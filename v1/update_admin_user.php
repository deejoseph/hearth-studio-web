<?php
// 修改管理员账号：仅管理端可调用；新密码以 bcrypt 存储
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';

gb_require_post();
gb_require_admin();

$id = (int) ($_POST['id'] ?? 0);
$name = trim($_POST['name'] ?? '');
$role = $_POST['role'] ?? 'user';
$password = (string) ($_POST['password'] ?? '');

if ($id <= 0 || $name === '') {
    gb_json(['success' => false, 'message' => '参数不完整'], 400);
}

if ($password !== '') {
    if (!gb_ensure_password_column($conn)) {
        gb_json(['success' => false, 'message' => '数据库 admin_users.password 列宽度不足，请先在 cPanel 把它改为 VARCHAR(255)'], 500);
    }
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $stmt = $conn->prepare("UPDATE admin_users SET name=?, role=?, password=? WHERE id=?");
    $stmt->bind_param("sssi", $name, $role, $hash, $id);
} else {
    $stmt = $conn->prepare("UPDATE admin_users SET name=?, role=? WHERE id=?");
    $stmt->bind_param("ssi", $name, $role, $id);
}

if (!$stmt->execute()) {
    $stmt->close();
    gb_json(['success' => false, 'message' => '更新失败'], 500);
}
$stmt->close();

gb_json(['success' => true]);
