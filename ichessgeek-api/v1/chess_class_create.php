<?php
/**
 * 开课堂。POST JSON: {}
 * 老师调用，返回一个 4 位数字课堂码。学生用这个码进课堂旁听。
 *
 * 资格位只挡"开"这一个动作：开课堂的人是要对学生的一整盘棋说话的，
 * 所以要先申请、管理员批过。学生凭码进来不挡 —— 那 4 位数是老师给他的，
 * 老师自己就是那道门（见 chess_class_join.php）。
 */
require_once __DIR__ . '/chess_guard.php';
require_once __DIR__ . '/chess_class_core.php';

$id = chess_require_verified();
$conn = chess_db();
chess_require_teacher($conn, $id);
chess_class_schema($conn);

try {
    $made = chess_class_new($id);
    $class = chess_insert_class($conn, $made['class']);
    if ($class === null) {
        chess_err('server');
    }

    chess_class_add_member($conn, $class['id'], $id, CHESS_CLASS_TEACHER);

    chess_json([
        'ok' => true,
        'class' => chess_class_public($class, chess_class_members($conn, $class['id']), $id),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'class_create');
}
