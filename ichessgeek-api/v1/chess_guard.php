<?php
/**
 * 棋手账号层的唯一入口：会话、限流、校验、令牌、统一响应。
 * chess_* 端点都应 require 本文件，不要再各自写一份。
 * 禁止直接 URL 访问（同目录 .htaccess 已 FilesMatch 拒绝）。
 *
 * 与 admin_guard.php 的区别：那份管后台（cookie 只作用于 /api/v1），
 * 这份管下棋的人（cookie 要作用到 /chess，所以 path=/）。两者互不相认。
 */

// 教练偏好、资格与申诉的规则层
require_once __DIR__ . '/chess_coach_core.php';
require_once __DIR__ . '/chess_coach_complaint_core.php';

const CHESS_FAIL_WINDOW = 900;      // 15 分钟
const CHESS_FAIL_LIMIT = 5;         // 同一 IP 的登录失败次数
const CHESS_REGISTER_WINDOW = 3600; // 同一 IP 每小时最多注册
// 按"真建成的账号"计，不是按失败计：一个班的孩子常共用校园网这一个 IP，
// 卡太紧会把想下棋的人挡在门外，所以留到 10 个/小时。
const CHESS_REGISTER_LIMIT = 10;
const CHESS_RESEND_LIMIT = 3;       // 重发邮件按小时限，发信量是另一笔账
const CHESS_VERIFY_TTL = 172800;    // 验证链接 48 小时有效
const CHESS_MIN_PASSWORD = 8;
const CHESS_MAX_PASSWORD = 72;      // bcrypt 在这之后静默丢弃

// 开房和进房各自限一个数。进别人房间的唯一正当途径是对方把 6 位码给你，
// 所以"猜码"要么是根本不成立、要么就是有人在扫 —— 扫就得限，
// 顺带也挡住一个人拿账号批量占房。
const CHESS_ROOM_WINDOW = 3600;
const CHESS_ROOM_CREATE_LIMIT = 8;  // 同一 IP 每小时真开出来的房间
const CHESS_JOIN_WINDOW = 900;
const CHESS_JOIN_LIMIT = 20;        // 同一 IP 15 分钟内"查无此房"的次数

// 图片按"真落盘的那一张"计，一个教练最多三张照片加一个头像 = 4 张，
// 留到 12 张/小时够他反复挑图，又挡得住有人拿这个端点往盘上堆东西
// （共享主机的磁盘是这台机器上最贵、也最难回退的那一项）。
const CHESS_PHOTO_WINDOW = 3600;
const CHESS_PHOTO_LIMIT = 12;

const CHESS_INQUIRY_WINDOW = 86400;
const CHESS_INQUIRY_STUDENT_LIMIT = 5;
const CHESS_INQUIRY_COACH_LIMIT = 20;
const CHESS_INQUIRY_RETRY_AFTER = 300;
const CHESS_COMPLAINT_WINDOW = 86400;
const CHESS_COMPLAINT_STUDENT_LIMIT = 5;
const CHESS_COMPLAINT_COACH_LIMIT = 20;

/**
 * 每个错误一个稳定 code，中文提示留在这里当兜底。
 * 棋盘（/chess）的界面是英文的，它按 code 出英文句子；加新错误时两边都要动，
 * 但 code 是契约、中文/英文都只是措辞，改文案不必改代码。
 */
const CHESS_ERRORS = [
    'service' => ['服务器暂时不可用', 503],
    'server' => ['操作失败，请稍后再试', 500],
    'method' => ['不支持的请求方法', 405],
    'content_type' => ['请提交 JSON', 415],
    'bad_body' => ['请求体格式不对', 400],
    'sign_in_required' => ['请先登录', 401],
    'no_such_player' => ['找不到这个账号', 404],
    'too_many_logins' => ['失败次数太多，请 15 分钟后再试', 429],
    'too_many_registrations' => ['这个网络这一小时注册的次数太多了，稍后再试或联系 admin@ichessgeek.com', 429],
    'too_many_sends' => ['发送次数太多，稍后再试', 429],
    'mail_failed' => ['邮件还是发不出去，请联系 admin@ichessgeek.com', 502],
    'bad_credentials' => ['邮箱或密码不正确', 401],
    'missing_fields' => ['请填写邮箱和密码', 400],
    'bad_email' => ['邮箱格式不对', 400],
    'short_nickname' => ['昵称至少 2 个字', 400],
    'short_password' => ['密码至少 ' . CHESS_MIN_PASSWORD . ' 位', 400],
    'long_password' => ['密码太长了', 400],
    'weak_password' => ['这个密码太常见了，换一个', 400],
    'verify_failed' => ['验证暂时不可用，请稍后再试', 500],

    // 房间（P2）。这些 code 是棋盘的契约：界面按 code 出句子，中文只当兜底。
    'verify_required' => ['请先点邮件里的链接验证邮箱，验证后才能和人下', 403],
    'bad_room_code' => ['房间码格式不对', 400],
    'no_such_room' => ['找不到这个房间，检查下房间码', 404],
    'room_full' => ['这个房间已经两个人了', 409],
    'room_not_active' => ['这局现在不能走子', 409],
    'room_over' => ['这局已经结束了', 409],
    'not_room_member' => ['你不是这个房间的棋手', 403],
    'not_your_turn' => ['还没轮到你走', 409],
    'illegal_move' => ['这一步不合法', 400],
    'flagged' => ['时间已经走完，这步不算', 409],
    'stale_move' => ['局面已经变了，这一步没记下（对手可能刚走完）', 409],
    'bad_room_time' => ['每方时间要在 10 秒到 1 小时之间', 400],
    'bad_room_color' => ['颜色只能是白、黑或随机', 400],
    'too_many_rooms' => ['这个网络开房间的次数太多了，稍后再试', 429],
    'too_many_joins' => ['房间码试的次数太多，请核对之后再试', 429],
    'draw_pending' => ['已经有一次提和没答复，等对方回应', 409],
    'no_draw_offer' => ['没有待答复的提和', 409],
    'not_your_offer' => ['这是你提的和，要等对方答复', 409],

    // 课堂（P4）。老师和 N 个学生共用一块棋盘，错误文案按 code 出。
    'bad_class_code' => ['课堂码是 4 位数字', 400],
    'no_such_class' => ['没有这个课堂码', 404],
    'class_closed' => ['这个课堂已经结束了', 409],
    'not_class_member' => ['你不在这个课堂里', 403],
    'not_teacher' => ['这一步只有老师能做', 403],
    'teacher_no_hand' => ['老师不用举手', 400],
    'no_permission' => ['现在轮不到你走，先等老师批准', 403],
    'already_approved' => ['老师已经让你走了', 409],
    'bad_action' => ['举手动作不认识', 400],
    'bad_move' => ['这一步看着不像一步棋', 400],
    'bad_player_id' => ['请选择课堂里的一位学生', 400],
    'stale' => ['课堂已经往前走了，请等棋盘同步后再试', 409],
    'stale_class_move' => ['课堂局面已经变了，这一步没记下，请等棋盘同步后再试', 409],
    'bad_approve' => ['批准状态必须是 true 或 false', 400],
    'teacher_unavailable' => ['老师当前不能继续授课', 409],

    // 教练偏好（P3）。界面按 code + field 出句子，中文只当兜底。
    'bad_pref' => ['这些选项里有一项不对，请再检查一遍', 400],
    'long_note' => ['说明太长了，请缩到 ' . COACH_NOTE_MAX . ' 个字以内', 400],
    'bad_note' => ['说明里有打不出来的字符，重写一遍就好', 400],
    'bad_budget' => ['预算要在 0 到 100000 元之间，且下限不能高于上限', 400],
    'long_schedule' => ['时间说明太长了，请缩到 ' . COACH_SCHEDULE_NOTE_MAX . ' 个字以内', 400],
    'bad_schedule' => ['时间说明里有打不出来的字符，重写一遍就好', 400],

    // 想当教练的申请 + 开课堂的资格位。
    // teacher_only 是这一整块的门：棋盘上任何一个人提交什么都换不来它，
    // 只有管理员在 /coach-admin 点了批准才算过 —— 界面按这个 code 出
    // "先申请成为教练"那一句并把人送到申请表上。
    'teacher_only' => ['开课堂要先申请成为教练，审核通过后才能用', 403],
    'short_intro' => ['这一段至少写 ' . COACH_INTRO_MIN . ' 个字', 400],
    'long_intro' => ['介绍太长了，请缩到 ' . COACH_INTRO_MAX . ' 个字以内', 400],
    'bad_intro' => ['介绍里有打不出来的字符，重写一遍就好', 400],
    'already_teacher' => ['你已经能开课堂了，不用再提交一遍介绍', 409],
    'bad_decision' => ['批准还是驳回，要选一个', 400],
    'no_such_app' => ['没找到这一份申请', 404],

    // 教练资料（名录上那张门面）。每个字段都可以留空，所以这些 code 全在
    // "填了但填错"这一侧；界面按 code + field 把红字挂到对应那一组上。
    'bad_profile' => ['这几项里有一项不对，请再检查一遍', 400],
    'bad_rate' => ['每小时费率要是 0 到 100000 之间的整数', 400],
    'long_tagline' => ['一句话简介太长了，请缩到 ' . COACH_TAGLINE_MAX . ' 个字以内', 400],
    'bad_tagline' => ['简介里有打不出来的字符，重写一遍就好', 400],
    'long_honors' => ['荣誉写得太长了，请缩到 ' . COACH_HONORS_MAX . ' 个字以内', 400],
    'bad_honors' => ['荣誉里有打不出来的字符，重写一遍就好', 400],
    'long_enrollment_notes' => ['招生要求太长了，请缩到 ' . COACH_ENROLLMENT_NOTES_MAX . ' 个字以内', 400],
    'bad_enrollment_notes' => ['招生要求里有打不出来的字符，重写一遍就好', 400],
    'long_tuition' => ['收费说明太长了，请缩到 ' . COACH_TUITION_TEXT_MAX . ' 个字以内', 400],
    'bad_tuition' => ['收费说明里有打不出来的字符，重写一遍就好', 400],
    'long_schedule_text' => ['授课时间太长了，请缩到 ' . COACH_SCHEDULE_TEXT_MAX . ' 个字以内', 400],
    'bad_schedule_text' => ['授课时间里有打不出来的字符，重写一遍就好', 400],
    'no_such_coach' => ['没有这位教练，或他还没进名录', 404],

    // 预约、申诉与资格撤销。
    'coach_only' => ['这个账号是教练账号，不能提交学员投诉', 403],
    'coach_revoked' => ['教练资格已被撤销，恢复前不能进行这些操作', 403],
    'bad_coach_id' => ['请选择一位有效的教练', 400],
    'contact_required' => ['预约前请明确同意把邮箱交给教练', 403],
    'short_message' => ['预约说明至少写 20 个字', 400],
    'long_message' => ['预约说明最多 2000 个字', 400],
    'bad_message' => ['预约说明里有打不出来的字符，重写一遍就好', 400],
    'bad_request_id' => ['这次预约的请求标识不对，请重新打开预约窗口', 400],
    'inquiry_pending' => ['上一封预约邮件还在发送，请稍等再重试', 409],
    'inquiry_conflict' => ['这次预约标识已经用于另一段留言，请重新打开预约窗口', 409],
    'too_many_inquiries' => ['今天的预约次数太多了，稍后再试', 429],
    'bad_complaint' => ['申诉内容里有打不出来的字符，重写一遍就好', 400],
    'short_complaint' => ['申诉内容至少写 20 个字', 400],
    'long_complaint' => ['申诉内容最多 3000 个字', 400],
    'complaint_target_invalid' => ['只能申诉当前或曾经的教练', 403],
    'complaint_pending' => ['你对这位教练已有一条待处理申诉', 409],
    'duplicate_complaint' => ['相同内容的申诉已经提交过了', 409],
    'too_many_complaints' => ['今天的申诉次数太多了，稍后再试', 429],
    'no_such_complaint' => ['没找到这条申诉', 404],
    'bad_public_text' => ['维持申诉必须填写不超过 3000 字的公开说明', 400],
    'bad_severity' => ['严重程度只能是 normal 或 severe', 400],
    'bad_revoke' => ['只有维持的严重申诉才能撤销教练资格', 400],
    'bad_restore_reason' => ['请填写不超过 1000 字的恢复原因', 400],
    'no_such_standing' => ['没找到这位教练的资格记录', 404],
    'not_revoked' => ['这位教练当前没有被撤销资格', 409],

    // 头像、照片与证书。中文兜底同 bad_*：界面按 code 出句子。
    'bad_image' => ['那不是一个图片文件，换一张试试', 400],
    'big_image' => ['图片太大了（两兆、每边四千像素以内）', 400],
    'too_many_photos' => ['照片最多 ' . COACH_PHOTOS_MAX . ' 张，先删一张再传', 400],
    'too_many_certificates' => ['证书图片最多 ' . COACH_CERTIFICATES_MAX . ' 张，先删一张再传', 400],
    'too_many_uploads' => ['今天传的图片太多了，稍后再试', 429],
];

function chess_err($code, $extra = []) {
    [$message, $status] = CHESS_ERRORS[$code] ?? CHESS_ERRORS['server'];
    chess_json(['ok' => false, 'code' => $code, 'error' => $message] + $extra, $status);
}

function chess_db() {
    static $conn = null;
    if ($conn === null) {
        require_once __DIR__ . '/db_config.php';
        if (!isset($conn)) {
            error_log('chess: db_config.php did not define $conn');
            chess_err('service');
        }
    }
    return $conn;
}

function chess_client_ip() {
    // Cloudflare 在前面，REMOTE_ADDR 恒为边缘地址，只有 CF 的头可信
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return substr($ip, 0, 45);
}

/** 死锁只重试整个事务，避免其中一半写入留下来。 */
function chess_transaction_retry($conn, callable $operation, $attempts = 3) {
    for ($try = 1; $try <= $attempts; $try++) {
        $conn->begin_transaction();
        try {
            $result = $operation();
            $conn->commit();
            return $result;
        } catch (Throwable $e) {
            $errno = (int) $conn->errno;
            $conn->rollback();
            if (!in_array($errno, [1205, 1213], true) || $try === $attempts) {
                throw $e;
            }
            usleep(20000 * $try);
        }
    }
}

/**
 * 表在首次用到时建，跟留言板那套一致：共享主机上不方便跑迁移脚本。
 */
function chess_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    $conn->query("CREATE TABLE IF NOT EXISTS chess_players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(190) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nickname VARCHAR(30) NOT NULL,
        rating INT NOT NULL DEFAULT 400,
        verified_at DATETIME NULL,
        verify_token_hash CHAR(64) NULL,
        verify_expires DATETIME NULL,
        last_seen_at DATETIME NULL,
        external_id VARCHAR(64) NULL,
        external_source VARCHAR(32) NULL,
        created_at DATETIME NOT NULL,
        UNIQUE KEY uq_chess_email (email),
        UNIQUE KEY uq_chess_external (external_source, external_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS chess_auth_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        scope VARCHAR(16) NOT NULL,
        ip VARCHAR(45) NOT NULL,
        tried_at DATETIME NOT NULL,
        INDEX idx_caa (scope, ip, tried_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS chess_rate_limits (
        scope VARCHAR(16) NOT NULL,
        ip VARCHAR(45) NOT NULL,
        window_started_at DATETIME NOT NULL,
        used_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (scope, ip)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // 棋谱库：存每个棋手的对局历史，从 localStorage 搬到服务端
    $conn->query("CREATE TABLE IF NOT EXISTS chess_library (
        id INT AUTO_INCREMENT PRIMARY KEY,
        player_id INT NOT NULL,
        game_id VARCHAR(40) NOT NULL,
        finished_at BIGINT NOT NULL COMMENT '对局结束时间戳（毫秒）',
        mode ENUM('computer', 'local', 'online') NOT NULL,
        level VARCHAR(12) NULL COMMENT '电脑难度，仅 mode=computer 时有',
        sans JSON NOT NULL COMMENT '走法列表',
        result ENUM('1-0', '0-1', '1/2-1/2', '*') NOT NULL,
        white_name VARCHAR(120) NOT NULL,
        black_name VARCHAR(120) NOT NULL,
        control_initial INT NULL COMMENT '初始时间（毫秒）',
        control_increment INT NULL COMMENT '增量（秒）',
        termination VARCHAR(24) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_player_game (player_id, game_id),
        INDEX idx_player_finished (player_id, finished_at DESC),
        FOREIGN KEY (player_id) REFERENCES chess_players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ready = true;
}

function chess_start_session() {
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('ichessgeek_chess');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function chess_player_id() {
    chess_start_session();
    return isset($_SESSION['chess_player_id']) ? (int) $_SESSION['chess_player_id'] : 0;
}

/** 当前登录者；未登录直接 401。写库前都先过这一关。 */
function chess_require_player() {
    $id = chess_player_id();
    if ($id > 0) {
        return $id;
    }
    chess_err('sign_in_required');
}

function chess_json($payload, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 只收 JSON body 的 POST。
 * 表单式的跨站 POST 带不上 application/json 这个 Content-Type（浏览器要预检），
 * 加上 cookie 是 SameSite=Lax，这一条就把 CSRF 的主要入口堵住了。
 */
function chess_read_body() {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        chess_err('method');
    }
    $type = $_SERVER['CONTENT_TYPE'] ?? '';
    if (stripos($type, 'application/json') === false) {
        chess_err('content_type');
    }
    $data = json_decode(file_get_contents('php://input'), true);
    if (!is_array($data)) {
        chess_err('bad_body');
    }
    return $data;
}

/**
 * 中文昵称要按"字"而不是按"字节"量，且"量长度"和"截断"必须是同一套口径，
 * 否则同一个昵称会被量成两种长度。共享主机不一定编了 mbstring，
 * 所以每个 mb_* 调用都留退路 —— 退路用 preg_split('//u') 同样按码点数。
 */
function chess_chars($s) {
    if (function_exists('mb_str_split')) {
        return mb_str_split($s, 1, 'UTF-8');
    }
    // //u 按 UTF-8 码点切，PCRE 编译必然支持，不依赖 mbstring
    return preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [];
}

function chess_len($s) {
    return count(chess_chars($s));
}

function chess_cut($s, $max) {
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $max, 'UTF-8');
    }
    return implode('', array_slice(chess_chars($s), 0, $max));
}

function chess_trim($value, $max) {
    return chess_cut(trim((string) ($value ?? '')), $max);
}

function chess_norm_email($value) {
    // 邮箱的本地部分按 RFC 是 ASCII，strtolower 足够；非 ASCII 地址本来也过不了 filter_var
    $email = strtolower(trim((string) ($value ?? '')));
    if ($email === '' || strlen($email) > 190 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return '';
    }
    return $email;
}

/**
 * 弱口令黑名单只挡"12345678"这类一撞就中的，不追求全面。
 * 少儿班的用户量下，撞库失败的主要代价是邮箱被拿去试。
 * 返回 code（'' 表示没问题），文案由 CHESS_ERRORS 出。
 */
function chess_password_problem($plain) {
    $len = strlen($plain);
    if ($len < CHESS_MIN_PASSWORD) {
        return 'short_password';
    }
    if ($len > CHESS_MAX_PASSWORD) {
        return 'long_password';
    }
    $weak = ['password', '12345678', '123456789', '1234567890', 'qwertyuiop',
             'iloveyou', 'football', 'baseball', '00000000', 'abcdefgh'];
    if (in_array(strtolower($plain), $weak, true)) {
        return 'weak_password';
    }
    return '';
}

function chess_attempt_count($conn, $scope, $ip, $window) {
    chess_schema($conn);
    $cutoff = date('Y-m-d H:i:s', time() - $window);
    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM chess_auth_attempts WHERE scope = ? AND ip = ? AND tried_at > ?");
    $stmt->bind_param("sss", $scope, $ip, $cutoff);
    $stmt->execute();
    $count = (int) $stmt->get_result()->fetch_assoc()['c'];
    $stmt->close();
    return $count;
}

function chess_record_attempt($conn, $scope, $ip) {
    chess_schema($conn);
    $stmt = $conn->prepare("INSERT INTO chess_auth_attempts (scope, ip, tried_at) VALUES (?, ?, NOW())");
    $stmt->bind_param("ss", $scope, $ip);
    $stmt->execute();
    $stmt->close();
}

function chess_clear_attempts($conn, $scope, $ip) {
    $stmt = $conn->prepare("DELETE FROM chess_auth_attempts WHERE scope = ? AND ip = ?");
    $stmt->bind_param("ss", $scope, $ip);
    $stmt->execute();
    $stmt->close();
}

function chess_take_rate_limits_locked($conn, array $limits, $cutoff, array &$buckets = []) {
    $buckets = [];
    $updates = [];
    $now = date('Y-m-d H:i:s');
    foreach ($limits as $limit) {
        $scope = (string) $limit['scope'];
        $ip = (string) $limit['ip'];
        $cap = max(1, (int) $limit['limit']);
        $stmt = $conn->prepare("INSERT INTO chess_rate_limits
            (scope, ip, window_started_at, used_count) VALUES (?, ?, NOW(), 0)
            ON DUPLICATE KEY UPDATE scope = VALUES(scope)");
        $stmt->bind_param("ss", $scope, $ip);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('rate limit insert failed');
        }
        $stmt->close();

        $stmt = $conn->prepare("SELECT window_started_at, used_count FROM chess_rate_limits
            WHERE scope = ? AND ip = ? LIMIT 1 FOR UPDATE");
        $stmt->bind_param("ss", $scope, $ip);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('rate limit lock failed');
        }
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            throw new RuntimeException('rate limit row missing');
        }
        if ($row['window_started_at'] <= $cutoff) {
            $window = $now;
            $updates[] = [$scope, $ip, 1, true];
        } else {
            if ((int) $row['used_count'] >= $cap) {
                return false;
            }
            $window = $row['window_started_at'];
            $updates[] = [$scope, $ip, (int) $row['used_count'] + 1, false];
        }
        $buckets[] = ['scope' => $scope, 'ip' => $ip, 'window_started_at' => $window];
    }

    foreach ($updates as [$scope, $ip, $used, $reset]) {
        $sql = $reset
            ? "UPDATE chess_rate_limits SET window_started_at = ?, used_count = ? WHERE scope = ? AND ip = ?"
            : "UPDATE chess_rate_limits SET used_count = ? WHERE scope = ? AND ip = ?";
        $stmt = $conn->prepare($sql);
        if ($reset) {
            $window = date('Y-m-d H:i:s');
            $stmt->bind_param("siss", $window, $used, $scope, $ip);
            foreach ($buckets as &$bucket) {
                if ($bucket['scope'] === $scope && $bucket['ip'] === $ip) {
                    $bucket['window_started_at'] = $window;
                }
            }
            unset($bucket);
        } else {
            $stmt->bind_param("iss", $used, $scope, $ip);
        }
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('rate limit update failed');
        }
        $stmt->close();
    }
    return true;
}

function chess_coach_inquiries_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    chess_schema($conn);
    $conn->query("CREATE TABLE IF NOT EXISTS chess_coach_inquiries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        coach_id INT NOT NULL,
        request_hash CHAR(64) NOT NULL,
        message_hash CHAR(64) NOT NULL,
        rate_windows TEXT NOT NULL,
        status ENUM('pending', 'sent') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY uq_coach_inquiry_request (student_id, request_hash),
        INDEX idx_coach_inquiry_coach (coach_id, created_at),
        INDEX idx_coach_inquiry_message (student_id, coach_id, message_hash, id),
        FOREIGN KEY (student_id) REFERENCES chess_players(id) ON DELETE CASCADE,
        FOREIGN KEY (coach_id) REFERENCES chess_players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ready = true;
}

/** 预约先落幂等回执并原子占额度；邮件在事务外发送。 */
function chess_inquiry_reserve($conn, $studentId, $coachId, $requestId, $message) {
    chess_coach_inquiries_schema($conn);
    $studentId = (int) $studentId;
    $coachId = (int) $coachId;
    $requestHash = hash('sha256', 'coach-inquiry:' . $requestId);
    $messageHash = hash('sha256', $coachId . "\n" . $message);
    $limits = [
        ['scope' => 'iq_s_' . $studentId, 'ip' => 'student', 'limit' => CHESS_INQUIRY_STUDENT_LIMIT],
        ['scope' => 'iq_c_' . $coachId, 'ip' => 'coach', 'limit' => CHESS_INQUIRY_COACH_LIMIT],
    ];
    usort($limits, static fn ($a, $b) => [$a['scope'], $a['ip']] <=> [$b['scope'], $b['ip']]);
    $cutoff = date('Y-m-d H:i:s', time() - CHESS_INQUIRY_WINDOW);
    $retryCutoff = date('Y-m-d H:i:s', time() - CHESS_INQUIRY_RETRY_AFTER);

    return chess_transaction_retry($conn, static function () use (
        $conn, $studentId, $coachId, $requestHash, $messageHash, $limits, $cutoff, $retryCutoff
    ) {
        $standing = chess_lock_player_standing($conn, $coachId);
        if (coach_standing_is_revoked($standing)) {
            return ['ok' => false, 'code' => 'no_such_coach'];
        }
        $reuse = static function (array $row) use ($conn, $studentId, $coachId, $messageHash, $retryCutoff) {
            if ((int) $row['coach_id'] !== $coachId || $row['message_hash'] !== $messageHash) {
                return ['ok' => false, 'code' => 'inquiry_conflict'];
            }
            if ($row['status'] === 'sent') {
                return ['ok' => true, 'existing' => true, 'sent' => true, 'id' => (int) $row['id']];
            }
            if ($row['updated_at'] > $retryCutoff) {
                return ['ok' => false, 'code' => 'inquiry_pending'];
            }
            $stmt = $conn->prepare("UPDATE chess_coach_inquiries SET updated_at = NOW()
                WHERE id = ? AND student_id = ? AND status = 'pending'");
            $stmt->bind_param("ii", $row['id'], $studentId);
            if (!$stmt->execute() || $stmt->affected_rows !== 1) {
                $stmt->close();
                throw new RuntimeException('inquiry retry claim failed');
            }
            $stmt->close();
            $buckets = json_decode($row['rate_windows'], true);
            if (!is_array($buckets)) {
                throw new RuntimeException('inquiry retry windows invalid');
            }
            return ['ok' => true, 'existing' => true, 'sent' => false,
                'id' => (int) $row['id'], 'buckets' => $buckets];
        };

        $stmt = $conn->prepare("SELECT id, coach_id, message_hash, rate_windows, status, created_at, updated_at
            FROM chess_coach_inquiries WHERE student_id = ? AND request_hash = ? LIMIT 1 FOR UPDATE");
        $stmt->bind_param("is", $studentId, $requestHash);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('inquiry idempotency read failed');
        }
        $existing = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($existing) {
            return $reuse($existing);
        }

        $stmt = $conn->prepare("SELECT id, coach_id, message_hash, rate_windows, status, created_at, updated_at
            FROM chess_coach_inquiries
            WHERE student_id = ? AND coach_id = ? AND message_hash = ?
            ORDER BY id DESC LIMIT 1 FOR UPDATE");
        $stmt->bind_param("iis", $studentId, $coachId, $messageHash);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('inquiry duplicate read failed');
        }
        $recent = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($recent && ($recent['status'] === 'pending' || $recent['created_at'] > $retryCutoff)) {
            return $reuse($recent);
        }

        $buckets = [];
        if (!chess_take_rate_limits_locked($conn, $limits, $cutoff, $buckets)) {
            return ['ok' => false, 'code' => 'too_many_inquiries'];
        }
        $now = date('Y-m-d H:i:s');
        $stmt = $conn->prepare("INSERT INTO chess_coach_inquiries
            (student_id, coach_id, request_hash, message_hash, rate_windows, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)");
        $rateWindows = json_encode($buckets, JSON_UNESCAPED_SLASHES);
        $stmt->bind_param("iisssss", $studentId, $coachId, $requestHash, $messageHash, $rateWindows, $now, $now);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('inquiry receipt insert failed');
        }
        $id = (int) $conn->insert_id;
        $stmt->close();
        return ['ok' => true, 'existing' => false, 'sent' => false, 'id' => $id, 'buckets' => $buckets];
    });
}

function chess_inquiry_mark_sent($conn, $studentId, $inquiryId) {
    return chess_transaction_retry($conn, static function () use ($conn, $studentId, $inquiryId) {
        $stmt = $conn->prepare("UPDATE chess_coach_inquiries
            SET status = 'sent', updated_at = NOW()
            WHERE id = ? AND student_id = ? AND status = 'pending'");
        $stmt->bind_param("ii", $inquiryId, $studentId);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('inquiry receipt update failed');
        }
        $changed = $stmt->affected_rows;
        $stmt->close();
        if ($changed !== 1) {
            throw new RuntimeException('inquiry receipt missing before sent');
        }
        return true;
    });
}

function chess_inquiry_refund($conn, $studentId, $inquiryId, array $buckets) {
    usort($buckets, static fn ($a, $b) => [$a['scope'], $a['ip']] <=> [$b['scope'], $b['ip']]);
    return chess_transaction_retry($conn, static function () use ($conn, $studentId, $inquiryId, $buckets) {
        $stmt = $conn->prepare("SELECT status FROM chess_coach_inquiries
            WHERE id = ? AND student_id = ? LIMIT 1 FOR UPDATE");
        $stmt->bind_param("ii", $inquiryId, $studentId);
        if (!$stmt->execute()) {
            $stmt->close();
            throw new RuntimeException('inquiry refund read failed');
        }
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row || $row['status'] !== 'pending') {
            return false;
        }
        $stmt = $conn->prepare("DELETE FROM chess_coach_inquiries WHERE id = ? AND student_id = ?");
        $stmt->bind_param("ii", $inquiryId, $studentId);
        if (!$stmt->execute() || $stmt->affected_rows !== 1) {
            $stmt->close();
            throw new RuntimeException('inquiry refund delete failed');
        }
        $stmt->close();

        foreach ($buckets as $bucket) {
            $stmt = $conn->prepare("SELECT used_count FROM chess_rate_limits
                WHERE scope = ? AND ip = ? AND window_started_at = ? LIMIT 1 FOR UPDATE");
            $stmt->bind_param("sss", $bucket['scope'], $bucket['ip'], $bucket['window_started_at']);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new RuntimeException('inquiry refund bucket read failed');
            }
            $rate = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$rate || (int) $rate['used_count'] < 1) {
                continue;
            }
            $used = (int) $rate['used_count'] - 1;
            $stmt = $conn->prepare("UPDATE chess_rate_limits SET used_count = ?
                WHERE scope = ? AND ip = ? AND window_started_at = ?");
            $stmt->bind_param("isss", $used, $bucket['scope'], $bucket['ip'], $bucket['window_started_at']);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new RuntimeException('inquiry refund bucket update failed');
            }
            $stmt->close();
        }
        return true;
    });
}

/**
 * 令牌只在库里存 SHA-256：数据库被读走也拿不到还能用的验证链接。
 * 返回 [明文令牌（只出现在这一次，用于拼链接）, 落库的哈希]。
 */
function chess_new_token() {
    $plain = bin2hex(random_bytes(32));
    return [$plain, hash('sha256', $plain)];
}

function chess_public_row($row) {
    return [
        'id' => (int) $row['id'],
        'email' => $row['email'],
        'nickname' => $row['nickname'],
        'rating' => (int) $row['rating'],
        'verified' => $row['verified_at'] !== null,
        'verified_at' => $row['verified_at'],
        'created_at' => $row['created_at'],
    ];
}

/**
 * 统一的失败出口：把 SQL 细节留在 error_log，给用户一句能看懂的话。
 */
function chess_fail(Throwable $e, $context) {
    error_log('chess ' . $context . ': ' . $e->getMessage());
    chess_err('server');
}

/* --------------------------------------------------------------------------
 * 房间（P2）。规则的判定全在 chess_room_core.php，这里只管进出数据库：
 * 建表、按房间码取行、把行还原成规则层要的数组、写回。
 * ------------------------------------------------------------------------ */

/** 毫秒时刻。DATETIME 只到秒，"剩 0.4 秒"和"剩 1.4 秒"会被存成同一个值。 */
function chess_now_ms() {
    return (int) floor(microtime(true) * 1000);
}

/**
 * 房间表在首次用到时建，和账号表一个路子：共享主机上不方便跑迁移脚本。
 *
 * seq 同时是两样东西：poll 的游标（客户端只取 seq > since 的事件），
 * 和写回的乐观锁（UPDATE ... WHERE seq = 期望值，0 行受影响就是有人先走了）。
 * 事件表上那个 UNIQUE (room_id, seq) 是第二层网：真撞上了说明同一手被记了两次。
 */
function chess_room_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    $conn->query("CREATE TABLE IF NOT EXISTS chess_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code CHAR(6) NOT NULL,
        white_player_id INT NULL,
        black_player_id INT NULL,
        fen VARCHAR(90) NOT NULL,
        status VARCHAR(16) NOT NULL,
        result VARCHAR(24) NULL,
        winner CHAR(1) NULL,
        time_ms INT NOT NULL,
        white_ms INT NOT NULL,
        black_ms INT NOT NULL,
        turn_started_ms BIGINT NULL,
        seq INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY uq_room_code (code),
        INDEX idx_room_white (white_player_id, status),
        INDEX idx_room_black (black_player_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS chess_room_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        seq INT NOT NULL,
        san VARCHAR(16) NOT NULL,
        fen_after VARCHAR(90) NOT NULL,
        played_by INT NOT NULL,
        played_at DATETIME NOT NULL,
        UNIQUE KEY uq_room_seq (room_id, seq)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // 提和。一间房最多一条待答复的记录（主键就是 room_id）—— 同时有两条
    // "谁在等谁答复"就说不清了。不并进 chess_rooms：那行每次都是整行写回、
    // 还要过 seq/status 两道乐观锁，而提和不涨 seq，也不该让一局棋卡在锁上。
    $conn->query("CREATE TABLE IF NOT EXISTS chess_room_draws (
        room_id INT PRIMARY KEY,
        offered_by CHAR(1) NOT NULL,
        offered_ms BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ready = true;
}

/** 没验证过邮箱的人只能下 AI —— 这是他定的门禁，进房和开房都要过。 */
function chess_require_verified() {
    $id = chess_require_player();
    $conn = chess_db();
    chess_schema($conn);
    $stmt = $conn->prepare("SELECT verified_at FROM chess_players WHERE id = ? LIMIT 1");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
        chess_err('no_such_player');
    }
    if ($row['verified_at'] === null) {
        chess_err('verify_required');
    }
    return $id;
}

/** 预约和申诉只给从未成为教练的账号。 */
function chess_require_student() {
    $id = chess_require_verified();
    if (chess_coach_was_teacher(chess_db(), $id)) {
        chess_err('coach_only');
    }
    return $id;
}

/** 按房间码取一行（不含昵称，昵称由端点另查）。 */
function chess_find_room($conn, $code) {
    chess_room_schema($conn);
    $stmt = $conn->prepare("SELECT id, code, white_player_id, black_player_id, fen, status,
            result, winner, time_ms, white_ms, black_ms, turn_started_ms, seq
        FROM chess_rooms WHERE code = ? LIMIT 1");
    $stmt->bind_param("s", $code);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

/**
 * mysqli 取回来的行全是字符串，规则层拿到的却是 int/null 混着写的数组
 * （'white_player_id' 为 null 表示空位）。不做这层还原，规则层里
 * $room['seq'] + 1 之类的比较会按字符串走，边界上出错还看不出来。
 */
function chess_room_from_row($row) {
    $intOrNull = static function ($value) {
        return $value === null ? null : (int) $value;
    };
    return [
        'id' => (int) $row['id'],
        'code' => $row['code'],
        'white_player_id' => $intOrNull($row['white_player_id']),
        'black_player_id' => $intOrNull($row['black_player_id']),
        'fen' => $row['fen'],
        'status' => $row['status'],
        'result' => $row['result'],
        'winner' => $row['winner'],
        'time_ms' => (int) $row['time_ms'],
        'white_ms' => (int) $row['white_ms'],
        'black_ms' => (int) $row['black_ms'],
        'turn_started_ms' => $intOrNull($row['turn_started_ms']),
        'seq' => (int) $row['seq'],
    ];
}

/** 新建房间；房间码撞了就换一个新的再来一次（唯一索引会挡住并发的那一个）。 */
function chess_insert_room($conn, array $room) {
    chess_room_schema($conn);
    for ($try = 0; $try < 5; $try++) {
        $code = $try === 0 ? $room['code'] : chess_room_code();
        $white = $room['white_player_id'];
        $black = $room['black_player_id'];
        $time = $room['time_ms'];
        $fen = $room['fen'];
        $status = $room['status'];
        $stmt = $conn->prepare("INSERT INTO chess_rooms
            (code, white_player_id, black_player_id, fen, status, result, winner,
             time_ms, white_ms, black_ms, turn_started_ms, seq, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, NULL, 0, NOW(), NOW())");
        $stmt->bind_param(
            "siissiii",
            $code,
            $white,
            $black,
            $fen,
            $status,
            $time,
            $time,
            $time
        );
        if ($stmt->execute()) {
            $room['code'] = $code;
            $room['id'] = (int) $conn->insert_id;
            $stmt->close();
            return $room;
        }
        $stmt->close();
        error_log('chess room insert try ' . ($try + 1) . ': ' . $conn->error);
        // 只有"房间码已存在"值得重试，别的错重试也一样
        if (stripos((string) $conn->error, 'uq_room_code') === false) {
            return null;
        }
    }
    return null;
}

/**
 * 写回房间。$expectSeq 是取到那一行时的 seq：0 行受影响 = 这行在我们读它之后
 * 被人改过（同一手双击、或对手已经走完），调用方回 stale_move，绝不能覆盖。
 *
 * $expectStatus 是给"不涨 seq 的改动"准备的（认输、超时结案）。这两类只改状态不改 seq，
 * 于是 WHERE seq = 0 对两个同时认输的人都会命中，后写的会把前一个人的
 * resign-white 改成 resign-black —— 比分就错了。加上状态预期就没这个问题：
 * 谁先把 active 改成 over，另一个人的 WHERE 就落空。走子不需要它（seq 一定变），
 * 但走子同样只在 active 时成立，所以一并传。
 */
function chess_write_room($conn, array $room, $expectSeq, $expectStatus = null) {
    $white = $room['white_player_id'];
    $black = $room['black_player_id'];
    $result = $room['result'];
    $winner = $room['winner'];
    $started = $room['turn_started_ms'];
    $sql = "UPDATE chess_rooms SET white_player_id = ?, black_player_id = ?,
            fen = ?, status = ?, result = ?, winner = ?, white_ms = ?, black_ms = ?,
            turn_started_ms = ?, seq = ?, updated_at = NOW()
        WHERE id = ? AND seq = ?" . ($expectStatus === null ? '' : ' AND status = ?');
    $params = [
        $white,
        $black,
        $room['fen'],
        $room['status'],
        $result,
        $winner,
        $room['white_ms'],
        $room['black_ms'],
        $started,
        $room['seq'],
        $room['id'],
        $expectSeq,
    ];
    // 顺序必须和上面 SQL 里的 ? 一一对应：i = 整数，s = 字符串/NULL。
    //  mysqli 只认 i/d/s/b 这四个字符，写进去别的（11-23 线上就是误写了 'a'）
    //  不是"类型宽松一点"，是整条 UPDATE 直接失败。
    $types = 'iissssiiiiii';
    if ($expectStatus !== null) {
        $params[] = $expectStatus;
        $types .= 's';
    }
    // 数错一个 ?、或者写了 mysqli 不认的类型字符，结果都是"房间停在旧状态不动"，
    // 两边各看一份局面。这种错必须当场报出来，所以这里自检一次。
    if (count($params) !== strlen($types) || strlen($types) !== substr_count($sql, '?')
        || preg_match('/[^idbs]/', $types)) {
        error_log('chess write room: bind mismatch (' . strlen($types) . ' types "' . $types
            . '", ' . count($params) . ' params, ' . substr_count($sql, '?') . ' placeholders)');
        return false;
    }
    $stmt = $conn->prepare($sql);
    if ($stmt === false) {
        error_log('chess write room: prepare failed: ' . $conn->error);
        return false;
    }
    $stmt->bind_param($types, ...$params);
    $ok = $stmt->execute();
    if (!$ok) {
        error_log('chess write room: execute failed: ' . $stmt->error);
    }
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $ok && $affected === 1;
}

/**
 * 抢一个空位。座位是被这条语句本身抢下来的，不能靠 chess_write_room：
 * 进房不涨 seq，两个人同时进同一个房间时两个 WHERE seq = 0 都会命中，
 * 后写的会把前一个人顶出座位。所以按"这个座位还是空的"来卡，
 * 座位名只能取这两个字面值（不能绑定，所以白名单而不是拼接输入）。
 * $seat 由 chess_room_join 的返回值给出，不是用户输入。
 */
function chess_room_claim_seat($conn, $roomId, $seat, $playerId, $nowMs) {
    if ($seat !== 'white_player_id' && $seat !== 'black_player_id') {
        error_log('chess claim seat: unexpected seat ' . var_export($seat, true));
        return false;
    }
    $stmt = $conn->prepare("UPDATE chess_rooms SET {$seat} = ?, status = 'active',
            turn_started_ms = ?, updated_at = NOW()
        WHERE id = ? AND {$seat} IS NULL AND status = 'waiting'");
    $stmt->bind_param("iii", $playerId, $nowMs, $roomId);
    $ok = $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $ok && $affected === 1;
}

/** 记一手棋。和 chess_write_room 在同一个请求里，两个都成功才算走完这一步。 */
function chess_insert_event($conn, $roomId, array $event) {
    $seq = $event['seq'];
    $by = $event['played_by'];
    $stmt = $conn->prepare("INSERT INTO chess_room_events (room_id, seq, san, fen_after, played_by, played_at)
        VALUES (?, ?, ?, ?, ?, NOW())");
    $stmt->bind_param("iissi", $roomId, $seq, $event['san'], $event['fen_after'], $by);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

/**
 * seq > $since 的事件，给轮询和掉线重进用。
 * 上限取 200 是因为重进（since=0）要一次把整份棋谱拿回去：一局少儿对弈常见的
 * 是 60–100 手，卡到 60 就会让重进来的人看到半份棋谱。200 条约 24KB，一次性的。
 */
function chess_room_events($conn, $roomId, $since, $cap = 200) {
    $stmt = $conn->prepare("SELECT seq, san, fen_after, played_by, played_at
        FROM chess_room_events WHERE room_id = ? AND seq > ? ORDER BY seq ASC LIMIT " . (int) $cap);
    $stmt->bind_param("ii", $roomId, $since);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'seq' => (int) $row['seq'],
            'san' => $row['san'],
            'fen_after' => $row['fen_after'],
            'played_by' => (int) $row['played_by'],
            'played_at' => $row['played_at'],
        ];
    }
    $stmt->close();
    return $rows;
}

/** 房间里两个人的昵称；规则层不该知道昵称，所以由端点查了传进去。 */
function chess_room_names($conn, array $room) {
    $ids = array_filter([$room['white_player_id'], $room['black_player_id']]);
    if (!$ids) {
        return [];
    }
    $in = implode(',', array_map('intval', $ids));
    $names = [];
    $result = $conn->query("SELECT id, nickname FROM chess_players WHERE id IN ({$in})");
    while ($row = $result->fetch_assoc()) {
        $names[(int) $row['id']] = $row['nickname'];
    }
    return $names;
}

/* --------------------------------------------------------------------------
 * 提和。规则在 chess_room_core.php（纯函数），这里只管那张一行一房的小表。
 * ------------------------------------------------------------------------ */

/** 这间房待答复的提和；没有返回 null（"没有人提"是常态）。 */
function chess_draw_read($conn, $roomId) {
    chess_room_schema($conn);
    $stmt = $conn->prepare("SELECT offered_by, offered_ms FROM chess_room_draws WHERE room_id = ? LIMIT 1");
    $stmt->bind_param("i", $roomId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? ['by' => $row['offered_by'], 'at_ms' => (int) $row['offered_ms']] : null;
}

/** 记下一条提和。同一间房再来一条就覆盖 —— 主键已经把"最多一条"钉死在库里。 */
function chess_draw_write($conn, $roomId, $by, $nowMs) {
    chess_room_schema($conn);
    $stmt = $conn->prepare("INSERT INTO chess_room_draws (room_id, offered_by, offered_ms)
        VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE offered_by = VALUES(offered_by), offered_ms = VALUES(offered_ms)");
    $stmt->bind_param("isi", $roomId, $by, $nowMs);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

/** 清掉提和：答复完了、有人走了一步、或者这局已经结束。 */
function chess_draw_clear($conn, $roomId) {
    chess_room_schema($conn);
    $stmt = $conn->prepare("DELETE FROM chess_room_draws WHERE room_id = ?");
    $stmt->bind_param("i", $roomId);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

/* --------------------------------------------------------------------------
 * 课堂（P3）。和房间分开：课堂没有计时器、成员是 1 老师 + N 学生、
 * 事件类型不只是走子（还有标注、举手、批准）。
 * ------------------------------------------------------------------------ */

function chess_class_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    $conn->query("CREATE TABLE IF NOT EXISTS chess_classes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code CHAR(4) NOT NULL,
        teacher_id INT NOT NULL,
        fen VARCHAR(90) NOT NULL,
        status VARCHAR(16) NOT NULL,
        seq INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY uq_class_code (code),
        INDEX idx_class_teacher (teacher_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS chess_class_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        class_id INT NOT NULL,
        player_id INT NOT NULL,
        role VARCHAR(16) NOT NULL,
        hand_status VARCHAR(16) NOT NULL DEFAULT 'none',
        joined_at DATETIME NOT NULL,
        UNIQUE KEY uq_class_player (class_id, player_id),
        INDEX idx_class_hand (class_id, hand_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("CREATE TABLE IF NOT EXISTS chess_class_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        class_id INT NOT NULL,
        seq INT NOT NULL,
        type VARCHAR(16) NOT NULL,
        data TEXT NOT NULL,
        actor_id INT NOT NULL,
        created_at DATETIME NOT NULL,
        UNIQUE KEY uq_class_seq (class_id, seq),
        INDEX idx_class_events (class_id, seq)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ready = true;
}

function chess_find_class($conn, $code) {
    chess_class_schema($conn);
    $stmt = $conn->prepare("SELECT id, code, teacher_id, fen, status, seq
        FROM chess_classes WHERE code = ? LIMIT 1");
    $stmt->bind_param("s", $code);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

function chess_class_from_row($row) {
    return [
        'id' => (int) $row['id'],
        'code' => $row['code'],
        'teacher_id' => (int) $row['teacher_id'],
        'fen' => $row['fen'],
        'status' => $row['status'],
        'seq' => (int) $row['seq'],
    ];
}

function chess_class_for_update($conn, $classId) {
    $stmt = $conn->prepare("SELECT id, code, teacher_id, fen, status, seq
        FROM chess_classes WHERE id = ? LIMIT 1 FOR UPDATE");
    $stmt->bind_param("i", $classId);
    if (!$stmt->execute()) {
        $stmt->close();
        throw new RuntimeException('class lock failed');
    }
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

function chess_class_member_for_update($conn, $classId, $playerId) {
    $stmt = $conn->prepare("SELECT role, hand_status FROM chess_class_members
        WHERE class_id = ? AND player_id = ? LIMIT 1 FOR UPDATE");
    $stmt->bind_param("ii", $classId, $playerId);
    if (!$stmt->execute()) {
        $stmt->close();
        throw new RuntimeException('class member lock failed');
    }
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

function chess_insert_class($conn, array $class) {
    chess_class_schema($conn);
    for ($try = 0; $try < 5; $try++) {
        $code = $try === 0 ? $class['code'] : chess_class_code();
        $teacher = $class['teacher_id'];
        $fen = $class['fen'];
        $status = $class['status'];
        $stmt = $conn->prepare("INSERT INTO chess_classes
            (code, teacher_id, fen, status, seq, created_at, updated_at)
            VALUES (?, ?, ?, ?, 0, NOW(), NOW())");
        $stmt->bind_param("siss", $code, $teacher, $fen, $status);
        if ($stmt->execute()) {
            $class['code'] = $code;
            $class['id'] = (int) $conn->insert_id;
            $stmt->close();
            return $class;
        }
        $stmt->close();
        if (stripos((string) $conn->error, 'uq_class_code') === false) {
            return null;
        }
    }
    return null;
}

function chess_write_class($conn, array $class, $expectSeq) {
    $stmt = $conn->prepare("UPDATE chess_classes SET fen = ?, status = ?, seq = ?, updated_at = NOW()
        WHERE id = ? AND seq = ?");
    $stmt->bind_param("ssiii", $class['fen'], $class['status'], $class['seq'], $class['id'], $expectSeq);
    $ok = $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $ok && $affected === 1;
}

function chess_class_members($conn, $classId) {
    chess_class_schema($conn);
    $result = $conn->query(
        "SELECT cm.player_id, cm.role, cm.hand_status, p.nickname
        FROM chess_class_members cm
        JOIN chess_players p ON p.id = cm.player_id
        WHERE cm.class_id = {$classId}
        ORDER BY cm.joined_at ASC"
    );
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'player_id' => (int) $row['player_id'],
            'role' => $row['role'],
            'hand_status' => $row['hand_status'],
            'nickname' => $row['nickname'],
        ];
    }
    return $rows;
}

function chess_class_member($conn, $classId, $playerId) {
    $stmt = $conn->prepare("SELECT role, hand_status FROM chess_class_members
        WHERE class_id = ? AND player_id = ? LIMIT 1");
    $stmt->bind_param("ii", $classId, $playerId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

function chess_class_add_member($conn, $classId, $playerId, $role) {
    chess_class_schema($conn);
    $stmt = $conn->prepare("INSERT IGNORE INTO chess_class_members
        (class_id, player_id, role, hand_status, joined_at) VALUES (?, ?, ?, 'none', NOW())");
    $stmt->bind_param("iis", $classId, $playerId, $role);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

function chess_class_remove_member($conn, $classId, $playerId) {
    $stmt = $conn->prepare("DELETE FROM chess_class_members WHERE class_id = ? AND player_id = ?");
    $stmt->bind_param("ii", $classId, $playerId);
    $ok = $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $ok && $affected === 1;
}

function chess_class_set_hand($conn, $classId, $playerId, $status) {
    $stmt = $conn->prepare("UPDATE chess_class_members SET hand_status = ?
        WHERE class_id = ? AND player_id = ?");
    $stmt->bind_param("sii", $status, $classId, $playerId);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

function chess_class_insert_event($conn, $classId, array $event) {
    // 规则层给的是数组，库里存 TEXT，所以在这里编码一次。端点回给客户端的仍是
    // 数组——两边形状一样，客户端不必分「刚发出去的」和「轮询回来的」两种事件。
    $data = is_string($event['data']) ? $event['data'] : json_encode($event['data'], JSON_UNESCAPED_UNICODE);
    $stmt = $conn->prepare("INSERT INTO chess_class_events (class_id, seq, type, data, actor_id, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())");
    $stmt->bind_param("iissi", $classId, $event['seq'], $event['type'], $data, $event['actor_id']);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

function chess_class_events($conn, $classId, $since, $cap = 200) {
    $stmt = $conn->prepare("SELECT seq, type, data, actor_id, created_at
        FROM chess_class_events WHERE class_id = ? AND seq > ? ORDER BY seq ASC LIMIT " . (int) $cap);
    $stmt->bind_param("ii", $classId, $since);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = [
            'seq' => (int) $row['seq'],
            'type' => $row['type'],
            // 写进去时是 json_encode 的字符串，读出来还原成对象：客户端不该再解一次，
            // 解错的地方也就不存在了。
            'data' => json_decode((string) $row['data'], true) ?? [],
            'actor_id' => (int) $row['actor_id'],
            'created_at' => $row['created_at'],
        ];
    }
    $stmt->close();
    return $rows;
}

function chess_class_close($conn, $classId, $expectSeq) {
    $stmt = $conn->prepare("UPDATE chess_classes SET status = 'closed', seq = seq + 1, updated_at = NOW()
        WHERE id = ? AND seq = ?");
    $stmt->bind_param("ii", $classId, $expectSeq);
    $ok = $stmt->execute();
    $affected = $stmt->affected_rows;
    $stmt->close();
    return $ok && $affected === 1;
}

/* --------------------------------------------------------------------------
 * 教练偏好（P3）。什么算一个合法的偏好，全在 chess_coach_core.php；
 * 这里只管建表、取那一行、把一行还原成规则层的形状。
 * ------------------------------------------------------------------------ */

/**
 * 一人一行，player_id 就是主键 —— 这个表没有"多份偏好"可言，
 * 存第二次是改而不是加，所以端点用 ON DUPLICATE KEY UPDATE。
 *
 * 多选存逗号串而不是 JSON：这一列只被"取出自己那一行"用（教练那边的匹配
 * 之后按 FIND_IN_SET 数人），而共享主机的 MySQL 版本没法在这儿验，
 * chess_library 那张表用 JSON 建没建成我此刻也无从查起。逗号串在任何
 * 一个还活着的版本上都是一列 VARCHAR —— 少一个能静默失败的地方。
 */
function chess_schema_column($conn, $table, $column, $definition, $after = null) {
    $result = $conn->query("SHOW COLUMNS FROM {$table} LIKE '{$column}'");
    if ($result instanceof mysqli_result && $result->num_rows > 0) {
        return;
    }
    $tail = $after === null ? '' : " AFTER {$after}";
    try {
        $migrated = $conn->query("ALTER TABLE {$table} ADD COLUMN {$column} {$definition}{$tail}");
    } catch (Throwable $e) {
        if ((int) $conn->errno === 1060) {
            return;
        }
        error_log('chess schema: add ' . $table . '.' . $column . ' failed: ' . $conn->error);
        return;
    }
    if (!$migrated && (int) $conn->errno !== 1060) {
        error_log('chess schema: add ' . $table . '.' . $column . ' failed: ' . $conn->error);
    }
}

function chess_coach_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    $conn->query("CREATE TABLE IF NOT EXISTS chess_coach_prefs (
        player_id INT PRIMARY KEY,
        level VARCHAR(16) NOT NULL,
        goals VARCHAR(64) NOT NULL,
        formats VARCHAR(32) NOT NULL,
        slots VARCHAR(64) NOT NULL,
        timezone VARCHAR(40) NOT NULL,
        language VARCHAR(8) NOT NULL,
        note VARCHAR(240) NOT NULL DEFAULT '',
        contact_ok TINYINT(1) NOT NULL DEFAULT 0,
        budget_min_cny INT NULL,
        budget_max_cny INT NULL,
        schedule_note VARCHAR(" . COACH_SCHEDULE_NOTE_MAX . ") NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        INDEX idx_coach_level (level),
        FOREIGN KEY (player_id) REFERENCES chess_players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    chess_schema_column($conn, 'chess_coach_prefs', 'budget_min_cny', 'INT NULL', 'contact_ok');
    chess_schema_column($conn, 'chess_coach_prefs', 'budget_max_cny', 'INT NULL', 'budget_min_cny');
    chess_schema_column($conn, 'chess_coach_prefs', 'schedule_note',
        'VARCHAR(' . COACH_SCHEDULE_NOTE_MAX . ") NOT NULL DEFAULT ''", 'budget_max_cny');
    $ready = true;
}

/** 这个人的偏好；没填过返回 null（"没填"是正常状态，不是错误）。 */
function chess_coach_pref_read($conn, $playerId) {
    chess_coach_schema($conn);
    $stmt = $conn->prepare("SELECT level, goals, formats, slots, timezone, language,
            note, contact_ok, budget_min_cny, budget_max_cny, schedule_note, updated_at
        FROM chess_coach_prefs WHERE player_id = ? LIMIT 1");
    $stmt->bind_param("i", $playerId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

/**
 * 存（或改）这个人的偏好。$pref 是 coach_pref_normalize() 通过后的那一份，
 * 所以这里的字段顺序就是规则层的字段顺序，端点不参与判断合不合法。
 *
 * created_at 只在第一次插入时写：ON DUPLICATE KEY UPDATE 那一段里不碰它，
 * 于是"什么时候开始想找教练"和"最后一次改是什么时候"两个时刻都留得住。
 */
function chess_coach_pref_write($conn, $playerId, array $pref) {
    chess_coach_schema($conn);
    $stmt = $conn->prepare("INSERT INTO chess_coach_prefs
        (player_id, level, goals, formats, slots, timezone, language, note, contact_ok,
         budget_min_cny, budget_max_cny, schedule_note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE level = VALUES(level), goals = VALUES(goals),
            formats = VALUES(formats), slots = VALUES(slots), timezone = VALUES(timezone),
            language = VALUES(language), note = VALUES(note),
            contact_ok = VALUES(contact_ok), budget_min_cny = VALUES(budget_min_cny),
            budget_max_cny = VALUES(budget_max_cny), schedule_note = VALUES(schedule_note),
            updated_at = NOW()");
    if ($stmt === false) {
        error_log('chess coach pref: prepare failed: ' . $conn->error);
        return false;
    }
    $stmt->bind_param(
        "isssssssiiis",
        $playerId,
        $pref['level'],
        $pref['goals'],
        $pref['formats'],
        $pref['slots'],
        $pref['timezone'],
        $pref['language'],
        $pref['note'],
        $pref['contact_ok'],
        $pref['budget_min_cny'],
        $pref['budget_max_cny'],
        $pref['schedule_note']
    );
    $ok = $stmt->execute();
    if (!$ok) {
        error_log('chess coach pref: execute failed: ' . $stmt->error);
    }
    $stmt->close();
    return $ok;
}

/* --------------------------------------------------------------------------
 * 想当教练的申请（P4）。一张表当两件事用：申请本身 + "谁能开课堂"的资格位。
 *
 * 为什么资格位要落在数据库而不是界面：棋盘上那个【开课堂】按钮藏不藏得住
 * 都不算挡 —— 直接对 chess_class_create.php 发一个请求就是绕过去。
 * 按钮的显示状态（coachApp.js）只是少让人点一次错，真正的门在这里：
 * status 只能被 coach_admin_decide.php 改成 approved。
 *
 * 一人一行（player_id 就是主键）：改介绍改的是同一份申请，不会出现
 * "一个人三条申请、管理员批了最老的那条"这种现场。
 * ------------------------------------------------------------------------ */

function chess_app_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    chess_schema($conn);     // 那句 FOREIGN KEY 要 chess_players 先在
    // 偏好表也要在：chess_app_list() 里那句 has_pref 子查询和后台那几个数都点它。
    // 表还没建时 mysqli 不是报错而是让整条 SELECT 返回 false ——
    // 管理员看到的会是一张"没有人申请"的空表，而这其实是查询没跑成。
    chess_coach_schema($conn);
    $conn->query("CREATE TABLE IF NOT EXISTS chess_coach_apps (
        player_id INT PRIMARY KEY,
        status VARCHAR(16) NOT NULL,
        intro VARCHAR(" . COACH_INTRO_MAX . ") NOT NULL DEFAULT '',
        submitted_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        decided_at DATETIME NULL,
        decided_by INT NULL,
        INDEX idx_app_status (status, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $ready = true;
}

/** 资格撤销与"曾经是教练"的永久标记；申请状态变化不会清掉它。 */
function chess_coach_standing_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    chess_app_schema($conn);
    chess_class_schema($conn);
    chess_profile_schema($conn);
    $conn->query("CREATE TABLE IF NOT EXISTS chess_coach_standing (
        player_id INT PRIMARY KEY,
        status ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
        was_coach TINYINT(1) NOT NULL DEFAULT 0,
        revoked_at DATETIME NULL,
        revoked_by INT NULL,
        revoke_complaint_id INT NULL,
        reason VARCHAR(" . COACH_RESTORE_REASON_MAX . ") NOT NULL DEFAULT '',
        restored_at DATETIME NULL,
        restored_by INT NULL,
        restore_reason VARCHAR(" . COACH_RESTORE_REASON_MAX . ") NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        INDEX idx_standing_status (status, was_coach),
        FOREIGN KEY (player_id) REFERENCES chess_players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $conn->query("INSERT IGNORE INTO chess_coach_standing
        (player_id, status, was_coach, created_at, updated_at)
        SELECT player_id, 'active', 1, NOW(), NOW() FROM chess_coach_apps WHERE status = 'approved'");
    $conn->query("INSERT IGNORE INTO chess_coach_standing
        (player_id, status, was_coach, created_at, updated_at)
        SELECT DISTINCT player_id, 'active', 1, NOW(), NOW() FROM chess_class_members
        WHERE role = 'teacher'");
    $conn->query("INSERT IGNORE INTO chess_coach_standing
        (player_id, status, was_coach, created_at, updated_at)
        SELECT DISTINCT teacher_id, 'active', 1, NOW(), NOW() FROM chess_classes");
    $conn->query("INSERT IGNORE INTO chess_coach_standing
        (player_id, status, was_coach, created_at, updated_at)
        SELECT player_id, 'active', 1, NOW(), NOW() FROM chess_coach_profiles");
    $tables = $conn->query("SHOW TABLES LIKE 'admin_users'");
    if ($tables instanceof mysqli_result && $tables->num_rows > 0) {
        $conn->query("INSERT IGNORE INTO chess_coach_standing
            (player_id, status, was_coach, created_at, updated_at)
            SELECT p.id, 'active', 1, NOW(), NOW() FROM chess_players p
            JOIN admin_users a ON a.email = p.email");
    }
    $ready = true;
}

function chess_player_standing($conn, $playerId) {
    chess_coach_standing_schema($conn);
    $stmt = $conn->prepare("SELECT player_id, status, was_coach, revoked_at, revoked_by,
            revoke_complaint_id, reason, restored_at, restored_by, restore_reason, updated_at
        FROM chess_coach_standing WHERE player_id = ? LIMIT 1");
    $stmt->bind_param("i", $playerId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

function chess_lock_player_standing($conn, $playerId) {
    $stmt = $conn->prepare("INSERT INTO chess_coach_standing
        (player_id, status, was_coach, created_at, updated_at)
        VALUES (?, 'active', 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE player_id = VALUES(player_id)");
    $stmt->bind_param("i", $playerId);
    if (!$stmt->execute()) {
        $stmt->close();
        throw new RuntimeException('standing lock failed');
    }
    $stmt->close();
    $stmt = $conn->prepare("SELECT player_id, status, was_coach, revoked_at, revoked_by,
            revoke_complaint_id, reason, restored_at, restored_by, restore_reason, updated_at
        FROM chess_coach_standing WHERE player_id = ? LIMIT 1 FOR UPDATE");
    $stmt->bind_param("i", $playerId);
    if (!$stmt->execute()) {
        $stmt->close();
        throw new RuntimeException('standing lock read failed');
    }
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

function chess_coach_standing_mark($conn, $playerId) {
    chess_coach_standing_schema($conn);
    $stmt = $conn->prepare("INSERT INTO chess_coach_standing
        (player_id, status, was_coach, created_at, updated_at)
        VALUES (?, 'active', 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE was_coach = 1");
    $stmt->bind_param("i", $playerId);
    $ok = $stmt->execute();
    $stmt->close();
    return $ok;
}

function chess_player_is_revoked($conn, $playerId) {
    return coach_standing_is_revoked(chess_player_standing($conn, $playerId));
}

/** 当前管理员、批准过的申请或教过课堂的人都算教练，含已撤销资格的人。 */
function chess_coach_was_teacher($conn, $playerId) {
    $playerId = (int) $playerId;
    if ($playerId < 1) {
        return false;
    }
    $standing = chess_player_standing($conn, $playerId);
    if ((int) ($standing['was_coach'] ?? 0) === 1) {
        return true;
    }
    $app = chess_app_read($conn, $playerId);
    if (coach_key($app['status'] ?? null) === 'approved') {
        chess_coach_standing_mark($conn, $playerId);
        return true;
    }
    if (chess_player_is_admin($conn, $playerId)) {
        return true;
    }
    $stmt = $conn->prepare("SELECT 1 FROM chess_class_members
        WHERE player_id = ? AND role = 'teacher' LIMIT 1");
    $stmt->bind_param("i", $playerId);
    $stmt->execute();
    $found = $stmt->get_result()->fetch_assoc() !== null;
    $stmt->close();
    if ($found) {
        chess_coach_standing_mark($conn, $playerId);
    }
    return $found;
}

function chess_coach_complaints_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    chess_coach_standing_schema($conn);
    $conn->query("CREATE TABLE IF NOT EXISTS chess_coach_complaints (
        id INT AUTO_INCREMENT PRIMARY KEY,
        coach_id INT NOT NULL,
        reporter_id INT NOT NULL,
        text TEXT NOT NULL,
        text_hash CHAR(64) NOT NULL,
        status ENUM('pending', 'upheld', 'rejected') NOT NULL DEFAULT 'pending',
        severity ENUM('normal', 'severe') NOT NULL DEFAULT 'normal',
        public_text TEXT NOT NULL,
        decided_by INT NULL,
        decided_at DATETIME NULL,
        published_at DATETIME NULL,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE KEY uq_coach_complaint_reporter_hash (coach_id, reporter_id, text_hash),
        INDEX idx_complaint_pending (coach_id, reporter_id, status),
        INDEX idx_complaint_public (coach_id, status, published_at, id),
        FOREIGN KEY (coach_id) REFERENCES chess_players(id) ON DELETE CASCADE,
        FOREIGN KEY (reporter_id) REFERENCES chess_players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $inspect = static function () use ($conn) {
        $indexes = [];
        $result = $conn->query("SHOW INDEX FROM chess_coach_complaints");
        if (!$result) {
            throw new RuntimeException('complaint index inspection failed');
        }
        while ($row = $result->fetch_assoc()) {
            $indexes[(string) $row['Key_name']][(int) $row['Seq_in_index']][] = $row;
        }
        $result->free();
        $hasReporterHash = false;
        $hasLegacyHash = false;
        foreach ($indexes as $keyRows) {
            ksort($keyRows);
            $columns = array_merge(...array_values($keyRows));
            $names = array_column($columns, 'Column_name');
            $keyName = (string) ($columns[0]['Key_name'] ?? '');
            $unique = (int) ($columns[0]['Non_unique'] ?? 1) === 0;
            if ($names === ['coach_id', 'reporter_id', 'text_hash'] && $unique) {
                $hasReporterHash = true;
            }
            if ($keyName === 'uq_coach_complaint_hash'
                && $names === ['coach_id', 'text_hash'] && $unique) {
                $hasLegacyHash = true;
            }
        }
        return [$hasReporterHash, $hasLegacyHash];
    };
    [$hasReporterHash, $hasLegacyHash] = $inspect();
    if ($hasLegacyHash) {
        if (!$conn->query("ALTER TABLE chess_coach_complaints DROP INDEX uq_coach_complaint_hash")
            && (int) $conn->errno !== 1091) {
            throw new RuntimeException('complaint legacy index migration failed');
        }
    }
    if (!$hasReporterHash) {
        if (!$conn->query("ALTER TABLE chess_coach_complaints
            ADD UNIQUE KEY uq_coach_complaint_reporter_hash (coach_id, reporter_id, text_hash)")) {
            if ((int) $conn->errno !== 1061) {
                throw new RuntimeException('complaint reporter index migration failed');
            }
            [$hasReporterHash] = $inspect();
            if (!$hasReporterHash) {
                throw new RuntimeException('complaint reporter index migration conflicted');
            }
        }
    }
    $ready = true;
}

/** 同一教练的待处理申诉串行写入，避免两人同时绕过"一人一条待处理"。 */
function chess_coach_complaint_save($conn, $reporterId, $coachId, $text, $textHash) {
    chess_coach_complaints_schema($conn);
    chess_schema($conn);
    $reporterId = (int) $reporterId;
    $coachId = (int) $coachId;
    $limits = [
        ['scope' => 'cp_s_' . $reporterId, 'ip' => 'student', 'limit' => CHESS_COMPLAINT_STUDENT_LIMIT],
        ['scope' => 'cp_c_' . $coachId, 'ip' => 'coach', 'limit' => CHESS_COMPLAINT_COACH_LIMIT],
    ];
    usort($limits, static fn ($a, $b) => [$a['scope'], $a['ip']] <=> [$b['scope'], $b['ip']]);
    $cutoff = date('Y-m-d H:i:s', time() - CHESS_COMPLAINT_WINDOW);
    try {
        return chess_transaction_retry($conn, static function () use ($conn, $reporterId, $coachId, $text, $textHash, $limits, $cutoff) {
            chess_lock_player_standing($conn, $coachId);

            $stmt = $conn->prepare("SELECT id FROM chess_coach_complaints
                WHERE coach_id = ? AND reporter_id = ? AND status = 'pending' LIMIT 1 FOR UPDATE");
            $stmt->bind_param("ii", $coachId, $reporterId);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new RuntimeException('complaint pending read failed');
            }
            $pending = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($pending) {
                return ['ok' => false, 'code' => 'complaint_pending'];
            }

            $stmt = $conn->prepare("SELECT id FROM chess_coach_complaints
                WHERE coach_id = ? AND reporter_id = ? AND text_hash = ? LIMIT 1");
            $stmt->bind_param("iis", $coachId, $reporterId, $textHash);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new RuntimeException('complaint duplicate read failed');
            }
            $duplicate = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($duplicate) {
                return ['ok' => false, 'code' => 'duplicate_complaint'];
            }
            if (!chess_take_rate_limits_locked($conn, $limits, $cutoff)) {
                return ['ok' => false, 'code' => 'too_many_complaints'];
            }

            $stmt = $conn->prepare("INSERT INTO chess_coach_complaints
                (coach_id, reporter_id, text, text_hash, status, severity, public_text,
                 created_at, updated_at)
                VALUES (?, ?, ?, ?, 'pending', 'normal', '', NOW(), NOW())");
            $stmt->bind_param("iiss", $coachId, $reporterId, $text, $textHash);
            if (!$stmt->execute()) {
                $errno = (int) $conn->errno;
                $stmt->close();
                if ($errno === 1062) {
                    return ['ok' => false, 'code' => 'duplicate_complaint'];
                }
                throw new RuntimeException('complaint insert failed');
            }
            $id = (int) $conn->insert_id;
            $stmt->close();

            $stmt = $conn->prepare("SELECT c.id, c.coach_id, c.text, c.public_text, c.status, c.severity,
                    c.created_at, c.decided_at, c.published_at, p.nickname AS coach_nickname
                FROM chess_coach_complaints c
                JOIN chess_players p ON p.id = c.coach_id
                WHERE c.id = ? LIMIT 1");
            $stmt->bind_param("i", $id);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new RuntimeException('complaint receipt read failed');
            }
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$row) {
                throw new RuntimeException('complaint receipt missing');
            }
            return ['ok' => true, 'id' => $id, 'code' => null,
                'complaint' => coach_complaint_private($row) + ['coach_nickname' => (string) $row['coach_nickname']]];
        });
    } catch (Throwable $e) {
        error_log('chess complaint save: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'server'];
    }
}

function chess_coach_complaint_receipt_row($conn, $complaintId) {
    chess_coach_complaints_schema($conn);
    $stmt = $conn->prepare("SELECT id, coach_id, status, created_at
        FROM chess_coach_complaints WHERE id = ? LIMIT 1");
    $stmt->bind_param("i", $complaintId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

function chess_coach_complaint_current($conn, $complaintId) {
    chess_coach_complaints_schema($conn);
    $stmt = $conn->prepare("SELECT id, coach_id, status, severity
        FROM chess_coach_complaints WHERE id = ? LIMIT 1");
    $stmt->bind_param("i", $complaintId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

function chess_coach_complaint_admin_row($conn, $complaintId) {
    chess_coach_complaints_schema($conn);
    $stmt = $conn->prepare("SELECT c.id, c.coach_id, c.text, c.public_text, c.status, c.severity,
            c.created_at, c.decided_at, c.published_at, p.nickname AS coach_name,
            p.nickname AS coach_nickname, s.status AS standing_status, s.restored_at
        FROM chess_coach_complaints c
        JOIN chess_players p ON p.id = c.coach_id
        LEFT JOIN chess_coach_standing s ON s.player_id = c.coach_id
        WHERE c.id = ? LIMIT 1");
    $stmt->bind_param("i", $complaintId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? coach_complaint_admin($row) : null;
}

function chess_coach_complaints_for_coach($conn, $coachId) {
    chess_coach_complaints_schema($conn);
    $stmt = $conn->prepare("SELECT id, coach_id, text, public_text, status, severity,
            created_at, decided_at, published_at
        FROM chess_coach_complaints WHERE coach_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 100");
    $stmt->bind_param("i", $coachId);
    $stmt->execute();
    $rows = [];
    while ($row = $stmt->get_result()->fetch_assoc()) {
        $rows[] = coach_complaint_for_coach($row);
    }
    $stmt->close();
    return $rows;
}

function chess_student_complaints($conn, $studentId) {
    chess_coach_complaints_schema($conn);
    $stmt = $conn->prepare("SELECT c.id, c.coach_id, c.text, c.public_text, c.status, c.severity,
            c.created_at, c.decided_at, c.published_at, p.nickname AS coach_nickname
        FROM chess_coach_complaints c
        JOIN chess_players p ON p.id = c.coach_id
        WHERE c.reporter_id = ? ORDER BY c.created_at DESC, c.id DESC LIMIT 100");
    $stmt->bind_param("i", $studentId);
    $stmt->execute();
    $rows = [];
    while ($row = $stmt->get_result()->fetch_assoc()) {
        $rows[] = coach_complaint_private($row) + ['coach_nickname' => (string) $row['coach_nickname']];
    }
    $stmt->close();
    return $rows;
}

/** 后来成为教练的账号，也保留自己以前提交的申诉历史。 */
function chess_player_complaints($conn, $playerId) {
    chess_coach_complaints_schema($conn);
    $stmt = $conn->prepare("SELECT * FROM (
            SELECT c.id, c.coach_id, c.text, c.public_text, c.status, c.severity,
                c.created_at, c.decided_at, c.published_at, p.nickname AS coach_nickname,
                'received' AS relation
            FROM chess_coach_complaints c
            JOIN chess_players p ON p.id = c.coach_id
            WHERE c.coach_id = ?
            UNION ALL
            SELECT c.id, c.coach_id, c.text, c.public_text, c.status, c.severity,
                c.created_at, c.decided_at, c.published_at, p.nickname AS coach_nickname,
                'submitted' AS relation
            FROM chess_coach_complaints c
            JOIN chess_players p ON p.id = c.coach_id
            WHERE c.reporter_id = ? AND c.coach_id <> ?
        ) AS records ORDER BY created_at DESC, id DESC LIMIT 100");
    $stmt->bind_param("iii", $playerId, $playerId, $playerId);
    if (!$stmt->execute()) {
        $stmt->close();
        throw new RuntimeException('player complaints query failed');
    }
    $rows = [];
    while ($row = $stmt->get_result()->fetch_assoc()) {
        $rows[] = ($row['relation'] === 'submitted'
            ? coach_complaint_private($row)
            : coach_complaint_for_coach($row))
            + ['coach_nickname' => (string) $row['coach_nickname'], 'relation' => $row['relation']];
    }
    $stmt->close();
    return $rows;
}

function chess_coach_complaints_admin($conn, $status = null, $cap = 100) {
    chess_coach_complaints_schema($conn);
    $limit = max(1, min(200, (int) $cap));
    $where = '';
    if ($status !== null) {
        $safe = in_array($status, COACH_COMPLAINT_STATUSES, true) ? $status : 'pending';
        $where = " WHERE c.status = '{$safe}'";
    }
    $result = $conn->query("SELECT c.id, c.coach_id, c.text, c.public_text, c.status, c.severity,
            c.created_at, c.decided_at, c.published_at, p.nickname AS coach_name,
            p.nickname AS coach_nickname, s.status AS standing_status, s.restored_at
        FROM chess_coach_complaints c
        JOIN chess_players p ON p.id = c.coach_id
        LEFT JOIN chess_coach_standing s ON s.player_id = c.coach_id{$where}
        ORDER BY c.created_at DESC, c.id DESC LIMIT {$limit}");
    $rows = [];
    if (!$result) {
        throw new RuntimeException('complaint admin query failed: ' . $conn->error);
    }
    while ($row = $result->fetch_assoc()) {
        $rows[] = coach_complaint_admin($row);
    }
    $result->free();
    return $rows;
}

function chess_coach_complaints_public($conn, $coachId, $cap = 20) {
    chess_coach_complaints_schema($conn);
    $limit = max(1, min(20, (int) $cap));
    $stmt = $conn->prepare("SELECT id, public_text, severity, published_at
        FROM chess_coach_complaints
        WHERE coach_id = ? AND status = 'upheld' AND public_text <> '' AND published_at IS NOT NULL
        ORDER BY published_at DESC, id DESC LIMIT {$limit}");
    $stmt->bind_param("i", $coachId);
    $stmt->execute();
    $rows = [];
    while ($row = $stmt->get_result()->fetch_assoc()) {
        $rows[] = coach_complaint_public($row);
    }
    $stmt->close();
    return $rows;
}

function chess_coach_complaint_decide($conn, $complaintId, array $decision, $adminId) {
    chess_coach_complaints_schema($conn);
    $complaintId = (int) $complaintId;
    $adminId = (int) $adminId;
    try {
        return chess_transaction_retry($conn, static function () use ($conn, $complaintId, $decision, $adminId) {
            $stmt = $conn->prepare("SELECT coach_id FROM chess_coach_complaints
                WHERE id = ? LIMIT 1");
            $stmt->bind_param("i", $complaintId);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new RuntimeException('complaint target read failed');
            }
            $target = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$target) {
                return ['ok' => false, 'code' => 'no_such_complaint'];
            }
            $coachId = (int) $target['coach_id'];
            chess_lock_player_standing($conn, $coachId);

            $stmt = $conn->prepare("SELECT id, coach_id, status, severity
                FROM chess_coach_complaints WHERE id = ? LIMIT 1 FOR UPDATE");
            $stmt->bind_param("i", $complaintId);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new RuntimeException('complaint decision lock failed');
            }
            $current = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$current) {
                return ['ok' => false, 'code' => 'no_such_complaint'];
            }
            if ($current['status'] !== 'pending') {
                return ['ok' => false, 'code' => 'bad_decision'];
            }
            $normalized = coach_complaint_decision_normalize($decision, $current);
            if (!$normalized['ok']) {
                return ['ok' => false, 'code' => $normalized['code']];
            }
            $decision = $normalized;

            $status = $decision['action'] === 'uphold' ? 'upheld' : 'rejected';
            $publicText = $status === 'upheld' ? $decision['public_text'] : '';
            $published = $status === 'upheld' ? 'NOW()' : 'NULL';
            $stmt = $conn->prepare("UPDATE chess_coach_complaints
                SET status = ?, public_text = ?, severity = ?, decided_at = NOW(), decided_by = ?,
                    published_at = {$published}, updated_at = NOW()
                WHERE id = ? AND status = 'pending'");
            $stmt->bind_param("sssii", $status, $publicText, $decision['severity'], $adminId, $complaintId);
            if (!$stmt->execute() || $stmt->affected_rows !== 1) {
                $stmt->close();
                throw new RuntimeException('complaint decision update failed');
            }
            $stmt->close();

            if ($decision['revoke']) {
                $reason = 'Complaint #' . $complaintId;
                $stmt = $conn->prepare("INSERT INTO chess_coach_standing
                    (player_id, status, was_coach, revoked_at, revoked_by, revoke_complaint_id,
                     reason, restored_at, restored_by, restore_reason, created_at, updated_at)
                    VALUES (?, 'revoked', 1, NOW(), ?, ?, ?, NULL, NULL, '', NOW(), NOW())
                    ON DUPLICATE KEY UPDATE status = 'revoked', was_coach = 1,
                        revoked_at = NOW(), revoked_by = VALUES(revoked_by),
                        revoke_complaint_id = VALUES(revoke_complaint_id), reason = VALUES(reason),
                        restored_at = NULL, restored_by = NULL, restore_reason = '', updated_at = NOW()");
                $stmt->bind_param("iiis", $coachId, $adminId, $complaintId, $reason);
                if (!$stmt->execute()) {
                    $stmt->close();
                    throw new RuntimeException('coach revocation failed');
                }
                $stmt->close();
            }
            $row = chess_coach_complaint_admin_row($conn, $complaintId);
            if ($row === null) {
                throw new RuntimeException('complaint decision receipt missing');
            }
            return ['ok' => true, 'complaint' => $row, 'code' => null];
        });
    } catch (Throwable $e) {
        error_log('chess complaint decide: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'server'];
    }
}

function chess_coach_standing_restore($conn, $coachId, $reason, $adminId) {
    chess_coach_standing_schema($conn);
    $coachId = (int) $coachId;
    $adminId = (int) $adminId;
    try {
        return chess_transaction_retry($conn, static function () use ($conn, $coachId, $reason, $adminId) {
            $stmt = $conn->prepare("SELECT player_id, status, restored_at
                FROM chess_coach_standing WHERE player_id = ? LIMIT 1 FOR UPDATE");
            $stmt->bind_param("i", $coachId);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new RuntimeException('coach restore lock failed');
            }
            $current = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$current) {
                return ['ok' => false, 'code' => 'no_such_standing'];
            }
            if ($current['status'] !== 'revoked'
                || ($current['restored_at'] !== null && $current['restored_at'] !== '')) {
                return ['ok' => false, 'code' => 'not_revoked'];
            }
            $stmt = $conn->prepare("UPDATE chess_coach_standing
                SET restored_at = NOW(), restored_by = ?, restore_reason = ?, updated_at = NOW()
                WHERE player_id = ? AND status = 'revoked'
                    AND (restored_at IS NULL OR restored_at = '')");
            $stmt->bind_param("isi", $adminId, $reason, $coachId);
            if (!$stmt->execute() || $stmt->affected_rows !== 1) {
                $stmt->close();
                throw new RuntimeException('coach restore failed');
            }
            $stmt->close();
            $standing = chess_player_standing($conn, $coachId);
            if (!$standing) {
                throw new RuntimeException('coach restore receipt missing');
            }
            return ['ok' => true, 'standing' => coach_standing_admin($standing), 'code' => null];
        });
    } catch (Throwable $e) {
        error_log('chess coach restore: ' . $e->getMessage());
        return ['ok' => false, 'code' => 'server'];
    }
}

/** 这个人的申请；没交过返回 null（"没交过"是常态，不是错误）。 */
function chess_app_read($conn, $playerId) {
    chess_app_schema($conn);
    $stmt = $conn->prepare("SELECT status, intro, submitted_at, updated_at, decided_at
        FROM chess_coach_apps WHERE player_id = ? LIMIT 1");
    $stmt->bind_param("i", $playerId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

/**
 * 交（或改）介绍。永远写成 pending ——
 * 这是全项目里唯一一个学员侧能改 status 的语句，而它能写的只有这一个值，
 * 而且不碰 decided_at/decided_by 之外的东西：重新提交要把上一次的结论清掉，
 * 否则管理员看到的还是"上次已驳回"，人却在等审核。
 */
function chess_app_submit($conn, $playerId, $intro) {
    chess_app_schema($conn);
    $stmt = $conn->prepare("INSERT INTO chess_coach_apps
        (player_id, status, intro, submitted_at, updated_at, decided_at, decided_by)
        VALUES (?, 'pending', ?, NOW(), NOW(), NULL, NULL)
        ON DUPLICATE KEY UPDATE intro = VALUES(intro), status = 'pending',
            submitted_at = NOW(), updated_at = NOW(),
            decided_at = NULL, decided_by = NULL");
    if ($stmt === false) {
        error_log('chess coach app: prepare failed: ' . $conn->error);
        return false;
    }
    $stmt->bind_param("is", $playerId, $intro);
    $ok = $stmt->execute();
    if (!$ok) {
        error_log('chess coach app: execute failed: ' . $stmt->error);
    }
    $stmt->close();
    return $ok;
}

/** 申请本身的资格；正在生效的撤销优先于已批准状态。 */
function chess_app_is_teacher($conn, $playerId) {
    return coach_can_teach(
        chess_app_read($conn, $playerId)['status'] ?? null,
        chess_player_standing($conn, $playerId)
    );
}

/**
 * 管理员 = 这个棋手的登录邮箱也在 admin_users 里（留言板后台那批账号）。
 *
 * 按邮箱认，不另建一张角色表：后台加一个邮箱，棋盘这边下一次请求就认它；
 * 而一个人不该为"我是站长"这件事维护两份身份。比较交给库的排序规则，
 * 大小写不敏感 —— 邮箱本来就不该因为大小写变成两个人。
 *
 * 表不在时回 false 而不是让请求失败：admin_users 是后台那套的资产，
 * 万一哪天它换了地方，下棋不该跟着一起 500。
 */
function chess_player_is_admin($conn, $playerId) {
    static $hasTable = null;
    static $seen = [];
    $playerId = (int) $playerId;
    if ($playerId < 1) {
        return false;
    }
    if (array_key_exists($playerId, $seen)) {
        return $seen[$playerId];
    }
    if ($hasTable === null) {
        $result = $conn->query("SHOW TABLES LIKE 'admin_users'");
        $hasTable = $result instanceof mysqli_result && $result->num_rows > 0;
    }
    if (!$hasTable) {
        return $seen[$playerId] = false;
    }
    $stmt = $conn->prepare("SELECT 1 FROM chess_players p
        JOIN admin_users a ON a.email = p.email
        WHERE p.id = ? LIMIT 1");
    if ($stmt === false) {
        error_log('chess admin check: prepare failed: ' . $conn->error);
        return $seen[$playerId] = false;
    }
    $stmt->bind_param("i", $playerId);
    $stmt->execute();
    $found = $stmt->get_result()->fetch_assoc() !== null;
    $stmt->close();
    if ($found) {
        chess_coach_standing_mark($conn, $playerId);
    }
    return $seen[$playerId] = $found;
}

/** 管理员或已批准申请都能教，但正在生效的撤销优先于两者。 */
function chess_player_can_teach($conn, $playerId) {
    $standing = chess_player_standing($conn, $playerId);
    if (coach_standing_is_revoked($standing)) {
        return false;
    }
    $admin = chess_player_is_admin($conn, $playerId);
    return coach_eligible(chess_app_read($conn, $playerId)['status'] ?? null, $admin, $standing);
}

/**
 * 课堂那侧的门。调用点在 chess_class_create.php，判在 verified 之后：
 * 先确认这个邮箱是真的，再问管理员点没点批准 —— 反过来会让一个没验证的
 * 账号在界面上一路撞墙，而每一句都写着"你不够格"。
 * 管理员（邮箱在 admin_users）不用走申请，直接就是教练。
 */
function chess_require_teacher($conn, $playerId) {
    if (chess_player_is_revoked($conn, $playerId)) {
        chess_err('coach_revoked');
    }
    if (!chess_player_can_teach($conn, $playerId)) {
        chess_err('teacher_only');
    }
}

/** 返回老师资格错误码；调用方若在事务里，会先锁住资格行再判断。 */
function chess_class_teacher_problem($conn, array $class, $playerId) {
    if ((int) ($class['teacher_id'] ?? 0) !== (int) $playerId) {
        return 'not_teacher';
    }
    chess_lock_player_standing($conn, $playerId);
    if (chess_player_is_revoked($conn, $playerId)) {
        return 'coach_revoked';
    }
    return chess_player_can_teach($conn, $playerId) ? null : 'not_teacher';
}

/** 已开课堂里的老师动作也要重新过资格，不能靠成员表里的旧角色永久教书。 */
function chess_require_class_teacher($conn, array $class, $playerId) {
    $problem = chess_class_teacher_problem($conn, $class, $playerId);
    if ($problem !== null) {
        chess_err($problem);
    }
}

/**
 * 管理员那一列。
 *
 * 🔴 SELECT 里没有 password_hash，也没有 verify_token_hash / verify_expires：
 * 后台的屏幕是会拍照发群的，而这两列一个能登进来、一个能直接点验证链接。
 * 要加列就回到这一行来看一眼是不是把凭据带上去了。
 */
function chess_app_list($conn, $status = null, $cap = 100) {
    // 资料表也要在：下面那句 LEFT JOIN 点到它。表没建时 mysqli 不是报错而是让
    // 整条 SELECT 返回 false —— 后台会显示成"没有人申请"，而其实是查询没跑成。
    chess_profile_schema($conn);
    $limit = max(1, min(200, (int) $cap));
    $sql = "SELECT a.player_id, a.status, a.intro, a.submitted_at, a.updated_at, a.decided_at,
            p.nickname, p.email, p.verified_at, p.created_at AS joined_at, p.rating,
            f.title, f.elo, f.years,
            (SELECT COUNT(*) FROM chess_coach_prefs c WHERE c.player_id = a.player_id) AS has_pref
        FROM chess_coach_apps a
        JOIN chess_players p ON p.id = a.player_id
        LEFT JOIN chess_coach_profiles f ON f.player_id = a.player_id";
    // 状态是白名单里的三个 ASCII 串之一，所以拼进 WHERE 之前先过一遍判定 ——
    // 参数绑定在这里要做成两条 SQL 反而更绕，而过不了 COACH_APP_STATUSES 的值
    // 根本到不了这一行（coach_admin_apps.php 先判）。
    if ($status === null) {
        $sql .= " ORDER BY a.updated_at DESC LIMIT {$limit}";
        $result = $conn->query($sql);
    } else {
        $safe = in_array($status, COACH_APP_STATUSES, true) ? $status : 'pending';
        $sql .= " WHERE a.status = '{$safe}' ORDER BY a.updated_at DESC LIMIT {$limit}";
        $result = $conn->query($sql);
    }
    $rows = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $rows[] = $row;
        }
    }
    return $rows;
}

/**
 * 管理员点下批准/驳回。
 *
 * 新状态由 coach_app_decide() 那张状态机表算出来（这里不重判），
 * 所以"批准成 pending"这类根本不该存在的跳转在这一层也过不去。
 */
function chess_app_decide($conn, $playerId, $decision, $adminId) {
    $playerId = (int) $playerId;
    $adminId = (int) $adminId;
    chess_app_schema($conn);
    chess_coach_standing_schema($conn);
    try {
        return chess_transaction_retry($conn, static function () use ($conn, $playerId, $decision, $adminId) {
            chess_lock_player_standing($conn, $playerId);
            $stmt = $conn->prepare("SELECT status FROM chess_coach_apps
                WHERE player_id = ? LIMIT 1 FOR UPDATE");
            $stmt->bind_param("i", $playerId);
            $stmt->execute();
            $current = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$current) {
                return null;
            }
            $next = coach_app_decide($current['status'], $decision);
            if ($next === null) {
                return false;
            }
            $stmt = $conn->prepare("UPDATE chess_coach_apps
                SET status = ?, decided_at = NOW(), decided_by = ?, updated_at = NOW()
                WHERE player_id = ? AND status = ?");
            $stmt->bind_param("siis", $next, $adminId, $playerId, $current['status']);
            if (!$stmt->execute()) {
                $stmt->close();
                throw new RuntimeException('coach application update failed');
            }
            $stmt->close();
            if ($next === 'approved' && !chess_coach_standing_mark($conn, $playerId)) {
                throw new RuntimeException('coach standing mark failed');
            }
            return $next;
        });
    } catch (Throwable $e) {
        error_log('chess coach app decide: ' . $e->getMessage());
        return false;
    }
}

/**
 * 后台顶上的那几个数。一次查完，界面就不必为每个数发一个请求。
 * 全是 COUNT —— 没有任何一行能指出"这是谁"。
 */
function chess_app_counts($conn) {
    chess_app_schema($conn);
    $out = ['players' => 0, 'verified' => 0, 'pending' => 0, 'approved' => 0,
        'rejected' => 0, 'prefs' => 0, 'games' => 0];
    $one = static function ($sql, $key) use ($conn, &$out) {
        $row = $conn->query($sql);
        if ($row) {
            $val = $row->fetch_assoc();
            $out[$key] = (int) reset($val);
        }
    };
    $one("SELECT COUNT(*) FROM chess_players", 'players');
    $one("SELECT COUNT(*) FROM chess_players WHERE verified_at IS NOT NULL", 'verified');
    $one("SELECT COUNT(*) FROM chess_coach_apps WHERE status = 'pending'", 'pending');
    $one("SELECT COUNT(*) FROM chess_coach_apps WHERE status = 'approved'", 'approved');
    $one("SELECT COUNT(*) FROM chess_coach_apps WHERE status = 'rejected'", 'rejected');
    $one("SELECT COUNT(*) FROM chess_coach_prefs", 'prefs');
    $one("SELECT COUNT(*) FROM chess_library", 'games');
    return $out;
}

/* ------------------------------------------------------------------------ *
 * 教练资料（名录上那一张脸）
 *
 * 单独一张表，不往 chess_coach_apps 上加列：chess_app_submit() 每次交介绍都会把
 * status 打回 pending 并清掉 decided_at，而"教龄几年、能带什么水平"是门面，
 * 不该跟着一次重新申请就被卷走。审核记录归审核，公开资料归公开资料。
 *
 * 多选照旧存逗号串（和 chess_coach_prefs 同一口径），图片只存文件名：
 * 图的字节在磁盘上（coach_media/<player_id>/），库里那一列只放
 * coach_image_name() 认过的那 28 个字符，所以这一行里没有一条路径能拼出来。
 * ------------------------------------------------------------------------ */

function chess_profile_schema($conn) {
    static $ready = false;
    if ($ready) {
        return;
    }
    // 那句 FOREIGN KEY 要 chess_players 先在；chess_app_schema() 顺带把
    // apps 和 prefs 两张表也建了（名录的 JOIN 点这两张）。
    chess_app_schema($conn);
    $conn->query("CREATE TABLE IF NOT EXISTS chess_coach_profiles (
        player_id INT PRIMARY KEY,
        title VARCHAR(8) NOT NULL DEFAULT '',
        elo SMALLINT NULL,
        years TINYINT NULL,
        tagline VARCHAR(" . COACH_TAGLINE_MAX . ") NOT NULL DEFAULT '',
        honors VARCHAR(" . COACH_HONORS_MAX . ") NOT NULL DEFAULT '',
        enrollment_notes VARCHAR(" . COACH_ENROLLMENT_NOTES_MAX . ") NOT NULL DEFAULT '',
        tuition_text VARCHAR(" . COACH_TUITION_TEXT_MAX . ") NOT NULL DEFAULT '',
        schedule_text VARCHAR(" . COACH_SCHEDULE_TEXT_MAX . ") NOT NULL DEFAULT '',
        hourly_rate_cny INT NULL,
        language VARCHAR(8) NOT NULL DEFAULT '',
        timezone VARCHAR(40) NOT NULL DEFAULT '',
        levels VARCHAR(64) NOT NULL DEFAULT '',
        goals VARCHAR(64) NOT NULL DEFAULT '',
        formats VARCHAR(32) NOT NULL DEFAULT '',
        slots VARCHAR(64) NOT NULL DEFAULT '',
        avatar VARCHAR(32) NOT NULL DEFAULT '',
        photos VARCHAR(128) NOT NULL DEFAULT '',
        certificates VARCHAR(192) NOT NULL DEFAULT '',
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        INDEX idx_profile_title (title),
        FOREIGN KEY (player_id) REFERENCES chess_players(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    // CREATE IF NOT EXISTS 不会给已经建好的表补列；两个请求同时迁移时，
    // 后一个可能只撞到 1060（列已存在），那不是故障。
    chess_schema_column($conn, 'chess_coach_profiles', 'enrollment_notes',
        'VARCHAR(' . COACH_ENROLLMENT_NOTES_MAX . ") NOT NULL DEFAULT ''", 'honors');
    chess_schema_column($conn, 'chess_coach_profiles', 'tuition_text',
        'VARCHAR(' . COACH_TUITION_TEXT_MAX . ") NOT NULL DEFAULT ''", 'enrollment_notes');
    chess_schema_column($conn, 'chess_coach_profiles', 'schedule_text',
        'VARCHAR(' . COACH_SCHEDULE_TEXT_MAX . ") NOT NULL DEFAULT ''", 'tuition_text');
    chess_schema_column($conn, 'chess_coach_profiles', 'hourly_rate_cny', 'INT NULL', 'schedule_text');
    chess_schema_column($conn, 'chess_coach_profiles', 'certificates',
        "VARCHAR(192) NOT NULL DEFAULT ''", 'photos');
    $ready = true;
}

/** 这个人的资料行；没建过返回 null。 */
function chess_profile_row($conn, $playerId, $lock = false) {
    chess_profile_schema($conn);
    $stmt = $conn->prepare("SELECT title, elo, years, tagline, honors,
            enrollment_notes, tuition_text, schedule_text, hourly_rate_cny,
            language, timezone, levels, goals, formats, slots, avatar, photos, certificates, updated_at
        FROM chess_coach_profiles WHERE player_id = ? LIMIT 1" . ($lock ? ' FOR UPDATE' : ''));
    if ($stmt === false) {
        error_log('chess coach profile: prepare(read) failed: ' . $conn->error);
        return null;
    }
    $stmt->bind_param("i", $playerId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

/** 先建一行全空的：传照片的人可能一个字都没填，那时也得有个地方挂文件名。 */
function chess_profile_ensure($conn, $playerId) {
    chess_profile_schema($conn);
    $stmt = $conn->prepare("INSERT IGNORE INTO chess_coach_profiles
        (player_id, created_at, updated_at) VALUES (?, NOW(), NOW())");
    if ($stmt === false) {
        error_log('chess coach profile: prepare(ensure) failed: ' . $conn->error);
        return false;
    }
    $stmt->bind_param("i", $playerId);
    $ok = $stmt->execute();
    if (!$ok) {
        error_log('chess coach profile: execute(ensure) failed: ' . $stmt->error);
    }
    $stmt->close();
    return $ok;
}

/**
 * 整份覆盖式保存。$profile 是 coach_profile_normalize() 通过后的那一份，
 * 字段顺序就是规则层的字段顺序 —— 端点不参与判断合不合法。
 *
 * created_at 只在第一次插入时写（ON DUPLICATE 那一段不碰它），
 * 于是"什么时候开始挂名录"和"最后一次改是什么时候"两个时刻都留得住。
 */
function chess_profile_write($conn, $playerId, array $profile) {
    chess_profile_schema($conn);
    $stmt = $conn->prepare("INSERT INTO chess_coach_profiles
        (player_id, title, elo, years, tagline, honors, enrollment_notes, tuition_text,
         schedule_text, hourly_rate_cny, language, timezone, levels, goals, formats, slots,
         avatar, photos, certificates, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE title = VALUES(title), elo = VALUES(elo),
            years = VALUES(years), tagline = VALUES(tagline), honors = VALUES(honors),
            enrollment_notes = VALUES(enrollment_notes), tuition_text = VALUES(tuition_text),
            schedule_text = VALUES(schedule_text), hourly_rate_cny = VALUES(hourly_rate_cny),
            language = VALUES(language), timezone = VALUES(timezone),
            levels = VALUES(levels), goals = VALUES(goals), formats = VALUES(formats),
            slots = VALUES(slots), avatar = VALUES(avatar), photos = VALUES(photos),
            certificates = VALUES(certificates), updated_at = NOW()");
    if ($stmt === false) {
        error_log('chess coach profile: prepare(write) failed: ' . $conn->error);
        return false;
    }
    // elo/years/rate 绑成 i 时 PHP 的 null 会作为 SQL NULL 下发（不是 0），
    // 这正是规则层要区分"没登记"和"0"的那一处。
    $stmt->bind_param(
        "isiissssssissssssss",
        $playerId,
        $profile['title'],
        $profile['elo'],
        $profile['years'],
        $profile['tagline'],
        $profile['honors'],
        $profile['enrollment_notes'],
        $profile['tuition_text'],
        $profile['schedule_text'],
        $profile['hourly_rate_cny'],
        $profile['language'],
        $profile['timezone'],
        $profile['levels'],
        $profile['goals'],
        $profile['formats'],
        $profile['slots'],
        $profile['avatar'],
        $profile['photos'],
        $profile['certificates']
    );
    $ok = $stmt->execute();
    if (!$ok) {
        error_log('chess coach profile: execute(write) failed: ' . $stmt->error);
    }
    $stmt->close();
    return $ok;
}

/**
 * 只改 avatar / photos / certificates 那一列（上传端点用）。
 *
 * 列名不能参数绑定，所以这里不是"把传进来的字段名拼进 SQL"：
 * $field 只从这张白名单取列名，别的值退到 avatar。
 */
function chess_profile_set_image($conn, $playerId, $field, $value) {
    $column = ['photos' => 'photos', 'certificates' => 'certificates'][$field] ?? 'avatar';
    if (!chess_profile_ensure($conn, $playerId)) {
        return false;
    }
    $stmt = $conn->prepare("UPDATE chess_coach_profiles
        SET {$column} = ?, updated_at = NOW() WHERE player_id = ?");
    if ($stmt === false) {
        error_log('chess coach profile: prepare(image) failed: ' . $conn->error);
        return false;
    }
    $stmt->bind_param("si", $value, $playerId);
    $ok = $stmt->execute();
    if (!$ok) {
        error_log('chess coach profile: execute(image) failed: ' . $stmt->error);
    }
    $stmt->close();
    return $ok;
}

/**
 * 管理员的棋手 id（邮箱在 admin_users 里的那批）。
 *
 * 名录要把管理员算进去：他们没交过介绍也能开课堂，只查 approved 的话
 * 站长自己在名录上就是隐身的。admin_users 是后台那套的资产，表不在就回空数组
 * —— 名录少几个人，比整个页面 500 好。
 */
function chess_admin_player_ids($conn) {
    static $ids = null;
    if ($ids !== null) {
        return $ids;
    }
    $ids = [];
    $tables = $conn->query("SHOW TABLES LIKE 'admin_users'");
    if (!($tables instanceof mysqli_result) || $tables->num_rows === 0) {
        return $ids;
    }
    $result = $conn->query("SELECT p.id FROM chess_players p
        JOIN admin_users a ON a.email = p.email");
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $ids[] = (int) $row['id'];
        }
    }
    return $ids;
}

/**
 * 名录该列哪些人：申请已批准的 ∪ 管理员。
 *
 * 这里只认 status='approved'（参数绑死，学员侧写不出这个值），所以"谁能出现在
 * 公开页面上"这件事全凭管理员点过那一下 —— 传再多表单也换不来一个名录位。
 */
function chess_coach_ids($conn, $cap = 100) {
    chess_profile_schema($conn);
    chess_coach_standing_schema($conn);
    $limit = max(1, min(200, (int) $cap));
    $ids = [];
    $result = $conn->query("SELECT a.player_id
        FROM chess_coach_apps a
        LEFT JOIN chess_coach_standing s ON s.player_id = a.player_id
        WHERE a.status = 'approved'
          AND (s.player_id IS NULL OR s.status <> 'revoked'
               OR (s.restored_at IS NOT NULL AND s.restored_at <> ''))
        ORDER BY a.decided_at DESC LIMIT {$limit}");
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $ids[(int) $row['player_id']] = true;
        }
    }
    foreach (chess_admin_player_ids($conn) as $id) {
        if (!chess_player_is_revoked($conn, $id)) {
            $ids[$id] = true;
        }
    }
    unset($ids[0]);
    return array_keys($ids);
}

/**
 * 一批人 → 名录/主页用的扁平行。
 *
 * 🔴 SELECT 里没有 email，也没有 verified_at / 任何 *_hash：这两列一个把邮箱
 * 挂在公开页面上，一个能点验证链接。要加列就回到这一行看一眼。
 *
 * 🔴 也不取 chess_coach_apps.intro：那段是申请时写给管理员看的，界面上承诺了
 * "只有管理员看得到"。谁能上名录由 chess_coach_ids() 判完，这里只需要玩家本人
 * 那一行 + 他自己填的资料，所以连 apps 表都不必 JOIN。
 *
 * $ids 是 chess_coach_ids() 自己算出来的整数数组（不是人发来的），所以拼进 IN
 * 之前先逐个 intval —— 拼 SQL 的地方必须自己把类型钉死，不靠调用点自觉。
 */
function chess_coach_rows($conn, array $ids) {
    chess_profile_schema($conn);
    $clean = [];
    foreach ($ids as $id) {
        $id = (int) $id;
        if ($id > 0) {
            $clean[$id] = true;
        }
    }
    if (!$clean) {
        return [];
    }
    $in = implode(',', array_keys($clean));
    $result = $conn->query("SELECT p.id AS player_id, p.nickname, p.rating,
            f.title, f.elo, f.years, f.tagline, f.honors,
            f.enrollment_notes, f.tuition_text, f.schedule_text, f.hourly_rate_cny,
            f.language, f.timezone, f.levels, f.goals, f.formats, f.slots,
            f.avatar, f.photos, f.certificates, f.updated_at AS profile_at
        FROM chess_players p
        LEFT JOIN chess_coach_profiles f ON f.player_id = p.id
        WHERE p.id IN ({$in})");
    $rows = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $rows[] = coach_directory_entry($row);
        }
    }
    return $rows;
}

/** 名录整页；没教练时回空数组，界面据此说"老师还在入驻"。 */
function chess_coach_directory($conn, $cap = 100) {
    return chess_coach_rows($conn, chess_coach_ids($conn, $cap));
}

/**
 * 主页那一个教练；不在名录里就返回 null（界面据此回 no_such_coach）。
 *
 * "查无此人"和"这个人存在但没批准"给的是同一句 404：后者不该由公开页面告诉路人
 * 谁交过申请、审到哪一步。
 */
function chess_coach_one($conn, $playerId) {
    $playerId = (int) $playerId;
    if ($playerId < 1 || !chess_player_can_teach($conn, $playerId)) {
        return null;
    }
    $rows = chess_coach_rows($conn, [$playerId]);
    return $rows[0] ?? null;
}

/* ------------------------------------------------------------------------ *
 * 教练图片（头像 + 最多三张照片 + 最多六张证书）
 *
 * 文件在 v1/coach_media/<player_id>/ 下，目录里那张 .htaccess 写着 Require all denied：
 * 这些字节只能从 chess_coach_photo.php 那一侧出去。为什么绕这一道：
 *   - 静态可达就等于"任何人拿目录能枚举"，而共享主机上 mod_rewrite 能不能挡住
 *     要看主机给不给力，这一条我在这儿没法验；
 *   - 走 PHP 就能顺手问一句"这一行还指着这张图吗"，删掉的照片当场 404，
 *     而不是留在盘上任人按 URL 取。
 * 库里的列只存 coach_image_name() 认过的那 28 个字符，路径的每一段都由服务端拼，
 * 所以这里没有任何一个字符串能决定"去读哪儿"。
 * ------------------------------------------------------------------------ */

function chess_coach_media_dir($playerId) {
    return __DIR__ . '/coach_media/' . (int) $playerId;
}

/** 一条资料行现在引用着哪些文件名（用来判断哪些图该删、哪张图该给）。 */
function chess_coach_media_names($row) {
    $row = is_array($row) ? $row : [];
    $names = [];
    $avatar = trim((string) ($row['avatar'] ?? ''));
    if ($avatar !== '') {
        $names[] = $avatar;
    }
    foreach (['photos', 'certificates'] as $field) {
        foreach (array_filter(array_map('trim', explode(',', (string) ($row[$field] ?? '')))) as $name) {
            $names[] = $name;
        }
    }
    return $names;
}

/**
 * 删掉不再被引用的文件。$wanted 是这一行保存后引用着的那一列名字。
 *
 * 只动形状对的文件（那 24 位十六进制 + 三种扩展名），所以目录里那张 .htaccess
 * 和任何别的东西都碰不到 —— 这个函数会删文件，边界要写死在代码里而不是靠调用点。
 */
function chess_coach_media_prune($playerId, array $wanted) {
    $dir = chess_coach_media_dir($playerId);
    if (!is_dir($dir)) {
        return 0;
    }
    $dropped = 0;
    foreach (scandir($dir) ?: [] as $file) {
        if ($file === '.' || $file === '..' || in_array($file, $wanted, true)) {
            continue;
        }
        if (preg_match(COACH_IMAGE_PATTERN, $file) && @unlink($dir . '/' . $file)) {
            $dropped++;
        }
    }
    return $dropped;
}

/**
 * 这张图该不该给出去 → 给的话是哪条路径。
 *
 * 判据是"这一行确实还指着它"，不是"文件在不在"：文件名本身就是一道口令，
 * 而删掉的那张早该取不到了。$name 先过 COACH_IMAGE_PATTERN，所以拼出来的路径
 * 里除了那个整数目录，只有服务端自己写过的文件名。
 */
function chess_coach_media_path($playerId, $name, $row) {
    $name = (string) $name;
    if (!preg_match(COACH_IMAGE_PATTERN, $name)) {
        return null;
    }
    if (!in_array($name, chess_coach_media_names($row), true)) {
        return null;
    }
    $path = chess_coach_media_dir($playerId) . '/' . $name;
    return is_file($path) ? $path : null;
}
