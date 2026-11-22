<?php
// 删除一条官方回复：只认管理员会话。写回复的逆操作，用来撤回打错字或不合适的回复。
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';

gb_require_post();

if (!gb_start_admin_session()) {
    gb_json(['error' => '请先登录管理员账号'], 401);
}

$input = gb_read_json_body();
$reply_id = (int) ($input['reply_id'] ?? 0);

if ($reply_id <= 0) {
    gb_json(['error' => '缺少 reply_id'], 400);
}

$stmt = $conn->prepare("DELETE FROM guestbook_replies WHERE id = ?");
$stmt->bind_param("i", $reply_id);
$stmt->execute();
$affected = $stmt->affected_rows;
$stmt->close();

if ($affected < 1) {
    gb_json(['error' => '回复不存在或已被删除'], 404);
}

gb_json(['success' => true, 'deleted_id' => $reply_id]);
