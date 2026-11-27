<?php
/**
 * 我是谁。GET，棋盘每次加载都调。
 * 未登录返回 200 + signed_in:false —— 用 401 会让首屏 console 里常年挂着一条红字，
 * 而"没登录"在这里是正常状态，不是错误。
 */
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    chess_err('method');
}

$id = chess_player_id();
if ($id === 0) {
    chess_json(['ok' => true, 'signed_in' => false, 'verified' => false, 'admin' => false, 'player' => null]);
}

$conn = chess_db();
try {
    chess_schema($conn);

    $stmt = $conn->prepare("SELECT id, email, nickname, rating, verified_at, created_at
        FROM chess_players WHERE id = ? LIMIT 1");
    $stmt->bind_param("i", $id);
    $stmt->execute();
    $player = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$player) {
        // 会话还在但账号已经不存在：清掉，别让人带着幽灵身份操作
        $_SESSION = [];
        session_destroy();
        chess_json(['ok' => true, 'signed_in' => false, 'verified' => false, 'admin' => false, 'player' => null]);
    }

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
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'me');
}
