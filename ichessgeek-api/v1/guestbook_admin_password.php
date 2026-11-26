<?php
// 管理员修改自己的密码：只认浏览器会话，且只能改当前登录的那一行
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';

gb_require_post();

if (!gb_start_admin_session()) {
    gb_json(['error' => '请先登录管理员账号'], 401);
}

$input = gb_read_json_body();
$old_password = (string) ($input['old_password'] ?? '');
$new_password = (string) ($input['new_password'] ?? '');

if ($old_password === '' || $new_password === '') {
    gb_json(['error' => '请填写原密码和新密码'], 400);
}

if (mb_strlen($new_password) < 8 || mb_strlen($new_password) > 200) {
    gb_json(['error' => '新密码需要 8 到 200 个字符'], 400);
}

$id = (int) $_SESSION['gb_admin_id'];

$stmt = $conn->prepare("SELECT id, email, name, role, password FROM admin_users WHERE id = ? LIMIT 1");
$stmt->bind_param("i", $id);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$user || !gb_verify_admin_password($conn, $old_password, $user)) {
    gb_json(['error' => '原密码不正确'], 401);
}

if ($old_password === $new_password) {
    gb_json(['error' => '新密码不能与原密码相同'], 400);
}

if (!gb_ensure_password_column($conn)) {
    gb_json(['error' => '数据库 admin_users.password 列宽度不足，请联系主机改为 VARCHAR(255)'], 500);
}

$hash = password_hash($new_password, PASSWORD_DEFAULT);
$update = $conn->prepare("UPDATE admin_users SET password = ? WHERE id = ?");
$update->bind_param("si", $hash, $id);

if (!$update->execute()) {
    $update->close();
    gb_json(['error' => '修改失败，请稍后重试'], 500);
}
$update->close();

// 换过密码就换一个新的会话标识
session_regenerate_id(true);

gb_json(['success' => true, 'message' => '密码已更新']);
