<?php
/**
 * 进课堂。POST JSON: {code: "3847"}
 * 学生用老师给的 4 位码进入课堂旁听。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_class_core.php';

$body = chess_read_body();
$id = chess_require_verified();
$conn = chess_db();

try {
    $code = chess_class_norm_code($body['code'] ?? '');
    if ($code === '') {
        chess_err('bad_class_code');
    }

    $row = chess_find_class($conn, $code);
    if (!$row) {
        chess_err('no_such_class');
    }
    $class = chess_class_from_row($row);

    if ($class['status'] !== CHESS_CLASS_OPEN) {
        chess_err('class_closed');
    }

    $existing = chess_class_member($conn, $class['id'], $id);
    if (!$existing) {
        $role = ($id === $class['teacher_id']) ? CHESS_CLASS_TEACHER : CHESS_CLASS_STUDENT;
        chess_class_add_member($conn, $class['id'], $id, $role);
    }

    chess_json([
        'ok' => true,
        'class' => chess_class_public($class, chess_class_members($conn, $class['id']), $id),
        // 半堂课已经下过去了：把记录一并给出，学生进来就能看到棋谱，
        // 不用等第一次轮询、也不会先看到一盘空棋盘。
        'events' => chess_class_events($conn, $class['id'], 0),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'class_join');
}
