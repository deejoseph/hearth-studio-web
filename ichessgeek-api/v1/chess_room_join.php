<?php
/**
 * 进房。POST JSON: {code}
 *
 * 座位是靠一条 UPDATE ... WHERE <座位> IS NULL 抢来的，不是靠 chess_write_room：
 * 进房不涨 seq，两个人同时进同一个房间时两个 WHERE seq = 0 都会命中，
 * 后写的那个会把前一个人顶出座位。
 *
 * 已经在房间里的人再提交一次同样的码 = 回到自己的座位（刷新页面、换设备），
 * 不报错、不占新位。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_room_core.php';

$body = chess_read_body();

$id = chess_require_verified();
$conn = chess_db();
$ip = chess_client_ip();

$code = chess_room_norm_code($body['code'] ?? '');
if ($code === '') {
    chess_err('bad_room_code');
}

try {
    if (chess_attempt_count($conn, 'joinfail', $ip, CHESS_JOIN_WINDOW) >= CHESS_JOIN_LIMIT) {
        chess_err('too_many_joins');
    }

    $row = chess_find_room($conn, $code);
    if (!$row) {
        chess_record_attempt($conn, 'joinfail', $ip);
        chess_err('no_such_room');
    }
    $room = chess_room_from_row($row);
    $now = chess_now_ms();

    $side = chess_room_color_of($room, $id);
    if ($side === null) {
        $joined = chess_room_join($room, $id, $now);
        if ($joined['err'] !== null) {
            chess_err($joined['err']);
        }
        if (!chess_room_claim_seat($conn, $room['id'], $joined['seat'], $id, $now)) {
            // 抢位那条语句没命中 = 就在刚才有人坐下了；也可能是同一刻房主自己
            // 改了状态。让人重新看一眼房间再决定，比在这里猜一个错要诚实。
            chess_err('room_full');
        }
        $room = chess_room_from_row(chess_find_room($conn, $code));
    }

    chess_json([
        'ok' => true,
        'room' => chess_room_public($room, chess_now_ms(), chess_room_names($conn, $room), $id),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'room_join');
}
