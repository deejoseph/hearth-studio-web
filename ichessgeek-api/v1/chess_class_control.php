<?php
/**
 * 课堂控制。POST JSON: {code, action: "branch"|"undo"|"reset", data}
 * 只有老师能操作；分支和悔棋都作为事件同步给全班。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_class_core.php';

$body = chess_read_body();
$id = chess_require_verified();
$conn = chess_db();

try {
    $code = chess_class_norm_code($body['code'] ?? '');
    if ($code === '') chess_err('bad_class_code');
    $action = (string) ($body['action'] ?? '');
    if (!in_array($action, [CHESS_EVT_BRANCH, CHESS_EVT_UNDO, CHESS_EVT_RESET], true)) {
        chess_err('bad_action');
    }
    $data = $body['data'] ?? [];
    if (!is_array($data)) chess_err('bad_branch');

    $row = chess_find_class($conn, $code);
    if (!$row) chess_err('no_such_class');
    chess_coach_standing_schema($conn);

    $result = chess_transaction_retry($conn, static function () use ($conn, $row, $id, $action, $data) {
        $locked = chess_class_for_update($conn, (int) $row['id']);
        if (!$locked) return ['ok' => false, 'code' => 'no_such_class'];
        $class = chess_class_from_row($locked);
        $member = chess_class_member_for_update($conn, $class['id'], $id);
        if (!$member) return ['ok' => false, 'code' => 'not_class_member'];
        $isTeacher = $member['role'] === CHESS_CLASS_TEACHER;
        if (!$isTeacher) return ['ok' => false, 'code' => 'no_permission'];
        $problem = chess_class_teacher_problem($conn, $class, $id);
        if ($problem !== null) return ['ok' => false, 'code' => $problem];

        $events = $action === CHESS_EVT_RESET ? [] : chess_class_events_since_reset($conn, $class['id']);
        $controlled = chess_class_control($class, $action, $data, $events, $id, true);
        if ($controlled['err'] !== null) {
            return ['ok' => false, 'code' => $controlled['err']];
        }
        $updated = $controlled['class'];
        if (!chess_write_class($conn, $updated, $class['seq'])) {
            return ['ok' => false, 'code' => 'stale_class_move'];
        }
        if (!chess_class_insert_event($conn, $updated['id'], $controlled['event'])) {
            throw new RuntimeException('class control event failed');
        }
        if ($action === CHESS_EVT_RESET) {
            $stmt = $conn->prepare("UPDATE chess_class_members SET hand_status = 'none' WHERE class_id = ?");
            $stmt->bind_param('i', $updated['id']);
            if (!$stmt->execute()) throw new RuntimeException('class reset hands failed');
            $stmt->close();
        }
        return ['ok' => true, 'payload' => [
            'ok' => true,
            'class' => chess_class_public($updated, chess_class_members($conn, $updated['id']), $id, true),
            'event' => $controlled['event'],
        ]];
    });

    if (!$result['ok']) chess_err($result['code']);
    chess_json($result['payload']);
} catch (Throwable $e) {
    chess_fail($e, 'class_control');
}
