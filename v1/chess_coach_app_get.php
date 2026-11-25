<?php
/**
 * 申请成为教练 —— 取自己那一份。GET。
 *
 * 只要登录、不要邮箱验证：还没验证的人想看的是"我交过没有、审到哪一步了"，
 * 让他读到自己是 pending 还是根本没交，比点了提交才吃一句 403 好。
 * 验证那道门禁在 chess_coach_app_save.php。
 *
 * 没交过返回 app:null（"还没交"是常态，不是错误），但 can_teach 照给 ——
 * 界面上那个【开课堂】按钮看的是资格，不是"有没有交过申请"。
 * 回的形状和 save 端点完全一致，所以界面只有一条读路径。
 */
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    chess_err('method');
}

$playerId = chess_require_player();
$conn = chess_db();

try {
    $row = chess_app_read($conn, $playerId);
    // 管理员（邮箱在 admin_users）不用申请就是教练；admin 这个标记单独带出去，
    // 是因为界面上"管理员"和"批准过的教练"要说两句不同的话。
    $admin = chess_player_is_admin($conn, $playerId);
    chess_json([
        'ok' => true,
        'app' => $row === null ? null : coach_app_public($row),
        'admin' => $admin,
        'can_teach' => $admin || coach_can_teach($row['status'] ?? null),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'coach app get');
}
