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
    $class = chess_class_from_row($row);

    $member = chess_class_member($conn, $class['id'], $id);
    if (!$member) {
        chess_err('not_class_member');
    }
    if ($member['role'] === CHESS_CLASS_TEACHER) {
        chess_err('teacher_no_hand');
    }

    $result = chess_class_hand($class, $id, $action, $member['hand_status']);
    if ($result['err'] !== null) {
        chess_json(['ok' => false, 'code' => $result['err']]);
    }

    $updated = $result['class'];
    if (!chess_write_class($conn, $updated, $row['seq'])) {
        chess_err('stale');
    }
    chess_class_set_hand($conn, $updated['id'], $id, $result['hand_status']);
    chess_class_insert_event($conn, $updated['id'], $result['event']);

    chess_json([
        'ok' => true,
        'class' => chess_class_public($updated, chess_class_members($conn, $updated['id']), $id),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'class_hand');
}
