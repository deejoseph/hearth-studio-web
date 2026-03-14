<?php
// 数据库配置信息
$servername = "localhost"; 
$username = "ichessge_dee"; 
$password = "7uiMKrhz-N4nCV5";
$dbname = "ichessge_craft_order";

// --- 1. 保留原有的 mysqli 连接（供旧页面使用） ---
$conn = new mysqli($servername, $username, $password, $dbname);
if ($conn->connect_error) {
    // 这里不要直接 die(json)，因为旧页面可能是 HTML，直接 die 会导致页面空白
    error_log("Mysqli connection failed: " . $conn->connect_error);
}
$conn->set_charset("utf8mb4");


// --- 2. 新增 PDO 连接（供 Android 后台 API 使用） ---
try {
    $dsn = "mysql:host=$servername;dbname=$dbname;charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, $username, $password, $options);
} catch (\PDOException $e) {
    error_log("PDO connection failed: " . $e->getMessage());
}
?>