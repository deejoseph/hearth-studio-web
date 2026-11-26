<?php
/**
 * 我想找什么样的教练 —— 存。POST，一人一行，反复提交就是改。
 *
 * 合不合法一律问 chess_coach_core.php（选项白名单、数量上下限、说明的字数），
 * 这个文件只做四件事：确认是谁、把 body 交给规则层、落库、把库里那一行还回去。
 * 回的形状和 chess_coach_pref_get.php 完全一致，所以界面只有一条读路径。
 *
 * 限流没做在这：它要登录才能写，一人只占一行，重复提交是把同一行改一遍。
 * 一个肯注册再填表的人，最坏情况是把自己的偏好改了 200 次。
 */
require_once __DIR__ . '/chess_guard.php';

$playerId = chess_require_player();

// chess_read_body 顺手挡掉三样：不是 POST、Content-Type 不是 JSON、body 不是对象。
// 表单式的跨站 POST 带不上 application/json，这一条就是 CSRF 的门。
$check = coach_pref_normalize(chess_read_body());
if (!$check['ok']) {
    chess_err($check['code'], $check['field'] === null ? [] : ['field' => $check['field']]);
}

$conn = chess_db();

try {
    if (!chess_coach_pref_write($conn, $playerId, $check['pref'])) {
        chess_err('server');
    }
    $row = chess_coach_pref_read($conn, $playerId);
    if ($row === null) {
        // 写成功了又读不到：库在中间出了别的事，不能报"存好了"
        error_log('chess coach pref: written but missing for player ' . $playerId);
        chess_err('server');
    }
    chess_json(['ok' => true, 'pref' => coach_pref_public($row)]);
} catch (Throwable $e) {
    chess_fail($e, 'coach pref save');
}
