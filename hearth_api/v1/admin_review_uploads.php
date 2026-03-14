<?php
require_once(__DIR__ . "/admin_auth.php");
require_once(__DIR__ . "/config/db.php");

/* 仅 super_admin 可访问 */
if ($_SESSION['admin_role'] !== 'super_admin') {
    header("Location: studio_dashboard.php");
    exit;
}

$base_url = "https://www.ichessgeek.com/HearthStudio";
$message = "";

/* ===========================
   读取所有阶段
=========================== */
$all_statuses = [];
$result = $conn->query("SELECT id, label FROM order_status ORDER BY sort_order ASC");
while ($row = $result->fetch_assoc()) {
    $all_statuses[] = $row;
}

/* ===========================
   审核处理
=========================== */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    $upload_id = intval($_POST['upload_id'] ?? 0);
    $action = $_POST['action'] ?? '';
    $new_status_id = intval($_POST['status_id'] ?? 0);
    $new_memo = trim($_POST['description'] ?? '');

    if (!$upload_id || !$new_status_id) {
        die("Invalid request.");
    }

    $conn->begin_transaction();

    try {

        /* 1️⃣ 更新内部上传记录 */
        $stmt = $conn->prepare("
            UPDATE studio_work_uploads
            SET status_id = ?, description = ?
            WHERE id = ?
        ");
        $stmt->bind_param("isi", $new_status_id, $new_memo, $upload_id);
        $stmt->execute();

        /* 2️⃣ 获取上传记录 */
        $stmt = $conn->prepare("
            SELECT order_id, image_path
            FROM studio_work_uploads
            WHERE id = ?
        ");
        $stmt->bind_param("i", $upload_id);
        $stmt->execute();
        $upload = $stmt->get_result()->fetch_assoc();

        if (!$upload) {
            throw new Exception("Upload not found.");
        }

        if ($action === 'approve') {

            /* 3️⃣ 构建客户可见路径 */
            $full_image_path = "/HearthStudio/" . ltrim($upload['image_path'], '/');

            /* 4️⃣ 插入客户可见表 */
            $stmt = $conn->prepare("
                INSERT INTO order_progress_images
                (order_id, studio_image, status_id)
                VALUES (?, ?, ?)
            ");
            $stmt->bind_param(
                "isi",
                $upload['order_id'],
                $full_image_path,
                $new_status_id
            );
            $stmt->execute();

            /* 5️⃣ 更新订单状态 */
            $stmt = $conn->prepare("
                UPDATE orders
                SET status_id = ?
                WHERE id = ?
            ");
            $stmt->bind_param("ii", $new_status_id, $upload['order_id']);
            $stmt->execute();

            /* 6️⃣ 标记审核通过 */
            $stmt = $conn->prepare("
                UPDATE studio_work_uploads
                SET is_approved = 1,
                    approved_by = ?,
                    approved_at = NOW()
                WHERE id = ?
            ");
            $stmt->bind_param("ii", $_SESSION['admin_id'], $upload_id);
            $stmt->execute();

            $message = "Upload approved and published.";

        } elseif ($action === 'reject') {

            /* 标记驳回 */
            $stmt = $conn->prepare("
                UPDATE studio_work_uploads
                SET is_approved = -1,
                    approved_by = ?,
                    approved_at = NOW()
                WHERE id = ?
            ");
            $stmt->bind_param("ii", $_SESSION['admin_id'], $upload_id);
            $stmt->execute();

            $message = "Upload rejected.";
        }

        $conn->commit();

    } catch (Exception $e) {
        $conn->rollback();
        die("Error: " . $e->getMessage());
    }
}

/* ===========================
   获取待审核列表
=========================== */
$pending_uploads = $conn->query("
    SELECT u.*, o.order_number
    FROM studio_work_uploads u
    JOIN orders o ON u.order_id = o.id
    WHERE u.is_approved = 0
    ORDER BY u.id ASC
");

/* ===========================
   页面布局开始
=========================== */
require_once(__DIR__ . "/admin_layout.php");
?>

<h1>Super Admin – Review Studio Uploads</h1>

<?php if ($message): ?>
<div class="success"><?php echo htmlspecialchars($message); ?></div>
<?php endif; ?>

<?php if ($pending_uploads->num_rows === 0): ?>
    <div class="card">No pending uploads.</div>
<?php endif; ?>

<?php while ($row = $pending_uploads->fetch_assoc()): ?>

<div class="card">

    <h3>Order #<?php echo htmlspecialchars($row['order_number']); ?></h3>

    <img src="<?php echo $base_url . '/' . $row['image_path']; ?>" 
         style="max-width:300px; margin-bottom:15px;">

    <form method="POST">

        <input type="hidden" name="upload_id" value="<?php echo $row['id']; ?>">

        <label>Stage</label>
        <select name="status_id" required>
            <?php foreach ($all_statuses as $s): ?>
                <option value="<?php echo $s['id']; ?>"
                    <?php if ($s['id'] == $row['status_id']) echo 'selected'; ?>>
                    <?php echo htmlspecialchars($s['label']); ?>
                </option>
            <?php endforeach; ?>
        </select>

        <label>Memo</label>
        <textarea name="description"><?php echo htmlspecialchars($row['description']); ?></textarea>

        <br><br>

        <button type="submit" name="action" value="approve" class="approve">
            Approve
        </button>

        <button type="submit" name="action" value="reject" class="reject">
            Reject
        </button>

    </form>

</div>

<?php endwhile; ?>

<?php require_once(__DIR__ . "/admin_footer.php"); ?>