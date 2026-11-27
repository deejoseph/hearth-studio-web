<?php
require_once __DIR__ . '/chess_guard.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    chess_err('method');
}

$playerId = chess_require_verified();
$conn = chess_db();

try {
    chess_json(['ok' => true, 'complaints' => chess_player_complaints($conn, $playerId)]);
} catch (Throwable $e) {
    chess_fail($e, 'coach complaint get');
}
