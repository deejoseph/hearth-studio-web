<?php
require_once(__DIR__ . "/config/db.php");
require 'PHPMailer/Exception.php';
require 'PHPMailer/PHPMailer.php';
require 'PHPMailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

header('Content-Type: application/json');

$input = json_decode(file_get_contents("php://input"), true);
$email = trim($input['email'] ?? '');

if (empty($email)) {
    echo json_encode(["success" => false, "message" => "Email required"]);
    exit();
}

$stmt = $pdo->prepare("SELECT id FROM users WHERE email = ? AND role='customer'");
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    echo json_encode(["success" => true]);
    exit();
}

$token = bin2hex(random_bytes(32));
$expires = date("Y-m-d H:i:s", time() + 3600);

$stmt = $pdo->prepare("
    INSERT INTO password_resets (user_id, token, expires_at)
    VALUES (?, ?, ?)
");
$stmt->execute([$user['id'], $token, $expires]);

$resetLink = "https://ichessgeek.com/reset-password?token=$token";

$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host       = 'mail.ichessgeek.com';
    $mail->SMTPAuth   = true;
    $mail->Username   = 'admin@ichessgeek.com';
    $mail->Password   = 'w9kAW14U';
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    $mail->Port       = 465;

    $mail->setFrom('admin@ichessgeek.com', 'Hearth Studio');
    $mail->addAddress($email);

    $mail->isHTML(true);
    $mail->Subject = 'Password Reset Request';
    $mail->Body    = "
        <h3>Password Reset</h3>
        <p>Click the link below to reset your password:</p>
        <a href='$resetLink'>$resetLink</a>
        <p>This link expires in 1 hour.</p>
    ";

    $mail->send();

    echo json_encode(["success" => true]);

} catch (Exception $e) {
    echo json_encode([
        "success" => false,
        "message" => "Mail error: " . $mail->ErrorInfo
    ]);
}