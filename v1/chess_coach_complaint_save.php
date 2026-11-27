<?php
require_once __DIR__ . '/chess_guard.php';

$playerId = chess_require_student();
$check = coach_complaint_text_normalize(chess_read_body());
if (!$check['ok']) {
    chess_err($check['code'], ['field' => $check['field']]);
}

$conn = chess_db();

try {
    $coachId = $check['coach_id'];
    if (!chess_coach_was_teacher($conn, $coachId)) {
        chess_err('complaint_target_invalid');
    }
    $saved = chess_coach_complaint_save(
        $conn,
        $playerId,
        $coachId,
        $check['text'],
        $check['text_hash']
    );
    if (!$saved['ok']) {
        chess_err($saved['code']);
    }
    chess_json(['ok' => true, 'complaint' => $saved['complaint']]);
} catch (Throwable $e) {
    chess_fail($e, 'coach complaint save');
}
