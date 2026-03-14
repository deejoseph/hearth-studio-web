<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

header("Content-Type: application/json");
session_start();

require_once(__DIR__ . "/config/db.php");

$data = json_decode(file_get_contents("php://input"), true);

if (
    !isset($data['email']) ||
    !isset($data['code']) ||
    !isset($data['new_password'])
) {
    echo json_encode([
        "success" => false,
        "message" => "All fields are required."
    ]);
    exit;
}

$email = trim($data['email']);
$code = trim($data['code']);
$newPassword = $data['new_password'];


// 1️⃣ 检查 session 是否存在
if (
    !isset($_SESSION['reset_code']) ||
    !isset($_SESSION['reset_email']) ||
    !isset($_SESSION['reset_expire'])
) {
    echo json_encode([
        "success" => false,
        "message" => "No reset request found. Please request a new code."
    ]);
    exit;
}

// 2️⃣ 检查邮箱是否匹配
if ($_SESSION['reset_email'] !== $email) {
    echo json_encode([
        "success" => false,
        "message" => "Email does not match."
    ]);
    exit;
}

// 3️⃣ 检查验证码是否正确
if ($_SESSION['reset_code'] != $code) {
    echo json_encode([
        "success" => false,
        "message" => "Invalid verification code."
    ]);
    exit;
}

// 4️⃣ 检查是否过期
if (time() > $_SESSION['reset_expire']) {
    echo json_encode([
        "success" => false,
        "message" => "Verification code expired."
    ]);
    exit;
}

// 5️⃣ 确认用户存在
$checkStmt = $conn->prepare("SELECT id FROM users WHERE email = ?");
$checkStmt->bind_param("s", $email);
$checkStmt->execute();
$result = $checkStmt->get_result();

if ($result->num_rows === 0) {
    echo json_encode([
        "success" => false,
        "message" => "User not found."
    ]);
    exit;
}
$checkStmt->close();


// 6️⃣ 更新密码（字段改为 password_hash）
$hashedPassword = password_hash($newPassword, PASSWORD_DEFAULT);

$stmt = $conn->prepare("UPDATE users SET password_hash = ? WHERE email = ?");
$stmt->bind_param("ss", $hashedPassword, $email);

if ($stmt->execute()) {

    // 清除 session
    unset($_SESSION['reset_code']);
    unset($_SESSION['reset_email']);
    unset($_SESSION['reset_expire']);

    echo json_encode([
        "success" => true,
        "message" => "Password reset successfully."
    ]);

} else {
    echo json_encode([
        "success" => false,
        "message" => "Failed to update password."
    ]);
}

$stmt->close();
$conn->close();