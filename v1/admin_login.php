<?php
// 管理员登录（Android 后台与浏览器共用）。响应 JSON 结构保持不变以兼容现有客户端。
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';

$email = trim($_POST['email'] ?? '');
$password = (string) ($_POST['password'] ?? '');

if ($email === '' || $password === '') {
    echo json_encode(['success' => false, 'message' => '请填写邮箱和密码'], JSON_UNESCAPED_UNICODE);
    exit;
}

$ip = gb_client_ip();

if (gb_recent_failures($conn, $ip) >= GB_FAIL_LIMIT) {
    echo json_encode(['success' => false, 'message' => '尝试次数过多，请 15 分钟后再试'], JSON_UNESCAPED_UNICODE);
    exit;
}

$stmt = $conn->prepare("SELECT id, email, name, role, password FROM admin_users WHERE email = ? LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user || !gb_verify_admin_password($conn, $password, $user)) {
    gb_record_failure($conn, $ip);
    // 不区分"邮箱不存在"和"密码错误"，避免账号枚举
    echo json_encode(['success' => false, 'message' => '邮箱或密码错误'], JSON_UNESCAPED_UNICODE);
    exit;
}

gb_clear_failures($conn, $ip);

// 签发真正的会话：支持 Cookie 的客户端后续可直接走会话鉴权
gb_start_admin_session();
session_regenerate_id(true);
$_SESSION['gb_admin_id'] = (int) $user['id'];
$_SESSION['gb_admin_name'] = ($user['name'] ?? '') !== '' ? $user['name'] : 'Eddie';

echo json_encode([
    'success' => true,
    'data' => [
        'id' => (int) $user['id'],
        'email' => $user['email'],
        'name' => $user['name'],
        'role' => strtoupper((string) $user['role']),
        // 仅作展示用；服务端鉴权认的是 gbadmin 会话 Cookie 或 GB_API_SECRET
        'token' => bin2hex(random_bytes(16)),
    ],
    'message' => '登录成功',
], JSON_UNESCAPED_UNICODE);

$conn->close();
