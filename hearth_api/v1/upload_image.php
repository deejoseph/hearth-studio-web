<?php

header("Content-Type: application/json");
require_once __DIR__ . '/config/db.php';

/* 开启调试（开发阶段） */
ini_set('display_errors', 1);
error_reporting(E_ALL);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(["success" => false, "message" => "Invalid request method"]);
    exit;
}

$orderId  = intval($_POST['order_id'] ?? 0);
$statusId = intval($_POST['status_id'] ?? 0);

if ($orderId <= 0 || $statusId <= 0) {
    echo json_encode(["success" => false, "message" => "Invalid input"]);
    exit;
}

if (!isset($_FILES['image'])) {
    echo json_encode(["success" => false, "message" => "No image uploaded"]);
    exit;
}

$file = $_FILES['image'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    echo json_encode([
        "success" => false,
        "message" => "Upload error code: " . $file['error']
    ]);
    exit;
}

/* ============================= */
/* 检查是否当前阶段 */
/* ============================= */

$checkStmt = $conn->prepare("
    SELECT status_id, order_number
    FROM orders
    WHERE id = ?
");

$checkStmt->bind_param("i", $orderId);
$checkStmt->execute();
$res = $checkStmt->get_result()->fetch_assoc();

if (!$res || $res['status_id'] != $statusId) {
    echo json_encode(["success" => false, "message" => "Not current stage"]);
    exit;
}

$orderNumber = $res['order_number'];

/* ============================= */
/* 校验图片 */
/* ============================= */

$tmpPath = $file['tmp_name'];

$imageInfo = getimagesize($tmpPath);
if ($imageInfo === false) {
    echo json_encode(["success" => false, "message" => "Invalid image file"]);
    exit;
}

$mime = $imageInfo['mime'];

$allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
if (!in_array($mime, $allowedTypes)) {
    echo json_encode(["success" => false, "message" => "Invalid image type"]);
    exit;
}

if ($file['size'] > 5 * 1024 * 1024) {
    echo json_encode(["success" => false, "message" => "File too large (max 5MB)"]);
    exit;
}

/* ============================= */
/* 创建目录 */
/* ============================= */

$year = date("Y");

$baseDir = $_SERVER['DOCUMENT_ROOT'] . "/HearthStudio/Customize/$year/$orderNumber/";

if (!file_exists($baseDir)) {
    if (!mkdir($baseDir, 0777, true)) {
        echo json_encode(["success" => false, "message" => "Failed to create directory"]);
        exit;
    }
}

/* ============================= */
/* 图片压缩 */
/* ============================= */

$width  = $imageInfo[0];
$height = $imageInfo[1];

$maxWidth = 1600;
$maxHeight = 1600;

$ratio = min($maxWidth / $width, $maxHeight / $height, 1);

$newWidth = floor($width * $ratio);
$newHeight = floor($height * $ratio);

switch ($mime) {
    case 'image/jpeg':
        $srcImage = imagecreatefromjpeg($tmpPath);
        break;
    case 'image/png':
        $srcImage = imagecreatefrompng($tmpPath);
        break;
    case 'image/webp':
        $srcImage = imagecreatefromwebp($tmpPath);
        break;
    default:
        echo json_encode(["success" => false, "message" => "Unsupported image"]);
        exit;
}

if (!$srcImage) {
    echo json_encode(["success" => false, "message" => "GD library error"]);
    exit;
}

$dstImage = imagecreatetruecolor($newWidth, $newHeight);

/* 防止PNG透明变黑 */
$white = imagecolorallocate($dstImage, 255, 255, 255);
imagefill($dstImage, 0, 0, $white);

imagecopyresampled(
    $dstImage,
    $srcImage,
    0, 0, 0, 0,
    $newWidth, $newHeight,
    $width, $height
);

/* 文件名 */
$fileName = date("Ymd_His") . "_" . rand(1000, 9999) . ".jpg";
$fullPath = $baseDir . $fileName;

/* 保存 */
if (!imagejpeg($dstImage, $fullPath, 85)) {
    echo json_encode(["success" => false, "message" => "Failed to save image"]);
    exit;
}

imagedestroy($srcImage);
imagedestroy($dstImage);

/* ============================= */
/* 存数据库 */
/* ============================= */

$imageUrl = "/HearthStudio/Customize/$year/$orderNumber/$fileName";

$insert = $conn->prepare("
    INSERT INTO order_progress_images
    (order_id, status_id, customer_image, is_visible_to_customer, created_at)
    VALUES (?, ?, ?, 1, NOW())
");

$insert->bind_param("iis", $orderId, $statusId, $imageUrl);

if (!$insert->execute()) {
    echo json_encode(["success" => false, "message" => "DB insert failed"]);
    exit;
}

$newImageId = $insert->insert_id;

echo json_encode([
    "success" => true,
    "image_id" => $newImageId,
    "image_url" => $imageUrl
]);