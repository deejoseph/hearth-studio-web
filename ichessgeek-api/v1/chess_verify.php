<?php
/**
 * 验证邮箱：邮件里的链接指到这里。GET ?token=<明文令牌>
 * 库里存的是令牌的 SHA-256，所以这里先哈希再查。
 * 验完只做一次 302 回棋盘，状态由查询串带给前端，这里不输出 HTML。
 */
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    chess_err('method');
}

$token = chess_trim($_GET['token'] ?? '', 80);
if ($token === '' || !preg_match('/\A[0-9a-f]{64}\z/', $token)) {
    header('Location: /chess/?verify=bad', true, 302);
    exit;
}

$conn = chess_db();
try {
    chess_schema($conn);

    $hash = hash('sha256', $token);
    $stmt = $conn->prepare("SELECT id, verified_at, verify_expires FROM chess_players WHERE verify_token_hash = ? LIMIT 1");
    $stmt->bind_param("s", $hash);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        header('Location: /chess/?verify=bad', true, 302);
        exit;
    }

    if ($row['verified_at'] !== null) {
        // 已经验证过：别再报"链接无效"，那会让人以为自己做错了什么
        header('Location: /chess/?verify=already', true, 302);
        exit;
    }

    if (strtotime((string) $row['verify_expires']) < time()) {
        header('Location: /chess/?verify=expired', true, 302);
        exit;
    }

    $id = (int) $row['id'];
    // 令牌验完不删：同一条链接再点一次（手快点了两下、或者换个手机接着点）就该
    // 落到"已经验证过了"，而不是"链接无效"——后者会让人以为自己做错了什么。
    // 留着它换不到任何东西：验证只看 verified_at，重发邮件对已验证的账号直接回"已验证"。
    $up = $conn->prepare("UPDATE chess_players SET verified_at = NOW() WHERE id = ?");
    $up->bind_param("i", $id);
    $up->execute();
    $up->close();

    header('Location: /chess/?verify=ok', true, 302);
    exit;
} catch (Throwable $e) {
    error_log('chess verify: ' . $e->getMessage());
    chess_err('verify_failed');
}
