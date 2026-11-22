<?php
/**
 * 登出。只认 POST —— GET 的登出链接会被预取、被爬虫点、被浏览器插件触发。
 */
require_once __DIR__ . '/chess_guard.php';

chess_read_body(); // 顺带完成 POST + JSON 的把关

chess_start_session();
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
}
session_destroy();

chess_json(['ok' => true, 'signed_in' => false, 'message' => '已登出']);
