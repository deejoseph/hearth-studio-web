<?php
require_once(__DIR__ . "/../config/db.php");

header("Content-Type: application/json");

// 获取 product_id
$productId = isset($_GET['product_id']) ? intval($_GET['product_id']) : 0;

if (!$productId) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid product_id."
    ]);
    exit;
}

/*
|--------------------------------------------------------------------------
| 1️⃣ 查询正确的 product_craft_option_id
|    同时计算最终价格
|--------------------------------------------------------------------------
*/

$stmt = $pdo->prepare("
    SELECT 
        pco.id AS product_craft_option_id,
        pco.product_id,
        pco.craft_type_id,
        ct.name AS craft_name,
        (p.base_price * IFNULL(ct.price_multiplier,1)) AS final_price
    FROM product_craft_options pco
    JOIN craft_types ct ON pco.craft_type_id = ct.id
    JOIN products p ON pco.product_id = p.id
    WHERE pco.product_id = ?
      AND pco.craft_type_id = 4
    LIMIT 1
");

$stmt->execute([$productId]);
$craft = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$craft) {
    echo json_encode([
        "success" => false,
        "message" => "Engraving option not found for this product."
    ]);
    exit;
}

/*
|--------------------------------------------------------------------------
| 2️⃣ 构建返回数据
|--------------------------------------------------------------------------
*/

$response = [
    "success" => true,
    "product_craft_option_id" => $craft['product_craft_option_id'], // 关键字段
    "product_id" => $craft['product_id'],
    "craft_type_id" => $craft['craft_type_id'],
    "craft_name" => $craft['craft_name'],
    "price" => round($craft['final_price'], 2),
    "patterns" => []
];

/*
|--------------------------------------------------------------------------
| 3️⃣ 获取 Engraving 可选图案
|--------------------------------------------------------------------------
*/

$stmt2 = $pdo->prepare("
    SELECT 
        p.id,
        p.name,
        p.thumbnail_url,
        p.description,
        p.image_url
    FROM patterns p
    WHERE p.is_active = 1
");

$stmt2->execute();
$response["patterns"] = $stmt2->fetchAll(PDO::FETCH_ASSOC);

/*
|--------------------------------------------------------------------------
| 4️⃣ 输出 JSON
|--------------------------------------------------------------------------
*/

echo json_encode($response);