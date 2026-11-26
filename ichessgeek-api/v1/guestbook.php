<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/db_config.php';

$table_sql = "CREATE TABLE IF NOT EXISTS guestbook (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
$conn->query($table_sql);

$replies_table_sql = "CREATE TABLE IF NOT EXISTS guestbook_replies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    author VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_gb_replies_message (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
$conn->query($replies_table_sql);

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $page = max(1, intval($_GET['page'] ?? 1));
    $per_page = min(50, max(1, intval($_GET['per_page'] ?? 20)));
    $offset = ($page - 1) * $per_page;

    $stmt = $conn->prepare("SELECT id, name, content, created_at FROM guestbook ORDER BY created_at DESC LIMIT ? OFFSET ?");
    $bind_types = "ii";
    $stmt->bind_param($bind_types, $per_page, $offset);
    $stmt->execute();
    $result = $stmt->get_result();

    $messages = [];
    while ($row = $result->fetch_assoc()) {
        $messages[] = [
            'id' => $row['id'],
            'name' => $row['name'],
            'content' => $row['content'],
            'timestamp' => $row['created_at'] . '+08:00',
        ];
    }
    $stmt->close();

    if ($messages) {
        // id 全部来自本库整型列，拼 IN 列表无注入风险
        $ids = array_map('intval', array_column($messages, 'id'));
        $replies_map = [];
        $replies_result = $conn->query(
            "SELECT id, message_id, author, content, created_at FROM guestbook_replies
             WHERE message_id IN (" . implode(',', $ids) . ")
             ORDER BY created_at ASC"
        );
        if ($replies_result) {
            while ($reply_row = $replies_result->fetch_assoc()) {
                $replies_map[(int) $reply_row['message_id']][] = [
                    'id' => (int) $reply_row['id'],
                    'author' => $reply_row['author'],
                    'content' => $reply_row['content'],
                    'timestamp' => $reply_row['created_at'] . '+08:00',
                ];
            }
        }
        foreach ($messages as $i => $message) {
            $messages[$i]['replies'] = $replies_map[(int) $message['id']] ?? [];
        }
    }

    $count_result = $conn->query("SELECT COUNT(*) as total FROM guestbook");
    $total = (int) $count_result->fetch_assoc()['total'];

    echo json_encode([
        'messages' => $messages,
        'total' => $total,
        'page' => $page,
        'per_page' => $per_page,
    ], JSON_UNESCAPED_UNICODE);

} elseif ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    $name = trim($input['name'] ?? '');
    $content = trim($input['content'] ?? '');

    if ($name === '' || $content === '') {
        http_response_code(400);
        echo json_encode(['error' => '昵称和留言不能为空'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (mb_strlen($name) > 100) {
        http_response_code(400);
        echo json_encode(['error' => '昵称不能超过100个字符'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (mb_strlen($content) > 2000) {
        http_response_code(400);
        echo json_encode(['error' => '留言不能超过2000个字符'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $conn->prepare("INSERT INTO guestbook (name, content) VALUES (?, ?)");
    $stmt->bind_param("ss", $name, $content);

    if ($stmt->execute()) {
        $id = $conn->insert_id;
        $stmt->close();

        echo json_encode([
            'success' => true,
            'id' => $id,
            'message' => '留言已提交',
        ], JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(500);
        echo json_encode(['error' => '提交失败，请稍后重试'], JSON_UNESCAPED_UNICODE);
    }

} else {
    http_response_code(405);
    echo json_encode(['error' => '不支持的请求方法'], JSON_UNESCAPED_UNICODE);
}

$conn->close();
?>
