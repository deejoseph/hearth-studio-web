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

chess_read_body();
$id = chess_require_verified();
$conn = chess_db();
chess_require_teacher($conn, $id);
chess_coach_standing_schema($conn);

try {
    $made = chess_class_new($id);
    $result = chess_transaction_retry($conn, static function () use ($conn, $made, $id) {
        $problem = chess_class_teacher_problem($conn, ['teacher_id' => $id], $id);
        if ($problem !== null) {
            return ['ok' => false, 'code' => $problem];
        }
        $class = chess_insert_class($conn, $made['class']);
        if ($class === null) {
            throw new RuntimeException('class create insert failed');
        }
        if (!chess_class_add_member($conn, $class['id'], $id, CHESS_CLASS_TEACHER)) {
            throw new RuntimeException('class create teacher insert failed');
        }
        return ['ok' => true, 'class' => chess_class_public(
            $class,
            chess_class_members($conn, $class['id']),
            $id,
            true
        )];
    });

    if (!$result['ok']) {
        chess_err($result['code']);
    }
    chess_json(['ok' => true, 'class' => $result['class']]);
} catch (Throwable $e) {
    chess_fail($e, 'class_create');
}
