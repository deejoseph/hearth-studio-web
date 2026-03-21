<?php
require_once __DIR__ . '/config/db.php';

header("Content-Type: application/json");

if (!isset($_GET['id'])) {
    echo json_encode([
        "success" => false,
        "message" => "Order ID missing"
    ]);
    exit;
}

$orderId = intval($_GET['id']);

$stmt = $conn->prepare("
    SELECT id,
           status,
           address,
           base_inscription,
           custom_notes,
           cover_image_url
    FROM orders
    WHERE id = ?
");

$stmt->bind_param("i", $orderId);
$stmt->execute();

$result = $stmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode([
        "success" => false,
        "message" => "Order not found"
    ]);
    exit;
}

$order = $result->fetch_assoc();

echo json_encode([
    "success" => true,
    "order" => $order
]);