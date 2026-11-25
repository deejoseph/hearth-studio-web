<?php
/**
 * 开课堂。POST JSON: {}
 * 老师调用，返回一个 4 位数字课堂码。学生用这个码进课堂旁听。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_class_core.php';

$id = chess_require_verified();
$conn = chess_db();
chess_class_schema($conn);

try {
    $made = chess_class_new($id);
    $class = chess_insert_class($conn, $made['class']);
    if ($class === null) {
        chess_err('server');
    }

    chess_class_add_member($conn, $class['id'], $id, CHESS_CLASS_TEACHER);

    chess_json([
        'ok' => true,
        'class' => chess_class_public($class, chess_class_members($conn, $class['id']), $id),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'class_create');
}
