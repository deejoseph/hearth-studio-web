<?php
header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once(__DIR__ . "/config/db.php");

session_start();
ini_set('session.cookie_lifetime', 0);

$error = "";

/* 判断是不是 JSON 请求（React） */
$isJsonRequest = strpos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // 根据请求类型读取数据
    if ($isJsonRequest) {
        $data = json_decode(file_get_contents("php://input"), true);
        $username = trim($data['username'] ?? '');
        $password = trim($data['password'] ?? '');
    } else {
        $username = trim($_POST['username'] ?? '');
        $password = trim($_POST['password'] ?? '');
    }

    if ($username === "" || $password === "") {

        if ($isJsonRequest) {
            echo json_encode([
                "success" => false,
                "message" => "Please enter username and password."
            ]);
            exit;
        }

        $error = "Please enter username and password.";
    } else {

        $stmt = $conn->prepare("SELECT * FROM admin_users WHERE username = ? AND is_active = 1 LIMIT 1");
        $stmt->bind_param("s", $username);
        $stmt->execute();
        $result = $stmt->get_result();
        $admin = $result->fetch_assoc();

        if ($admin && password_verify($password, $admin['password_hash'])) {

            // 设置 Session（原逻辑完全保留）
            $_SESSION['admin_id'] = $admin['id'];
            $_SESSION['admin_username'] = $admin['username'];
            $_SESSION['admin_role'] = $admin['role'];

            // 更新登录时间
            $update = $conn->prepare("UPDATE admin_users SET last_login_at = NOW() WHERE id = ?");
            $update->bind_param("i", $admin['id']);
            $update->execute();

            /* =========================
               关键：根据角色决定跳转
               ========================= */

            if ($admin['role'] === 'super_admin') {
                $redirect = "admin_order.php";
            } elseif ($admin['role'] === 'studio_admin') {
                $redirect = "studio_dashboard.php";  // ← 按你原来的员工页面填
            } else {
                $redirect = "admin_order.php"; // 默认安全跳转
            }

            // 如果是 React 登录
            if ($isJsonRequest) {
                echo json_encode([
                    "success" => true,
                    "redirect" => $redirect,
                    "role" => $admin['role']
                ]);
                exit;
            }

            // 原系统表单登录逻辑（完全保留）
            header("Location: $redirect");
            exit;

        } else {

            if ($isJsonRequest) {
                echo json_encode([
                    "success" => false,
                    "message" => "Invalid credentials."
                ]);
                exit;
            }

            $error = "Invalid credentials.";
        }
    }
}
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Admin Login</title>
<style>
body { font-family: Arial; background:#111; color:white; display:flex; justify-content:center; align-items:center; height:100vh; }
.card { background:#1c1c1c; padding:40px; border-radius:12px; width:300px; }
input { width:100%; padding:10px; margin:10px 0; border-radius:6px; border:none; }
button { width:100%; padding:10px; background:#d4af37; border:none; border-radius:6px; cursor:pointer; }
.error { color:#ff6b6b; font-size:14px; }
</style>
</head>
<body>

<div class="card">
<h2>Studio Admin</h2>

<?php if ($error): ?>
<p class="error"><?php echo $error; ?></p>
<?php endif; ?>

<form method="POST">
<input type="text" name="username" placeholder="Username" required>
<input type="password" name="password" placeholder="Password" required>
<button type="submit">Login</button>
</form>

</div>
</body>
</html>