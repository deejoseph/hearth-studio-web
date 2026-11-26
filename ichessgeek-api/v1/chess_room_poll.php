<?php
/**
 * 轮询房间。GET ?code=<6 位码>&since=<已应用的最大 seq>
 * 棋盘每 2–3 秒调一次；这是共享主机（LiteSpeed + PHP）上能用的最简方案 ——
 * 不上 WebSocket（跑不了）也不上 SSE（会长时间挂住 PHP 进程）。
 *
 * 🔴 GET 一律不写库。超时结案是写操作，放在 chess_room_close.php（POST），
 * 由钟归零那一方的客户端发一次。
 *
 * 返回的 room 就是权威状态（含 clock 与 server_now_ms），events 只是两次 poll 之间
 * 新落的手；重进时 since=0 一次拿到整份棋谱。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_room_core.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    chess_err('method');
}

$id = chess_require_player();

$code = chess_room_norm_code($_GET['code'] ?? '');
if ($code === '') {
    chess_err('bad_room_code');
}
$since = max(0, (int) ($_GET['since'] ?? 0));

$conn = chess_db();
try {
    $row = chess_find_room($conn, $code);
    if (!$row) {
        chess_err('no_such_room');
    }
    $room = chess_room_from_row($row);

    // 只让房里的人读。不这么卡的话，"报一个码试一下"就能问出这个房间存不存在、
    // 里面坐的是谁 —— 房间码不该当成访问控制来用，但它确实是这一层唯一的口令。
    // 门禁"验证过才能下棋"在这里不用重复查：能坐到座位上的，进房时已经查过一遍。
    if (chess_room_color_of($room, $id) === null) {
        chess_err('not_room_member');
    }

    // 提和也在 poll 里一起回来：它不涨 seq，不能指望事件表把它带给客户端。
    $draw = chess_draw_read($conn, (int) $room['id']);
    chess_json([
        'ok' => true,
        'room' => chess_room_public(
            $room, chess_now_ms(), chess_room_names($conn, $room), $id, $draw['by'] ?? null
        ),
        'events' => chess_room_events($conn, (int) $room['id'], $since),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'room_poll');
}
