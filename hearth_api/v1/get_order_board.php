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

    // =============================
    // 1️⃣ 获取当前或未来季度
    // =============================
    $currentStmt = $pdo->prepare("
        SELECT *
        FROM seasons
        WHERE is_visible = 1
        AND status = 'open'
        AND CURDATE() BETWEEN start_date AND end_date
        LIMIT 1
    ");
    $currentStmt->execute();
    $currentSeason = $currentStmt->fetch(PDO::FETCH_ASSOC);

    $seasons = [];

    if ($currentSeason) {

        $seasons[] = $currentSeason;

        $nextStmt = $pdo->prepare("
            SELECT *
            FROM seasons
            WHERE is_visible = 1
            AND status = 'open'
            AND start_date > ?
            ORDER BY start_date ASC
            LIMIT 1
        ");
        $nextStmt->execute([$currentSeason['end_date']]);
        $nextSeason = $nextStmt->fetch(PDO::FETCH_ASSOC);

        if ($nextSeason) {
            $seasons[] = $nextSeason;
        }

    } else {

        $futureStmt = $pdo->prepare("
            SELECT *
            FROM seasons
            WHERE is_visible = 1
            AND status = 'open'
            AND start_date > CURDATE()
            ORDER BY start_date ASC
            LIMIT 2
        ");
        $futureStmt->execute();
        $seasons = $futureStmt->fetchAll(PDO::FETCH_ASSOC);
    }

    $result = [];

    foreach ($seasons as $season) {

        $seasonId = $season['id'];

        // =============================
        // 2️⃣ 统计已用 slots
        // =============================
        $countStmt = $pdo->prepare("
            SELECT COUNT(*) 
            FROM orders o
            JOIN order_status s ON o.status_id = s.id
            WHERE o.season_id = ?
            AND s.code != 'cancelled'
        ");
        $countStmt->execute([$seasonId]);
        $usedSlots = (int)$countStmt->fetchColumn();

        // =============================
        // 3️⃣ 获取订单 + 状态 + 用户名
        // =============================
        $orderStmt = $pdo->prepare("
            SELECT 
                o.id,
                o.is_public,
                o.cover_image_url,
                u.name AS customer_name,

                s.id AS status_id,
                s.code AS status_code,
                s.label AS status_label,
                s.description AS status_description,
                s.sort_order

            FROM orders o
            JOIN order_status s ON o.status_id = s.id
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.season_id = ?
            AND s.code != 'cancelled'
            ORDER BY s.sort_order ASC, o.created_at ASC
        ");

        $orderStmt->execute([$seasonId]);
        $orders = $orderStmt->fetchAll(PDO::FETCH_ASSOC);

        // =============================
        // 4️⃣ 按状态分组
        // =============================
        $grouped = [];

        foreach ($orders as $order) {

            $statusId = $order['status_id'];

            if (!isset($grouped[$statusId])) {
                $grouped[$statusId] = [
                    "status_id" => (int)$statusId,
                    "status_code" => $order['status_code'],
                    "status_label" => $order['status_label'],
                    "status_description" => $order['status_description'],
                    "orders" => []
                ];
            }

            $grouped[$statusId]["orders"][] = [
                "id" => (int)$order['id'],
                "is_public" => (int)$order['is_public'],
                "product_image" => !empty($order['cover_image_url'])
                    ? $order['cover_image_url']
                    : null,
                "customer_name" => $order['customer_name'] ?? null
            ];
        }

        $result[] = [
            "id" => (int)$seasonId,
            "name" => $season['name'],
            "year" => (int)$season['year'],
            "start_date" => $season['start_date'],
            "end_date" => $season['end_date'],
            "order_deadline" => $season['order_deadline'],
            "production_cycle" => $season['production_cycle'] ?? "4–8 Weeks",
            "total_slots" => (int)$season['total_slots'],
            "used_slots" => $usedSlots,
            "statuses" => array_values($grouped)
        ];
    }

    echo json_encode([
        "success" => true,
        "seasons" => $result
    ]);

} catch (Exception $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ]);
}