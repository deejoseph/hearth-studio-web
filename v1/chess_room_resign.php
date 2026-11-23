<?php
/**
 * 认输。POST JSON: {code}
 *
 * 只改状态不改 seq，所以写回时要按"这行还停在 active"来卡：
 * 两个人在同一瞬间互相认输，两边读到的 seq 都是 0，只按 seq 卡的话后写的会把
 * resign-white 改成 resign-black —— 记录下来的胜者就反了。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_room_core.php';

$body = chess_read_body();

$id = chess_require_verified();
$conn = chess_db();

$code = chess_room_norm_code($body['code'] ?? '');
if ($code === '') {
    chess_err('bad_room_code');
}

try {
    $row = chess_find_room($conn, $code);
    if (!$row) {
        chess_err('no_such_room');
    }
    $room = chess_room_from_row($row);
    $names = chess_room_names($conn, $room);

    $done = chess_room_resign($room, $id, chess_now_ms());
    if ($done['err'] !== null) {
        chess_err($done['err']);
    }
    if (!chess_write_room($conn, $done['room'], (int) $room['seq'], CHESS_ROOM_ACTIVE)) {
        chess_err('stale_move', ['room' => chess_room_public(
            chess_room_from_row(chess_find_room($conn, $code)), chess_now_ms(), $names, $id
        )]);
    }

    chess_json([
        'ok' => true,
        'room' => chess_room_public($done['room'], chess_now_ms(), $names, $id),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'room_resign');
}
