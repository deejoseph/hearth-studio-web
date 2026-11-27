<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    gb_json(['success' => false, 'ok' => false, 'error' => '不支持的请求方法', 'message' => '不支持的请求方法'], 405);
}
if (!gb_start_admin_session()) {
    gb_json(['success' => false, 'ok' => false, 'error' => '请先登录管理员账号', 'message' => '请先登录管理员账号'], 401);
}

$status = null;
$want = $_GET['status'] ?? '';
if (!is_string($want)) {
    gb_json(['success' => false, 'ok' => false, 'error' => '状态只能是 pending / upheld / rejected',
        'message' => '状态只能是 pending / upheld / rejected'], 400);
}
$want = trim($want);
if ($want !== '') {
    $status = coach_complaint_status($want);
    if ($status === '') {
        gb_json(['success' => false, 'ok' => false, 'error' => '状态只能是 pending / upheld / rejected',
            'message' => '状态只能是 pending / upheld / rejected'], 400);
    }
}
$limit = $_GET['limit'] ?? 100;
if ((!is_int($limit) && !(is_string($limit) && ctype_digit($limit))) || (int) $limit < 1) {
    gb_json(['success' => false, 'ok' => false, 'error' => 'limit 必须是正整数',
        'message' => 'limit 必须是正整数'], 400);
}

try {
    $complaints = chess_coach_complaints_admin($conn, $status, (int) $limit);
    gb_json(['success' => true, 'ok' => true, 'complaints' => $complaints, 'count' => count($complaints)]);
} catch (Throwable $e) {
    error_log('coach admin complaints: ' . $e->getMessage());
    gb_json(['success' => false, 'ok' => false, 'error' => '读取失败，请稍后再试', 'message' => '读取失败，请稍后再试'], 500);
}
