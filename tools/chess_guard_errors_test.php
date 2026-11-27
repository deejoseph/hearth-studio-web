<?php
/**
 * 课堂错误码的离线契约测试：不连数据库、不发 HTTP。
 *
 *   D:/tmp/php81/php.exe tools/chess_guard_errors_test.php
 */

require_once __DIR__ . '/../v1/chess_guard.php';

$checks = 0;
$failures = [];
$assert = static function ($cond, $label) use (&$checks, &$failures) {
    $checks++;
    if (!$cond) {
        $failures[] = $label;
    }
};

$statuses = [
    'bad_class_code' => 400,
    'no_such_class' => 404,
    'class_closed' => 409,
    'not_class_member' => 403,
    'not_teacher' => 403,
    'teacher_no_hand' => 400,
    'no_permission' => 403,
    'already_approved' => 409,
    'bad_action' => 400,
    'bad_move' => 400,
    'bad_player_id' => 400,
    'stale' => 409,
    'stale_class_move' => 409,
    'bad_approve' => 400,
    'teacher_unavailable' => 409,
    'bad_budget' => 400,
    'long_schedule' => 400,
    'bad_schedule' => 400,
    'long_enrollment_notes' => 400,
    'bad_enrollment_notes' => 400,
    'long_tuition' => 400,
    'bad_tuition' => 400,
    'long_schedule_text' => 400,
    'bad_schedule_text' => 400,
    'coach_only' => 403,
    'coach_revoked' => 403,
    'bad_coach_id' => 400,
    'contact_required' => 403,
    'short_message' => 400,
    'long_message' => 400,
    'bad_message' => 400,
    'bad_request_id' => 400,
    'inquiry_pending' => 409,
    'inquiry_conflict' => 409,
    'too_many_inquiries' => 429,
    'bad_complaint' => 400,
    'short_complaint' => 400,
    'long_complaint' => 400,
    'complaint_target_invalid' => 403,
    'complaint_pending' => 409,
    'duplicate_complaint' => 409,
    'too_many_complaints' => 429,
    'no_such_complaint' => 404,
    'bad_public_text' => 400,
    'bad_severity' => 400,
    'bad_revoke' => 400,
    'bad_restore_reason' => 400,
    'no_such_standing' => 404,
    'not_revoked' => 409,
];
foreach ($statuses as $code => $status) {
    $row = CHESS_ERRORS[$code] ?? null;
    $assert(is_array($row), "错误码存在：{$code}");
    $assert(($row[0] ?? '') !== '', "错误码有中文文案：{$code}");
    $assert(($row[1] ?? null) === $status, "错误码状态码：{$code}");
    $assert(($row[0] ?? '') !== CHESS_ERRORS['server'][0], "错误码不落通用文案：{$code}");
}

$codes = [];
$endpointFiles = array_merge(
    [__DIR__ . '/../v1/chess_guard.php'],
    glob(__DIR__ . '/../v1/chess_class_*.php'),
    glob(__DIR__ . '/../v1/chess_coach_*.php')
);
foreach ($endpointFiles as $file) {
    $source = (string) file_get_contents($file);
    preg_match_all("/chess_err\\('([^']+)'/", $source, $matches);
    preg_match_all("/'code'\\s*=>\\s*'([^']+)'/", $source, $returned);
    foreach (array_merge($matches[1], $returned[1]) as $code) {
        $codes[$code] = true;
        $assert(isset(CHESS_ERRORS[$code]), basename($file) . " 的错误码已登记：{$code}");
    }
}
foreach (glob(__DIR__ . '/../v1/coach_admin_*.php') as $file) {
    preg_match_all("/'code'\\s*=>\\s*'([^']+)'/", (string) file_get_contents($file), $matches);
    foreach ($matches[1] as $code) {
        $codes[$code] = true;
        $assert(isset(CHESS_ERRORS[$code]), basename($file) . " 的错误码已登记：{$code}");
    }
}
$assert(isset($codes['stale']), '课堂标注、举手和批准的并发冲突使用 stale');
$assert(isset($codes['stale_class_move']), '课堂走子的并发冲突使用 stale_class_move');
$assert(isset($codes['too_many_inquiries']), '预约端点使用预约专属限流码');
$assert(isset($codes['too_many_complaints']), '申诉端点使用申诉专属限流码');

$guard = (string) file_get_contents(__DIR__ . '/../v1/chess_guard.php');
$appStart = strpos($guard, 'function chess_app_decide(');
$appSource = substr($guard, $appStart, strpos($guard, 'function chess_app_counts(', $appStart) - $appStart);
$appLock = strpos($appSource, 'chess_lock_player_standing(');
$appSelect = strpos($appSource, 'SELECT status FROM chess_coach_apps');
$assert($appLock !== false && $appSelect !== false && $appLock < $appSelect,
    '申请审批先锁资格行再锁申请行，避免与课堂动作形成反向锁序');
$assert(strpos($appSource, 'chess_transaction_retry(') !== false, '申请审批重试死锁');

$profileSave = (string) file_get_contents(__DIR__ . '/../v1/chess_coach_profile_save.php');
$profileLock = strpos($profileSave, 'chess_lock_player_standing(');
$profileWrite = strpos($profileSave, 'chess_profile_write(');
$assert(strpos($profileSave, 'chess_transaction_retry(') !== false
    && $profileLock !== false && $profileWrite !== false && $profileLock < $profileWrite,
    '资料保存锁资格后才整份写入');

$photoSave = (string) file_get_contents(__DIR__ . '/../v1/chess_coach_photo_save.php');
$photoBegin = strpos($photoSave, '$conn->begin_transaction()');
$photoLock = strpos($photoSave, 'chess_lock_player_standing(');
$photoMove = strpos($photoSave, 'move_uploaded_file(');
$assert($photoBegin !== false && $photoLock !== false && $photoMove !== false
    && $photoBegin < $photoLock && $photoLock < $photoMove,
    '图片上传在事务内复核资格后才落盘');
$assert(strpos($photoSave, '$conn->rollback()') !== false
    && strpos($photoSave, "@unlink(chess_coach_media_dir(\$playerId) . '/' . \$storedName)") !== false,
    '图片写入失败回滚并清理已落盘文件');

foreach (['move', 'hand', 'join', 'annotate'] as $action) {
    $source = (string) file_get_contents(__DIR__ . "/../v1/chess_class_{$action}.php");
    $assert(strpos($source, 'chess_lock_player_standing(') !== false,
        "课堂{$action}序列化老师资格状态");
    $assert(strpos($source, "'coach_revoked'") === false,
        "课堂{$action}不因老师被撤销而拒绝已有学生");
}
$classCreate = (string) file_get_contents(__DIR__ . '/../v1/chess_class_create.php');
$assert(strpos($classCreate, 'chess_read_body();') !== false,
    '创建课堂先走 POST JSON 门禁，GET 不能触发');
$assert(strpos($classCreate, '$class === null') !== false
    && strpos($classCreate, '!chess_class_add_member(') !== false,
    '创建课堂检查课堂与老师成员两条插入结果');
$rateStart = strpos($guard, 'function chess_take_rate_limits_locked(');
$rateEnd = strpos($guard, '/** 原子占用预约或申诉额度', $rateStart);
$rateSource = substr($guard, $rateStart, $rateEnd - $rateStart);
$assert(strpos($rateSource, '$updates = [];') !== false
    && strpos($rateSource, 'foreach ($updates as') > strpos($rateSource, 'return false;'),
    '双额度先完整预检再统一递增，后项超限不消耗前项');

$inquirySchemaStart = strpos($guard, 'function chess_coach_inquiries_schema(');
$inquirySchemaEnd = strpos($guard, '/** 预约先落幂等回执', $inquirySchemaStart);
$inquirySchema = substr($guard, $inquirySchemaStart, $inquirySchemaEnd - $inquirySchemaStart);
$assert(strpos($inquirySchema, 'CREATE TABLE IF NOT EXISTS chess_coach_inquiries') !== false
    && strpos($inquirySchema, 'UNIQUE KEY uq_coach_inquiry_request (student_id, request_hash)') !== false
    && strpos($inquirySchema, "status ENUM('pending', 'sent')") !== false,
    '预约回执按学生和请求键唯一，持久化 pending/sent 状态');
$assert(strpos($inquirySchema, 'message_hash CHAR(64)') !== false
    && strpos($inquirySchema, 'rate_windows TEXT') !== false
    && strpos($inquirySchema, 'idx_coach_inquiry_message') !== false
    && strpos($inquirySchema, 'message TEXT') === false
    && strpos($inquirySchema, 'email') === false,
    '预约回执不保存留言正文或邮箱，保存原额度窗口供恢复重试用');

$reserveStart = strpos($guard, 'function chess_inquiry_reserve(');
$reserveEnd = strpos($guard, 'function chess_inquiry_mark_sent(', $reserveStart);
$reserveSource = substr($guard, $reserveStart, $reserveEnd - $reserveStart);
$reserveLock = strpos($reserveSource, '$standing = chess_lock_player_standing(');
$reserveRevoked = strpos($reserveSource, 'coach_standing_is_revoked($standing)');
$reserveReuse = strpos($reserveSource, '$reuse = static function');
$assert($reserveLock !== false && $reserveRevoked !== false && $reserveReuse !== false
    && $reserveLock < $reserveRevoked && $reserveRevoked < $reserveReuse,
    '预约在资格行锁内复核撤销状态，预检与锁之间发生的撤销也会阻止发信');
$assert(strpos($reserveSource, 'LIMIT 1 FOR UPDATE') !== false
    && strpos($reserveSource, 'chess_take_rate_limits_locked(') < strpos($reserveSource, 'INSERT INTO chess_coach_inquiries'),
    '预约先锁回执并占额度，再插入 pending 回执');
$assert(strpos($reserveSource, "'inquiry_conflict'") !== false
    && strpos($reserveSource, "'inquiry_pending'") !== false
    && strpos($reserveSource, "'existing' => true") !== false,
    '相同请求不同内容冲突、pending 拒绝、已发送重试返回原回执');
$assert(strpos($reserveSource, 'CHESS_INQUIRY_RETRY_AFTER') !== false
    && strpos($reserveSource, 'inquiry retry claim failed') !== false
    && strpos($reserveSource, 'WHERE student_id = ? AND coach_id = ? AND message_hash = ?') !== false,
    'pending 超时可原子恢复，同留言近期重复请求即使换键也不会重复发信');

$markStart = strpos($guard, 'function chess_inquiry_mark_sent(');
$markEnd = strpos($guard, 'function chess_inquiry_refund(', $markStart);
$markSource = substr($guard, $markStart, $markEnd - $markStart);
$assert(strpos($markSource, "status = 'sent'") !== false
    && strpos($markSource, '$changed !== 1') !== false,
    '预约发送后只把本人 pending 回执标记为 sent，并核对写入结果');
$refundStart = strpos($guard, 'function chess_inquiry_refund(');
$refundEnd = strpos($guard, '/**', $refundStart);
$refundSource = substr($guard, $refundStart, $refundEnd - $refundStart);
$assert(strpos($refundSource, 'DELETE FROM chess_coach_inquiries') !== false
    && strpos($refundSource, 'LIMIT 1 FOR UPDATE') !== false
    && strpos($refundSource, 'window_started_at = ?') !== false,
    '邮件失败在同一事务锁回执、删除回执并只返还原窗口额度');

$inquiryEndpoint = (string) file_get_contents(__DIR__ . '/../v1/chess_coach_inquiry.php');
$reserveCall = strpos($inquiryEndpoint, 'chess_inquiry_reserve(');
$mailCall = strpos($inquiryEndpoint, 'chess_send_coach_inquiry(');
$refundCall = strpos($inquiryEndpoint, 'chess_inquiry_refund(');
$markCall = strpos($inquiryEndpoint, 'chess_inquiry_mark_sent(');
$assert($reserveCall !== false && $mailCall !== false && $refundCall !== false && $markCall !== false
    && $reserveCall < $mailCall && $refundCall > $mailCall && $markCall > $refundCall,
    '预约端点按预留、发信、失败返还、成功标记的顺序执行');
$assert(strpos($inquiryEndpoint, "empty(\$reserved['sent'])") !== false,
    '已发送回执直接复用，超时 pending 回执才重新发信');

$complaintSaveStart = strpos($guard, 'function chess_coach_complaint_save(');
$complaintSaveEnd = strpos($guard, 'function chess_coach_complaint_receipt_row(', $complaintSaveStart);
$complaintSave = substr($guard, $complaintSaveStart, $complaintSaveEnd - $complaintSaveStart);
$assert(strpos($complaintSave, "throw new RuntimeException('complaint insert failed')") !== false,
    '投诉插入失败抛出并回滚已占额度，不把部分成功提交');

$complaintSchemaStart = strpos($guard, 'function chess_coach_complaints_schema(');
$complaintSchema = substr($guard, $complaintSchemaStart);
$assert(strpos($complaintSchema, '(int) $conn->errno !== 1091') !== false
    && strpos($complaintSchema, '(int) $conn->errno !== 1061') !== false,
    '并发索引迁移只容忍索引已不存在或已存在，其他错误仍抛出');
$assert(strpos($complaintSchema, '[$hasReporterHash] = $inspect();') > strpos($complaintSchema, '(int) $conn->errno !== 1061'),
    '添加索引遇到同名竞态后重新确认目标索引确实存在');

$htaccess = (string) file_get_contents(__DIR__ . '/../v1/.htaccess');
$assert(strpos($htaccess, 'chess_coach_complaint_core') !== false,
    '申诉核心文件已加入直接访问拒绝名单');

if ($failures) {
    fwrite(STDERR, implode(PHP_EOL, $failures) . PHP_EOL);
    exit(1);
}
echo "PASS: {$checks} checks" . PHP_EOL;
