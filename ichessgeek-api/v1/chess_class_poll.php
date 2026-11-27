<?php
/**
 * 轮询课堂事件。GET ?code=3847&since=0
 * 所有成员（老师和学生）都轮询这个端点获取走子、标注、举手等更新。
 * GET 不写任何东西，重试安全。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_class_core.php';

$id = chess_require_player();
$conn = chess_db();

try {
    $code = chess_class_norm_code($_GET['code'] ?? '');
    if ($code === '') {
        chess_err('bad_class_code');
    }
    $since = max(0, (int) ($_GET['since'] ?? 0));

    $row = chess_find_class($conn, $code);
    if (!$row) {
        chess_err('no_such_class');
    }
    $class = chess_class_from_row($row);

    $member = chess_class_member($conn, $class['id'], $id);
    if (!$member) {
        chess_err('not_class_member');
    }

    $events = chess_class_events($conn, $class['id'], $since);

    chess_json([
        'ok' => true,
        'class' => chess_class_public(
            $class,
            chess_class_members($conn, $class['id']),
            $id,
            chess_player_can_teach($conn, $class['teacher_id'])
        ),
        'events' => $events,
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'class_poll');
}
