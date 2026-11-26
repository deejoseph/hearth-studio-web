<?php
// 普通用户改密码（users 表，本来就是 bcrypt）。改用 db_config 的连接，去掉硬编码凭据。
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';

$email = $_POST['email'] ?? '';
$oldPass = $_POST['old_password'] ?? '';
$newPass = $_POST['new_password'] ?? '';

if (empty($email) || empty($oldPass) || empty($newPass)) {
    echo json_encode(["success" => false, "message" => "密信资料不全"], JSON_UNESCAPED_UNICODE);
    exit;
}

$stmt = $conn->prepare("SELECT password FROM users WHERE email = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($user = $result->fetch_assoc()) {
    if (password_verify($oldPass, (string) $user['password'])) {
        $updateStmt = $conn->prepare("UPDATE users SET password = ? WHERE email = ?");
        $newHashedPass = password_hash($newPass, PASSWORD_DEFAULT);
        $updateStmt->bind_param("ss", $newHashedPass, $email);

        if ($updateStmt->execute()) {
            echo json_encode(["success" => true, "message" => "密押（密码）修订成功"], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(["success" => false, "message" => "修订失败，请稍后重试"], JSON_UNESCAPED_UNICODE);
        }
        $updateStmt->close();
    } else {
        echo json_encode(["success" => false, "message" => "旧密押校验错误"], JSON_UNESCAPED_UNICODE);
    }
} else {
    echo json_encode(["success" => false, "message" => "查无此名帖"], JSON_UNESCAPED_UNICODE);
}

$stmt->close();
$conn->close();
