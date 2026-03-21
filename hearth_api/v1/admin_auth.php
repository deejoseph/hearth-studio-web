<?php
session_start();

if (!isset($_SESSION['admin_id'])) {
    header("Location: admin_login.php");
    exit;
}

// 可选：自动过期（30分钟无操作）
$timeout = 1800;

if (isset($_SESSION['last_activity']) &&
    (time() - $_SESSION['last_activity'] > $timeout)) {

    session_unset();
    session_destroy();
    header("Location: admin_login.php?timeout=1");
    exit;
}

$_SESSION['last_activity'] = time();