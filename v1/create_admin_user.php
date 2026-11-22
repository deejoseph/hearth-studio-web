<?php
// 创建管理员账号：仅管理端可调用，密码以 bcrypt 存储
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';

gb_require_post();
gb_require_admin();

$email = trim($_POST['email'] ?? '');
$password = (string) ($_POST['password'] ?? '');
$name = trim($_POST['name'] ?? '');
$role = $_POST['role'] ?? 'user';

if ($email === '' || $password === '' || $name === '') {
    gb_json(['success' => false, 'message' => '请填写完整信息'], 400);
}

if (!gb_ensure_password_column($conn)) {
    // 列宽放不下 bcrypt 就拒绝写入，否则会静默截断成一个登不进去的账号
    gb_json(['success' => false, 'message' => '数据库 admin_users.password 列宽度不足，请先在 cPanel 把它改为 VARCHAR(255)'], 500);
}

$check = $conn->prepare("SELECT id FROM admin_users WHERE email = ? LIMIT 1");
$check->bind_param("s", $email);
$check->execute();
$exists = $check->get_result()->fetch_assoc();
$check->close();

if ($exists) {
    gb_json(['success' => false, 'message' => '该邮箱已被注册'], 409);
}

$stmt = $conn->prepare("INSERT INTO admin_users (email, password, name, role) VALUES (?, ?, ?, ?)");
$hash = password_hash($password, PASSWORD_DEFAULT);
$stmt->bind_param("ssss", $email, $hash, $name, $role);

if (!$stmt->execute()) {
    gb_json(['success' => false, 'message' => '写入数据库失败'], 500);
}
$stmt->close();

gb_json(['success' => true, 'message' => '用户创建成功']);
