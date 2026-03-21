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
    // 获取可见的 seasons
    // ==============================
    $stmt = $pdo->prepare("
        SELECT *
        FROM seasons
        WHERE is_visible = 1
        ORDER BY year DESC, start_date DESC
    ");
    $stmt->execute();

    $seasons = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $result = [];

    foreach ($seasons as $season) {

        $seasonId   = (int)$season['id'];
        $totalSlots = (int)$season['total_slots'];

        // ==============================
        // 动态统计订单数量（排除 cancelled）
        // ==============================
        $countStmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM orders
            WHERE season_id = ?
            AND status_id NOT IN (12)
        ");

        $countStmt->execute([$seasonId]);
        $currentOrders = (int)$countStmt->fetchColumn();

        $remaining = $totalSlots - $currentOrders;
        if ($remaining < 0) {
            $remaining = 0;
        }

        $isFull = $currentOrders >= $totalSlots;

        $canOrder = !$isFull && (int)$season['is_accepting_orders'] === 1;

        $result[] = [
            "id"               => $seasonId,
            "name"             => $season['name'],
            "year"             => (int)$season['year'],
            "start_date"       => $season['start_date'],
            "end_date"         => $season['end_date'],
            "total_slots"      => $totalSlots,
            "current_orders"   => $currentOrders,
            "remaining_slots"  => $remaining,
            "status"           => $season['status'],
            "is_full"          => $isFull,
            "can_order"        => $canOrder
        ];
    }

    echo json_encode([
        "success" => true,
        "data"    => $result
    ]);

} catch (Exception $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ]);
}