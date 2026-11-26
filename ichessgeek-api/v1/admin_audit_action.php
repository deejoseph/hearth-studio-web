<?php
// 交换申请审批：改用统一鉴权闸门，不再比对源码里写死的 secret_admin_key
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';

gb_require_post();
gb_require_admin();

$id = (int) ($_POST['id'] ?? 0);
$newStatus = (int) ($_POST['status'] ?? 0); // 2 通过，3 驳回

if ($id > 0 && ($newStatus == 2 || $newStatus == 3)) {
    $stmt = $conn->prepare("UPDATE swap_items SET status = ? WHERE id = ?");
    $stmt->bind_param("ii", $newStatus, $id);

    if ($stmt->execute()) {
        echo json_encode(["success" => true, "message" => ($newStatus == 2) ? "准入画卷成功！" : "已驳回该申请"], JSON_UNESCAPED_UNICODE);
    } else {
        error_log('admin_audit_action failed: ' . $conn->error);
        echo json_encode(["success" => false, "message" => "数据库更新失败"], JSON_UNESCAPED_UNICODE);
    }
    $stmt->close();
} else {
    echo json_encode(["success" => false, "message" => "参数无效"], JSON_UNESCAPED_UNICODE);
}

$conn->close();
