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
    chess_coach_standing_schema($conn);

    $result = chess_transaction_retry($conn, static function () use ($conn, $row, $id) {
        $locked = chess_class_for_update($conn, (int) $row['id']);
        if (!$locked) {
            return ['ok' => false, 'code' => 'no_such_class'];
        }
        $class = chess_class_from_row($locked);
        if ($class['status'] !== CHESS_CLASS_OPEN) {
            return ['ok' => false, 'code' => 'class_closed'];
        }
        $member = chess_class_member_for_update($conn, $class['id'], $id);
        if ($member && $member['role'] === CHESS_CLASS_STUDENT) {
            chess_lock_player_standing($conn, $class['teacher_id']);
            $teacherCanTeach = chess_player_can_teach($conn, $class['teacher_id']);
        } else {
            $problem = chess_class_teacher_problem($conn, $class, $id === $class['teacher_id'] ? $id : $class['teacher_id']);
            if ($problem !== null) {
                return ['ok' => false, 'code' => $problem === 'not_teacher' ? 'teacher_unavailable' : $problem];
            }
            $teacherCanTeach = true;
        }
        if (!$member) {
            $role = $id === $class['teacher_id'] ? CHESS_CLASS_TEACHER : CHESS_CLASS_STUDENT;
            if (!chess_class_add_member($conn, $class['id'], $id, $role)) {
                throw new RuntimeException('class join insert failed');
            }
        }
        return ['ok' => true, 'payload' => [
            'ok' => true,
            'class' => chess_class_public(
                $class,
                chess_class_members($conn, $class['id']),
                $id,
                $teacherCanTeach
            ),
            'events' => chess_class_events($conn, $class['id'], 0),
        ]];
    });

    if (!$result['ok']) {
        chess_err($result['code']);
    }
    chess_json($result['payload']);
} catch (Throwable $e) {
    chess_fail($e, 'class_join');
}
