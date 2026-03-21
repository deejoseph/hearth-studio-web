<?php

header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once(__DIR__ . "/config/db.php");

try {

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        throw new Exception("Invalid request method");
    }

    // ==============================
    // 1️⃣ 获取当前开放季度
    // ==============================
    $seasonStmt = $pdo->prepare("
        SELECT id, name, year, total_slots, status, is_accepting_orders
        FROM seasons
        WHERE status = 'open'
        AND is_accepting_orders = 1
        LIMIT 1
    ");

    $seasonStmt->execute();
    $season = $seasonStmt->fetch(PDO::FETCH_ASSOC);

    if (!$season) {
        echo json_encode([
            "success" => true,
            "season" => null,
            "message" => "No active season"
        ]);
        exit();
    }

    $seasonId   = (int)$season['id'];
    $totalSlots = (int)$season['total_slots'];

    // ==============================
    // 2️⃣ 统计当前有效订单数量
    //    status_id 12 = cancelled
    // ==============================
    $countStmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM orders
        WHERE season_id = ?
        AND status_id NOT IN (12)
    ");

    $countStmt->execute([$seasonId]);
    $currentOrders = (int)$countStmt->fetchColumn();

    // ==============================
    // 3️⃣ 计算剩余名额
    // ==============================
    $remainingSlots = max($totalSlots - $currentOrders, 0);
    $isFull = $remainingSlots <= 0;

    // ==============================
    // 4️⃣ 返回数据
    // ==============================
    echo json_encode([
        "success" => true,
        "season" => [
            "id" => $seasonId,
            "name" => $season['name'],
            "year" => (int)$season['year'],
            "total_slots" => $totalSlots,
            "current_orders" => $currentOrders,
            "remaining_slots" => $remainingSlots,
            "is_full" => $isFull,
            "is_accepting_orders" => (bool)$season['is_accepting_orders']
        ]
    ]);

} catch (Exception $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ]);
}