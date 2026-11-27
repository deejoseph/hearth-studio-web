<?php
/**
 * 老师批准/收回学生的走子权限。POST JSON: {code, player_id, approve: true|false}
 * 批准后学生获得一次走子机会（走完自动收回）。
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
    $targetId = coach_positive_id($body['player_id'] ?? null);
    if ($targetId === null) {
        chess_err('bad_player_id');
    }
    if (!array_key_exists('approve', $body) || !is_bool($body['approve'])) {
        chess_err('bad_approve');
    }
    $approve = $body['approve'];

    $row = chess_find_class($conn, $code);
    if (!$row) {
        chess_err('no_such_class');
    }
    chess_coach_standing_schema($conn);

    $result = chess_transaction_retry($conn, static function () use ($conn, $row, $id, $targetId, $approve) {
        $locked = chess_class_for_update($conn, (int) $row['id']);
        if (!$locked) {
            return ['ok' => false, 'code' => 'no_such_class'];
        }
        $class = chess_class_from_row($locked);
        $teacher = chess_class_member_for_update($conn, $class['id'], $id);
        if (!$teacher || $teacher['role'] !== CHESS_CLASS_TEACHER) {
            return ['ok' => false, 'code' => 'not_teacher'];
        }
        $problem = chess_class_teacher_problem($conn, $class, $id);
        if ($problem !== null) {
            return ['ok' => false, 'code' => $problem];
        }
        $target = chess_class_member_for_update($conn, $class['id'], $targetId);
        if (!$target || $target['role'] !== CHESS_CLASS_STUDENT) {
            return ['ok' => false, 'code' => 'bad_player_id'];
        }

        $approved = chess_class_approve($class, $targetId, $approve, true);
        if ($approved['err'] !== null) {
            return ['ok' => false, 'code' => $approved['err']];
        }
        $updated = $approved['class'];
        if (!chess_write_class($conn, $updated, $class['seq'])) {
            return ['ok' => false, 'code' => 'stale'];
        }
        if (!chess_class_set_hand($conn, $updated['id'], $targetId, $approved['hand_status'])) {
            throw new RuntimeException('class approval update failed');
        }
        if (!chess_class_insert_event($conn, $updated['id'], $approved['event'])) {
            throw new RuntimeException('class approval event failed');
        }
        return ['ok' => true, 'class' => chess_class_public(
            $updated,
            chess_class_members($conn, $updated['id']),
            $id,
            true
        )];
    });

    if (!$result['ok']) {
        chess_err($result['code']);
    }
    chess_json(['ok' => true, 'class' => $result['class']]);
} catch (Throwable $e) {
    chess_fail($e, 'class_approve');
}
