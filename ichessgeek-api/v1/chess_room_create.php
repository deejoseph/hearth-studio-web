<?php
/**
 * 开房间。POST JSON: {color: "w"|"b"|"random", time_ms?: 毫秒}
 * 成功回一个 6 位房间码，把它给对方，对方拿它进房。
 *
 * 这里是"没验证邮箱只能下 AI"那道门禁真正生效的地方（P1 时它没有可见效果，
 * 因为在线对弈的入口当时还不存在）。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_room_core.php';

$body = chess_read_body();

$id = chess_require_verified();
$conn = chess_db();
$ip = chess_client_ip();

try {
    if (chess_attempt_count($conn, 'room', $ip, CHESS_ROOM_WINDOW) >= CHESS_ROOM_CREATE_LIMIT) {
        chess_err('too_many_rooms');
    }

    // 不填就是每方 10 分钟；填了要在规则层的区间内（10 秒到 1 小时），
    // 下限是防一个请求把房间开成一局 0 秒 —— 那样第一手之前就该判负。
    $timeMs = isset($body['time_ms']) ? (int) $body['time_ms'] : CHESS_ROOM_TIME_MS;
    $color = chess_trim($body['color'] ?? '', 8);
    if ($color === '') {
        $color = 'random';
    }

    $made = chess_room_new($id, $color, $timeMs);
    if ($made['err'] !== null) {
        chess_err($made['err']);
    }
    $room = chess_insert_room($conn, $made['room']);
    if ($room === null) {
        chess_err('server');
    }

    // 按真开成的房间计，和注册同一口径：失败不该占额度，但一直开着玩也要有个数。
    chess_record_attempt($conn, 'room', $ip);

    chess_json([
        'ok' => true,
        'room' => chess_room_public($room, chess_now_ms(), chess_room_names($conn, $room), $id),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'room_create');
}
