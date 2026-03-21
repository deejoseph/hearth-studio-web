<?php

// ===== CORS 处理 =====
header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

// 处理预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once(__DIR__ . "/../config/db.php");

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {

    // ==========================================
    // 1️⃣ 查询
    // ==========================================
    case 'GET':

        $product_id = $_GET['product_id'] ?? null;
        $category   = $_GET['category'] ?? null;

        // 公共查询SQL主体
        $baseSQL = "
    SELECT 
        pco.id,
        pco.product_id,
        p.name AS product_name,
        p.category,
        p.base_price,
        pco.craft_type_id,
        ct.name AS craft_name,
        ct.price_multiplier,
        ct.description,
        pv.glaze_color,
        pv.image_url,
        pv.is_active,
        ROUND(p.base_price * ct.price_multiplier, 2) AS price
    FROM product_craft_options pco
    LEFT JOIN craft_types ct 
        ON pco.craft_type_id = ct.id
    LEFT JOIN products p
        ON pco.product_id = p.id
    LEFT JOIN product_variants pv 
        ON pv.product_id = pco.product_id 
        AND pv.craft_option_id = pco.id
    WHERE pv.is_active = 1
";

        // ======================================
        // 🔹 按 product_id 查询
        // ======================================
        if ($product_id) {

            $sql = $baseSQL . "
                AND pco.product_id = ?
                ORDER BY p.id ASC, pco.id ASC
            ";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([$product_id]);
        }

        // ======================================
        // 🔹 按 category 查询
        // ======================================
        elseif ($category) {

            $sql = $baseSQL . "
                AND p.category = ?
                ORDER BY p.id ASC, pco.id ASC
            ";

            $stmt = $pdo->prepare($sql);
            $stmt->execute([$category]);
        }

        // ======================================
        // 🔹 查询全部（后台使用）
        // ======================================
        else {

            $sql = $baseSQL . "
                ORDER BY p.id ASC, pco.id ASC
            ";

            $stmt = $pdo->query($sql);
        }

        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            "success" => true,
            "data" => $data
        ]);
        break;


    // ==========================================
    // 2️⃣ 新增
    // ==========================================
    case 'POST':

        $input = json_decode(file_get_contents("php://input"), true);

        $stmt = $pdo->prepare("
            INSERT INTO product_craft_options
            (product_id, craft_type_id)
            VALUES (?, ?)
        ");

        $stmt->execute([
            $input['product_id'],
            $input['craft_type_id']
        ]);

        echo json_encode([
            "success" => true,
            "id" => $pdo->lastInsertId()
        ]);
        break;


    // ==========================================
    // 3️⃣ 修改
    // ==========================================
    case 'PUT':

        $input = json_decode(file_get_contents("php://input"), true);

        $stmt = $pdo->prepare("
            UPDATE product_craft_options
            SET craft_type_id = ?
            WHERE id = ?
        ");

        $stmt->execute([
            $input['craft_type_id'],
            $input['id']
        ]);

        echo json_encode([
            "success" => true
        ]);
        break;


    // ==========================================
    // 4️⃣ 删除
    // ==========================================
    case 'DELETE':

        $input = json_decode(file_get_contents("php://input"), true);

        $stmt = $pdo->prepare("
            DELETE FROM product_craft_options
            WHERE id = ?
        ");

        $stmt->execute([$input['id']]);

        echo json_encode([
            "success" => true
        ]);
        break;


    default:
        echo json_encode([
            "success" => false,
            "message" => "Invalid request method"
        ]);
        break;
}