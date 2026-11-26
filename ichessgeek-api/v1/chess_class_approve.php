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
    $targetId = (int) ($body['player_id'] ?? 0);
    if ($targetId <= 0) {
        chess_err('bad_player_id');
    }
    $approve = !empty($body['approve']);

    $row = chess_find_class($conn, $code);
    if (!$row) {
        chess_err('no_such_class');
    }
    $class = chess_class_from_row($row);

    $member = chess_class_member($conn, $class['id'], $id);
    if (!$member || $member['role'] !== CHESS_CLASS_TEACHER) {
        chess_err('not_teacher');
    }

    $target = chess_class_member($conn, $class['id'], $targetId);
    if (!$target) {
        chess_err('not_class_member');
    }

    $result = chess_class_approve($class, $targetId, $approve, true);
    if ($result['err'] !== null) {
        chess_json(['ok' => false, 'code' => $result['err']]);
    }

    $updated = $result['class'];
    if (!chess_write_class($conn, $updated, $row['seq'])) {
        chess_err('stale');
    }
    chess_class_set_hand($conn, $updated['id'], $targetId, $result['hand_status']);
    chess_class_insert_event($conn, $updated['id'], $result['event']);

    chess_json([
        'ok' => true,
        'class' => chess_class_public($updated, chess_class_members($conn, $updated['id']), $id),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'class_approve');
}
