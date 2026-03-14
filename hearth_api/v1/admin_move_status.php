<?php
require_once(__DIR__ . "/config/db.php");
header("Content-Type: application/json");

$data = json_decode(file_get_contents("php://input"), true);

$order_id = intval($data["order_id"] ?? 0);
$admin_name = "admin"; // 后面可以换成登录用户

if (!$order_id) {
    echo json_encode(["success" => false, "message" => "Invalid order id"]);
    exit;
}

$conn->begin_transaction();

try {

    // 1️⃣ 获取当前订单状态
    $stmt = $conn->prepare("
        SELECT status_id 
        FROM orders 
        WHERE id = ?
        FOR UPDATE
    ");
    $stmt->bind_param("i", $order_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $order = $result->fetch_assoc();

    if (!$order) {
        throw new Exception("Order not found");
    }

    $current_status_id = intval($order["status_id"]);

    // 2️⃣ 获取当前状态 sort_order
    $stmt = $conn->prepare("
        SELECT sort_order 
        FROM order_status 
        WHERE id = ?
    ");
    $stmt->bind_param("i", $current_status_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $current_status = $result->fetch_assoc();

    if (!$current_status) {
        throw new Exception("Current status not found");
    }

    $current_sort = intval($current_status["sort_order"]);

    // 3️⃣ 查找下一个阶段
    $stmt = $conn->prepare("
        SELECT id, sort_order 
        FROM order_status 
        WHERE sort_order > ?
        ORDER BY sort_order ASC
        LIMIT 1
    ");
    $stmt->bind_param("i", $current_sort);
    $stmt->execute();
    $result = $stmt->get_result();
    $next_status = $result->fetch_assoc();

    if (!$next_status) {
        throw new Exception("Already at final stage");
    }

    $next_status_id = intval($next_status["id"]);

    // 4️⃣ 更新订单状态
    $stmt = $conn->prepare("
        UPDATE orders 
        SET status_id = ? 
        WHERE id = ?
    ");
    $stmt->bind_param("ii", $next_status_id, $order_id);
    $stmt->execute();

    // 5️⃣ 插入状态日志
    $stmt = $conn->prepare("
        INSERT INTO order_status_logs
        (order_id, from_status_id, to_status_id, changed_by, note, created_at)
        VALUES (?, ?, ?, ?, ?, NOW())
    ");
    $note = "Stage moved by admin";
    $stmt->bind_param(
        "iiiss",
        $order_id,
        $current_status_id,
        $next_status_id,
        $admin_name,
        $note
    );
    $stmt->execute();

    $conn->commit();

    echo json_encode([
        "success" => true,
        "message" => "Stage updated successfully"
    ]);

} catch (Exception $e) {

    $conn->rollback();

    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ]);
}