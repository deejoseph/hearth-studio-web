<?php
require_once(__DIR__ . "/admin_auth.php");
require_once(__DIR__ . "/config/db.php");

/* 仅 super_admin 可访问 */
if ($_SESSION['admin_role'] !== 'super_admin') {
    header("Location: studio_dashboard.php");
    exit;
}

$message = "";

/* ===========================
   创建管理员
=========================== */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['create_admin'])) {

    $username = trim($_POST['username'] ?? '');
    $password = trim($_POST['password'] ?? '');
    $role     = $_POST['role'] ?? '';

    if ($username && $password && in_array($role, ['super_admin','studio_admin'])) {

        $password_hash = password_hash($password, PASSWORD_DEFAULT);

        $stmt = $conn->prepare("
            INSERT INTO admin_users (username, password_hash, role, is_active, created_at)
            VALUES (?, ?, ?, 1, NOW())
        ");

        $stmt->bind_param("sss", $username, $password_hash, $role);

        if ($stmt->execute()) {
            $message = "Admin created successfully.";
        } else {
            $message = "Username already exists.";
        }

    } else {
        $message = "Invalid input.";
    }
}

/* ===========================
   删除管理员
=========================== */
if (isset($_GET['delete'])) {

    $delete_id = intval($_GET['delete']);

    if ($delete_id && $delete_id != $_SESSION['admin_id']) {

        $stmt = $conn->prepare("DELETE FROM admin_users WHERE id = ?");
        $stmt->bind_param("i", $delete_id);
        $stmt->execute();
    }

    header("Location: admin_manage_admins.php");
    exit;
}

/* ===========================
   切换启用状态
=========================== */
if (isset($_GET['toggle'])) {

    $toggle_id = intval($_GET['toggle']);

    if ($toggle_id && $toggle_id != $_SESSION['admin_id']) {

        $stmt = $conn->prepare("
            UPDATE admin_users
            SET is_active = 1 - is_active
            WHERE id = ?
        ");
        $stmt->bind_param("i", $toggle_id);
        $stmt->execute();
    }

    header("Location: admin_manage_admins.php");
    exit;
}

/* ===========================
   获取管理员列表
=========================== */
$admins = $conn->query("
    SELECT id, username, role, is_active, created_at
    FROM admin_users
    ORDER BY created_at DESC
");

/* ===========================
   页面布局
=========================== */
require_once(__DIR__ . "/admin_layout.php");
?>

<h1>Super Admin – Admin Management</h1>

<?php if ($message): ?>
<div class="success"><?php echo htmlspecialchars($message); ?></div>
<?php endif; ?>

<div class="card">
    <h3>Create New Admin</h3>

    <form method="POST" style="display:flex; gap:10px; flex-wrap:wrap;">

        <input type="text" name="username" placeholder="Username" required>

        <input type="password" name="password" placeholder="Password" required>

        <select name="role">
            <option value="studio_admin">Studio Admin</option>
            <option value="super_admin">Super Admin</option>
        </select>

        <button type="submit" name="create_admin">
            Create
        </button>

    </form>
</div>

<div class="card">
    <h3>All Admins</h3>

    <table style="width:100%; border-collapse:collapse;">

        <tr>
            <th>ID</th>
            <th>Username</th>
            <th>Role</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
        </tr>

        <?php while ($row = $admins->fetch_assoc()): ?>

        <tr style="<?php echo $row['is_active'] ? '' : 'opacity:0.5;'; ?>">

            <td><?php echo $row['id']; ?></td>

            <td><?php echo htmlspecialchars($row['username']); ?></td>

            <td>
                <span class="badge <?php echo $row['role']; ?>">
                    <?php echo htmlspecialchars($row['role']); ?>
                </span>
            </td>

            <td>
                <?php echo $row['is_active'] ? 'Active' : 'Disabled'; ?>
            </td>

            <td>
                <?php echo htmlspecialchars($row['created_at']); ?>
            </td>

            <td>
                <?php if ($row['id'] != $_SESSION['admin_id']): ?>

                    <a href="?toggle=<?php echo $row['id']; ?>">
                        Toggle
                    </a>
                    |
                    <a href="?delete=<?php echo $row['id']; ?>"
                       onclick="return confirm('Delete this admin?')">
                        Delete
                    </a>

                <?php else: ?>
                    (You)
                <?php endif; ?>
            </td>

        </tr>

        <?php endwhile; ?>

    </table>
</div>

<?php require_once(__DIR__ . "/admin_footer.php"); ?>