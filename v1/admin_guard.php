<?php
/**
 * 管理员鉴权与密码存储的唯一入口。
 * 所有 admin_* / guestbook_* 端点都应 include 本文件，不要再各自写一份校验。
 * 本文件禁止直接 URL 访问（同目录 .htaccess 已 FilesMatch 拒绝）。
 */

// 非浏览器客户端（Android 后台）使用的接口密钥。
// 用法：请求体带 admin_token=<本值>，或先调 admin_login.php 拿到 gbadmin 会话 Cookie。
// 修改这里即可全局换密钥；不要把它写进任何前端代码或 URL（会进日志）。
const GB_API_SECRET = 'REDACTED-GB-API-SECRET';

// 登录失败限流：15 分钟内同一 IP 满 5 次即拒绝
const GB_FAIL_WINDOW = 900;
const GB_FAIL_LIMIT = 5;

function gb_client_ip() {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    return substr($ip, 0, 45);
}

function gb_start_admin_session() {
    session_name('gbadmin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/api/v1',
        'secure' => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    return isset($_SESSION['gb_admin_id']);
}

function gb_secret_ok($provided) {
    return is_string($provided) && $provided !== '' && hash_equals(GB_API_SECRET, $provided);
}

/**
 * 管理端点的统一闸门：浏览器会话 或 接口密钥，二者其一即可。
 * 不通过就直接 401 退出，后续代码不会执行。
 */
function gb_require_admin() {
    if (gb_start_admin_session()) {
        return;
    }
    // 只认 POST 字段、X-Admin-Token 头和（读接口的）查询串；不认 Cookie，避免子域投毒
    $token = $_POST['admin_token'] ?? $_GET['admin_token'] ?? ($_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '');
    if (gb_secret_ok($token)) {
        return;
    }
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => '未授权', 'message' => '未授权'], JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 只允许 POST，避免 GET 预取/爬虫/日志误触发写操作。
 */
function gb_require_post() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => '不支持的请求方法', 'message' => '不支持的请求方法'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

function gb_attempts_table($conn) {
    $conn->query("CREATE TABLE IF NOT EXISTS guestbook_admin_attempts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ip VARCHAR(45) NOT NULL,
        failed_at DATETIME NOT NULL,
        INDEX idx_gba_ip (ip, failed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function gb_recent_failures($conn, $ip) {
    gb_attempts_table($conn);
    $cutoff = date('Y-m-d H:i:s', time() - GB_FAIL_WINDOW);
    $stmt = $conn->prepare("SELECT COUNT(*) AS c FROM guestbook_admin_attempts WHERE ip = ? AND failed_at > ?");
    $stmt->bind_param("ss", $ip, $cutoff);
    $stmt->execute();
    $count = (int) $stmt->get_result()->fetch_assoc()['c'];
    $stmt->close();
    return $count;
}

function gb_record_failure($conn, $ip) {
    gb_attempts_table($conn);
    $stmt = $conn->prepare("INSERT INTO guestbook_admin_attempts (ip, failed_at) VALUES (?, NOW())");
    $stmt->bind_param("s", $ip);
    $stmt->execute();
    $stmt->close();
}

function gb_clear_failures($conn, $ip) {
    gb_attempts_table($conn);
    $stmt = $conn->prepare("DELETE FROM guestbook_admin_attempts WHERE ip = ?");
    $stmt->bind_param("s", $ip);
    $stmt->execute();
    $stmt->close();
}

/**
 * bcrypt 散列长 60 字符；老库的 password 列可能更短，先加宽再写入，避免静默截断。
 */
function gb_ensure_password_column($conn) {
    static $safe = null;
    if ($safe !== null) {
        return $safe;
    }

    // PHP 8.1+ 的 mysqli 默认把报错抛成异常；共享主机的 DDL 权限不确定，必须吞掉
    try {
        $stmt = $conn->prepare("SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'admin_users' AND column_name = 'password' LIMIT 1");
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row) {
            return $safe = false;
        }
        if ($row['len'] !== null && (int) $row['len'] >= 60) {
            return $safe = true;
        }
        // bcrypt 散列固定 60 字符，列太短会静默截断
        $conn->query("ALTER TABLE admin_users MODIFY password VARCHAR(255) NOT NULL");
        return $safe = true;
    } catch (Throwable $e) {
        error_log('gb_ensure_password_column failed: ' . $e->getMessage());
        return $safe = false;
    }
}

/**
 * 校验管理员密码，兼容尚未迁移的明文行：明文命中时顺手升级成 bcrypt。
 * 升级过程任何一步可疑（列太短、写坏、读回校验不过）都还原成原值 —— 宁可继续存明文，
 * 也不能把 Eddie 锁在自己的后台门外。$user 需含 id 与 password 字段。
 */
function gb_verify_admin_password($conn, $plain, $user) {
    $stored = (string) ($user['password'] ?? '');
    if ($stored === '') {
        return false;
    }

    if (password_verify($plain, $stored)) {
        return true;
    }

    if ($stored !== $plain) {
        return false;
    }

    $id = (int) $user['id'];

    try {
        if (!gb_ensure_password_column($conn)) {
            return true; // 列宽没把握，本次不升级，保持明文可登
        }

        $hash = password_hash($plain, PASSWORD_DEFAULT);
        $stmt = $conn->prepare("UPDATE admin_users SET password = ? WHERE id = ?");
        $stmt->bind_param("si", $hash, $id);
        if (!$stmt->execute()) {
            $stmt->close();
            return true;
        }
        $stmt->close();

        // 读回确认散列完整，否则还原
        $chk = $conn->prepare("SELECT password FROM admin_users WHERE id = ?");
        $chk->bind_param("i", $id);
        $chk->execute();
        $fresh = $chk->get_result()->fetch_assoc();
        $chk->close();

        if ($fresh && password_verify($plain, (string) $fresh['password'])) {
            return true;
        }

        $rb = $conn->prepare("UPDATE admin_users SET password = ? WHERE id = ?");
        $rb->bind_param("si", $stored, $id);
        $rb->execute();
        $rb->close();
        error_log('admin_users password upgrade rolled back for id ' . $id);
        return true;
    } catch (Throwable $e) {
        error_log('admin_users password upgrade failed for id ' . $id . ': ' . $e->getMessage());
        return true;
    }
}

function gb_read_json_body() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function gb_json($payload, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}
