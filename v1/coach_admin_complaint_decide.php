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
$complaintId = coach_positive_id($body['complaint_id'] ?? null);
if ($complaintId === null) {
    gb_json(['success' => false, 'ok' => false, 'code' => 'bad_complaint', 'field' => 'complaint_id',
        'error' => '请选择一条有效的申诉', 'message' => '请选择一条有效的申诉'], 400);
}

try {
    $current = chess_coach_complaint_current($conn, $complaintId);
    if ($current === null) {
        gb_json(['success' => false, 'ok' => false, 'code' => 'no_such_complaint',
            'error' => '没找到这条申诉', 'message' => '没找到这条申诉'], 404);
    }
    $check = coach_complaint_decision_normalize($body, $current);
    if (!$check['ok']) {
        $status = in_array($check['code'], ['server', 'mail_failed'], true) ? 500 : 400;
        gb_json(['success' => false, 'ok' => false, 'code' => $check['code'], 'field' => $check['field'],
            'error' => CHESS_ERRORS[$check['code']][0] ?? '申诉处理内容不对',
            'message' => CHESS_ERRORS[$check['code']][0] ?? '申诉处理内容不对'], $status);
    }
    $result = chess_coach_complaint_decide($conn, $complaintId, $check, (int) $_SESSION['gb_admin_id']);
    if (!$result['ok']) {
        $http = $result['code'] === 'no_such_complaint' ? 404 : ($result['code'] === 'server' ? 500 : 409);
        gb_json(['success' => false, 'ok' => false, 'code' => $result['code'],
            'error' => CHESS_ERRORS[$result['code']][0] ?? '操作失败',
            'message' => CHESS_ERRORS[$result['code']][0] ?? '操作失败'], $http);
    }
    $complaint = $result['complaint'];
    gb_json([
        'success' => true,
        'ok' => true,
        'complaint' => $complaint,
        'status' => $complaint['status'],
        'severity' => $complaint['severity'],
        'public_text' => $complaint['public_text'],
        'decided_at' => $complaint['decided_at'],
        'published_at' => $complaint['published_at'],
        'revoked' => $complaint['revoked'],
    ]);
} catch (Throwable $e) {
    error_log('coach admin complaint decide: ' . $e->getMessage());
    gb_json(['success' => false, 'ok' => false, 'error' => '操作失败，请稍后再试', 'message' => '操作失败，请稍后再试'], 500);
}
