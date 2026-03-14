<?php

header("Content-Type: application/json");
require_once __DIR__ . '/config/db.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $orderId = intval($_GET['order_id'] ?? 0);
    $statusId = intval($_GET['status_id'] ?? 0);
    $message = trim($_GET['message'] ?? '');
} else {
    $data = json_decode(file_get_contents("php://input"), true);
    $orderId = intval($data['order_id'] ?? 0);
    $statusId = intval($data['status_id'] ?? 0);
    $message = trim($data['message'] ?? '');
}

if ($orderId <= 0 || $statusId <= 0 || $message === "") {
    echo json_encode(["success" => false, "message" => "Invalid input"]);
    exit;
}

/* 检查是否为当前阶段 */
$checkStmt = $conn->prepare("
    SELECT status_id FROM orders WHERE id = ?
");
$checkStmt->bind_param("i", $orderId);
$checkStmt->execute();
$res = $checkStmt->get_result()->fetch_assoc();

if (!$res || $res['status_id'] != $statusId) {
    echo json_encode(["success" => false, "message" => "Not current stage"]);
    exit;
}

/* 检查是否有未关闭轮次 */
$roundCheck = $conn->prepare("
    SELECT id FROM order_progress_messages
    WHERE order_id = ?
    AND status_id = ?
    AND is_closed = 0
    LIMIT 1
");
$roundCheck->bind_param("ii", $orderId, $statusId);
$roundCheck->execute();
$roundRes = $roundCheck->get_result();

if ($roundRes->num_rows > 0) {
    echo json_encode(["success" => false, "message" => "Previous round not closed"]);
    exit;
}

/* 插入新轮次 */
$insert = $conn->prepare("
    INSERT INTO order_progress_messages
    (order_id, status_id, customer_message, customer_message_at, is_closed)
    VALUES (?, ?, ?, NOW(), 0)
");

$insert->bind_param("iis", $orderId, $statusId, $message);
$insert->execute();

$newRoundId = $insert->insert_id;

echo json_encode([
    "success" => true,
    "round_id" => $newRoundId
]);