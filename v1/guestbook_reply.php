<?php
// 留言板官方回复：仅管理员会话可写，不开放跨域
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db_config.php';
require_once __DIR__ . '/admin_guard.php';

gb_require_post();

// 写回复只认浏览器会话（不认接口密钥）：SameSite=Lax + 不设 CORS 头，第三方站点既拿不到 Cookie 也读不到响应
if (!gb_start_admin_session()) {
    gb_json(['error' => '请先登录管理员账号'], 401);
}

$input = gb_read_json_body();
$message_id = intval(is_array($input) ? ($input['message_id'] ?? 0) : 0);
$content = trim(is_array($input) ? ($input['content'] ?? '') : '');

if ($message_id <= 0 || $content === '') {
    http_response_code(400);
    echo json_encode(['error' => '留言编号和回复内容不能为空'], JSON_UNESCAPED_UNICODE);
    exit;
}

if (mb_strlen($content) > 2000) {
    http_response_code(400);
    echo json_encode(['error' => '回复不能超过2000个字符'], JSON_UNESCAPED_UNICODE);
    exit;
}

$check = $conn->prepare("SELECT id FROM guestbook WHERE id = ?");
$check->bind_param("i", $message_id);
$check->execute();
$exists = $check->get_result()->fetch_assoc();
$check->close();

if (!$exists) {
    http_response_code(404);
    echo json_encode(['error' => '留言不存在'], JSON_UNESCAPED_UNICODE);
    exit;
}

$conn->query("CREATE TABLE IF NOT EXISTS guestbook_replies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    author VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gb_replies_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

$author = $_SESSION['gb_admin_name'] ?? 'Eddie';

$stmt = $conn->prepare("INSERT INTO guestbook_replies (message_id, author, content) VALUES (?, ?, ?)");
$stmt->bind_param("iss", $message_id, $author, $content);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['error' => '回复失败，请稍后重试'], JSON_UNESCAPED_UNICODE);
    exit;
}

$reply_id = (int) $conn->insert_id;
$stmt->close();

$created_at = date('Y-m-d H:i:s');
$row = $conn->query("SELECT created_at FROM guestbook_replies WHERE id = $reply_id");
if ($row && $fetched = $row->fetch_assoc()) {
    $created_at = $fetched['created_at'];
}

echo json_encode([
    'success' => true,
    'reply' => [
        'id' => $reply_id,
        'author' => $author,
        'content' => $content,
        'timestamp' => $created_at . '+08:00',
    ],
], JSON_UNESCAPED_UNICODE);

$conn->close();
