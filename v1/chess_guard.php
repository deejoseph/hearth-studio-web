<?php
/**
 * 棋手账号层的唯一入口：会话、限流、校验、令牌、统一响应。
 * chess_* 端点都应 require 本文件，不要再各自写一份。
 * 禁止直接 URL 访问（同目录 .htaccess 已 FilesMatch 拒绝）。
 *
 * 与 admin_guard.php 的区别：那份管后台（cookie 只作用于 /api/v1），
 * 这份管下棋的人（cookie 要作用到 /chess，所以 path=/）。两者互不相认。
 */

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
