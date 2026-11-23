<?php
/**
 * 走一步。POST JSON: {code, san}
 *
 * 这一步是整个 P2 的裁判：客户端只交 SAN 字符串，局面、时钟、结果全部由服务端
 * 按 chess_engine.php 那份裁判标准算 —— 那一份已经和棋盘 JS 引擎逐手对拍过
 * （25833 局面 / 518401 手 / 0 处不一致），规则层不许自己再判一次。
 *
 * 写房间和记事件在一个事务里：只写成一半的话，要么"棋走好了但棋谱少一手"，
 * 要么"棋谱多一手但盘面没动"，两种都会让两边的界面从此对不上。
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
// 只截不断：超过 16 个字符的 SAN 一定是乱输入，直接判不合法。
// 若按 chess_trim 的惯例截到 16，"Rxa8=Q+mate" 会被截成 "Rxa8=Q+m"，
// 引擎解不出来固然也是拒绝，但拒绝的理由就成了我们自己的手误。
$san = trim((string) ($body['san'] ?? ''));
if ($san === '' || strlen($san) > 16) {
    chess_err('illegal_move');
}

try {
    $row = chess_find_room($conn, $code);
    if (!$row) {
        chess_err('no_such_room');
    }
    $room = chess_room_from_row($row);
    $names = chess_room_names($conn, $room);
    $now = chess_now_ms();

    $played = chess_room_move($room, $id, $san, $now);
    $next = $played['room'];

    if ($played['err'] !== null) {
        // 钟已经归零：这一手不算，但结案要写进库 —— 否则这局永远停在 active，
        // 棋谱导出（P4）会拿到半局。写不进去说明别人已经动过这行，那就按 stale 处理。
        if ($played['err'] === 'flagged') {
            if (chess_write_room($conn, $next, (int) $room['seq'], CHESS_ROOM_ACTIVE)) {
                chess_err('flagged', ['room' => chess_room_public($next, chess_now_ms(), $names, $id)]);
            }
        }
        chess_err($played['err']);
    }

    $conn->begin_transaction();
    try {
        if (!chess_write_room($conn, $next, (int) $room['seq'], CHESS_ROOM_ACTIVE)) {
            $conn->rollback();
            chess_err('stale_move', ['room' => chess_room_public(
                chess_room_from_row(chess_find_room($conn, $code)), chess_now_ms(), $names, $id
            )]);
        }
        if (!chess_insert_event($conn, (int) $room['id'], $played['event'])) {
            $conn->rollback();
            error_log('chess room move event: ' . $conn->error);
            chess_err('server');
        }
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        throw $e;
    }

    chess_json([
        'ok' => true,
        'room' => chess_room_public($next, chess_now_ms(), $names, $id),
        'event' => $played['event'],
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'room_move');
}
