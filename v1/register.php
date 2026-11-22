<?php
// 用户注册（users 表，密码 bcrypt）。改用 db_config 的连接，去掉硬编码凭据；
// 出错时不再把异常原文返回给客户端。
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

require_once __DIR__ . '/db_config.php';

if (!isset($pdo)) {
    die(json_encode(['status' => 'error', 'message' => '数据库连接失败'], JSON_UNESCAPED_UNICODE));
}

$email = $_POST['email'] ?? '';
$password = $_POST['password'] ?? '';
$nickname = $_POST['nickname'] ?? '';
$from_code = $_POST['from_invite_code'] ?? '';

if (!$email || !$password) {
    die(json_encode(['status' => 'error', 'message' => '邮箱或密码不能为空'], JSON_UNESCAPED_UNICODE));
}

$checkStmt = $pdo->prepare("SELECT id FROM users WHERE email = ?");
$checkStmt->execute([$email]);
if ($checkStmt->fetch()) {
    die(json_encode(['status' => 'error', 'message' => '该邮箱已被注册'], JSON_UNESCAPED_UNICODE));
}

$my_invite_code = strtoupper(substr(md5($email . time()), 0, 8));

try {
    $hashedPassword = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare("INSERT INTO users (email, password, nickname, invite_code, from_invite_code) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$email, $hashedPassword, $nickname, $my_invite_code, $from_code]);

    if (!empty($from_code)) {
        $upStmt = $pdo->prepare("UPDATE users SET referral_count = referral_count + 1 WHERE invite_code = ?");
        $upStmt->execute([$from_code]);
    }

    echo json_encode([
        'status' => 'success',
        'invite_code' => $my_invite_code,
        'message' => '登记成功，欢迎加入岁时礼序',
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    error_log('register failed: ' . $e->getMessage());
    echo json_encode(['status' => 'error', 'message' => '系统登记失败，请稍后重试'], JSON_UNESCAPED_UNICODE);
}
