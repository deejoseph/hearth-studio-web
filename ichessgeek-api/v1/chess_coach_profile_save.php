<?php
/**
 * 教练资料 —— 整份保存。POST JSON。
 *
 * 覆盖式：界面先把当前那一份读回来再整份发回，所以这里不必区分"没发这个键"和
 * "发了空串" —— 那两种都按清空处理（规则层 coach_profile_normalize 定死）。
 * 少一套缺省语义，就少一处只有真浏览器才能发现的漏存。
 *
 * 门是 chess_player_can_teach()：名录只列得着够格的人，给一个不够格的人存资料
 * 只会存出一行谁都看不见的东西 —— 那不如当场说一句"先申请成为教练"。
 * 顺序是先验证邮箱、再判格式、最后判资格：让一个没点邮件链接的人先读到
 * "你的简介超长"这种能自己修的话，比让他撞一句 403 讲得清。
 *
 * 图片不走这一条： multipart 上传另开一个端点（chess_coach_photo_save.php），
 * 一次一张，传完就落库。这个 JSON 端点只搬文件名，所以 avatar/photos/certificates
 * 三列原样写回 —— 界面发回来的就是它刚从 profile_get 读到的那几串。
 */
require_once __DIR__ . '/chess_guard.php';

$playerId = chess_require_verified();

// chess_read_body 顺手挡掉三样：不是 POST、Content-Type 不是 JSON、body 不是对象。
// 表单式的跨站 POST 带不上 application/json，这一条就是 CSRF 的门 —— 这里写的
// 东西会出现在公开的教练名录上，尤其不能让人在别人的会话里代笔。
$check = coach_profile_normalize(chess_read_body());
if (!$check['ok']) {
    chess_err($check['code'], ['field' => $check['field']]);
}

$conn = chess_db();

try {
    if (!chess_player_can_teach($conn, $playerId)) {
        chess_err('teacher_only');
    }
    if (!chess_profile_write($conn, $playerId, $check['profile'])) {
        chess_err('server');
    }
    $row = chess_profile_row($conn, $playerId);
    if ($row === null) {
        // 写成功了又读不到：库在中间出了别的事，不能报"存好了"
        error_log('chess coach profile: written but missing for player ' . $playerId);
        chess_err('server');
    }
    // 保存后这一行不再引用的文件就是被换下来的（删照片、换头像），顺手清掉：
    // 名录页上少几张照片不算事，磁盘上留一堆没人引用的图才是长期成本。
    $dropped = chess_coach_media_prune($playerId, chess_coach_media_names($row));
    if ($dropped > 0) {
        error_log('chess coach media: pruned ' . $dropped . ' file(s) for player ' . $playerId);
    }
    chess_json([
        'ok' => true,
        'profile' => coach_profile_public($row),
        'filled' => coach_profile_filled(coach_profile_public($row)),
        'listed' => true,   // 走到这里的一定在名录里（上面那道门刚判过）
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'coach profile save');
}
