<?php
/**
 * 离开课堂 / 关闭课堂。POST JSON: {code}
 * 学生离开只移除自己；老师离开则关闭整个课堂。
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

    $member = chess_class_member($conn, $class['id'], $id);
    if (!$member) {
        chess_err('not_class_member');
    }

    if ($member['role'] === CHESS_CLASS_TEACHER) {
        chess_class_close($conn, $class['id'], $class['seq']);
    } else {
        chess_class_remove_member($conn, $class['id'], $id);
    }

    chess_json(['ok' => true]);
} catch (Throwable $e) {
    chess_fail($e, 'class_leave');
}
