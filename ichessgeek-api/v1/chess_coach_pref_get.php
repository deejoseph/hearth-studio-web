<?php
/**
 * 我想找什么样的教练 —— 取。GET。
 *
 * 必须登录（这是这个人自己的偏好，没登录就没有"自己的"）。没填过返回
 * pref:null —— "还没填"是正常状态，用 404 会让首屏常年挂一条红字。
 *
 * 不要求邮箱已确认：填这张表不外发任何东西，确认邮件那道门禁是为
 * "和真人对上"（在线对弈）设的，把想学的人挡在门外才是这里的代价。
 */
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    chess_err('method');
}

$playerId = chess_require_player();
$conn = chess_db();

try {
    $row = chess_coach_pref_read($conn, $playerId);
    chess_json([
        'ok' => true,
        'pref' => $row === null ? null : coach_pref_public($row),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'coach pref get');
}
