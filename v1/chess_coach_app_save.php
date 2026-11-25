<?php
/**
 * 申请成为教练 —— 交/改自我介绍。POST JSON: {intro}
 *
 * 三道门按顺序过：登录且邮箱验证过（chess_require_verified）、这段话合不合格
 * （coach_app_normalize）、这个人是不是已经批了。
 *
 * 最后那条不是啰嗦：chess_app_submit() 把状态写回 'pending'，一个批过的教练
 * 想"顺手更新下介绍"就会当场丢掉开课堂的资格，而界面上一句解释都没有。
 * 所以已批准的走 409，让界面把人引去联系管理员，而不是让他自己把门关上。
 *
 * 限流没做在这：门槛已经是"注册 + 点邮件链接 + 一人一行"，反复提交只是把同一行
 * 改一遍，最坏的受害者是提交者自己（他的申请在管理员列表里排到最后）。
 * 按 IP 限反而会出现"一个老师在教室网络上改第三次就存不上"。
 */
require_once __DIR__ . '/chess_guard.php';

$playerId = chess_require_verified();

// chess_read_body 顺手挡掉三样：不是 POST、Content-Type 不是 JSON、body 不是对象。
// 表单式的跨站 POST 带不上 application/json，这一条就是 CSRF 的门 —— 这里写的
// 东西会出现在管理员的审核屏幕上，尤其不能让人在别人的会话里代笔。
$check = coach_app_normalize(chess_read_body());
if (!$check['ok']) {
    chess_err($check['code'], ['field' => $check['field']]);
}

$conn = chess_db();

try {
    if (chess_app_is_teacher($conn, $playerId)) {
        chess_err('already_teacher');
    }
    if (!chess_app_submit($conn, $playerId, $check['intro'])) {
        chess_err('server');
    }
    $row = chess_app_read($conn, $playerId);
    if ($row === null) {
        // 写成功了又读不到：库在中间出了别的事，不能报"交好了"
        error_log('chess coach app: written but missing for player ' . $playerId);
        chess_err('server');
    }
    chess_json([
        'ok' => true,
        'app' => coach_app_public($row),
        // 刚交完一定是待审 —— 直接从库里那一行算，不写死 false，
        // 免得哪天状态机改了这里还在报旧值。
        'can_teach' => coach_can_teach($row['status'] ?? null),
    ]);
} catch (Throwable $e) {
    chess_fail($e, 'coach app save');
}
