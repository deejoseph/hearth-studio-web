<?php
/**
 * 结案。POST JSON: {code}
 *
 * 存在的理由：超时是由时钟推出来的，不是由任何一方"走的一步"触发的。轮到走的人
 * 一直不走，另一方在 poll 里只能看到对方归零而这局在库里永远停在 active ——
 * poll 是 GET，不能写库（GET 不该有副作用），所以由客户端显式发一次 POST 来结案。
 *
 * 幂等：没人超时就原样返回、一个字节都不写；已经结过案的房间再调一次也不会变。
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
    if (chess_room_color_of($room, $id) === null) {
        chess_err('not_room_member');
    }
    $names = chess_room_names($conn, $room);

    $now = chess_now_ms();
    $closed = chess_room_close($room, $now);
    $next = $closed['room'];

    // 只有"本来还开着、现在因为归零而结了案"才需要写：
    // 其余情况（时间没到 / 早已结束）写回去也是同样的值，白白抢一次乐观锁。
    $needsWrite = $room['status'] === CHESS_ROOM_ACTIVE && $next['status'] === CHESS_ROOM_OVER;
    if ($needsWrite && !chess_write_room($conn, $next, (int) $room['seq'], CHESS_ROOM_ACTIVE)) {
        chess_err('stale_move', ['room' => chess_room_public(
            chess_room_from_row(chess_find_room($conn, $code)), chess_now_ms(), $names, $id
        )]);
    }
    if ($needsWrite && !chess_draw_clear($conn, (int) $room['id'])) {
        error_log('chess room close: draw row not cleared for room ' . $room['id']);
    }

    chess_json([
        'ok' => true,
        'room' => chess_room_public($next, chess_now_ms(), $names, $id),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'room_close');
}
