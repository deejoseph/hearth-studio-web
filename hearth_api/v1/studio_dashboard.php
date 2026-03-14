<?php
require_once(__DIR__ . "/admin_auth.php");
require_once(__DIR__ . "/config/db.php");

if ($_SESSION['admin_role'] !== 'studio_admin') {
    header("Location: super_dashboard.php");
    exit;
}

/* ===========================
   图片压缩函数
=========================== */
function compressImage($source, $destination, $quality = 75) {

    $info = getimagesize($source);
    if (!$info) return false;

    if ($info['mime'] == 'image/jpeg') {
        $image = imagecreatefromjpeg($source);
    } elseif ($info['mime'] == 'image/png') {
        $image = imagecreatefrompng($source);
    } else {
        return false;
    }

    imagejpeg($image, $destination, $quality);
    imagedestroy($image);
    return true;
}

$base_url = "https://www.ichessgeek.com/HearthStudio";

$order_id = intval($_GET['order_id'] ?? $_POST['order_id'] ?? 0);
$message = "";
$order = null;

/* ===========================
   上传处理
=========================== */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['upload_work']) && $order_id) {

    $memo = trim($_POST['memo'] ?? '');
    $status_id = intval($_POST['status_id'] ?? 0);

    if (!empty($_FILES["image"]["tmp_name"])) {

        /* 获取订单信息 */
        $stmt = $conn->prepare("SELECT order_number, created_at FROM orders WHERE id = ?");
        $stmt->bind_param("i", $order_id);
        $stmt->execute();
        $order_row = $stmt->get_result()->fetch_assoc();

        if ($order_row) {

            $order_number = $order_row['order_number'];
            $order_year = date("Y", strtotime($order_row['created_at']));

            $root_path = $_SERVER['DOCUMENT_ROOT'] . "/HearthStudio";
            $upload_dir = $root_path . "/Customize/{$order_year}/{$order_number}/";

            if (!is_dir($upload_dir)) {
                mkdir($upload_dir, 0777, true);
            }

            $filename = uniqid() . ".jpg";
            $target = $upload_dir . $filename;
            $tmp_file = $_FILES["image"]["tmp_name"];

            if (compressImage($tmp_file, $target, 75)) {

                $relative_path = "Customize/{$order_year}/{$order_number}/" . $filename;

                $stmt = $conn->prepare("
                    INSERT INTO studio_work_uploads
                    (studio_admin_id, image_path, description, order_id, status_id)
                    VALUES (?, ?, ?, ?, ?)
                ");

                $stmt->bind_param(
                    "issii",
                    $_SESSION['admin_id'],
                    $relative_path,
                    $memo,
                    $order_id,
                    $status_id
                );

                $stmt->execute();

                $message = "Progress uploaded (compressed). Waiting approval.";
            } else {
                $message = "Image compression failed.";
            }
        }
    }
}

/* ===========================
   获取订单信息
=========================== */
if ($order_id) {

    $stmt = $conn->prepare("
        SELECT o.*, s.label, p.image_url AS pattern_image
        FROM orders o
        JOIN order_status s ON o.status_id = s.id
        LEFT JOIN patterns p ON o.pattern_id = p.id
        WHERE o.id = ?
    ");
    $stmt->bind_param("i", $order_id);
    $stmt->execute();
    $order = $stmt->get_result()->fetch_assoc();
}

/* ===========================
   获取已有进度图（已审核）
=========================== */
$progress_images = null;
if ($order_id) {
    $progress_images = $conn->query("
        SELECT studio_image
        FROM order_progress_images
        WHERE order_id = {$order_id}
        ORDER BY created_at ASC
    ");
}

/* 获取阶段列表 */
$statuses = $conn->query("
    SELECT id, label FROM order_status
    ORDER BY sort_order ASC
");
?>

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Studio Dashboard</title>

<style>
body { font-family:sans-serif; background:#f4f4f4; padding:40px; }
.card { background:white; padding:25px; margin-bottom:25px; border-radius:10px; }
img { max-width:200px; margin:10px 10px 10px 0; border-radius:8px; }
input, select, textarea { width:100%; margin-bottom:10px; padding:8px; }
button { padding:8px 14px; background:black; color:white; border:none; border-radius:6px; cursor:pointer; }
.image-row { display:flex; flex-wrap:wrap; }
.success { color:green; margin-bottom:15px; }
</style>
</head>

<body>

<h1>Studio Admin Panel</h1>

<?php if ($message): ?>
<div class="success"><?php echo $message; ?></div>
<?php endif; ?>

<div class="card">
<h3>Open Order</h3>
<form method="GET">
    <input type="number" name="order_id" placeholder="Enter Order ID" required>
    <button type="submit">Load</button>
</form>
</div>

<?php if ($order): ?>

<div class="card">
<h3>Order Info</h3>
<p><strong>Order Number:</strong> <?php echo $order['order_number']; ?></p>
<p><strong>Status:</strong> <?php echo $order['label']; ?></p>
<p><strong>Created:</strong> <?php echo $order['created_at']; ?></p>
</div>

<div class="card">
<h3>Product Image</h3>
<?php if ($order['cover_image_url']): ?>
    <img src="<?php echo $order['cover_image_url']; ?>">
<?php endif; ?>
</div>

<div class="card">
<h3>Pattern Image</h3>
<?php if ($order['pattern_image']): ?>
    <img src="<?php echo $base_url . $order['pattern_image']; ?>">
<?php endif; ?>
</div>

<div class="card">
<h3>Customer Reference</h3>
<?php if ($order['customer_reference_image']): ?>
    <img src="<?php echo $base_url . $order['customer_reference_image']; ?>">
<?php endif; ?>
</div>

<div class="card">
<h3>Existing Approved Progress</h3>
<div class="image-row">
<?php if ($progress_images): ?>
    <?php while ($img = $progress_images->fetch_assoc()): ?>
        <img src="<?php echo htmlspecialchars($img['studio_image']); ?>">
    <?php endwhile; ?>
<?php endif; ?>
</div>
</div>

<div class="card">
<h3>Upload New Progress</h3>

<form method="POST" enctype="multipart/form-data">
<input type="hidden" name="order_id" value="<?php echo $order_id; ?>">

<label>Stage</label>
<select name="status_id" required>
<?php while ($s = $statuses->fetch_assoc()): ?>
    <option value="<?php echo $s['id']; ?>">
        <?php echo $s['label']; ?>
    </option>
<?php endwhile; ?>
</select>

<label>Memo</label>
<textarea name="memo"></textarea>

<label>Image</label>
<input type="file" name="image" accept="image/*" required>

<button type="submit" name="upload_work">Upload</button>
</form>

</div>

<?php endif; ?>

</body>
</html>