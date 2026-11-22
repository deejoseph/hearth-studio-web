<?php
// 留言板管理端登录：会话签发与校验
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';

$authenticated = gb_start_admin_session();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    gb_json([
        'authenticated' => $authenticated,
        'name' => $authenticated ? $_SESSION['gb_admin_name'] : null,
    ]);
}

if ($method !== 'POST') {
    gb_json(['error' => '不支持的请求方法'], 405);
}

$input = gb_read_json_body();
$action = $input['action'] ?? '';

if ($action === 'logout') {
    $_SESSION = [];
    session_destroy();
    gb_json(['success' => true]);
}

if ($action !== 'login') {
    gb_json(['error' => '缺少 action 参数'], 400);
}

$email = trim($input['email'] ?? '');
$password = (string) ($input['password'] ?? '');

if ($email === '' || $password === '') {
    gb_json(['error' => '请填写邮箱和密码'], 400);
}

$ip = gb_client_ip();

if (gb_recent_failures($conn, $ip) >= GB_FAIL_LIMIT) {
    gb_json(['error' => '尝试次数过多，请 15 分钟后再试'], 429);
}

$stmt = $conn->prepare("SELECT id, email, name, role, password FROM admin_users WHERE email = ? LIMIT 1");
$stmt->bind_param("s", $email);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user || !gb_verify_admin_password($conn, $password, $user)) {
    gb_record_failure($conn, $ip);
    gb_json(['error' => '邮箱或密码错误'], 401);
}

session_regenerate_id(true);
$_SESSION['gb_admin_id'] = (int) $user['id'];
$_SESSION['gb_admin_name'] = ($user['name'] ?? '') !== '' ? $user['name'] : 'Eddie';

gb_clear_failures($conn, $ip);

gb_json(['success' => true, 'name' => $_SESSION['gb_admin_name']]);
