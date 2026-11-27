<?php
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_mail.php';

$playerId = chess_require_verified();
$check = coach_inquiry_normalize(chess_read_body());
if (!$check['ok']) {
    chess_err($check['code'], ['field' => $check['field']]);
}

$conn = chess_db();

try {
    $coachId = $check['coach_id'];
    $coach = chess_coach_one($conn, $coachId);
    if ($coach === null) {
        chess_err('no_such_coach');
    }

    $stmt = $conn->prepare("SELECT nickname, email FROM chess_players WHERE id = ? LIMIT 1");
    $stmt->bind_param("i", $playerId);
    $stmt->execute();
    $student = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $stmt = $conn->prepare("SELECT nickname, email FROM chess_players WHERE id = ? LIMIT 1");
    $stmt->bind_param("i", $coachId);
    $stmt->execute();
    $coachIdentity = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$student || !$coachIdentity) {
        chess_err('no_such_player');
    }

    $requestId = $check['request_id'] ?? bin2hex(random_bytes(32));
    $pref = chess_coach_pref_read($conn, $playerId) ?? [];
    $reserved = chess_inquiry_reserve($conn, $playerId, $coachId, $requestId, $check['message']);
    if (!$reserved['ok']) {
        chess_err($reserved['code']);
    }
    if (empty($reserved['sent'])) {
        $sent = chess_send_coach_inquiry(
            $coachIdentity['email'],
            $coachIdentity['nickname'],
            $student['email'],
            $student['nickname'],
            $check['message'],
            $pref
        );
        if (!$sent['coach']) {
            chess_inquiry_refund($conn, $playerId, $reserved['id'], $reserved['buckets']);
            chess_err('mail_failed');
        }
        chess_inquiry_mark_sent($conn, $playerId, $reserved['id']);
    }
    chess_json([
        'ok' => true,
        'inquiry' => [
            'id' => $reserved['id'],
            'coach_id' => $coachId,
            'status' => 'sent',
        ],
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'coach inquiry');
}
