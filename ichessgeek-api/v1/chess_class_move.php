<?php
/**
 * 课堂走子。POST JSON: {code, san}
 * 老师随时可走；学生只有被批准（hand_status=approved）后才能走。
 * 走子合法性由 chess_engine 裁判，和 1v1 房间同一套标准。
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
    $san = trim((string) ($body['san'] ?? ''));
    if ($san === '' || strlen($san) > 16) {
        chess_err('bad_move');
    }

    $row = chess_find_class($conn, $code);
    if (!$row) {
        chess_err('no_such_class');
    }
    chess_coach_standing_schema($conn);

    $result = chess_transaction_retry($conn, static function () use ($conn, $row, $id, $san) {
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
        $canMove = $isTeacher || $member['hand_status'] === CHESS_HAND_APPROVED;
        $public = static fn (array $state) => chess_class_public(
            $state,
            chess_class_members($conn, $state['id']),
            $id,
            $teacherCanTeach
        );

        $played = chess_class_move($class, $san, $id, $canMove);
        if ($played['err'] !== null) {
            return ['ok' => false, 'code' => $played['err'], 'class' => $public($class)];
        }
        $updated = $played['class'];
        if (!chess_write_class($conn, $updated, $class['seq'])) {
            return ['ok' => false, 'code' => 'stale_class_move', 'class' => $public($class)];
        }
        if (!chess_class_insert_event($conn, $updated['id'], $played['event'])) {
            throw new RuntimeException('class move event failed');
        }

        if (!$isTeacher && $member['hand_status'] === CHESS_HAND_APPROVED
            && !chess_class_set_hand($conn, $updated['id'], $id, CHESS_HAND_NONE)) {
            throw new RuntimeException('class move hand reset failed');
        }
        return ['ok' => true, 'payload' => [
            'ok' => true,
            'class' => $public($updated),
            'event' => $played['event'],
        ]];
    });

    if (!$result['ok']) {
        chess_err($result['code'], isset($result['class']) ? ['class' => $result['class']] : []);
    }
    chess_json($result['payload']);
} catch (Throwable $e) {
    chess_fail($e, 'class_move');
}
