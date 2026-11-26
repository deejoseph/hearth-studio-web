<?php
/**
 * 棋谱库：保存一局对局记录。
 *
 * 必须登录。用 game_id 去重：同一局不会存两次（INSERT ... ON DUPLICATE KEY UPDATE）。
 * 返回保存后的记录，格式和 list 端点一致。
 */
require_once __DIR__ . '/chess_guard.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    chess_err('method');
}

$playerId = chess_player_id();
if ($playerId === 0) {
    chess_err('sign_in_required');
}

// chess_read_body 已经挡过方法、Content-Type 和非数组的 body，这里只管取字段
$body = chess_read_body();

// 验证必填字段
$gameId = $body['id'] ?? null;
$at = $body['at'] ?? null;
$mode = $body['mode'] ?? null;
$result = $body['result'] ?? null;
$white = $body['white'] ?? null;
$black = $body['black'] ?? null;
$termination = $body['termination'] ?? null;
$sans = $body['sans'] ?? null;

if (!is_string($gameId) || $gameId === '' || strlen($gameId) > 40) {
    chess_err('bad_body');
}
if (!is_int($at) || $at <= 0) {
    chess_err('bad_body');
}
if (!in_array($mode, ['computer', 'local', 'online'], true)) {
    chess_err('bad_body');
}
if (!in_array($result, ['1-0', '0-1', '1/2-1/2', '*'], true)) {
    chess_err('bad_body');
}
if (!is_string($white) || $white === '' || strlen($white) > 120) {
    chess_err('bad_body');
}
if (!is_string($black) || $black === '' || strlen($black) > 120) {
    chess_err('bad_body');
}
if (!is_string($termination) || $termination === '' || strlen($termination) > 24) {
    chess_err('bad_body');
}
if (!is_array($sans) || count($sans) === 0) {
    chess_err('bad_body');
}
foreach ($sans as $san) {
    if (!is_string($san) || $san === '' || strlen($san) > 12) {
        chess_err('bad_body');
    }
}

// level 字段：仅 mode=computer 时有
$level = null;
if ($mode === 'computer') {
    $level = $body['level'] ?? null;
    if ($level !== null && (!is_string($level) || strlen($level) > 12)) {
        chess_err('bad_body');
    }
}

// control 字段：null 或 {initial, increment}
$controlInitial = null;
$controlIncrement = null;
$control = $body['control'] ?? null;
if ($control !== null) {
    if (!is_array($control) || count($control) !== 2) {
        chess_err('bad_body');
    }
    [$initial, $increment] = $control;
    if (!is_int($initial) || $initial < 0 || !is_int($increment) || $increment < 0) {
        chess_err('bad_body');
    }
    $controlInitial = $initial;
    $controlIncrement = $increment;
}

$conn = chess_db();
chess_schema($conn);

// 插入或更新：同一 player_id + game_id 只存一次
$stmt = $conn->prepare('INSERT INTO chess_library (player_id, game_id, finished_at, mode, level, sans, result, white_name, black_name, control_initial, control_increment, termination) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE finished_at=VALUES(finished_at), mode=VALUES(mode), level=VALUES(level), sans=VALUES(sans), result=VALUES(result), white_name=VALUES(white_name), black_name=VALUES(black_name), control_initial=VALUES(control_initial), control_increment=VALUES(control_increment), termination=VALUES(termination)');
if (!$stmt) {
    chess_err('service');
}

$sansJson = json_encode($sans, JSON_UNESCAPED_UNICODE);
$stmt->bind_param(
    'isisissssiis',
    $playerId,
    $gameId,
    $at,
    $mode,
    $level,
    $sansJson,
    $result,
    $white,
    $black,
    $controlInitial,
    $controlIncrement,
    $termination
);

if (!$stmt->execute()) {
    $stmt->close();
    chess_err('server');
}
$stmt->close();

// 返回保存后的记录
chess_json([
    'ok' => true,
    'game' => [
        'v' => 1,
        'id' => $gameId,
        'at' => $at,
        'mode' => $mode,
        'level' => $level,
        'sans' => $sans,
        'result' => $result,
        'white' => $white,
        'black' => $black,
        'control' => $control,
        'termination' => $termination,
    ],
]);
