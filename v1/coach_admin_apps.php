<?php
/**
 * 教练申请审核（后台）。GET，只认 gbadmin 会话。
 *
 * 这个页面是会被人截图发群的，所以这里返回的每一个字段都只到"够不够格教书"
 * 为止：昵称、邮箱、注册时间、等级、有没有填过偏好。
 * 🔴 password_hash / verify_token_hash / verify_expires 一列都不在这个请求里 ——
 * 连 SQL 都没 SELECT（见 chess_guard.php 的 chess_app_list()），
 * 所以就算这份 JSON 被翻出来也拿不到能登进来的东西。
 *
 * 只认会话、不认接口密钥：那条通道是给青瓷那台 App 用的，它不需要看学员邮箱。
 */
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    gb_json(['error' => '不支持的请求方法', 'message' => '不支持的请求方法'], 405);
}
if (!gb_start_admin_session()) {
    gb_json(['error' => '请先登录管理员账号', 'message' => '请先登录管理员账号'], 401);
}

// 状态过滤：不填就是全部。填了但不在那三个里，直接说清楚，
// 不能悄悄当成"全部"或"待审"回一批 —— 管理员会以为没人申请。
$want = trim((string) ($_GET['status'] ?? ''));
$status = null;
if ($want !== '') {
    if (!in_array($want, COACH_APP_STATUSES, true)) {
        gb_json(['error' => '状态只能是 pending / approved / rejected', 'message' => '状态只能是 pending / approved / rejected'], 400);
    }
    $status = $want;
}

try {
    $rows = chess_app_list($conn, $status, (int) ($_GET['limit'] ?? 100));
    $apps = array_map('coach_app_admin', $rows);
    gb_json([
        'success' => true,
        'apps' => $apps,
        'counts' => chess_app_counts($conn),
    ]);
} catch (Throwable $e) {
    error_log('coach admin apps: ' . $e->getMessage());
    gb_json(['error' => '读取失败，请稍后再试', 'message' => '读取失败，请稍后再试'], 500);
}
