<?php
/**
 * 答复提和。POST JSON: {code, accept: true|false}
 *
 * 接受 = 和棋（result 'agreement'），这是唯一一条"两边都没输也没赢"的终局；
 * 拒绝 = 只删掉那条提和记录，局面、时钟、seq 一个都不动。
 *
 * accept 必须是布尔值，不收 "yes"/1：答复会把一局棋定死，缺字段或写错
 * 应该是一句"请求体格式不对"，而不是悄悄当成拒绝（或者更糟，当成接受）。
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
if (!is_bool($body['accept'] ?? null)) {
    chess_err('bad_body');
}
$accept = $body['accept'];

try {
    $row = chess_find_room($conn, $code);
    if (!$row) {
        chess_err('no_such_room');
    }
    $room = chess_room_from_row($row);
    $names = chess_room_names($conn, $room);
    $pending = chess_draw_read($conn, (int) $room['id']);

    $done = chess_room_draw_answer($room, $id, $accept, chess_now_ms(), $pending);
    $next = $done['room'];
    if ($done['err'] !== null) {
        // 和走子/认输一样：钟先走完的话，这一下不算，但结案要落库。
        if ($done['err'] === 'flagged') {
            if (chess_write_room($conn, $next, (int) $room['seq'], CHESS_ROOM_ACTIVE)) {
                chess_draw_clear($conn, (int) $room['id']);
                chess_err('flagged', ['room' => chess_room_public($next, chess_now_ms(), $names, $id)]);
            }
        }
        chess_err($done['err'], $done['err'] === 'no_draw_offer'
            ? ['room' => chess_room_public($room, chess_now_ms(), $names, $id)]
            : []);
    }

    if ($done['accepted']) {
        $conn->begin_transaction();
        try {
            if (!chess_write_room($conn, $next, (int) $room['seq'], CHESS_ROOM_ACTIVE)) {
                $conn->rollback();
                chess_err('stale_move', ['room' => chess_room_public(
                    chess_room_from_row(chess_find_room($conn, $code)), chess_now_ms(), $names, $id
                )]);
            }
            // 和棋已经成立，清理失败只记一笔：不能让一条没删掉的提和
            // 把两秒钟前双方都看见的"和棋"退回去。
            if (!chess_draw_clear($conn, (int) $room['id'])) {
                error_log('chess draw answer: accepted but draw row not cleared for room ' . $room['id']);
            }
            $conn->commit();
        } catch (Throwable $e) {
            $conn->rollback();
            throw $e;
        }
    } elseif (!chess_draw_clear($conn, (int) $room['id'])) {
        // 拒绝只改这一张表：删不掉就等于没拒绝，界面会一直挂着那个对话框。
        chess_err('server');
    }

    chess_json([
        'ok' => true,
        'accepted' => $done['accepted'],
        'room' => chess_room_public($next, chess_now_ms(), $names, $id),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'room_draw_answer');
}