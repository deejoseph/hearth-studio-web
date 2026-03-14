<?php
require_once("admin_layout.php");
require_once(__DIR__ . "/admin_auth.php");
require_once(__DIR__ . "/config/db.php");

if ($_SESSION['admin_role'] !== 'super_admin') {
    header("Location: studio_dashboard.php");
    exit;
}

$keyword = trim($_GET['keyword'] ?? '');

if ($keyword) {
    $stmt = $conn->prepare("
        SELECT id, email, created_at
        FROM customers
        WHERE email LIKE ?
        ORDER BY created_at DESC
    ");
    $search = "%" . $keyword . "%";
    $stmt->bind_param("s", $search);
    $stmt->execute();
    $customers = $stmt->get_result();
} else {
    $customers = $conn->query("
        SELECT id, email, created_at
        FROM customers
        ORDER BY created_at DESC
        LIMIT 100
    ");
}

require_once(__DIR__ . "/admin_layout.php");
?>

<h1>Customer Management</h1>

<div class="card">
    <h3>Search Customer</h3>

    <form method="GET">
        <input type="text" name="keyword" placeholder="Search by email" value="<?php echo htmlspecialchars($keyword); ?>">
        <button type="submit">Search</button>
    </form>
</div>

<div class="card">
    <h3>Customer List</h3>

    <table style="width:100%; border-collapse:collapse;">
        <tr>
            <th>ID</th>
            <th>Email</th>
            <th>Created</th>
        </tr>

        <?php while ($row = $customers->fetch_assoc()): ?>
        <tr>
            <td><?php echo intval($row['id']); ?></td>
            <td><?php echo htmlspecialchars($row['email']); ?></td>
            <td><?php echo htmlspecialchars($row['created_at']); ?></td>
        </tr>
        <?php endwhile; ?>
    </table>
</div>

<?php require_once(__DIR__ . "/admin_footer.php"); ?>