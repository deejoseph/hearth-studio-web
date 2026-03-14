<?php
require_once(__DIR__ . "/admin_auth.php");
require_once(__DIR__ . "/config/db.php");

function compressImage($source, $destination, $quality) {

    $info = getimagesize($source);

    if ($info['mime'] == 'image/jpeg') {
        $image = imagecreatefromjpeg($source);
        imagejpeg($image, $destination, $quality);
    }
    elseif ($info['mime'] == 'image/png') {
        $image = imagecreatefrompng($source);
        imagepng($image, $destination, 8);
    }
}

function compressTo200KB($source, $destination) {

    $info = getimagesize($source);
    if (!$info) return false;

    $mime = $info['mime'];

    if ($mime == 'image/jpeg') {
        $image = imagecreatefromjpeg($source);
    } elseif ($mime == 'image/png') {
        $image = imagecreatefrompng($source);
    } else {
        return false;
    }

    $width = imagesx($image);
    $height = imagesy($image);

    // 最大宽度限制
    $maxWidth = 1600;
    if ($width > $maxWidth) {
        $newHeight = intval($height * ($maxWidth / $width));
        $resized = imagecreatetruecolor($maxWidth, $newHeight);
        imagecopyresampled($resized, $image, 0, 0, 0, 0, $maxWidth, $newHeight, $width, $height);
        $image = $resized;
    }

    $quality = 85;

    do {
        imagejpeg($image, $destination, $quality);
        $filesize = filesize($destination);
        $quality -= 5;
    } while ($filesize > 200000 && $quality > 30);

    imagedestroy($image);

    return true;
}

function createThumbnail($source, $destination, $newWidth) {

    list($width, $height) = getimagesize($source);

    $ratio = $height / $width;
    $newHeight = $newWidth * $ratio;

    $thumb = imagecreatetruecolor($newWidth, $newHeight);

    $info = getimagesize($source);

    if ($info['mime'] == 'image/jpeg') {
        $sourceImage = imagecreatefromjpeg($source);
    } elseif ($info['mime'] == 'image/png') {
        $sourceImage = imagecreatefrompng($source);
    } else {
        return;
    }

    imagecopyresampled(
        $thumb,
        $sourceImage,
        0, 0, 0, 0,
        $newWidth, $newHeight,
        $width, $height
    );

    imagejpeg($thumb, $destination, 85);
}

function buildFullUrl($path) {
    if (!$path) return '';
    if (strpos($path, 'http') === 0) return $path;
    if (strpos($path, '/HearthStudio') === 0) {
        return "https://www.ichessgeek.com" . $path;
    }
    return "https://www.ichessgeek.com/HearthStudio" . $path;
}

function getOrderLastChange($conn, $orderId) {
    $stmt = $conn->prepare("
        SELECT GREATEST(
            IFNULL((SELECT MAX(customer_message_at) FROM order_progress_messages WHERE order_id = ?), '1970-01-01 00:00:00'),
            IFNULL((SELECT MAX(studio_reply_at) FROM order_progress_messages WHERE order_id = ?), '1970-01-01 00:00:00'),
            IFNULL((SELECT MAX(created_at) FROM order_progress_messages WHERE order_id = ?), '1970-01-01 00:00:00'),
            IFNULL((SELECT MAX(created_at) FROM order_progress_images WHERE order_id = ?), '1970-01-01 00:00:00'),
            IFNULL((SELECT MAX(created_at) FROM order_status_logs WHERE order_id = ?), '1970-01-01 00:00:00')
        ) AS last_change
    ");
    $stmt->bind_param("iiiii", $orderId, $orderId, $orderId, $orderId, $orderId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    return $row ? $row['last_change'] : '';
}

if ($_SESSION['admin_role'] !== 'super_admin') {
    header("Location: studio_dashboard.php");
    exit;
}

$base_url = "https://www.ichessgeek.com/HearthStudio";
$order_id = intval($_GET['order_id'] ?? 0);
$message = "";
$ai_message = "";
$reply_draft = "";
$ai_provider = $_SESSION['ai_provider'] ?? 'qwen';
$admin_id = intval($_SESSION['admin_id'] ?? 0);
$ai_secret = '';
$ai_secret_path = __DIR__ . "/config/ai_secret.php";
if (file_exists($ai_secret_path)) {
    $ai_secret = trim((string) require $ai_secret_path);
}

if (isset($_GET['poll']) && $_GET['poll'] === '1') {
    header("Content-Type: application/json");
    $poll_order_id = intval($_GET['order_id'] ?? 0);
    if (!$poll_order_id) {
        echo json_encode(['success' => false, 'message' => 'Order ID missing']);
        exit;
    }
    echo json_encode([
        'success' => true,
        'last_change' => getOrderLastChange($conn, $poll_order_id)
    ]);
    exit;
}
$ai_settings = [
    'qwen_api_key' => '',
    'gemini_api_key' => '',
    'zhipu_api_key' => '',
    'ai_api_endpoint_qwen' => '',
    'ai_api_endpoint_gemini' => '',
    'ai_api_endpoint_zhipu' => '',
    'zhipu_model' => '',
    'qwen_model' => ''
];

function maskSecret($value) {
    if (!$value) return '';
    $len = strlen($value);
    if ($len <= 6) return str_repeat('*', $len);
    return substr($value, 0, 3) . str_repeat('*', $len - 6) . substr($value, -3);
}

function aiEncrypt($plaintext, $secret) {
    if ($plaintext === '' || $secret === '') return '';
    $iv = random_bytes(16);
    $cipher = openssl_encrypt($plaintext, 'AES-256-CBC', $secret, OPENSSL_RAW_DATA, $iv);
    if ($cipher === false) return '';
    return base64_encode($iv) . ':' . base64_encode($cipher);
}

function aiDecrypt($ciphertext, $secret) {
    if ($ciphertext === '' || $secret === '') return '';
    $parts = explode(':', $ciphertext, 2);
    if (count($parts) !== 2) return '';
    $iv = base64_decode($parts[0], true);
    $cipher = base64_decode($parts[1], true);
    if ($iv === false || $cipher === false) return '';
    $plain = openssl_decrypt($cipher, 'AES-256-CBC', $secret, OPENSSL_RAW_DATA, $iv);
    return $plain === false ? '' : $plain;
}

if ($admin_id > 0) {
    $stmt = $conn->prepare("
        SELECT qwen_api_key, gemini_api_key, zhipu_api_key,
               ai_api_endpoint_qwen, ai_api_endpoint_gemini, ai_api_endpoint_zhipu,
               zhipu_model, qwen_model
        FROM admin_users
        WHERE id = ?
        LIMIT 1
    ");
    $stmt->bind_param("i", $admin_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    if ($row) {
        $ai_settings = array_merge($ai_settings, $row);
    }
}

function callAiPolish($provider, $text, $lang, $settings) {

    $provider = strtolower($provider);
    $lang = strtolower($lang) === 'en' ? 'en' : 'zh';

    $system_prompt_zh = "你是面向美国客户的陶艺工作室客服。请将内容润色为专业、礼貌、清晰且简洁的回复，直接回应客户问题，避免推销和长篇大论。必要时可简短提到“参与式定制，让作品承载客户想法与记忆”。不要编造未确认信息。";
    $system_prompt_en = "You are a ceramic studio customer support agent serving U.S. clients. Rewrite the message in English to be professional, polite, clear, and concise. Answer the customer’s question directly and avoid salesy language or long paragraphs. If relevant, briefly mention that this is a participatory custom process that preserves the client’s ideas and memories. Do not add unverified details.";

    if ($provider === 'qwen') {
        $api_key = $settings['qwen_api_key'] ?? '';
        $endpoint = $settings['ai_api_endpoint_qwen'] ?? '';
        if (!$api_key || !$endpoint) {
            return ['ok' => false, 'error' => 'Qwen API 未配置（需要 URL 与 Key）'];
        }

        $model = $settings['qwen_model'] ?? '';
        if (!$model) $model = 'qwen-plus';
        if (substr($endpoint, -strlen('/chat/completions')) !== '/chat/completions') {
            $endpoint = rtrim($endpoint, '/') . '/chat/completions';
        }

        $payload = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $lang === 'en' ? $system_prompt_en : $system_prompt_zh],
                ['role' => 'user', 'content' => $lang === 'en'
                    ? "Please polish the following message and reply in English:\n" . $text
                    : $text]
            ],
            'temperature' => 0.6
        ];

        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $api_key
        ];

    } elseif ($provider === 'gemini') {
        $api_key = $settings['gemini_api_key'] ?? '';
        $endpoint = $settings['ai_api_endpoint_gemini'] ?? '';
        if (!$api_key || !$endpoint) {
            return ['ok' => false, 'error' => 'Gemini API 未配置（需要 URL 与 Key）'];
        }

        $payload = [
            'text' => $text,
            'lang' => $lang,
            'task' => 'polish'
        ];

        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $api_key
        ];

    } elseif ($provider === 'zhipu') {
        $api_key = $settings['zhipu_api_key'] ?? '';
        $endpoint = $settings['ai_api_endpoint_zhipu'] ?? '';
        if (!$api_key || !$endpoint) {
            return ['ok' => false, 'error' => '智谱 API 未配置（需要 URL 与 Key）'];
        }

        $user_text = $text;
        if ($lang === 'en') {
            $user_text = "Please polish the following message and reply in English:\n" . $text;
        }

        $model = $settings['zhipu_model'] ?? '';
        if (!$model) $model = 'glm-4';

        $payload = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $lang === 'en' ? $system_prompt_en : $system_prompt_zh],
                ['role' => 'user', 'content' => $user_text]
            ],
            'temperature' => 0.6
        ];

        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $api_key
        ];

    } else {
        return ['ok' => false, 'error' => '未知 AI 服务提供方'];
    }

    $ch = curl_init($endpoint);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload, JSON_UNESCAPED_UNICODE));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 20);

    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($err) {
        return ['ok' => false, 'error' => 'AI 请求失败: ' . $err];
    }

    if ($status < 200 || $status >= 300) {
        return ['ok' => false, 'error' => 'AI 请求失败，HTTP ' . $status];
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        return ['ok' => false, 'error' => 'AI 返回格式错误'];
    }

    $text_out = $data['text'] ?? $data['output'] ?? $data['result'] ?? '';
    if (!$text_out && isset($data['choices'][0]['message']['content'])) {
        $text_out = $data['choices'][0]['message']['content'];
    }
    if (!$text_out) {
        return ['ok' => false, 'error' => 'AI 返回内容为空'];
    }

    return ['ok' => true, 'text' => $text_out];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['set_ai_provider'])) {
    $incoming_provider = $_POST['ai_provider'] ?? 'qwen';
    $incoming_provider = in_array($incoming_provider, ['qwen', 'gemini', 'zhipu'], true) ? $incoming_provider : 'qwen';
    $_SESSION['ai_provider'] = $incoming_provider;
    $ai_provider = $incoming_provider;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['set_ai_settings'])) {
    if (!$ai_secret) {
        $ai_message = "AI_SECRET_KEY 未配置，无法保存 API 密钥。";
    } else {
        $provider = $_POST['ai_provider'] ?? ($_SESSION['ai_provider'] ?? $ai_provider);
        $provider = in_array($provider, ['qwen', 'gemini', 'zhipu'], true) ? $provider : 'qwen';
        $new_api_key = trim($_POST['ai_api_key'] ?? '');
        $new_api_url = trim($_POST['ai_api_endpoint'] ?? '');
        $new_model = trim($_POST['ai_model'] ?? '');

        $update_fields = [];
        $params = [];
        $types = '';

        if ($provider === 'gemini') {
            $key_column = 'gemini_api_key';
            $url_column = 'ai_api_endpoint_gemini';
        } elseif ($provider === 'zhipu') {
            $key_column = 'zhipu_api_key';
            $url_column = 'ai_api_endpoint_zhipu';
        } else {
            $key_column = 'qwen_api_key';
            $url_column = 'ai_api_endpoint_qwen';
        }

        if ($new_api_key !== '') {
            $update_fields[] = $key_column . " = ?";
            $params[] = aiEncrypt($new_api_key, $ai_secret);
            $types .= 's';
        }
        if ($new_api_url !== '') {
            $update_fields[] = $url_column . " = ?";
            $params[] = $new_api_url;
            $types .= 's';
        }
        if ($new_model !== '') {
            if ($provider === 'zhipu') {
                $update_fields[] = "zhipu_model = ?";
                $params[] = $new_model;
                $types .= 's';
            }
            if ($provider === 'qwen') {
                $update_fields[] = "qwen_model = ?";
                $params[] = $new_model;
                $types .= 's';
            }
        }

        if (!empty($update_fields) && $admin_id > 0) {
            $sql = "UPDATE admin_users SET " . implode(", ", $update_fields) . " WHERE id = ?";
            $stmt = $conn->prepare($sql);
            $types .= 'i';
            $params[] = $admin_id;
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $ai_message = "AI 配置已保存。";

            $stmt = $conn->prepare("
                SELECT qwen_api_key, gemini_api_key, zhipu_api_key,
                       ai_api_endpoint_qwen, ai_api_endpoint_gemini, ai_api_endpoint_zhipu,
                       zhipu_model, qwen_model
                FROM admin_users
                WHERE id = ?
                LIMIT 1
            ");
            $stmt->bind_param("i", $admin_id);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            if ($row) {
                $ai_settings = array_merge($ai_settings, $row);
            }
        }
    }
}

/* =====================================================
   1️⃣ 推进阶段
===================================================== */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['move_stage'])) {

    $move_order_id = intval($_POST['order_id']);
    $conn->begin_transaction();

    try {

        $stmt = $conn->prepare("SELECT status_id FROM orders WHERE id = ? FOR UPDATE");
        $stmt->bind_param("i", $move_order_id);
        $stmt->execute();
        $orderRow = $stmt->get_result()->fetch_assoc();

        if (!$orderRow) throw new Exception("Order not found");

        $current_status_id = intval($orderRow['status_id']);

        $stmt = $conn->prepare("SELECT sort_order, label FROM order_status WHERE id = ?");
        $stmt->bind_param("i", $current_status_id);
        $stmt->execute();
        $current_status = $stmt->get_result()->fetch_assoc();

        if (!$current_status) throw new Exception("Current status missing");

        $stmt = $conn->prepare("
            SELECT id, label 
            FROM order_status 
            WHERE sort_order > ?
            ORDER BY sort_order ASC
            LIMIT 1
        ");
        $stmt->bind_param("i", $current_status['sort_order']);
        $stmt->execute();
        $next_status = $stmt->get_result()->fetch_assoc();

        if (!$next_status) throw new Exception("Already final stage");

        $next_status_id = intval($next_status['id']);

        $stmt = $conn->prepare("UPDATE orders SET status_id = ? WHERE id = ?");
        $stmt->bind_param("ii", $next_status_id, $move_order_id);
        $stmt->execute();

        $note = "Moved from {$current_status['label']} to {$next_status['label']}";
        $changed_by = $_SESSION['admin_username'];

        $stmt = $conn->prepare("
            INSERT INTO order_status_logs
            (order_id, from_status_id, to_status_id, changed_by, note, created_at)
            VALUES (?, ?, ?, ?, ?, NOW())
        ");
        $stmt->bind_param("iiiss",
            $move_order_id,
            $current_status_id,
            $next_status_id,
            $changed_by,
            $note
        );
        $stmt->execute();

        $conn->commit();
        header("Location: admin_order.php?order_id=" . $move_order_id);
        exit;

    } catch (Exception $e) {
        $conn->rollback();
        $message = $e->getMessage();
    }
}

/* =====================================================
   2️⃣ 回复客户消息
===================================================== */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['polish_lang'])) {

    $reply_draft = trim($_POST['studio_reply'] ?? '');
    $lang = $_POST['polish_lang'] ?? 'zh';
    $ai_provider = $_SESSION['ai_provider'] ?? $ai_provider;
    $ai_settings['qwen_api_key'] = aiDecrypt($ai_settings['qwen_api_key'] ?? '', $ai_secret);
    $ai_settings['gemini_api_key'] = aiDecrypt($ai_settings['gemini_api_key'] ?? '', $ai_secret);
    $ai_settings['zhipu_api_key'] = aiDecrypt($ai_settings['zhipu_api_key'] ?? '', $ai_secret);

    if (!$reply_draft) {
        $ai_message = "请先输入需要润色的基础信息。";
    } else {
        $ai_result = callAiPolish($ai_provider, $reply_draft, $lang, $ai_settings);
        if ($ai_result['ok']) {
            $reply_draft = $ai_result['text'];
        } else {
            $ai_message = $ai_result['error'];
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['send_reply'])) {

    $reply_order_id = intval($_POST['order_id']);
    $reply = trim($_POST['studio_reply']);

    if ($reply) {

        // 当前状态
        $stmt = $conn->prepare("SELECT status_id FROM orders WHERE id = ?");
        $stmt->bind_param("i", $reply_order_id);
        $stmt->execute();
        $orderRow = $stmt->get_result()->fetch_assoc();
        $status_id = $orderRow ? intval($orderRow['status_id']) : null;

        // 查是否有未关闭的客户消息
        $stmt = $conn->prepare("
            SELECT id 
            FROM order_progress_messages
            WHERE order_id = ?
            AND is_closed = 0
            ORDER BY created_at DESC
            LIMIT 1
        ");
        $stmt->bind_param("i", $reply_order_id);
        $stmt->execute();
        $openRow = $stmt->get_result()->fetch_assoc();

        if ($openRow) {

            // 更新这条记录
            $stmt = $conn->prepare("
                UPDATE order_progress_messages
                SET studio_reply = ?,
                    studio_reply_at = NOW(),
                    status_id = ?,
                    is_closed = 1
                WHERE id = ?
            ");
            $stmt->bind_param("sii", $reply, $status_id, $openRow['id']);
            $stmt->execute();

        } else {

            // 没有未关闭记录 → 新建一条
            $stmt = $conn->prepare("
                INSERT INTO order_progress_messages
                (order_id, studio_reply, studio_reply_at, status_id, is_closed, created_at)
                VALUES (?, ?, NOW(), ?, 1, NOW())
            ");
            $stmt->bind_param("isi", $reply_order_id, $reply, $status_id);
            $stmt->execute();
        }
    }

    header("Location: admin_order.php?order_id=" . $reply_order_id);
    exit;
}
/* =====================================================
   3️⃣ 发送进度图片
===================================================== */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['upload_image'])) {

    $upload_order_id = intval($_POST['order_id']);

    if (!empty($_FILES['studio_image']['name'])) {

        // 获取订单信息
        $stmt = $conn->prepare("SELECT order_number, status_id FROM orders WHERE id = ?");
        $stmt->bind_param("i", $upload_order_id);
        $stmt->execute();
        $orderRow = $stmt->get_result()->fetch_assoc();

        if (!$orderRow) die("Order not found");

        $order_number = $orderRow['order_number'];
        $status_id = intval($orderRow['status_id']);
        $year = date("Y");

        // 目录
        $upload_dir = $_SERVER['DOCUMENT_ROOT'] . "/HearthStudio/Customize/{$year}/{$order_number}/";

        if (!is_dir($upload_dir)) {
            mkdir($upload_dir, 0755, true);
        }

        $original_name = basename($_FILES['studio_image']['name']);
        $filename = time() . "_" . $original_name;
        $target_path = $upload_dir . $filename;

        // 压缩并保存
        if (compressTo200KB($_FILES['studio_image']['tmp_name'], $target_path)) {

            $db_path = "/HearthStudio/Customize/{$year}/{$order_number}/" . $filename;

            $stmt = $conn->prepare("
                INSERT INTO order_progress_images
                (order_id, studio_image, status_id, created_at)
                VALUES (?, ?, ?, NOW())
            ");
            $stmt->bind_param("isi", $upload_order_id, $db_path, $status_id);
            $stmt->execute();
        }
    }

    header("Location: admin_order.php?order_id=" . $upload_order_id);
    exit;
}

/* =====================================================
   4️⃣ 获取订单信息
===================================================== */
$order = null;
$messages = null;
$images = null;
$next_status = null;
$pattern_image_url = null;
$customer_reference_image = null;

if ($order_id) {

    $stmt = $conn->prepare("
        SELECT o.*, s.label, s.sort_order
        FROM orders o
        JOIN order_status s ON o.status_id = s.id
        WHERE o.id = ?
    ");
    $stmt->bind_param("i", $order_id);
    $stmt->execute();
    $order = $stmt->get_result()->fetch_assoc();

    if ($order) {
        if (!empty($order['pattern_id'])) {
            $stmt = $conn->prepare("
                SELECT image_url
                FROM patterns
                WHERE id = ?
                LIMIT 1
            ");
            $stmt->bind_param("i", $order['pattern_id']);
            $stmt->execute();
            $patternRow = $stmt->get_result()->fetch_assoc();
            $pattern_image_url = $patternRow ? $patternRow['image_url'] : null;
        }

        $customer_reference_image = $order['customer_reference_image'] ?? null;


        $stmt = $conn->prepare("
            SELECT id, label
            FROM order_status
            WHERE sort_order > ?
            ORDER BY sort_order ASC
            LIMIT 1
        ");
        $stmt->bind_param("i", $order['sort_order']);
        $stmt->execute();
        $next_status = $stmt->get_result()->fetch_assoc();

        $messages = $conn->query("
            SELECT *
            FROM order_progress_messages
            WHERE order_id = {$order_id}
            ORDER BY created_at ASC
        ");

        $images = $conn->query("
            SELECT *
            FROM order_progress_images
            WHERE order_id = {$order_id}
            ORDER BY created_at ASC
        ");
    }
}

$last_change = $order ? getOrderLastChange($conn, $order_id) : '';

require_once(__DIR__ . "/admin_layout.php");
?>

<h1>Super Admin – Order Management</h1>

<style>
.messages-panel {
    max-height: 320px;
    overflow-y: auto;
    background: #fafbff;
    border: 1px solid #e6e9f2;
    border-radius: 10px;
    padding: 12px;
}
.message {
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 10px;
    border: 1px solid #eef0f6;
    background: #ffffff;
}
.message.customer {
    background: #f5f7ff;
    border-color: #dfe5ff;
}
.message.studio {
    background: #f2fbf6;
    border-color: #d3f0df;
}
.badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
}
.badge.green {
    background: #e7f7ee;
    color: #1f7a4d;
    border: 1px solid #ccead9;
}
.badge.red {
    background: #fdeaea;
    color: #b42318;
    border: 1px solid #f6c9c9;
}
.preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin: 12px 0;
}
.preview-card {
    background: #f8f9fd;
    border: 1px solid #e6e9f2;
    border-radius: 10px;
    padding: 10px;
    text-align: center;
    min-height: 260px;
}
.preview-card img {
    width: 100%;
    max-width: 240px;
    height: 180px;
    object-fit: contain;
    background: #fff;
    border-radius: 8px;
    cursor: pointer;
    margin: 0 auto;
}
.preview-empty {
    height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #777;
    border: 1px dashed #d7dbe7;
    border-radius: 8px;
    background: #fff;
    max-width: 240px;
    margin: 0 auto;
}
.carousel {
    position: relative;
    padding: 0 24px;
    overflow: hidden;
}
.carousel-viewport {
    overflow: hidden;
    width: 100%;
    max-width: 780px;
    margin: 0 auto;
}
.carousel-track {
    display: flex;
    gap: 12px;
    padding-bottom: 6px;
    width: max-content;
    transition: transform 0.35s ease;
}
.carousel-track::-webkit-scrollbar {
    height: 8px;
}
.carousel-track::-webkit-scrollbar-thumb {
    background: #cbd3e1;
    border-radius: 999px;
}
.carousel-item {
    flex: 0 0 auto;
    width: 240px;
}
.carousel-item img {
    width: 100%;
    height: 170px;
    object-fit: cover;
    border-radius: 8px;
    cursor: pointer;
    display: block;
}
.carousel-btn {
    position: absolute;
    top: 40%;
    transform: translateY(-50%);
    background: #4e73df;
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    cursor: pointer;
    z-index: 2;
}
.carousel-btn.prev {
    left: 0;
}
.carousel-btn.next {
    right: 0;
}
.reply-section {
    margin-top: 16px;
}
.reply-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}
.ai-settings {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #f7f8fb;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid #e6e9f2;
}
.ai-settings select {
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid #d7dbe7;
}
.reply-form textarea {
    width: 100%;
    min-height: 140px;
    resize: vertical;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid #d7dbe7;
}
.reply-form input[type="text"] {
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid #d7dbe7;
    min-width: 240px;
    flex: 1;
}
.reply-actions {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}
.btn-ghost {
    background: #eef1fb;
    color: #334;
}
.ai-message {
    margin: 10px 0;
    color: #d35400;
}
.refresh-banner {
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid #ffe6a7;
    background: #fff8e1;
    color: #6b4e00;
    border-radius: 8px;
    margin: 10px 0;
}
.refresh-banner button {
    background: #4e73df;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
}
.upload-form {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
}
</style>

<div class="card">

<h2>Search Order</h2>
<form method="GET">
    <input type="number" name="order_id" placeholder="Enter Order ID" required>
    <button type="submit">Load</button>
</form>

<?php if ($order): ?>

<hr>
<h2>Order #<?php echo $order['order_number']; ?></h2>
<p><strong>Status:</strong> <?php echo $order['label']; ?></p>
<p><strong>Deposit Paid:</strong>
    <?php if (intval($order['deposit_paid']) === 1): ?>
        <span class="badge green">Paid</span>
    <?php else: ?>
        <span class="badge red">Unpaid</span>
    <?php endif; ?>
</p>
<p><strong>Balance Paid:</strong>
    <?php if (intval($order['balance_paid']) === 1): ?>
        <span class="badge green">Paid</span>
    <?php else: ?>
        <span class="badge red">Unpaid</span>
    <?php endif; ?>
</p>

<div class="preview-grid">
    <div class="preview-card">
        <h4>Final Product</h4>
        <?php $cover = buildFullUrl($order['cover_image_url'] ?? ''); ?>
        <?php if ($cover): ?>
            <a href="<?php echo htmlspecialchars($cover); ?>" target="_blank">
                <img src="<?php echo htmlspecialchars($cover); ?>" alt="Product">
            </a>
        <?php else: ?>
            <div class="preview-empty">No image</div>
        <?php endif; ?>
    </div>
    <div class="preview-card">
        <h4>Present Pattern</h4>
        <?php $pattern = buildFullUrl($pattern_image_url ?? ''); ?>
        <?php if ($pattern): ?>
            <a href="<?php echo htmlspecialchars($pattern); ?>" target="_blank">
                <img src="<?php echo htmlspecialchars($pattern); ?>" alt="Pattern">
            </a>
        <?php else: ?>
            <div class="preview-empty">No pattern selected</div>
        <?php endif; ?>
    </div>
    <div class="preview-card">
        <h4>Customer Upload</h4>
        <?php $customer_ref = buildFullUrl($customer_reference_image ?? ''); ?>
        <?php if ($customer_ref): ?>
            <a href="<?php echo htmlspecialchars($customer_ref); ?>" target="_blank">
                <img src="<?php echo htmlspecialchars($customer_ref); ?>" alt="Reference">
            </a>
        <?php else: ?>
            <div class="preview-empty">No reference image</div>
        <?php endif; ?>
    </div>
</div>

<?php if ($next_status): ?>
<form method="POST">
    <input type="hidden" name="order_id" value="<?php echo $order_id; ?>">
    <button name="move_stage">Move to Next Stage</button>
</form>
<?php endif; ?>

<hr>
<h3>Messages</h3>

<div id="admin-refresh-banner" class="refresh-banner">
    <span>有新的消息或更新，建议刷新。</span>
    <button type="button" id="admin-refresh-btn">刷新</button>
</div>

<div class="messages-panel">
<?php if ($messages && $messages->num_rows > 0): ?>
<?php while ($row = $messages->fetch_assoc()): ?>

    <?php if ($row['customer_message']): ?>
        <div class="message customer">
            <strong>Customer:</strong>
            <?php echo htmlspecialchars($row['customer_message']); ?>
        </div>
    <?php endif; ?>

    <?php if ($row['studio_reply']): ?>
        <div class="message studio">
            <strong>Studio:</strong>
            <?php echo htmlspecialchars($row['studio_reply']); ?>
        </div>
    <?php endif; ?>

<?php endwhile; ?>
<?php else: ?>
    <div class="message">No messages yet.</div>
<?php endif; ?>
</div>

<div class="reply-section">
    <div class="reply-header">
        <h3>Reply</h3>
        <form method="POST" class="ai-settings">
            <input type="hidden" name="order_id" value="<?php echo $order_id; ?>">
            <label for="ai_provider">AI API</label>
            <select id="ai_provider" name="ai_provider">
                <option value="qwen" <?php echo $ai_provider === 'qwen' ? 'selected' : ''; ?>>Qwen (千问)</option>
                <option value="gemini" <?php echo $ai_provider === 'gemini' ? 'selected' : ''; ?>>Gemini</option>
                <option value="zhipu" <?php echo $ai_provider === 'zhipu' ? 'selected' : ''; ?>>Zhipu (智谱)</option>
            </select>
            <button class="btn btn-primary" name="set_ai_provider">保存</button>
        </form>
    </div>

    <?php if ($ai_message): ?>
        <div class="ai-message"><?php echo htmlspecialchars($ai_message); ?></div>
    <?php endif; ?>

        <form method="POST" class="reply-form" style="margin-bottom:12px;">
            <input type="hidden" name="order_id" value="<?php echo $order_id; ?>">
            <input type="hidden" id="ai_provider_hidden" name="ai_provider" value="<?php echo htmlspecialchars($ai_provider); ?>">
        <div class="reply-actions" style="margin-top:0;">
            <?php
            if ($ai_provider === 'gemini') {
                $current_url = $ai_settings['ai_api_endpoint_gemini'] ?? '';
            } elseif ($ai_provider === 'zhipu') {
                $current_url = $ai_settings['ai_api_endpoint_zhipu'] ?? '';
            } else {
                $current_url = $ai_settings['ai_api_endpoint_qwen'] ?? '';
            }
            ?>
            <input type="text" name="ai_api_endpoint" placeholder="API URL"
                   value="<?php echo htmlspecialchars($current_url); ?>">
            <input type="text" name="ai_api_key" placeholder="API Key（留空表示不修改）">
            <?php if ($ai_provider === 'zhipu'): ?>
                <input type="text" name="ai_model" placeholder="Zhipu Model（如 glm-4）"
                       value="<?php echo htmlspecialchars($ai_settings['zhipu_model'] ?? ''); ?>">
            <?php elseif ($ai_provider === 'qwen'): ?>
                <input type="text" name="ai_model" placeholder="Qwen Model（如 qwen-plus）"
                       value="<?php echo htmlspecialchars($ai_settings['qwen_model'] ?? ''); ?>">
            <?php endif; ?>
            <button class="btn btn-primary" name="set_ai_settings">保存 API 配置</button>
        </div>
        <div style="font-size:12px;color:#6b7280;margin-top:6px;">
            当前保存对象：
            <?php
            $provider_label = $ai_provider === 'gemini' ? 'Gemini' : ($ai_provider === 'zhipu' ? 'Zhipu(智谱)' : 'Qwen(千问)');
            echo htmlspecialchars($provider_label);
            ?>
        </div>
        <?php
        $saved_qwen = $ai_secret ? aiDecrypt($ai_settings['qwen_api_key'] ?? '', $ai_secret) : '';
        $saved_gemini = $ai_secret ? aiDecrypt($ai_settings['gemini_api_key'] ?? '', $ai_secret) : '';
        $saved_zhipu = $ai_secret ? aiDecrypt($ai_settings['zhipu_api_key'] ?? '', $ai_secret) : '';
        ?>
        <?php if ($saved_qwen || $saved_gemini || $saved_zhipu): ?>
            <div style="font-size:12px;color:#6b7280;margin-top:6px;">
                已保存密钥：
                Qwen <?php echo htmlspecialchars(maskSecret($saved_qwen)); ?>，
                Gemini <?php echo htmlspecialchars(maskSecret($saved_gemini)); ?>，
                Zhipu <?php echo htmlspecialchars(maskSecret($saved_zhipu)); ?>
            </div>
        <?php endif; ?>
    </form>

    <form method="POST" class="reply-form">
        <input type="hidden" name="order_id" value="<?php echo $order_id; ?>">
        <textarea name="studio_reply" placeholder="输入要点，点击 AI 润色生成更完整的回复" required><?php echo htmlspecialchars($reply_draft); ?></textarea>
        <div class="reply-actions">
            <button class="btn btn-ghost" name="polish_lang" value="zh">AI 润色中文</button>
            <button class="btn btn-ghost" name="polish_lang" value="en">AI 润色英文</button>
            <button class="btn btn-primary" name="send_reply">Send Reply</button>
        </div>
    </form>
</div>

<hr>
<h3>Progress Images</h3>

<div class="carousel">
    <button type="button" class="carousel-btn prev" id="studio-carousel-prev">‹</button>
    <div class="carousel-viewport">
        <div class="carousel-track" id="studio-carousel">
            <?php
            $has_studio_images = false;
            while ($img = $images->fetch_assoc()):
                $studio_img = buildFullUrl($img['studio_image'] ?? '');
                if ($studio_img):
                    $has_studio_images = true;
            ?>
                    <div class="carousel-item">
                        <a href="<?php echo htmlspecialchars($studio_img); ?>" target="_blank">
                            <img src="<?php echo htmlspecialchars($studio_img); ?>" alt="Studio Update">
                        </a>
                    </div>
            <?php
                endif;
            endwhile;
            if (!$has_studio_images):
            ?>
                <div class="preview-empty" style="width:240px;">No images yet</div>
            <?php endif; ?>
        </div>
    </div>
    <button type="button" class="carousel-btn next" id="studio-carousel-next">›</button>
</div>

<form method="POST" enctype="multipart/form-data" class="upload-form">
    <input type="hidden" name="order_id" value="<?php echo $order_id; ?>">
    <input type="file" name="studio_image" accept="image/*" required>
    <button class="btn btn-primary" name="upload_image">Upload Image</button>
</form>

<?php endif; ?>

</div>

<script>
(function () {
    const orderId = <?php echo (int) $order_id; ?>;
    if (!orderId) return;

    let lastChange = <?php echo json_encode($last_change); ?>;
    const pollUrl = `admin_order.php?order_id=${orderId}&poll=1`;
    const banner = document.getElementById("admin-refresh-banner");
    const refreshBtn = document.getElementById("admin-refresh-btn");

    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            window.location.reload();
        });
    }

    setInterval(async () => {
        try {
            const res = await fetch(pollUrl + "&t=" + Date.now(), {
                credentials: "include"
            });
            if (!res.ok) return;
            const data = await res.json();
            if (!data || !data.success) return;

            if (data.last_change && data.last_change !== lastChange) {
                lastChange = data.last_change;
                const textarea = document.querySelector('textarea[name="studio_reply"]');
                const fileInput = document.querySelector('input[type="file"][name="studio_image"]');
                const hasDraft = textarea && textarea.value.trim().length > 0;
                const hasFile = fileInput && fileInput.value;

                if (!hasDraft && !hasFile) {
                    window.location.reload();
                } else if (banner) {
                    banner.style.display = "flex";
                }
            }
        } catch (err) {
            console.error(err);
        }
    }, 6000);
})();

(function () {
    const select = document.getElementById("ai_provider");
    const hidden = document.getElementById("ai_provider_hidden");
    if (!select || !hidden) return;
    const sync = () => {
        hidden.value = select.value;
    };
    select.addEventListener("change", sync);
    sync();
})();

(function () {
    const track = document.getElementById("studio-carousel");
    if (!track) return;
    const prev = document.getElementById("studio-carousel-prev");
    const next = document.getElementById("studio-carousel-next");
    const items = Array.from(track.querySelectorAll(".carousel-item"));
    if (!items.length) {
        if (prev) prev.style.display = "none";
        if (next) next.style.display = "none";
        return;
    }

    const gap = 12;
    const itemWidth = 240 + gap;
    let index = 0;

    const update = () => {
        const maxIndex = Math.max(0, items.length - 1);
        if (index < 0) index = 0;
        if (index > maxIndex) index = maxIndex;
        track.style.transform = `translateX(${-index * itemWidth}px)`;
    };

    if (prev) {
        prev.addEventListener("click", () => {
            index -= 1;
            update();
        });
    }
    if (next) {
        next.addEventListener("click", () => {
            index += 1;
            update();
        });
    }

    update();
})();
</script>

<?php require_once(__DIR__ . "/admin_footer.php"); ?>
