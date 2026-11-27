<?php
/**
 * 举手/放下手。POST JSON: {code, action: "raise"|"lower"}
 * 只有学生可以举手。举手后老师会看到，批准后获得一次走子权限。
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
    $action = chess_trim($body['action'] ?? '', 8);
    if ($action !== 'raise' && $action !== 'lower') {
        chess_err('bad_action');
    }

    $row = chess_find_class($conn, $code);
    if (!$row) {
        chess_err('no_such_class');
    }
    chess_coach_standing_schema($conn);

    $result = chess_transaction_retry($conn, static function () use ($conn, $row, $id, $action) {
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
            return ['ok' => false, 'code' => 'teacher_no_hand'];
        }
        chess_lock_player_standing($conn, $class['teacher_id']);
        $teacherCanTeach = chess_player_can_teach($conn, $class['teacher_id']);

        $hand = chess_class_hand($class, $id, $action, $member['hand_status']);
        if ($hand['err'] !== null) {
            return ['ok' => false, 'code' => $hand['err']];
        }
        $updated = $hand['class'];
        if (!chess_write_class($conn, $updated, $class['seq'])) {
            return ['ok' => false, 'code' => 'stale'];
        }
        if (!chess_class_set_hand($conn, $updated['id'], $id, $hand['hand_status'])) {
            throw new RuntimeException('class hand update failed');
        }
        if (!chess_class_insert_event($conn, $updated['id'], $hand['event'])) {
            throw new RuntimeException('class hand event failed');
        }
        return ['ok' => true, 'class' => chess_class_public(
            $updated,
            chess_class_members($conn, $updated['id']),
            $id,
            $teacherCanTeach
        )];
    });

    if (!$result['ok']) {
        chess_err($result['code']);
    }
    chess_json(['ok' => true, 'class' => $result['class']]);
} catch (Throwable $e) {
    chess_fail($e, 'class_hand');
}
