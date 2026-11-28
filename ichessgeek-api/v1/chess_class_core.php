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
const CHESS_EVT_BRANCH = 'branch';
const CHESS_EVT_UNDO = 'undo';
const CHESS_EVT_RESET = 'reset';

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

function chess_class_branch_node(array $root, array $path) {
    $node = null;
    foreach ($path as $index) {
        if (!is_int($index) || $index < 0 || !isset($root['children'][$index])) return null;
        $node = $root['children'][$index];
        $root = $node;
    }
    return $node;
}

function chess_class_branch_slot(array $main, array $root, array $path, $ply) {
    if (!is_array($path) || count($path) > 32 || !is_int($ply) || $ply < 0) return null;
    if (!$path) return $ply <= count($main) ? ['owner' => false, 'line' => $main, 'index' => $ply] : null;
    $node = chess_class_branch_node($root, $path);
    if ($node === null) return null;
    if ($ply === 0) {
        $parentPath = array_slice($path, 0, -1);
        $line = $parentPath ? chess_class_branch_node($root, $parentPath)['moves'] : $main;
        return ['owner' => false, 'line' => $line, 'index' => $node['branchIndex'], 'parent' => $parentPath];
    }
    if ($ply > count($node['moves'])) return null;
    return ['owner' => true, 'line' => $node['moves'], 'index' => $ply];
}

function chess_class_branch_repeats(array $main, array $root, array $path, $ply, $san) {
    $slot = chess_class_branch_slot($main, $root, $path, $ply);
    if (!$slot) return false;
    if ($path && $ply === 0) {
        $node = chess_class_branch_node($root, $path);
        return $node && ($node['moves'][0] ?? null) === $san;
    }
    return $slot['index'] < count($slot['line']) && $slot['line'][$slot['index']] === $san;
}

function chess_class_branch_position($startFen, array $main, array $root, array $path, $ply) {
    $slot = chess_class_branch_slot($main, $root, $path, $ply);
    if (!$slot) return null;
    if (!$path) {
        $ownerPath = [];
        $index = $ply;
    } else {
        $node = chess_class_branch_node($root, $path);
        $ownerPath = $ply === 0 ? array_slice($path, 0, -1) : $path;
        $index = $ply === 0 ? $node['branchIndex'] : $ply;
    }
    $mainLength = $ownerPath ? chess_class_branch_node($root, [$ownerPath[0]])['branchIndex'] : $index;
    $line = array_slice($main, 0, $mainLength);
    foreach ($ownerPath as $i => $unused) {
        $ancestor = chess_class_branch_node($root, array_slice($ownerPath, 0, $i + 1));
        $moves = $i === count($ownerPath) - 1 ? array_slice($ancestor['moves'], 0, $index) : $ancestor['moves'];
        $line = array_merge($line, $moves);
    }
    $pos = chess_engine_parse_fen($startFen);
    if ($pos === null) return null;
    foreach ($line as $san) {
        $move = chess_engine_from_san($pos, $san);
        if ($move === null) return null;
        $pos = chess_engine_move($pos, $move);
    }
    return $pos;
}

function chess_class_branch_map_node(array $node, array $path, callable $change) {
    if (!$path) return $change($node);
    $index = $path[0];
    $node['children'][$index] = chess_class_branch_map_node($node['children'][$index], array_slice($path, 1), $change);
    return $node;
}

function chess_class_branch_record(array $main, array $root, array $path, $ply, $san) {
    $slot = chess_class_branch_slot($main, $root, $path, $ply);
    if (!$slot || $slot['index'] > count($slot['line'])) return ['main' => $main, 'root' => $root];
    if ($slot['index'] < count($slot['line']) && $slot['line'][$slot['index']] === $san) {
        return ['main' => $main, 'root' => $root];
    }
    $node = ['branchIndex' => $slot['index'], 'moves' => [$san], 'children' => []];
    if ($slot['index'] < count($slot['line'])) {
        $ownerPath = isset($slot['parent']) ? $slot['parent'] : $path;
        if (!$ownerPath) {
            $root['children'][] = $node;
        } else {
            $root = chess_class_branch_map_node($root, $ownerPath,
                static fn (array $owner) => array_merge($owner, ['children' => [...$owner['children'], $node]]));
        }
    } elseif (!$path) {
        $main[] = $san;
    } else {
        $root = chess_class_branch_map_node($root, $path,
            static fn (array $owner) => array_merge($owner, ['moves' => [...$owner['moves'], $san]]));
    }
    return ['main' => $main, 'root' => $root];
}

function chess_class_replay_controls(array $events) {
    $main = [];
    $positions = [CHESS_ENGINE_START_FEN];
    $root = ['children' => []];
    foreach ($events as $event) {
        $data = is_array($event['data'] ?? null) ? $event['data'] : [];
        if ($event['type'] === CHESS_EVT_RESET) {
            $main = [];
            $positions = [CHESS_ENGINE_START_FEN];
            $root = ['children' => []];
        } elseif ($event['type'] === CHESS_EVT_MOVE) {
            $pos = chess_engine_parse_fen($positions[count($positions) - 1]);
            $move = $pos ? chess_engine_from_san($pos, (string) ($data['san'] ?? '')) : null;
            if (!$move) return ['err' => 'server'];
            $main[] = chess_engine_to_san($pos, $move, chess_engine_legal_moves($pos));
            $positions[] = chess_engine_to_fen(chess_engine_move($pos, $move));
        } elseif ($event['type'] === CHESS_EVT_UNDO) {
            if (!$main || end($main) !== ($data['san'] ?? null)) return ['err' => 'server'];
            $san = array_pop($main);
            array_pop($positions);
            $ply = count($main);
            $root['children'] = array_values(array_filter($root['children'],
                static fn (array $child) => $child['branchIndex'] <= $ply));
            $known = false;
            foreach ($root['children'] as $child) {
                if ($child['branchIndex'] === $ply && $child['moves'][0] === $san) {
                    $known = true;
                    break;
                }
            }
            if (!$known) {
                $root['children'][] = ['branchIndex' => $ply, 'moves' => [$san], 'children' => []];
            }
        } elseif ($event['type'] === CHESS_EVT_BRANCH) {
            $path = $data['path'] ?? [];
            $ply = $data['ply'] ?? null;
            if (chess_class_branch_repeats($main, $root, $path, $ply, $data['san'] ?? null)) {
                continue;
            }
            $pos = chess_class_branch_position(CHESS_ENGINE_START_FEN, $main, $root, $path, $ply);
            $move = $pos ? chess_engine_from_san($pos, (string) ($data['san'] ?? '')) : null;
            if (!$move) return ['err' => 'bad_branch'];
            $san = chess_engine_to_san($pos, $move, chess_engine_legal_moves($pos));
            $recorded = chess_class_branch_record($main, $root, $path, $ply, $san);
            $main = $recorded['main'];
            $root = $recorded['root'];
        }
    }
    return ['err' => null, 'main' => $main, 'positions' => $positions, 'root' => $root];
}

/** 老师的课堂控制：分支只记事件，悔棋回退主线，新局清空全班记录。 */
function chess_class_control(array $class, $action, array $data, array $events, $actorId, $isTeacher) {
    if ($class['status'] !== CHESS_CLASS_OPEN) {
        return ['err' => 'class_closed', 'class' => $class, 'event' => null];
    }
    if (!$isTeacher) {
        return ['err' => 'no_permission', 'class' => $class, 'event' => null];
    }
    if ($action === CHESS_EVT_RESET) {
        $class['fen'] = CHESS_ENGINE_START_FEN;
        $class['seq']++;
        return ['err' => null, 'class' => $class, 'event' => [
            'seq' => $class['seq'], 'type' => CHESS_EVT_RESET,
            'data' => ['fen_after' => $class['fen']], 'actor_id' => $actorId,
        ]];
    }
    $history = chess_class_replay_controls($events);
    if ($history['err'] !== null) {
        return ['err' => $history['err'], 'class' => $class, 'event' => null];
    }
    if ($action === CHESS_EVT_UNDO) {
        if (!$history['main']) {
            return ['err' => 'nothing_to_undo', 'class' => $class, 'event' => null];
        }
        $san = end($history['main']);
        $class['fen'] = $history['positions'][count($history['positions']) - 2];
        $class['seq']++;
        $parts = explode(' ', $class['fen']);
        return ['err' => null, 'class' => $class, 'event' => [
            'seq' => $class['seq'], 'type' => CHESS_EVT_UNDO,
            'data' => ['san' => $san, 'fen_after' => $class['fen'], 'turn' => $parts[1]],
            'actor_id' => $actorId,
        ]];
    }
    if ($action !== CHESS_EVT_BRANCH) {
        return ['err' => 'bad_action', 'class' => $class, 'event' => null];
    }
    $path = $data['path'] ?? [];
    $ply = $data['ply'] ?? null;
    if (!is_array($path)) {
        return ['err' => 'bad_branch', 'class' => $class, 'event' => null];
    }
    $san = trim((string) ($data['san'] ?? ''));
    if ($san === '' || strlen($san) > 16) {
        return ['err' => 'bad_branch', 'class' => $class, 'event' => null];
    }
    $slot = chess_class_branch_slot($history['main'], $history['root'], $path, $ply);
    if (!$slot) {
        return ['err' => 'bad_branch', 'class' => $class, 'event' => null];
    }
    if (chess_class_branch_repeats($history['main'], $history['root'], $path, $ply, $san)) {
        $class['seq']++;
        return ['err' => null, 'class' => $class, 'event' => [
            'seq' => $class['seq'], 'type' => CHESS_EVT_BRANCH,
            'data' => ['path' => array_values($path), 'ply' => $ply, 'san' => $san], 'actor_id' => $actorId,
        ]];
    }
    $pos = chess_class_branch_position(CHESS_ENGINE_START_FEN, $history['main'], $history['root'], $path, $ply);
    $move = $pos ? chess_engine_from_san($pos, $san) : null;
    if ((!$path && $ply >= count($history['main'])) || !$move) {
        return ['err' => 'bad_branch', 'class' => $class, 'event' => null];
    }
    $class['seq']++;
    return ['err' => null, 'class' => $class, 'event' => [
        'seq' => $class['seq'], 'type' => CHESS_EVT_BRANCH,
        'data' => ['path' => array_values($path), 'ply' => $ply,
            'san' => chess_engine_to_san($pos, $move, chess_engine_legal_moves($pos))],
        'actor_id' => $actorId,
    ]];
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
