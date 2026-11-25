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
    $san = chess_trim($body['san'] ?? '', 16);
    if ($san === '') {
        chess_err('bad_move');
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

    $isTeacher = $member['role'] === CHESS_CLASS_TEACHER;
    $canMove = $isTeacher || $member['hand_status'] === CHESS_HAND_APPROVED;

    $result = chess_class_move($class, $san, $id, $canMove);
    if ($result['err'] !== null) {
        chess_json(['ok' => false, 'code' => $result['err'], 'class' => chess_class_public(
            $class, chess_class_members($conn, $class['id']), $id
        )]);
    }

    $updated = $result['class'];
    if (!chess_write_class($conn, $updated, $row['seq'])) {
        chess_err('stale_move');
    }
    chess_class_insert_event($conn, $updated['id'], $result['event']);

    // 学生走完后自动收回权限（一次走子机会）
    if (!$isTeacher && $member['hand_status'] === CHESS_HAND_APPROVED) {
        chess_class_set_hand($conn, $updated['id'], $id, CHESS_HAND_NONE);
    }

    chess_json([
        'ok' => true,
        'class' => chess_class_public($updated, chess_class_members($conn, $updated['id']), $id),
        'event' => $result['event'],
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'class_move');
}
