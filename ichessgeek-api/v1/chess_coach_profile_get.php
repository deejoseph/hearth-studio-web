<?php
/**
 * 教练资料 —— 取自己那一份。GET。
 *
 * 只要登录：编辑框里要摆的是当前那一份，先让人看见自己填过什么，
 * 比在门口贴一句"你还不够格"有用。能不能存由 chess_coach_profile_save.php 判。
 *
 * listed 是"名录上有没有你"（管理员 ∪ 申请已批准），界面上那句
 * "填好资料就会出现在推荐教练里"照它说，不照 can_teach 猜 —— 两者今天同源，
 * 哪天规则分开也不会说错话。
 */
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    chess_err('method');
}

$playerId = chess_require_player();
$conn = chess_db();

try {
    $row = chess_profile_row($conn, $playerId);
    $profile = coach_profile_public($row ?? []);
    chess_json([
        'ok' => true,
        'profile' => $profile,
        'filled' => coach_profile_filled($profile),
        'listed' => chess_player_can_teach($conn, $playerId),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'coach profile get');
}
