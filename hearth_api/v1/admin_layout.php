<?php
require_once(__DIR__ . "/admin_auth.php");

if (!isset($_SESSION['admin_id'])) {
    header("Location: admin_login.php");
    exit;
}

$current_page = basename($_SERVER['PHP_SELF']);
$admin_username = $_SESSION['admin_username'];
$admin_role = $_SESSION['admin_role'];

function active($page, $current_page) {
    return $page === $current_page ? 'active' : '';
}
?>

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Admin Panel</title>

<style>
body {
    margin:0;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto;
    background:#f5f6fa;
}

/* Top Bar */
.topbar {
    background:#1e1e2f;
    color:white;
    padding:15px 25px;
    display:flex;
    justify-content:space-between;
    align-items:center;
}

.topbar .right a {
    color:white;
    text-decoration:none;
    margin-left:20px;
}

/* Layout */
.container {
    display:flex;
}

/* Sidebar */
.sidebar {
    width:220px;
    background:#2c2c3e;
    min-height:100vh;
    padding-top:20px;
}

.sidebar a {
    display:block;
    padding:14px 20px;
    color:#ddd;
    text-decoration:none;
    font-size:15px;
}

.sidebar a:hover {
    background:#3d3d55;
    color:white;
}

.sidebar a.active {
    background:#4e73df;
    color:white;
}

/* Content */
.content {
    flex:1;
    padding:40px;
}

/* Card */
.card {
    background:white;
    padding:25px;
    border-radius:12px;
    box-shadow:0 2px 8px rgba(0,0,0,0.05);
    margin-bottom:25px;
}

/* Buttons */
.btn {
    padding:8px 14px;
    border:none;
    border-radius:6px;
    cursor:pointer;
}

.btn-primary {
    background:#4e73df;
    color:white;
}

.btn-danger {
    background:#e74c3c;
    color:white;
}

.success-msg {
    color:green;
    margin-bottom:20px;
}
</style>
</head>

<body>

<div class="topbar">
    <div>
        <div class="logo">
    HearthStudio Admin
</div> <?php echo htmlspecialchars($admin_username); ?>
        (<?php echo htmlspecialchars($admin_role); ?>)
    </div>
    <div class="right">
        <a href="admin_logout.php">Logout</a>
    </div>
</div>

<div class="container">

    <div class="sidebar">

        <?php
        // 安全兜底，避免变量未定义导致白屏
        $current_page = $current_page ?? basename($_SERVER['PHP_SELF']);
        $admin_role   = $admin_role ?? ($_SESSION['admin_role'] ?? '');
        ?>

        <a href="super_dashboard.php"
           class="<?php echo function_exists('active') ? active('super_dashboard.php', $current_page) : ''; ?>">
            Dashboard
        </a>

        <a href="admin_order.php"
           class="<?php echo function_exists('active') ? active('admin_order.php', $current_page) : ''; ?>">
            Orders
        </a>

        <a href="admin_customers.php"
           class="<?php echo function_exists('active') ? active('admin_customers.php', $current_page) : ''; ?>">
            Customer Management
        </a>

        <a href="admin_review_uploads.php"
           class="<?php echo function_exists('active') ? active('admin_review_uploads.php', $current_page) : ''; ?>">
            Review Uploads
        </a>

        <?php if ($admin_role === 'super_admin'): ?>
            <a href="admin_manage_admins.php"
               class="<?php echo function_exists('active') ? active('admin_manage_admins.php', $current_page) : ''; ?>">
                Admin Management
            </a>
        <?php endif; ?>

    </div>

    <div class="content">