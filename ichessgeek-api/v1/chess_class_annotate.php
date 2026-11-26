<?php
/**
 * 广播标注。POST JSON: {code, annotations: [...]}
 * 只有老师可以广播箭头/高亮到所有学生。
 * annotations 格式: [{type:'square',square,color} | {type:'arrow',from,to,color}]
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

    $annotations = $body['annotations'] ?? [];
    if (!is_array($annotations)) {
        $annotations = [];
    }

    $result = chess_class_annotate($class, $annotations, $id, $isTeacher);
    if ($result['err'] !== null) {
        chess_json(['ok' => false, 'code' => $result['err']]);
    }

    $updated = $result['class'];
    if (!chess_write_class($conn, $updated, $row['seq'])) {
        chess_err('stale');
    }
    chess_class_insert_event($conn, $updated['id'], $result['event']);

    chess_json([
        'ok' => true,
        'class' => chess_class_public($updated, chess_class_members($conn, $updated['id']), $id),
        'event' => $result['event'],
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'class_annotate');
}
