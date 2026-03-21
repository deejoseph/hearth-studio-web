<?php
require_once("admin_layout.php");
require_once(__DIR__ . "/admin_auth.php");
require_once(__DIR__ . "/config/db.php");

if ($_SESSION['admin_role'] !== 'super_admin') {
    header("Location: studio_dashboard.php");
    exit;
}

// 简单统计数据
$totalOrders = $conn->query("SELECT COUNT(*) as total FROM orders")->fetch_assoc()['total'] ?? 0;
$totalCustomers = $conn->query("SELECT COUNT(*) as total FROM customers")->fetch_assoc()['total'] ?? 0;

require_once(__DIR__ . "/admin_layout.php");
?>

<h1>Super Admin Dashboard</h1>

<div class="card">
    <h3>System Overview</h3>
    <p><strong>Total Orders:</strong> <?php echo intval($totalOrders); ?></p>
    <p><strong>Total Customers:</strong> <?php echo intval($totalCustomers); ?></p>
</div>

<div class="card">
    <h3>Quick Actions</h3>
    <ul>
        <li><a href="admin_order.php">Manage Orders</a></li>
        <li><a href="admin_customers.php">Manage Customers</a></li>
        <li><a href="admin_manage_admins.php">Manage Admins</a></li>
    </ul>
</div>

<?php require_once(__DIR__ . "/admin_footer.php"); ?>