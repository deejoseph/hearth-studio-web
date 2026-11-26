<?php
// 普通用户登录（站内 / Android）。users 表本来就是 bcrypt，这里只改用 db_config 的连接，
// 不再在文件里硬编码数据库账号密码，也关掉 display_errors。
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';

$email = $_POST['email'] ?? '';
$password = $_POST['password'] ?? '';

if (empty($email) || empty($password)) {
    echo json_encode(["status" => "error", "message" => "鸿雁传书不可为空"], JSON_UNESCAPED_UNICODE);
    exit;
}

$stmt = $conn->prepare("SELECT nickname, password, invite_code FROM users WHERE email = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$stmt->store_result();

if ($stmt->num_rows > 0) {
    $stmt->bind_result($db_nickname, $db_password, $db_invite_code);
    $stmt->fetch();

    if (password_verify($password, (string) $db_password)) {
        echo json_encode([
            "status" => "success",
            "account" => $db_nickname,
            "invite_code" => $db_invite_code,
            "message" => "归雁入林，欢迎回来",
        ], JSON_UNESCAPED_UNICODE);
    } else {
        echo json_encode(["status" => "error", "message" => "密押（密码）校验不符"], JSON_UNESCAPED_UNICODE);
    }
} else {
    echo json_encode(["status" => "error", "message" => "未能在画卷中找到此名帖"], JSON_UNESCAPED_UNICODE);
}

$stmt->close();
$conn->close();
