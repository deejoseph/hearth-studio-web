<?php

header("Content-Type: application/json");
require_once __DIR__ . '/config/db.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $roundId = intval($_GET['round_id'] ?? 0);
    $reply = trim($_GET['reply'] ?? '');
} else {
    $data = json_decode(file_get_contents("php://input"), true);
    $roundId = intval($data['round_id'] ?? 0);
    $reply = trim($data['reply'] ?? '');
}

if ($roundId <= 0 || $reply === "") {
    echo json_encode(["success" => false, "message" => "Invalid input"]);
    exit;
}

/* 检查轮次是否存在且未关闭 */
$check = $conn->prepare("
    SELECT id FROM order_progress_messages
    WHERE id = ?
    AND is_closed = 0
");
$check->bind_param("i", $roundId);
$check->execute();
$res = $check->get_result();

if ($res->num_rows === 0) {
    echo json_encode(["success" => false, "message" => "Round not found or already closed"]);
    exit;
}

/* 更新回复 */
$update = $conn->prepare("
    UPDATE order_progress_messages
    SET studio_reply = ?, 
        studio_reply_at = NOW(),
        is_closed = 1
    WHERE id = ?
");

$update->bind_param("si", $reply, $roundId);
$update->execute();

echo json_encode(["success" => true]);