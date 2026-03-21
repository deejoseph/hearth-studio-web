<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

header("Content-Type: application/json");

session_start();

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

require __DIR__ . '/PHPMailer/Exception.php';
require __DIR__ . '/PHPMailer/PHPMailer.php';
require __DIR__ . '/PHPMailer/SMTP.php';

$data = json_decode(file_get_contents("php://input"), true);

if (!isset($data['email']) || empty($data['email'])) {
    echo json_encode([
        "success" => false,
        "message" => "Email is required."
    ]);
    exit;
}

$toEmail = trim($data['email']);

// 生成6位验证码
$code = rand(100000, 999999);

// 保存验证码到 session
$_SESSION['reset_code']   = $code;
$_SESSION['reset_email']  = $toEmail;
$_SESSION['reset_expire'] = time() + 600; // 10分钟有效

$mail = new PHPMailer(true);

try {

    $mail->isSMTP();
    $mail->Host       = 'ichessgeek.com';
    $mail->SMTPAuth   = true;
    $mail->Username   = 'admin@ichessgeek.com';
    $mail->Password   = 'w9kAW14U';
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    $mail->Port       = 465;

    $mail->setFrom('admin@ichessgeek.com', 'Hearth Studio');
    $mail->addAddress($toEmail);

    $mail->isHTML(true);
    $mail->Subject = 'Your Password Reset Code';
    $mail->Body    = "
        <h2>Password Reset</h2>
        <p>Your verification code is:</p>
        <h1 style='color:#e67e22;'>$code</h1>
        <p>This code will expire in 10 minutes.</p>
    ";

    $mail->AltBody = "Your verification code is: $code";

    $mail->send();

    echo json_encode([
        "success" => true,
        "message" => "Verification code sent successfully."
    ]);

} catch (Exception $e) {

    echo json_encode([
        "success" => false,
        "message" => "Mailer Error: " . $mail->ErrorInfo
    ]);
}