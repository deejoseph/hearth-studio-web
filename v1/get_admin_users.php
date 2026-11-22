<?php
// 管理员列表：原先无任何鉴权，任何人可枚举管理员邮箱与角色
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';

gb_require_admin();

try {
    $stmt = $pdo->query("SELECT id, email, name, role, created_at as createdAt FROM admin_users ORDER BY created_at DESC");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        "success" => true,
        "data" => $users,
        "message" => "获取成功",
    ], JSON_UNESCAPED_UNICODE);
} catch (PDOException $e) {
    error_log('get_admin_users failed: ' . $e->getMessage());
    echo json_encode([
        "success" => false,
        "data" => null,
        "message" => "查询失败",
    ], JSON_UNESCAPED_UNICODE);
}
