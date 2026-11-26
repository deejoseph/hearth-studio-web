<?php
/**
 * 棋谱库：删除一局对局记录。
 *
 * 必须登录。只能删除自己的记录（player_id 校验）。
 * 返回 {ok: true}，无论是否真删了（幂等：删不存在的也算成功）。
 */
require_once __DIR__ . '/chess_guard.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    chess_err('method');
}

$playerId = chess_player_id();
if ($playerId === 0) {
    chess_err('sign_in_required');
}

// chess_read_body 已经挡过方法、Content-Type 和非数组的 body，这里只管取字段
$body = chess_read_body();

$gameId = $body['id'] ?? null;
if (!is_string($gameId) || $gameId === '' || strlen($gameId) > 40) {
    chess_err('bad_body');
}

$conn = chess_db();
chess_schema($conn);

// 删除：只删自己的记录（player_id 校验）
$stmt = $conn->prepare('DELETE FROM chess_library WHERE player_id = ? AND game_id = ?');
if (!$stmt) {
    chess_err('service');
}
$stmt->bind_param('is', $playerId, $gameId);
if (!$stmt->execute()) {
    $stmt->close();
    chess_err('server');
}
$stmt->close();

chess_json(['ok' => true]);
