<?php
// 删除管理员账号：仅管理端可调用，且不允许把管理员删到一个不剩
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';

gb_require_post();
gb_require_admin();

$id = (int) ($_POST['id'] ?? 0);
if ($id <= 0) {
    gb_json(['success' => false, 'message' => '参数不完整'], 400);
}

// 用会话登录的浏览器管理员不能删自己；走接口密钥的调用方无从判断"自己"是谁
$self_id = isset($_SESSION['gb_admin_id']) ? (int) $_SESSION['gb_admin_id'] : 0;
if ($self_id === $id) {
    gb_json(['success' => false, 'message' => '不能删除当前登录的账号'], 400);
}

$count = $conn->query("SELECT COUNT(*) AS c FROM admin_users")->fetch_assoc()['c'];
if ((int) $count <= 1) {
    gb_json(['success' => false, 'message' => '至少保留一个管理员账号'], 400);
}

$stmt = $conn->prepare("DELETE FROM admin_users WHERE id = ?");
$stmt->bind_param("i", $id);

if (!$stmt->execute()) {
    $stmt->close();
    gb_json(['success' => false, 'message' => '删除失败'], 500);
}
$stmt->close();

gb_json(['success' => true]);
