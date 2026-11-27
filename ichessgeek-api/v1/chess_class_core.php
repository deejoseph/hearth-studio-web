<?php
/**
 * 课堂模式的规则层：一行课堂进来，更新后的一行出去——不碰数据库、不碰会话。
 *
 * 和 chess_room_core.php 的区别：
 * - 课堂没有计时器、没有胜负判定
 * - 成员模型是 1 老师 + N 学生（多对多），不是固定两个座位
 * - 事件类型不只是走子，还有标注（箭头/高亮）、举手、批准
 *
 * 走法合法性仍然交给 chess_engine.php，裁判只有一套标准。
 *
 * 禁止直接 URL 访问（同目录 .htaccess 已 FilesMatch 拒绝）。
 */

require_once __DIR__ . '/chess_engine.php';

/** 课堂码：4 位数字，好念好记（"请大家输入 3-8-4-7"）。 */
const CHESS_CLASS_CODE_LENGTH = 4;

const CHESS_CLASS_OPEN = 'open';
const CHESS_CLASS_CLOSED = 'closed';

/** 成员角色。 */
const CHESS_CLASS_TEACHER = 'teacher';
const CHESS_CLASS_STUDENT = 'student';

/** 举手状态。 */
const CHESS_HAND_NONE = 'none';
const CHESS_HAND_RAISED = 'raised';
const CHESS_HAND_APPROVED = 'approved';

/** 事件类型。 */
const CHESS_EVT_MOVE = 'move';
const CHESS_EVT_ANNOTATION = 'annotation';
const CHESS_EVT_HAND = 'hand';
const CHESS_EVT_APPROVE = 'approve';

/**
 * 生成 4 位数字课堂码。用 random_int 逐位取，不能用 rand() 拼接——
 * 这码是全班学生进课堂的唯一入口，不能有可预测的分布。
 */
function chess_class_code() {
    $code = '';
    for ($i = 0; $i < CHESS_CLASS_CODE_LENGTH; $i++) {
        $code .= (string) random_int(0, 9);
    }
    return $code;
}

/**
 * 把用户输入的课堂码收正：去空格、只留数字、要求恰好 4 位。
 * 不合格返回 ''，调用方据此回 bad_class_code。
 */
function chess_class_norm_code($value) {
    $code = preg_replace('/\s+/', '', (string) ($value ?? ''));
    if (strlen($code) !== CHESS_CLASS_CODE_LENGTH) {
        return '';
    }
    if (!ctype_digit($code)) {
        return '';
    }
    return $code;
}

/**
 * 新建课堂：老师创建，初始 FEN 是标准起始局面。
 * 返回 ['err' => null, 'class' => [...]] 或 ['err' => '...', 'class' => null]。
 */
function chess_class_new($teacherId) {
    $code = chess_class_code();
    return [
        'err' => null,
        'class' => [
            'code' => $code,
            'teacher_id' => $teacherId,
            'fen' => 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            'status' => CHESS_CLASS_OPEN,
            'seq' => 0,
        ],
    ];
}

/**
 * 走一步。验证合法性、更新 FEN、返回新事件。
 * $canMove 是调用方根据角色+举手状态判定的权限布尔值。
 */
function chess_class_move(array $class, $san, $actorId, $canMove) {
    if ($class['status'] !== CHESS_CLASS_OPEN) {
        return ['err' => 'class_closed', 'class' => $class, 'event' => null];
    }
    if (!$canMove) {
        return ['err' => 'no_permission', 'class' => $class, 'event' => null];
    }
    $pos = chess_engine_parse_fen($class['fen']);
    if ($pos === null) {
        return ['err' => 'server', 'class' => $class, 'event' => null];
    }
    $move = chess_engine_from_san($pos, $san);
    if ($move === null) {
        return ['err' => 'illegal_move', 'class' => $class, 'event' => null];
    }
    $next = chess_engine_move($pos, $move);
    $class['fen'] = chess_engine_to_fen($next);
    $class['seq']++;
    $event = [
        'seq' => $class['seq'],
        'type' => CHESS_EVT_MOVE,
        'data' => [
            'san' => chess_engine_to_san($pos, $move, chess_engine_legal_moves($pos)),
            'fen_after' => $class['fen'],
            'turn' => $next['turn'],
        ],
        'actor_id' => $actorId,
    ];
    return ['err' => null, 'class' => $class, 'event' => $event];
}

/**
 * 广播标注（箭头/高亮）。老师在棋盘上画的东西同步给学生。
 * $annotations 是 JSON 数组 [{type:'square'|'arrow', square/from/to, color}]。
 */
function chess_class_annotate(array $class, $annotations, $actorId, $isTeacher) {
    if ($class['status'] !== CHESS_CLASS_OPEN) {
        return ['err' => 'class_closed', 'class' => $class, 'event' => null];
    }
    if (!$isTeacher) {
        return ['err' => 'no_permission', 'class' => $class, 'event' => null];
    }
    $class['seq']++;
    $event = [
        'seq' => $class['seq'],
        'type' => CHESS_EVT_ANNOTATION,
        'data' => [
            'annotations' => array_values($annotations),
            'fen' => $class['fen'],
        ],
        'actor_id' => $actorId,
    ];
    return ['err' => null, 'class' => $class, 'event' => $event];
}

/**
 * 学生举手或放下手。
 */
function chess_class_hand(array $class, $playerId, $action, $currentHandStatus) {
    if ($class['status'] !== CHESS_CLASS_OPEN) {
        return ['err' => 'class_closed', 'class' => $class, 'event' => null];
    }
    if ($action === 'raise') {
        if ($currentHandStatus === CHESS_HAND_APPROVED) {
            return ['err' => 'already_approved', 'class' => $class, 'event' => null];
        }
        $newStatus = CHESS_HAND_RAISED;
    } elseif ($action === 'lower') {
        $newStatus = CHESS_HAND_NONE;
    } else {
        return ['err' => 'bad_action', 'class' => $class, 'event' => null];
    }
    $class['seq']++;
    $event = [
        'seq' => $class['seq'],
        'type' => CHESS_EVT_HAND,
        'data' => [
            'player_id' => $playerId,
            'status' => $newStatus,
        ],
        'actor_id' => $playerId,
    ];
    return ['err' => null, 'class' => $class, 'event' => $event, 'hand_status' => $newStatus];
}

/**
 * 老师批准或收回学生的走子权限。
 */
function chess_class_approve(array $class, $targetPlayerId, $approve, $isTeacher) {
    if ($class['status'] !== CHESS_CLASS_OPEN) {
        return ['err' => 'class_closed', 'class' => $class, 'event' => null];
    }
    if (!$isTeacher) {
        return ['err' => 'no_permission', 'class' => $class, 'event' => null];
    }
    $newStatus = $approve ? CHESS_HAND_APPROVED : CHESS_HAND_NONE;
    $class['seq']++;
    $event = [
        'seq' => $class['seq'],
        'type' => CHESS_EVT_APPROVE,
        'data' => [
            'player_id' => $targetPlayerId,
            'status' => $newStatus,
        ],
        'actor_id' => $class['teacher_id'],
    ];
    return ['err' => null, 'class' => $class, 'event' => $event, 'hand_status' => $newStatus];
}

/**
 * 课堂公开状态（发给所有成员的 payload）。
 * $members 是 [{player_id, nickname, role, hand_status}] 数组。
 * $you 是当前请求者的角色信息。
 */
function chess_class_public(array $class, array $members, $youId, $teacherCanTeach = true) {
    $yourRole = null;
    $yourHand = CHESS_HAND_NONE;
    $canMove = false;
    foreach ($members as $m) {
        if ($m['player_id'] === $youId) {
            $yourRole = $m['role'];
            $yourHand = $m['hand_status'];
            $canMove = ($m['role'] === CHESS_CLASS_TEACHER && $teacherCanTeach)
                || ($m['hand_status'] === CHESS_HAND_APPROVED);
            break;
        }
    }
    // 回合从 FEN 的第二段读，不是按字符下标数——子力位置那一段长短不一，
    // 写死下标只在全局第一手时碰巧对。
    $parts = explode(' ', trim($class['fen']));
    $turn = (($parts[1] ?? 'w') === 'b') ? 'b' : 'w';
    return [
        'code' => $class['code'],
        'status' => $class['status'],
        'fen' => $class['fen'],
        'turn' => $turn,
        'seq' => $class['seq'],
        'you' => [
            'role' => $yourRole,
            'hand' => $yourHand,
            'can_move' => $canMove,
        ],
        'members' => array_map(static function ($m) {
            return [
                'id' => $m['player_id'],
                'nickname' => $m['nickname'],
                'role' => $m['role'],
                'hand' => $m['hand_status'],
            ];
        }, $members),
    ];
}
