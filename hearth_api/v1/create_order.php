<?php

header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once(__DIR__ . "/config/db.php");

try {

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new Exception("Invalid request method");
    }

    $input = json_decode(file_get_contents("php://input"), true);
    file_put_contents("debug_input.txt", print_r($input, true));

    if (!$input || !isset($input['productId'])) {
        throw new Exception("Missing productId");
    }

    $productId = (int)$input['productId'];

    $pdo->beginTransaction();

    // ======================================================
    // 1️⃣ 查找可用季度（锁行）
    // ======================================================
    $seasonStmt = $pdo->prepare("
        SELECT *
        FROM seasons
        WHERE status = 'open'
        AND is_visible = 1
        AND is_accepting_orders = 1
        AND (
            start_date >= CURDATE()
            OR CURDATE() BETWEEN start_date AND end_date
        )
        ORDER BY start_date ASC
        FOR UPDATE
    ");

    $seasonStmt->execute();
    $seasons = $seasonStmt->fetchAll(PDO::FETCH_ASSOC);

    if (!$seasons) {
        throw new Exception("No open season available");
    }

    $targetSeason = null;

    foreach ($seasons as $season) {

        $seasonId   = (int)$season['id'];
        $totalSlots = (int)$season['total_slots'];

        if ($totalSlots <= 0) {
            continue;
        }

        if (!empty($season['order_deadline']) && date("Y-m-d") > $season['order_deadline']) {
            continue;
        }

        $countStmt = $pdo->prepare("
            SELECT COUNT(*)
            FROM orders
            WHERE season_id = ?
            AND status_id NOT IN (12)
        ");

        $countStmt->execute([$seasonId]);
        $currentOrders = (int)$countStmt->fetchColumn();

        if ($currentOrders < $totalSlots) {
            $targetSeason = $season;
            break;
        }
    }

    if (!$targetSeason) {
        throw new Exception("All seasonal production slots are currently fully reserved.");
    }

    $seasonId = (int)$targetSeason['id'];

    // ======================================================
// 2️⃣ 获取产品基础价格 + 工艺系数
// ======================================================

$stmt = $pdo->prepare("
    SELECT 
        p.base_price,
        ct.price_multiplier
    FROM products p
    LEFT JOIN craft_types ct ON ct.id = ?
    WHERE p.id = ?
");

$stmt->execute([
    $input['craft_type_id'] ?? null,
    $productId
]);

$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    throw new Exception("Product or craft type not found");
}

$basePrice = (float)$row['base_price'];
$multiplier = isset($row['price_multiplier']) 
    ? (float)$row['price_multiplier'] 
    : 1;

$totalPrice = round($basePrice * $multiplier, 2);

    // ======================================================
    // 3️⃣ 设计字段
    // ======================================================
    $baseInscription  = $input['base_inscription'] ?? null;
    $craftTypeId      = isset($input['craft_type_id']) ? (int)$input['craft_type_id'] : null;
    $patternId        = isset($input['pattern_id']) ? (int)$input['pattern_id'] : null;
    $patternTypeId    = isset($input['pattern_type_id']) ? (int)$input['pattern_type_id'] : null;
    $customNotes      = $input['custom_notes'] ?? null;
    $expectedDate     = $input['expected_date'] ?? null;
    $isPublic         = isset($input['is_public']) ? (int)$input['is_public'] : 0;

    // ✅ 关键：前端传入的图片
    $coverImageUrl = $input['image_url'] ?? null;

    // ======================================================
    // 4️⃣ 生成订单号
    // ======================================================
    $orderNumber = 'HS' . date("YmdHis") . rand(100,999);

    // ======================================================
    // 5️⃣ 计算定金
    // ======================================================
    $depositRatio  = 0.50;
    $depositAmount = round($totalPrice * $depositRatio, 2);

    if (!isset($input['user_id'])) {
        throw new Exception("Missing user_id");
    }
    $userId   = (int)$input['user_id'];
    // TODO: replace with real authentication (session or token)
    $statusId = 1; // pending_design

    // ======================================================
    // 6️⃣ 插入订单
    // ======================================================
    $insertStmt = $pdo->prepare("
        INSERT INTO orders
        (
            order_number,
            user_id,
            season_id,
            product_id,
            craft_type_id,
            pattern_id,
            pattern_type_id,
            cover_image_url,
            base_inscription,
            custom_notes,
            expected_date,
            is_public,
            deposit_amount,
            total_price,
            deposit_ratio,
            status_id,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ");

    $insertStmt->execute([
        $orderNumber,
        $userId,
        $seasonId,
        $productId,
        $craftTypeId,
        $patternId,
        $patternTypeId,
        $coverImageUrl,
        $baseInscription,
        $customNotes,
        $expectedDate,
        $isPublic,
        $depositAmount,
        $totalPrice,
        $depositRatio,
        $statusId
    ]);

    $orderId = $pdo->lastInsertId();

    $pdo->commit();

    echo json_encode([
        "success" => true,
        "orderId" => $orderId,
        "season_id" => $seasonId,
        "season_name" => $targetSeason['name']
    ]);

} catch (Exception $e) {

    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ]);
}
