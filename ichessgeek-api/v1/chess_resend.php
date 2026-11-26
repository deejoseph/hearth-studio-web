<?php
/**
 * 重发验证邮件。POST，且必须已登录 —— 不收邮箱参数，这样这个端点就不会
 * 被拿来试探"某个地址有没有注册过"。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_mail.php';

chess_read_body();
$id = chess_require_player();
$conn = chess_db();
$ip = chess_client_ip();

try {
    chess_schema($conn);

    if (chess_attempt_count($conn, 'resend', $ip, CHESS_REGISTER_WINDOW) >= CHESS_RESEND_LIMIT) {
        chess_err('too_many_sends');
    }

    $stmt = $conn->prepare("SELECT id, email, nickname, verified_at FROM chess_players WHERE id = ? LIMIT 1");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $player = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$player) {
        chess_err('no_such_player');
    }
    if ($player['verified_at'] !== null) {
        chess_json(['ok' => true, 'verified' => true, 'message' => '这个邮箱已经验证过了']);
    }

    [$token, $token_hash] = chess_new_token();
    $expires = date('Y-m-d H:i:s', time() + CHESS_VERIFY_TTL);
    $up = $conn->prepare("UPDATE chess_players SET verify_token_hash = ?, verify_expires = ? WHERE id = ?");
    $up->bind_param("ssi", $token_hash, $expires, $id);
    $up->execute();
    $up->close();

    // 计数放在真正要发的时候，避免试探性请求把额度白吃掉
    chess_record_attempt($conn, 'resend', $ip);

    if (!chess_send_verification($player['email'], $player['nickname'], $token)) {
        chess_err('mail_failed');
    }

    chess_json(['ok' => true, 'verified' => false, 'message' => '验证邮件已重新发送，请查收（含垃圾箱）']);
} catch (Throwable $e) {
    chess_fail($e, 'resend');
}
