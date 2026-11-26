<?php
/**
 * 教练名录 —— 公开页那一列。GET，不要登录。
 *
 * 只列得着两类人：申请已批准的，和邮箱在 admin_users 里的管理员。
 * 这两条都在 chess_coach_ids() 里，端点不参与判断谁够格。
 *
 * 回来的每一行都由 coach_directory_entry() 整形：里面有昵称、称号、等级分、
 * 能带什么水平、照片文件名 —— 🔴 没有 email，也没有 verified_at。
 * 这一页是搜索引擎抓得到的，多带一列就是一次不可逆的公开。
 *
 * 排序不在服务端做：按学员偏好匹配是界面那侧的 coachMatch.js，
 * 同一个人在不同人屏幕上顺序不同，写成 SQL 就得两边各维护一份规则。
 */
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    chess_err('method');
}

$conn = chess_db();

try {
    $coaches = chess_coach_directory($conn, min(100, max(1, (int) ($_GET['n'] ?? 60))));
    chess_json([
        'ok' => true,
        'coaches' => $coaches,
        'count' => count($coaches),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'coach directory');
}
