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
    chess_coach_standing_schema($conn);

    $result = chess_transaction_retry($conn, static function () use ($conn, $row, $id) {
        $locked = chess_class_for_update($conn, (int) $row['id']);
        if (!$locked) {
            return ['ok' => false, 'code' => 'no_such_class'];
        }
        $class = chess_class_from_row($locked);
        $member = chess_class_member_for_update($conn, $class['id'], $id);
        if (!$member) {
            return ['ok' => false, 'code' => 'not_class_member'];
        }
        if ($member['role'] === CHESS_CLASS_TEACHER) {
            $problem = chess_class_teacher_problem($conn, $class, $id);
            if ($problem !== null) {
                return ['ok' => false, 'code' => $problem];
            }
            if (!chess_class_close($conn, $class['id'], $class['seq'])) {
                return ['ok' => false, 'code' => 'stale'];
            }
        } elseif (!chess_class_remove_member($conn, $class['id'], $id)) {
            throw new RuntimeException('class leave delete failed');
        }
        return ['ok' => true];
    });

    if (!$result['ok']) {
        chess_err($result['code']);
    }
    chess_json(['ok' => true]);
} catch (Throwable $e) {
    chess_fail($e, 'class_leave');
}
