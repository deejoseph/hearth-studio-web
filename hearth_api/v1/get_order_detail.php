<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

header("Content-Type: application/json");

require_once __DIR__ . '/config/db.php';


/* =========================
   1️⃣ 参数检查
========================= */

if (!isset($_GET['id'])) {
    echo json_encode([
        "success" => false,
        "message" => "Order ID missing"
    ]);
    exit;
}

$orderId = intval($_GET['id']);

if ($orderId <= 0) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid Order ID"
    ]);
    exit;
}


/* =========================
   2️⃣ 查询订单基本信息
========================= */

$orderStmt = $conn->prepare("
    SELECT 
    id,
    order_number,
    user_id,
    product_id,
    craft_type_id,
    pattern_id,
    cover_image_url,
    customer_reference_image,
    total_price,
    deposit_amount,
    deposit_paid,
    balance_paid,
    status_id,
    is_public,
    created_at
FROM orders
    WHERE id = ?
");

$orderStmt->bind_param("i", $orderId);
$orderStmt->execute();
$orderResult = $orderStmt->get_result();

if ($orderResult->num_rows === 0) {
    echo json_encode([
        "success" => false,
        "message" => "Order not found"
    ]);
    exit;
}

$order = $orderResult->fetch_assoc();

/* =========================
   🔥 查询 Pattern 大图
========================= */

$patternImageUrl = null;

if (!empty($order['pattern_id'])) {

    $patternStmt = $conn->prepare("
        SELECT image_url
        FROM patterns
        WHERE id = ?
        LIMIT 1
    ");

    $patternStmt->bind_param("i", $order['pattern_id']);
    $patternStmt->execute();
    $patternResult = $patternStmt->get_result();

    if ($patternRow = $patternResult->fetch_assoc()) {
        $patternImageUrl = $patternRow['image_url'];
    }
}


/* =========================
   3️⃣ 获取当前状态 sort_order
========================= */

$sortStmt = $conn->prepare("
    SELECT sort_order
    FROM order_status
    WHERE id = ?
");

$sortStmt->bind_param("i", $order['status_id']);
$sortStmt->execute();
$sortResult = $sortStmt->get_result();
$currentStatus = $sortResult->fetch_assoc();

$currentSortOrder = $currentStatus ? $currentStatus['sort_order'] : 0;


/* =========================
   4️⃣ 查询完整时间轴骨架
========================= */

$timelineStmt = $conn->prepare("
    SELECT
        s.id AS status_id,
        s.code,
        s.label,
        s.sort_order,
        s.is_payment_trigger
    FROM order_status s
    ORDER BY s.sort_order ASC
");

$timelineStmt->execute();
$timelineResult = $timelineStmt->get_result();

$timeline = [];

while ($row = $timelineResult->fetch_assoc()) {

    $row['is_current']   = ($row['status_id'] == $order['status_id']) ? 1 : 0;
    $row['is_completed'] = ($row['sort_order'] < $currentSortOrder) ? 1 : 0;

    $row['messages'] = [];
    $row['images']   = [];   // 🔥 新增 images 容器

    $timeline[$row['status_id']] = $row;
}


/* =========================
   5️⃣ 查询阶段沟通（不再关联图片）
========================= */

$messageStmt = $conn->prepare("
    SELECT 
        id,
        status_id,
        customer_message,
        customer_message_at,
        studio_reply,
        studio_reply_at,
        is_closed
    FROM order_progress_messages
    WHERE order_id = ?
    ORDER BY id ASC
");

$messageStmt->bind_param("i", $orderId);
$messageStmt->execute();
$messageResult = $messageStmt->get_result();

while ($msg = $messageResult->fetch_assoc()) {

    $sid = $msg['status_id'];

    if (isset($timeline[$sid])) {

        $timeline[$sid]['messages'][] = [
            "id" => $msg['id'],
            "customer_message" => $msg['customer_message'],
            "customer_message_at" => $msg['customer_message_at'],
            "studio_reply" => $msg['studio_reply'],
            "studio_reply_at" => $msg['studio_reply_at'],
            "is_closed" => $msg['is_closed']
        ];
    }
}


/* =========================
   6️⃣ 单独查询图片（关键修正）
========================= */

$imageStmt = $conn->prepare("
    SELECT
        id,
        status_id,
        customer_image,
        studio_image,
        is_visible_to_customer,
        created_at
    FROM order_progress_images
    WHERE order_id = ?
    ORDER BY created_at ASC
");

$imageStmt->bind_param("i", $orderId);
$imageStmt->execute();
$imageResult = $imageStmt->get_result();

while ($img = $imageResult->fetch_assoc()) {

    $sid = $img['status_id'];

    if (isset($timeline[$sid])) {

        $timeline[$sid]['images'][] = [
            "id" => $img['id'],
            "customer_image" => $img['customer_image'],
            "studio_image" => $img['studio_image'],
            "is_visible_to_customer" => $img['is_visible_to_customer'],
            "created_at" => $img['created_at']
        ];
    }
}


/* =========================
   7️⃣ 重新索引 timeline
========================= */

$timeline = array_values($timeline);


/* =========================
   8️⃣ 返回 JSON
========================= */
$referenceImage = $order['customer_reference_image'] ?? null;

echo json_encode([
    "success" => true,
    "order_info" => [
    "id" => $order['id'],
    "order_number" => $order['order_number'],
    "product_id" => $order['product_id'],
    "craft_type_id" => $order['craft_type_id'],
    "pattern_id" => $order['pattern_id'],
    "pattern_image" => $patternImageUrl,  // 🔥 新增
    "cover_image_url" => $order['cover_image_url'],
    "customer_reference_image" => $referenceImage,
        "total_price" => $order['total_price'],
        "deposit_amount" => $order['deposit_amount'],
        "deposit_paid" => $order['deposit_paid'],
        "balance_paid" => $order['balance_paid'],
        "status_id" => $order['status_id'],
        "is_public" => $order['is_public'],
        "created_at" => $order['created_at']
    ],
    "timeline" => $timeline
]);