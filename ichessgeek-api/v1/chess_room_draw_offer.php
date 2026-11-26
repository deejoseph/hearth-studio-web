<?php
/**
 * 提和。POST JSON: {code}
 *
 * 提和不涨 seq、不占时钟，所以正常情况下这是什么都不写的一步：只在
 * chess_room_draws 里留一条，下一次 poll 两边就都看得见。唯一要写房间的
 * 情形是"钟已经走完"—— 那时必须有人把 over 写进库，和走子/认输同一条路。
 *
 * 一房一条：已经有待答复的提和时规则层回 draw_pending，而不是覆盖。
 * 覆盖会把"谁先提的"变成"谁最后点的"，该谁答复就反了。
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
    $pending = chess_draw_read($conn, (int) $room['id']);

    $done = chess_room_draw_offer($room, $id, chess_now_ms(), $pending);
    if ($done['err'] !== null) {
        // 钟归零：提和不算，但结案要落库，否则这局永远停在 active。
        if ($done['err'] === 'flagged') {
            if (chess_write_room($conn, $done['room'], (int) $room['seq'], CHESS_ROOM_ACTIVE)) {
                chess_draw_clear($conn, (int) $room['id']);
                chess_err('flagged', ['room' => chess_room_public(
                    $done['room'], chess_now_ms(), $names, $id
                )]);
            }
        }
        chess_err($done['err'], $done['err'] === 'draw_pending'
            ? ['room' => chess_room_public($room, chess_now_ms(), $names, $id, $pending['by'] ?? null)]
            : []);
    }

    if (!chess_draw_write($conn, (int) $room['id'], $done['offer']['by'], (int) $done['offer']['at_ms'])) {
        chess_err('server');
    }

    chess_json([
        'ok' => true,
        'room' => chess_room_public($done['room'], chess_now_ms(), $names, $id, $done['offer']['by']),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'room_draw_offer');
}