<?php
/**
 * 棋谱库：列出当前登录棋手的所有对局。
 *
 * 返回按结束时间倒序，最新在前。未登录返回空列表（不报错，保持向后兼容）。
 * 返回格式和前端 localStorage 的格式一致，方便无缝切换。
 */
require_once __DIR__ . '/chess_guard.php';

$playerId = chess_player_id();
if ($playerId === 0) {
    // 未登录：返回空列表，前端继续用 localStorage
    chess_json(['ok' => true, 'games' => []]);
}

$conn = chess_db();
chess_schema($conn);

// 查询该用户的所有对局，按结束时间倒序
$stmt = $conn->prepare('SELECT game_id, finished_at, mode, level, sans, result, white_name, black_name, control_initial, control_increment, termination FROM chess_library WHERE player_id = ? ORDER BY finished_at DESC');
if (!$stmt) {
    chess_err('service');
}
$stmt->bind_param('i', $playerId);
if (!$stmt->execute()) {
    $stmt->close();
    chess_err('service');
}
$result = $stmt->get_result();

$games = [];
while ($row = $result->fetch_assoc()) {
    // 转换字段名，和前端 localStorage 格式对齐
    $sans = json_decode($row['sans'], true);
    if (!is_array($sans)) {
        $sans = [];
    }

    // control 字段：前端用 [initial, increment] 数组或 null
    $control = null;
    if ($row['control_initial'] !== null && $row['control_increment'] !== null) {
        $control = [(int)$row['control_initial'], (int)$row['control_increment']];
    }

    $games[] = [
        'v' => 1,  // 版本号，和前端 FORMAT 对齐
        'id' => $row['game_id'],
        'at' => (int)$row['finished_at'],
        'mode' => $row['mode'],
        'level' => $row['level'],
        'sans' => $sans,
        'result' => $row['result'],
        'white' => $row['white_name'],
        'black' => $row['black_name'],
        'control' => $control,
        'termination' => $row['termination'],
    ];
}

$stmt->close();

chess_json(['ok' => true, 'games' => $games]);
