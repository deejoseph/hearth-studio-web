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

$email = trim($data['email'] ?? '');
$code  = trim($data['code'] ?? '');

if (!$email || !$code) {
    echo json_encode([
        "success" => false,
        "message" => "Email and verification code are required"
    ]);
    exit();
}

try {

    // 查询用户
    $stmt = $pdo->prepare("
        SELECT id, name, email, verification_code, is_verified
        FROM users
        WHERE email = ?
        AND role = 'customer'
    ");

    $stmt->execute([$email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        echo json_encode([
            "success" => false,
            "message" => "User not found"
        ]);
        exit();
    }

    // 如果已经验证过
    if ((int)$user['is_verified'] === 1) {
        echo json_encode([
            "success" => true,
            "message" => "Email already verified",
            "user" => [
                "id" => $user['id'],
                "name" => $user['name'],
                "email" => $user['email']
            ]
        ]);
        exit();
    }

    // 验证码不匹配
    if ($user['verification_code'] !== $code) {
        echo json_encode([
            "success" => false,
            "message" => "Invalid verification code"
        ]);
        exit();
    }

    // 更新为已验证
    $updateStmt = $pdo->prepare("
        UPDATE users
        SET is_verified = 1,
            verification_code = NULL,
            updated_at = NOW()
        WHERE id = ?
    ");

    $updateStmt->execute([$user['id']]);

    // 返回用户信息（用于自动登录）
    echo json_encode([
        "success" => true,
        "message" => "Email verified successfully",
        "user" => [
            "id" => $user['id'],
            "name" => $user['name'],
            "email" => $user['email']
        ]
    ]);

} catch (Exception $e) {

    http_response_code(500);

    echo json_encode([
        "success" => false,
        "message" => $e->getMessage()
    ]);
}