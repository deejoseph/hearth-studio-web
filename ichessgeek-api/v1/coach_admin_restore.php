<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';
require_once __DIR__ . '/chess_guard.php';

gb_require_post();
if (!gb_start_admin_session()) {
    gb_json(['success' => false, 'ok' => false, 'error' => '请先登录管理员账号', 'message' => '请先登录管理员账号'], 401);
}
if (stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') === false) {
    gb_json(['success' => false, 'ok' => false, 'error' => '请提交 JSON', 'message' => '请提交 JSON'], 415);
}

$body = gb_read_json_body();
$coachId = coach_positive_id($body['coach_id'] ?? null);
if ($coachId === null) {
    gb_json(['success' => false, 'ok' => false, 'code' => 'bad_coach_id', 'field' => 'coach_id',
        'error' => '请选择一位有效的教练', 'message' => '请选择一位有效的教练'], 400);
}
$check = coach_restore_reason_normalize($body['reason'] ?? null);
if (!$check['ok']) {
    gb_json(['success' => false, 'ok' => false, 'code' => 'bad_restore_reason', 'field' => 'reason',
        'error' => CHESS_ERRORS['bad_restore_reason'][0], 'message' => CHESS_ERRORS['bad_restore_reason'][0]], 400);
}

try {
    $result = chess_coach_standing_restore($conn, $coachId, $check['reason'], (int) $_SESSION['gb_admin_id']);
    if (!$result['ok']) {
        $http = $result['code'] === 'no_such_standing' ? 404 : ($result['code'] === 'server' ? 500 : 409);
        gb_json(['success' => false, 'ok' => false, 'code' => $result['code'],
            'error' => CHESS_ERRORS[$result['code']][0] ?? '操作失败',
            'message' => CHESS_ERRORS[$result['code']][0] ?? '操作失败'], $http);
    }
    gb_json(['success' => true, 'ok' => true, 'standing' => $result['standing'], 'restored' => true]);
} catch (Throwable $e) {
    error_log('coach admin restore: ' . $e->getMessage());
    gb_json(['success' => false, 'ok' => false, 'error' => '操作失败，请稍后再试', 'message' => '操作失败，请稍后再试'], 500);
}
