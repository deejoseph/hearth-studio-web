<?php
/**
 * 批准 / 驳回一份教练申请（后台）。POST JSON: {player_id, decision}
 *
 * 这是全项目里唯一一个能把状态写成 approved 的地方 —— 棋盘上那个
 * 【开课堂】按钮、chess_coach_app_save.php、数据库里那句 ON DUPLICATE KEY UPDATE
 * 都只能写 pending。资格位的支点就在这一行。
 *
 * 所以它三道门一个都不能省：只认 POST（gb_require_post）、只认 gbadmin 会话
 * （不认接口密钥）、写的形状由状态机算（coach_app_decide）。
 * 撤销也是同一个入口：approved 再点一次驳回就没了，这是 Eddie 定的"随时可撤"。
 */
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';
require_once __DIR__ . '/chess_guard.php';

gb_require_post();
if (!gb_start_admin_session()) {
    gb_json(['error' => '请先登录管理员账号', 'message' => '请先登录管理员账号'], 401);
}

$body = gb_read_json_body();
$playerId = (int) ($body['player_id'] ?? 0);
// decision 只认 approved / rejected 这两个 key；别的值（包括 'pending'、空串、
// 数字）一律当"没选"，不猜。
$decision = coach_decision($body['decision'] ?? null);

if ($playerId <= 0 || $decision === null) {
    gb_json(['error' => '要点明是哪一份申请，并选批准还是驳回', 'message' => '要点明是哪一份申请，并选批准还是驳回'], 400);
}

$adminId = (int) ($_SESSION['gb_admin_id'] ?? 0);

try {
    $result = chess_app_decide($conn, $playerId, $decision, $adminId);
    if ($result === null) {
        // 这人没交过申请：多半是页面开着没刷新，另一个标签里已经处理完了
        gb_json(['error' => '没找到这一份申请，刷新看看', 'message' => '没找到这一份申请，刷新看看', 'code' => 'no_such_app'], 404);
    }
    if ($result === false) {
        error_log('coach admin decide rejected by state machine: player ' . $playerId . ' -> ' . $decision);
        gb_json(['error' => '这一步不成立，请刷新后再看状态', 'message' => '这一步不成立，请刷新后再看状态', 'code' => 'bad_decision'], 409);
    }
    gb_json(['success' => true, 'player_id' => $playerId, 'status' => $result]);
} catch (Throwable $e) {
    error_log('coach admin decide: ' . $e->getMessage());
    gb_json(['error' => '操作失败，请稍后再试', 'message' => '操作失败，请稍后再试'], 500);
}
