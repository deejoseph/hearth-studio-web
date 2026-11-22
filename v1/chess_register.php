<?php
/**
 * 注册。POST JSON: {email, password, nickname}
 * 成功后直接给会话（先让人能下 AI），验证邮件同时发出；发信失败会返回
 * mail_sent=false，前端据此显示"重新发送"，不让人卡在门外。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_mail.php';

$body = chess_read_body();
$conn = chess_db();
$ip = chess_client_ip();

try {
    chess_schema($conn);

    if (chess_attempt_count($conn, 'register', $ip, CHESS_REGISTER_WINDOW) >= CHESS_REGISTER_LIMIT) {
        chess_err('too_many_registrations');
    }

    $email = chess_norm_email($body['email'] ?? '');
    if ($email === '') {
        chess_err('bad_email');
    }

    $nickname = chess_trim($body['nickname'] ?? '', 30);
    if (chess_len($nickname) < 2) {
        chess_err('short_nickname');
    }

    $password = (string) ($body['password'] ?? '');
    $problem = chess_password_problem($password);
    if ($problem !== '') {
        chess_err($problem);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    [$token, $token_hash] = chess_new_token();
    $expires = date('Y-m-d H:i:s', time() + CHESS_VERIFY_TTL);

    $stmt = $conn->prepare("INSERT INTO chess_players
        (email, password_hash, nickname, verified_at, verify_token_hash, verify_expires, last_seen_at, created_at)
        VALUES (?, ?, ?, NULL, ?, ?, NOW(), NOW())");
    $stmt->bind_param("sssss", $email, $hash, $nickname, $token_hash, $expires);

    $duplicate = false;
    try {
        $stmt->execute();
    } catch (mysqli_sql_exception $e) {
        // 1062 = 唯一键冲突。不告诉调用方这个邮箱是否已存在，避免别人拿它枚举学员邮箱
        if ($e->getCode() === 1062 || stripos($e->getMessage(), 'Duplicate entry') !== false) {
            $duplicate = true;
        } else {
            throw $e;
        }
    }
    $stmt->close();

    if ($duplicate) {
        chess_json([
            'ok' => true,
            'status' => 'submitted',
            'signed_in' => chess_player_id() > 0,
            'mail_sent' => false,
            'message' => '我们已经处理了这个邮箱的注册请求。如果它可用，验证邮件正在路上。',
        ]);
    }

    $player_id = (int) $conn->insert_id;
    // 限流数的是真建成的账号：填错邮箱、密码太短不该扣掉这个 IP 的额度。
    chess_record_attempt($conn, 'register', $ip);

    $row = $conn->prepare("SELECT id, email, nickname, rating, verified_at, created_at FROM chess_players WHERE id = ?");
    $row->bind_param("i", $player_id);
    $row->execute();
    $player = $row->get_result()->fetch_assoc();
    $row->close();

    chess_start_session();
    session_regenerate_id(true);
    $_SESSION['chess_player_id'] = $player_id;

    $mail_sent = chess_send_verification($email, $nickname, $token);

    chess_json([
        'ok' => true,
        'status' => 'created',
        'signed_in' => true,
        'verified' => false,
        'mail_sent' => $mail_sent,
        'player' => chess_public_row($player),
        'message' => $mail_sent
            ? '账号建好了，先去下 AI 也行；点收信里的链接就能和人下。'
            : '账号建好了。验证邮件没发出去，可以用页面上的"重新发送"。',
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'register');
}
