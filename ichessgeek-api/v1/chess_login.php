<?php
/**
 * 登录。POST JSON: {email, password}
 * 同一 IP 15 分钟内失败满 5 次就拒绝；成功后轮换会话 ID，防会话固定。
 */
require_once __DIR__ . '/chess_guard.php';

$body = chess_read_body();
$conn = chess_db();
$ip = chess_client_ip();

try {
    chess_schema($conn);

    if (chess_attempt_count($conn, 'login', $ip, CHESS_FAIL_WINDOW) >= CHESS_FAIL_LIMIT) {
        chess_err('too_many_logins');
    }

    $email = chess_norm_email($body['email'] ?? '');
    $password = (string) ($body['password'] ?? '');
    if ($email === '' || $password === '') {
        chess_err('missing_fields');
    }

    $stmt = $conn->prepare("SELECT id, email, nickname, password_hash, rating, verified_at, created_at
        FROM chess_players WHERE email = ? LIMIT 1");
    $stmt->bind_param("s", $email);
    $stmt->execute();
    $player = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$player) {
        // 不存在也要走一次真实的 bcrypt，让"没这个邮箱"和"密码错"耗时一致。
        // 这是 PHP 8.1 password_hash 出来的真散列（原文是一个用不到的随机串），
        // 写成假串的话 password_verify 会立刻返回，反而把时序差异暴露出来。
        password_verify($password, '$2y$10$XpCmqOyEh/U.pHz51ZfYMeYetLekHSE3cqyiwvfyp3y5y4pjfEjK2');
        chess_record_attempt($conn, 'login', $ip);
        chess_err('bad_credentials');
    }

    if (!password_verify($password, (string) $player['password_hash'])) {
        chess_record_attempt($conn, 'login', $ip);
        chess_err('bad_credentials');
    }

    if (password_needs_rehash((string) $player['password_hash'], PASSWORD_DEFAULT)) {
        $new = password_hash($password, PASSWORD_DEFAULT);
        $up = $conn->prepare("UPDATE chess_players SET password_hash = ? WHERE id = ?");
        $up->bind_param("si", $new, $player['id']);
        $up->execute();
        $up->close();
    }

    chess_clear_attempts($conn, 'login', $ip);

    chess_start_session();
    session_regenerate_id(true);
    $_SESSION['chess_player_id'] = (int) $player['id'];

    $id = (int) $player['id'];
    $seen = $conn->prepare("UPDATE chess_players SET last_seen_at = NOW() WHERE id = ?");
    $seen->bind_param("i", $id);
    $seen->execute();
    $seen->close();

    chess_json([
        'ok' => true,
        'signed_in' => true,
        'verified' => $player['verified_at'] !== null,
        'admin' => chess_player_is_admin($conn, $id),
        'player' => chess_public_row($player),
        'message' => '登录成功',
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'login');
}
