<?php
/**
 * 教练主页 —— 公开页里那一个人。GET ?c=<player_id>，不要登录。
 *
 * 查无此人和"有这个人但没批准"回的是同一句 404：公开页面不该告诉路人
 * 谁交过申请、审到哪一步 —— 那是管理员屏幕上的事。
 *
 * 形状和名录那一行完全一致（同一个 coach_directory_entry()），
 * 所以界面点开一张卡只要换一次请求，不用两套读法。
 */
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    chess_err('method');
}

$coachId = coach_positive_id($_GET['c'] ?? null);
$conn = chess_db();

try {
    $coach = $coachId === null ? null : chess_coach_one($conn, $coachId);
    if ($coach === null) {
        chess_err('no_such_coach');
    }
    $coach['complaints'] = chess_coach_complaints_public($conn, $coachId);
    chess_json(['ok' => true, 'coach' => $coach]);
} catch (Throwable $e) {
    chess_fail($e, 'coach profile read');
}
