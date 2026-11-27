<?php
/**
 * 广播标注。POST JSON: {code, annotations: [...]}
 * 只有老师可以广播箭头/高亮到所有学生。
 * annotations 格式: [{type:'square',square,color} | {type:'arrow',from,to,color}]
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
    $annotations = $body['annotations'] ?? [];
    if (!is_array($annotations)) {
        $annotations = [];
    }

    $result = chess_transaction_retry($conn, static function () use ($conn, $row, $id, $annotations) {
        $locked = chess_class_for_update($conn, (int) $row['id']);
        if (!$locked) {
            return ['ok' => false, 'code' => 'no_such_class'];
        }
        $class = chess_class_from_row($locked);
        $member = chess_class_member_for_update($conn, $class['id'], $id);
        if (!$member) {
            return ['ok' => false, 'code' => 'not_class_member'];
        }
        $isTeacher = $member['role'] === CHESS_CLASS_TEACHER;
        if ($isTeacher) {
            $problem = chess_class_teacher_problem($conn, $class, $id);
            if ($problem !== null) {
                return ['ok' => false, 'code' => $problem];
            }
            $teacherCanTeach = true;
        } else {
            chess_lock_player_standing($conn, $class['teacher_id']);
            $teacherCanTeach = chess_player_can_teach($conn, $class['teacher_id']);
        }

        $annotated = chess_class_annotate($class, $annotations, $id, $isTeacher);
        if ($annotated['err'] !== null) {
            return ['ok' => false, 'code' => $annotated['err']];
        }
        $updated = $annotated['class'];
        if (!chess_write_class($conn, $updated, $class['seq'])) {
            return ['ok' => false, 'code' => 'stale'];
        }
        if (!chess_class_insert_event($conn, $updated['id'], $annotated['event'])) {
            throw new RuntimeException('class annotation event failed');
        }
        return ['ok' => true, 'payload' => [
            'ok' => true,
            'class' => chess_class_public(
                $updated,
                chess_class_members($conn, $updated['id']),
                $id,
                $teacherCanTeach
            ),
            'event' => $annotated['event'],
        ]];
    });

    if (!$result['ok']) {
        chess_err($result['code']);
    }
    chess_json($result['payload']);
} catch (Throwable $e) {
    chess_fail($e, 'class_annotate');
}
