<?php

header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once(__DIR__ . "/config/db.php");

$data = json_decode(file_get_contents("php://input"), true);

$name = trim($data['name'] ?? '');
$email = trim($data['email'] ?? '');
$password = trim($data['password'] ?? '');

if (!$name || !$email || !$password) {
    echo json_encode([
        "success" => false,
        "message" => "Missing required fields"
    ]);
    exit();
}

try {

    // 检查邮箱是否已存在
    $checkStmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
    $checkStmt->execute([$email]);

    if ($checkStmt->fetch()) {
        echo json_encode([
            "success" => false,
            "message" => "Email already registered"
        ]);
        exit();
    }

    // 加密密码
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    // 生成 6 位验证码
    $verificationCode = random_int(100000, 999999);

    // 插入用户（新增 is_verified + verification_code）
    $stmt = $pdo->prepare("
        INSERT INTO users 
        (name, email, password_hash, is_verified, verification_code, created_at)
        VALUES (?, ?, ?, 0, ?, NOW())
    ");

    $stmt->execute([
        $name,
        $email,
        $hashedPassword,
        $verificationCode
    ]);

    // ===== 发送验证码邮件（后续可替换为 SMTP）=====
    $subject = "Your Verification Code";
    $message = "Your verification code is: " . $verificationCode;
    $headers = "From: noreply@yourdomain.com";

    @mail($email, $subject, $message, $headers);

    // ⚠️ 不再返回 user
    echo json_encode([
        "success" => true,
        "email" => $email
    ]);

} catch (Exception $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ]);
}