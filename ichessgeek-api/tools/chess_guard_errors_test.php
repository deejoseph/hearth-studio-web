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
    'long_teaching_focus' => 400,
    'bad_teaching_focus' => 400,
    'long_goals_note' => 400,
    'bad_goals_note' => 400,
    'long_custom_slot' => 400,
    'bad_custom_slots' => 400,
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
$expectedMessages = [
    'long_goals_note' => '授课方向说明太长了，请缩到 ' . COACH_GOALS_NOTE_MAX . ' 个字以内',
    'bad_goals_note' => '授课方向说明里有打不出来的字符，重写一遍就好',
    'long_custom_slot' => '自定义上课时段太长了，每条请缩到 ' . COACH_CUSTOM_SLOT_MAX . ' 个字以内',
    'bad_custom_slots' => '自定义上课时段里有打不出来的字符，重写一遍就好',
];
foreach ($expectedMessages as $code => $message) {
    $assert((CHESS_ERRORS[$code][0] ?? null) === $message, "错误码中文文案准确：{$code}");
}

/* --- rating：未设置是 null,已设置的 0 仍是 0 --- */
$player = ['id' => '7', 'email' => 'a@b.c', 'nickname' => '青瓷', 'verified_at' => null,
    'created_at' => '2026-11-20 08:00:00'];
foreach ([[null, null], ['', null], [0, 0], ['0', 0], ['1450', 1450]] as [$given, $want]) {
    $publicPlayer = chess_public_row($player + ['rating' => $given]);
    $assert($publicPlayer['rating'] === $want,
        '账号公开输出 rating ' . var_export($given, true) . ' → ' . var_export($want, true));
}
$assert(chess_public_row($player)['rating'] === null, '账号公开输出缺 rating 时保持未设置');

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
$directoryStart = strpos($guard, 'function chess_coach_ids(');
$directoryEnd = strpos($guard, '/**', $directoryStart);
$directorySource = substr($guard, $directoryStart, $directoryEnd - $directoryStart);
$assert(strpos($directorySource, 's.restored_at IS NOT NULL') !== false
    && strpos($directorySource, "restored_at <> ''") === false,
    '公开名录只用 IS NULL 判断恢复时间，不把 DATETIME 与空字符串比较');
$restoreStart = strpos($guard, 'function chess_coach_standing_restore(');
$restoreEnd = strpos($guard, '/**', $restoreStart);
$restoreSource = substr($guard, $restoreStart, $restoreEnd - $restoreStart);
$assert(strpos($restoreSource, "status = 'revoked' AND restored_at IS NULL") !== false
    && strpos($restoreSource, "restored_at = ''") === false,
    '恢复资格的条件同样只判断 DATETIME NULL');
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

/* --- 新账号 rating 的建表、迁移、注册 INSERT 与三条账号输出路径 --- */
$playersSchemaStart = strpos($guard, 'function chess_schema(');
$playersSchema = substr($guard, $playersSchemaStart,
    strpos($guard, 'function chess_start_session(', $playersSchemaStart) - $playersSchemaStart);
$assert(strpos($playersSchema, 'rating INT NULL DEFAULT NULL') !== false,
    '新账号表的 rating 建为可空且数据库默认 NULL');
$assert(strpos($playersSchema, "SHOW COLUMNS FROM chess_players LIKE 'rating'") !== false
    && strpos($playersSchema, "\$rating['Default'] !== null") !== false
    && strpos($playersSchema, 'ALTER TABLE chess_players MODIFY rating INT NULL DEFAULT NULL') !== false,
    '旧表迁移同时修正可空性和默认值,避免省略 rating 时仍写入旧默认分');
$register = (string) file_get_contents(__DIR__ . '/../v1/chess_register.php');
$registerInsertStart = strpos($register, 'INSERT INTO chess_players');
$registerInsertEnd = strpos($register, 'VALUES', $registerInsertStart);
$registerInsert = substr($register, $registerInsertStart, $registerInsertEnd - $registerInsertStart);
$assert($registerInsertStart !== false && $registerInsertEnd !== false
    && strpos($registerInsert, 'rating') === false,
    '新注册 INSERT 不写 rating,由数据库默认 NULL');
foreach (['chess_register.php', 'chess_login.php', 'chess_me.php'] as $endpoint) {
    $source = (string) file_get_contents(__DIR__ . '/../v1/' . $endpoint);
    $assert(strpos($source, 'chess_public_row(') !== false,
        "{$endpoint} 的账号输出统一经过 rating 空值转换");
}
$appListStart = strpos($guard, 'function chess_app_list(');
$appList = substr($guard, $appListStart,
    strpos($guard, 'function chess_app_decide(', $appListStart) - $appListStart);
$assert(strpos($appList, 'p.rating') !== false, '管理申请列表读取真实 rating,NULL 交由输出层保留');
$coachRowsStart = strpos($guard, 'function chess_coach_rows(');
$coachRows = substr($guard, $coachRowsStart,
    strpos($guard, 'function chess_coach_directory(', $coachRowsStart) - $coachRowsStart);
$assert(strpos($coachRows, 'p.rating') !== false
    && strpos($coachRows, 'COALESCE(p.rating') === false,
    '公开名录 SELECT 不把未设置 rating 补成默认分');

/* --- chess_profile_write：列、占位符、类型串、绑定顺序逐项对齐 --- */
$writeStart = strpos($guard, 'function chess_profile_write(');
$writeEnd = strpos($guard, '/**', $writeStart);
$writeSource = substr($guard, $writeStart, $writeEnd - $writeStart);
$expectedColumns = [
    'player_id', 'title', 'elo', 'years', 'tagline', 'honors', 'teaching_focus', 'goals_note', 'custom_slots',
    'enrollment_notes', 'tuition_text', 'schedule_text', 'hourly_rate_cny', 'language', 'timezone', 'levels',
    'goals', 'formats', 'slots', 'avatar', 'photos', 'certificates', 'created_at', 'updated_at',
];
$expectedTypes = [
    'i', 's', 'i', 'i', 's', 's', 's', 's', 's', 's', 's', 's', 'i',
    's', 's', 's', 's', 's', 's', 's', 's', 's',
];
$writeMatch = [];
$hasInsert = preg_match('/INSERT INTO chess_coach_profiles\s*\((.*?)\)\s*VALUES\s*\((.*?)\)\s*ON DUPLICATE/s',
    $writeSource, $writeMatch) === 1;
$assert($hasInsert, '资料写入 SQL 能解析出完整列清单与 VALUES');
$columns = $hasInsert ? array_map('trim', explode(',', $writeMatch[1])) : [];
$values = $hasInsert ? $writeMatch[2] : '';
$assert($columns === $expectedColumns, '资料 INSERT 列顺序包含新字段且与绑定契约一致');
$placeholderCount = substr_count($values, '?');
$assert($placeholderCount === count($expectedColumns) - 2 && substr_count($values, 'NOW()') === 2,
    '资料 INSERT 有 22 个占位符,created_at/updated_at 由 NOW() 写入');
$typeMatch = [];
$hasTypes = preg_match('/->bind_param\(\s*"([^"]+)"/s', $writeSource, $typeMatch) === 1;
$types = $hasTypes ? $typeMatch[1] : '';
$assert(str_split($types) === $expectedTypes,
    'bind_param 类型串为 i/s/i/i + 八个 s + i + 九个 s,共 22 位');
$bindStart = strpos($writeSource, '->bind_param(');
$bindSource = substr($writeSource, $bindStart);
$bindArgs = substr($bindSource, 0, strpos($bindSource, ');'));
$bindingMatches = [];
preg_match_all("/\\$(?:playerId|profile\\['[a-z_]+'\\])/", $bindArgs, $bindingMatches);
$expectedBindings = ['$playerId'];
foreach (array_slice($expectedColumns, 1, -2) as $column) {
    $expectedBindings[] = "\$profile['{$column}']";
}
$assert($bindingMatches[0] === $expectedBindings,
    'bind_param 参数顺序与 SQL 列一一对应,goals_note/custom_slots 未错位');
$assert(count($bindingMatches[0]) === $placeholderCount && strlen($types) === $placeholderCount,
    'bind_param 类型数量、参数数量与占位符数量相同');
foreach (['goals_note', 'custom_slots'] as $column) {
    $assert(strpos($writeSource, "{$column} = VALUES({$column})") !== false,
        "资料覆盖保存更新 {$column}");
}
$profileRowStart = strpos($guard, 'function chess_profile_row(');
$profileRow = substr($guard, $profileRowStart,
    strpos($guard, 'function chess_profile_ensure(', $profileRowStart) - $profileRowStart);
$assert(strpos($profileRow, 'goals_note, custom_slots') !== false,
    '资料读取 SELECT 带回 goals_note/custom_slots');
$profileSchemaStart = strpos($guard, 'function chess_profile_schema(');
$profileSchema = substr($guard, $profileSchemaStart,
    strpos($guard, 'function chess_profile_row(', $profileSchemaStart) - $profileSchemaStart);
$assert(strpos($profileSchema, 'goals_note VARCHAR(') !== false
    && strpos($profileSchema, "'custom_slots', 'TEXT NOT NULL'") !== false,
    '资料表为 goals_note/custom_slots 建列并提供旧表补列迁移');
$assert(strpos($coachRows, 'f.goals_note, f.custom_slots') !== false,
    '公开名录 JOIN 读取 goals_note/custom_slots');

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
