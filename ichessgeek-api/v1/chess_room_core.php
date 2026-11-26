<?php
/**
 * 在线对弈的规则层：房间的一行进来，走完之后的那行出去 —— 不碰数据库、不碰会话，
 * 全部是纯函数。这么拆是为了让在线对弈里最容易错的四件事（该谁走、时钟怎么算、
 * 这步合不合法、什么时候算结束）能离线拿真棋谱重放测（tools/chess_room_core_test.php），
 * 端点只负责读会话、读写库、把这里的答案转成 JSON。
 *
 * 走法合法性一律交给 chess_engine.php —— 那一份已经和棋盘 JS 引擎逐手对拍过
 * （25833 个局面 / 518401 手 / 0 处不一致）。这一层不许自己再判一次棋，
 * 裁判只能有一套标准。
 *
 * 时间是毫秒整数，不用 DATETIME：库里 DATETIME 只到秒，"剩 0.4 秒"和"剩 1.4 秒"
 * 会被存成同一个值，而这两种情况一个该判负一个不该。端点把毫秒写进 BIGINT，
 * 客户端只显示不裁决。
 *
 * 禁止直接 URL 访问（同目录 .htaccess 已 FilesMatch 拒绝）。
 */

require_once __DIR__ . '/chess_engine.php';

/** 每方 10 分钟。少儿班一局要想到十几分钟， blitz 的 5 分钟太紧。 */
const CHESS_ROOM_TIME_MS = 600000;
const CHESS_ROOM_TIME_MIN_MS = 10000;    // 最短 10 秒，防一个请求把房间设成一局 0 秒
const CHESS_ROOM_TIME_MAX_MS = 3600000;  // 最长 1 小时，共享主机上不养长期占用

/**
 * 房间码。去掉 O/0/I/1 —— 这三个字符在手机屏幕上抄错一次，
 * 对面就永远等不到人，而且看不出是谁的错。
 */
const CHESS_ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CHESS_ROOM_CODE_LENGTH = 6;

const CHESS_ROOM_WAITING = 'waiting';
const CHESS_ROOM_ACTIVE = 'active';
const CHESS_ROOM_OVER = 'over';

/**
 * 结果只有这七种，都能从"棋局本身结束"或"时钟/认输/双方同意"三条路推出，
 * 并且都写进 chess_rooms.result 给棋谱导出（P4）和结果展示用。
 */
const CHESS_ROOM_RESULTS = [
    'checkmate' => '将死',
    'stalemate' => '逼和（和棋）',
    'resign-white' => '白方认输',
    'resign-black' => '黑方认输',
    'timeout-white' => '白方超时',
    'timeout-black' => '黑方超时',
    'agreement' => '双方同意和棋',
];

/** 房间码：6 位，从字母表里逐位随机取。用 random_int 而不是 shuffle/hash，
 * 因为这串码是别人进房的唯一入口，不能有可预测的位置分布。
 * 撞库（同一码已存在）由调用方在 INSERT 失败后重试，这里只管生成。
 */
function chess_room_code() {
    $alphabet = CHESS_ROOM_CODE_ALPHABET;
    $last = strlen($alphabet) - 1;
    $code = '';
    for ($i = 0; $i < CHESS_ROOM_CODE_LENGTH; $i++) {
        $code .= $alphabet[random_int(0, $last)];
    }
    return $code;
}

/**
 * 把用户输入的房间码收成正则：去空格、转大写（手机上打字没人管得住大小写），
 * 再要求逐位都在字母表里 —— 小写 o 会被转成大写 O，而 O 不在字母表，
 * 于是"把 0 看成 O"这种错会在门口就被挡下，而不是查一遍库说找不到房间。
 * 不合格返回 ''，调用方据此回 bad_room_code。
 */
function chess_room_norm_code($value) {
    $code = strtoupper(preg_replace('/\s+/', '', (string) ($value ?? '')));
    if (strlen($code) !== CHESS_ROOM_CODE_LENGTH) {
        return '';
    }
    for ($i = 0; $i < CHESS_ROOM_CODE_LENGTH; $i++) {
        if (strpos(CHESS_ROOM_CODE_ALPHABET, $code[$i]) === false) {
            return '';
        }
    }
    return $code;
}

/**
 * 开一个房间。$creatorColor 是 'w' / 'b' / 'random'，random 在这里就定下来，
 * 定完写进返回的行 —— 之后谁也不能改，否则两边看到的颜色会随第几次请求变。
 */
function chess_room_new($creatorId, $creatorColor, $timeMs, $code = null) {
    $creatorId = (int) $creatorId;
    $timeMs = (int) $timeMs;
    if ($creatorId < 1) {
        return ['room' => null, 'err' => 'sign_in_required'];
    }
    if ($timeMs < CHESS_ROOM_TIME_MIN_MS || $timeMs > CHESS_ROOM_TIME_MAX_MS) {
        return ['room' => null, 'err' => 'bad_room_time'];
    }
    if ($creatorColor === 'random') {
        $creatorColor = random_int(0, 1) === 0 ? CHESS_ENGINE_WHITE : CHESS_ENGINE_BLACK;
    }
    if ($creatorColor !== CHESS_ENGINE_WHITE && $creatorColor !== CHESS_ENGINE_BLACK) {
        return ['room' => null, 'err' => 'bad_room_color'];
    }

    $white = $creatorColor === CHESS_ENGINE_WHITE;
    return ['room' => [
        'code' => $code ?? chess_room_code(),
        'white_player_id' => $white ? $creatorId : null,
        'black_player_id' => $white ? null : $creatorId,
        'fen' => CHESS_ENGINE_START_FEN,
        'status' => CHESS_ROOM_WAITING,
        'result' => null,
        'winner' => null,
        'time_ms' => $timeMs,
        'white_ms' => $timeMs,
        'black_ms' => $timeMs,
        'turn_started_ms' => null,
        'seq' => 0,
    ], 'err' => null];
}

/** 这个人在这个房间里执什么色；不是他就在返回 null。 */
function chess_room_color_of(array $room, $playerId) {
    $playerId = (int) $playerId;
    if ($playerId > 0 && $playerId === (int) $room['white_player_id']) {
        return CHESS_ENGINE_WHITE;
    }
    if ($playerId > 0 && $playerId === (int) $room['black_player_id']) {
        return CHESS_ENGINE_BLACK;
    }
    return null;
}

/** 轮到谁走 —— 只认 FEN 里那一位，不认任何缓存字段。 */
function chess_room_turn(array $room) {
    $pos = chess_engine_parse_fen($room['fen']);
    return $pos === null ? null : $pos['turn'];
}

/**
 * 把流逝的时间结算进走子一方的剩余时间。任何要改房间的操作都先走这一步，
 * 这样"剩余时间"永远是"截至某个时刻的值"，而不是一个正在跑的倒计时。
 */
function chess_room_tick(array $room, $nowMs) {
    $nowMs = (int) $nowMs;
    if ($room['status'] !== CHESS_ROOM_ACTIVE || $room['turn_started_ms'] === null) {
        return $room;
    }
    $turn = chess_room_turn($room);
    if ($turn === null) {
        return $room;
    }
    $elapsed = max(0, $nowMs - (int) $room['turn_started_ms']);
    $key = $turn === CHESS_ENGINE_WHITE ? 'white_ms' : 'black_ms';
    $room[$key] = max(0, (int) $room[$key] - $elapsed);
    $room['turn_started_ms'] = $nowMs;
    return $room;
}

/** 此刻两边各还剩多少（不落库，只算给客户端看）。 */
function chess_room_clock(array $room, $nowMs) {
    if ($room['status'] !== CHESS_ROOM_ACTIVE || $room['turn_started_ms'] === null) {
        return [
            'w' => (int) $room['white_ms'],
            'b' => (int) $room['black_ms'],
        ];
    }
    $turn = chess_room_turn($room);
    $elapsed = $turn === null ? 0 : max(0, (int) $nowMs - (int) $room['turn_started_ms']);
    return [
        'w' => $turn === CHESS_ENGINE_WHITE
            ? max(0, (int) $room['white_ms'] - $elapsed)
            : (int) $room['white_ms'],
        'b' => $turn === CHESS_ENGINE_BLACK
            ? max(0, (int) $room['black_ms'] - $elapsed)
            : (int) $room['black_ms'],
    ];
}

/**
 * 谁超时了。只有"轮到走的那一方"会归零 —— 不动自己的钟就不可能输在时间上，
 * 这也是为什么结算一定要先 tick。
 */
function chess_room_flagged(array $room, $nowMs) {
    if ($room['status'] !== CHESS_ROOM_ACTIVE) {
        return null;
    }
    $turn = chess_room_turn($room);
    if ($turn === null) {
        return null;
    }
    $clock = chess_room_clock($room, $nowMs);
    return $clock[$turn] <= 0 ? $turn : null;
}

/**
 * 局面上这盘棋结束了没有：将死 / 逼和。
 * 只有一方能将死另一方是输；两边都没有合法走法又不被将军就是逼和（和棋）。
 * 50 步重复、三次重复、子力不足这三种和法这里暂不判 —— 事件表里有全部走法，
 * 要补就在规则层补，补完必须在离线重放里加用例。
 */
function chess_room_outcome($fen) {
    $pos = chess_engine_parse_fen($fen);
    if ($pos === null) {
        return ['over' => false, 'result' => null, 'winner' => null];
    }
    if (count(chess_engine_legal_moves($pos)) > 0) {
        return ['over' => false, 'result' => null, 'winner' => null];
    }
    $loser = $pos['turn'];
    if (chess_engine_in_check($pos, $loser)) {
        return ['over' => true, 'result' => 'checkmate', 'winner' => chess_engine_other($loser)];
    }
    return ['over' => true, 'result' => 'stalemate', 'winner' => null];
}

/**
 * 第二个人进房。房主不能自己坐对面（那等于一个人开两局骗计时器），
 * 房间不是 waiting 就不让进。进来之后才起钟：没人响应的房间不烧时间。
 *
 * 返回值里的 seat 是端点要抢的那个座位列名 —— 规则层已经算清楚了哪个位置是空的，
 * 让端点再算一遍就是两套口径。
 */
function chess_room_join(array $room, $playerId, $nowMs) {
    $playerId = (int) $playerId;
    if ($room['status'] !== CHESS_ROOM_WAITING) {
        return ['room' => $room, 'seat' => null,
                'err' => $room['status'] === CHESS_ROOM_ACTIVE ? 'room_full' : 'room_not_active'];
    }
    $open = null;
    foreach (['white_player_id', 'black_player_id'] as $seat) {
        if ($room[$seat] === null) {
            $open = $seat;
        }
    }
    if ($open === null || $playerId === (int) $room['white_player_id'] || $playerId === (int) $room['black_player_id']) {
        return ['room' => $room, 'seat' => null, 'err' => 'room_full'];
    }
    $room[$open] = $playerId;
    $room['status'] = CHESS_ROOM_ACTIVE;
    $room['turn_started_ms'] = (int) $nowMs;
    return ['room' => $room, 'seat' => $open, 'err' => null];
}

/**
 * 走一步。顺序是硬性的，每一步都在堵一个不同的洞：
 *   状态 → 是不是这房间的人 → 时钟有没有先走完 → 这局面我们自己读得懂吗 →
 *   钟归零了没有 → 轮到他没有 → 这步棋按 FEN 合法吗 → 结算与落库口径。
 * 客户端传来的 SAN 只当"意图"，一律用引擎解析（chess_engine_from_san 只认规范写法），
 * 记进事件表的是引擎自己写出来的那个 SAN，不是客户端字符串。
 */
function chess_room_move(array $room, $playerId, $san, $nowMs) {
    $playerId = (int) $playerId;
    $san = trim((string) $san);
    if ($room['status'] !== CHESS_ROOM_ACTIVE) {
        return ['room' => $room, 'event' => null, 'err' => $room['status'] === CHESS_ROOM_OVER ? 'room_over' : 'room_not_active'];
    }
    $side = chess_room_color_of($room, $playerId);
    if ($side === null) {
        return ['room' => $room, 'event' => null, 'err' => 'not_room_member'];
    }
    $room = chess_room_tick($room, $nowMs);

    $pos = chess_engine_parse_fen($room['fen']);
    if ($pos === null) {
        // 库里的 FEN 解析不出来：这是服务器自己的问题，不能回"你这步不合法"，
        // 也不能回"没轮到你"——那一局里两边永远都不该走，谁都会以为是自己点错了。
        // 所以要判在"轮到谁"之前。
        return ['room' => $room, 'event' => null, 'err' => 'server'];
    }

    // 先判钟再判走法：钟已经归零的一方，走一步再合法也不该算。
    $flagged = chess_room_flagged($room, $nowMs);
    if ($flagged !== null) {
        $room['status'] = CHESS_ROOM_OVER;
        $room['result'] = 'timeout-' . ($flagged === CHESS_ENGINE_WHITE ? 'white' : 'black');
        $room['winner'] = chess_engine_other($flagged);
        return ['room' => $room, 'event' => null, 'err' => 'flagged'];
    }
    if ($pos['turn'] !== $side) {
        return ['room' => $room, 'event' => null, 'err' => 'not_your_turn'];
    }
    $move = chess_engine_from_san($pos, $san);
    if ($move === null) {
        return ['room' => $room, 'event' => null, 'err' => 'illegal_move'];
    }
    $next = chess_engine_move($pos, $move);
    $fen = chess_engine_to_fen($next);
    // from_san 只认规范写法（它比的就是引擎自己写出来的那串），
    // 所以能走到这里的 $san 已经是规范 SAN，不必再让引擎重写一遍。

    $room['fen'] = $fen;
    $room['seq'] = (int) $room['seq'] + 1;
    $room['turn_started_ms'] = (int) $nowMs;

    $outcome = chess_room_outcome($fen);
    if ($outcome['over']) {
        $room['status'] = CHESS_ROOM_OVER;
        $room['result'] = $outcome['result'];
        $room['winner'] = $outcome['winner'];
    }
    return ['room' => $room, 'event' => [
        'seq' => (int) $room['seq'],
        'san' => $san,
        'fen_after' => $fen,
        'played_by' => $playerId,
        'clock' => chess_room_clock($room, $nowMs),
        'status' => $room['status'],
        'result' => $room['result'],
        'winner' => $room['winner'],
    ], 'err' => null];
}

/** 认输。归零对方的钟没有意义，所以只结自己的时间，不动 result 以外的字段。 */
function chess_room_resign(array $room, $playerId, $nowMs) {
    $side = chess_room_color_of($room, (int) $playerId);
    if ($side === null) {
        return ['room' => $room, 'err' => 'not_room_member'];
    }
    if ($room['status'] !== CHESS_ROOM_ACTIVE) {
        return ['room' => $room, 'err' => $room['status'] === CHESS_ROOM_OVER ? 'room_over' : 'room_not_active'];
    }
    $room = chess_room_tick($room, $nowMs);
    $room['status'] = CHESS_ROOM_OVER;
    $room['result'] = 'resign-' . ($side === CHESS_ENGINE_WHITE ? 'white' : 'black');
    $room['winner'] = chess_engine_other($side);
    return ['room' => $room, 'err' => null];
}

/**
 * 提和。谁都能提，不用等轮到自己 —— 提和不占时钟，也不会自动判和：
 * 它只是在 chess_room_draws 里留一条，等对方点"接受"或"拒绝"。
 *
 * $pending 是端点从 chess_room_draws 读出来的那一行（null = 没有），规则层不碰库。
 * 判定顺序和走子同一条链：状态 → 是不是这房的人 → 结算时钟 → 局面读得懂吗 →
 * 钟先走完没有 → 已经有一条没答复的提和没有。先判钟再判提和：钟归零的人
 * 连提和也不该提成，和"归零之后走一步合法也不作数"是同一个道理。
 */
function chess_room_draw_offer(array $room, $playerId, $nowMs, $pending = null) {
    $playerId = (int) $playerId;
    if ($room['status'] !== CHESS_ROOM_ACTIVE) {
        return ['room' => $room, 'offer' => null,
                'err' => $room['status'] === CHESS_ROOM_OVER ? 'room_over' : 'room_not_active'];
    }
    $side = chess_room_color_of($room, $playerId);
    if ($side === null) {
        return ['room' => $room, 'offer' => null, 'err' => 'not_room_member'];
    }
    $room = chess_room_tick($room, $nowMs);
    if (chess_engine_parse_fen($room['fen']) === null) {
        return ['room' => $room, 'offer' => null, 'err' => 'server'];
    }
    $flagged = chess_room_flagged($room, $nowMs);
    if ($flagged !== null) {
        $room['status'] = CHESS_ROOM_OVER;
        $room['result'] = 'timeout-' . ($flagged === CHESS_ENGINE_WHITE ? 'white' : 'black');
        $room['winner'] = chess_engine_other($flagged);
        return ['room' => $room, 'offer' => null, 'err' => 'flagged'];
    }
    if ($pending !== null) {
        // 已经有一条在等答复：不接受第二条，也不替对方点"接受"。
        // 界面看到这个 code 应该把那条提和摆出来让人答复。
        return ['room' => $room, 'offer' => null, 'err' => 'draw_pending'];
    }
    return ['room' => $room, 'offer' => ['by' => $side, 'at_ms' => (int) $nowMs], 'err' => null];
}

/**
 * 答复提和。只有没提过的那一方能答复 —— 提和的人自己点"接受"，
 * 等于单方面宣布和棋，所以那不是一种宽容，是必须挡住的一条。
 * 接受 = 和棋（result 'agreement'，没有胜者）；拒绝只清掉那条记录，
 * 局面、时钟、seq 都不动，棋照下。
 */
function chess_room_draw_answer(array $room, $playerId, $accept, $nowMs, $pending = null) {
    $playerId = (int) $playerId;
    $accept = (bool) $accept;
    if ($room['status'] !== CHESS_ROOM_ACTIVE) {
        return ['room' => $room, 'accepted' => false,
                'err' => $room['status'] === CHESS_ROOM_OVER ? 'room_over' : 'room_not_active'];
    }
    $side = chess_room_color_of($room, $playerId);
    if ($side === null) {
        return ['room' => $room, 'accepted' => false, 'err' => 'not_room_member'];
    }
    $room = chess_room_tick($room, $nowMs);
    if (chess_engine_parse_fen($room['fen']) === null) {
        return ['room' => $room, 'accepted' => false, 'err' => 'server'];
    }
    $flagged = chess_room_flagged($room, $nowMs);
    if ($flagged !== null) {
        $room['status'] = CHESS_ROOM_OVER;
        $room['result'] = 'timeout-' . ($flagged === CHESS_ENGINE_WHITE ? 'white' : 'black');
        $room['winner'] = chess_engine_other($flagged);
        return ['room' => $room, 'accepted' => false, 'err' => 'flagged'];
    }
    if ($pending === null) {
        return ['room' => $room, 'accepted' => false, 'err' => 'no_draw_offer'];
    }
    if ($pending['by'] === $side) {
        return ['room' => $room, 'accepted' => false, 'err' => 'not_your_offer'];
    }
    if (!$accept) {
        return ['room' => $room, 'accepted' => false, 'err' => null];
    }
    $room['status'] = CHESS_ROOM_OVER;
    $room['result'] = 'agreement';
    $room['winner'] = null;
    return ['room' => $room, 'accepted' => true, 'err' => null];
}

/**
 * 把时钟已经判出的结果写进房间。poll 是 GET，不能改库；超时的另一方可能源源不断地
 * 看着对方归零却不发一个 POST，那样这局在库里永远停在 active，棋谱导出会拿到半局。
 * 所以规则层给一个幂等的收尾：没人超时就原样返回，有人超时就结案。
 */
function chess_room_close(array $room, $nowMs) {
    if ($room['status'] !== CHESS_ROOM_ACTIVE) {
        return ['room' => $room, 'err' => null];
    }
    $room = chess_room_tick($room, $nowMs);
    $flagged = chess_room_flagged($room, $nowMs);
    if ($flagged === null) {
        return ['room' => $room, 'err' => null];
    }
    $room['status'] = CHESS_ROOM_OVER;
    $room['result'] = 'timeout-' . ($flagged === CHESS_ENGINE_WHITE ? 'white' : 'black');
    $room['winner'] = chess_engine_other($flagged);
    return ['room' => $room, 'err' => null];
}

/**
 * 两边客户端读的是同一份：局面、状态、还剩多少、轮到谁、有没有人在等答复的提和。
 * server_now_ms 让棋盘算出"服务器时刻 - 本机时刻"的差值再用本机时钟平滑显示 ——
 * 显示用的仍然是本机时钟，裁决用的永远是服务器算出来的那几个字段。
 * $names 由端点从 chess_players 查出来传进来（规则层不该知道昵称长什么样）。
 * $viewerId 决定 you：棋盘靠它知道该把哪个时钟放自己面前、能不能落子。
 * $drawBy 是端点从 chess_room_draws 读出来的提和方颜色；mine 让界面知道
 * 该显示"等对方答复"还是把接受/拒绝摆出来。
 */
function chess_room_public(array $room, $nowMs, array $names = [], $viewerId = null, $drawBy = null) {
    $nowMs = (int) $nowMs;
    $clock = chess_room_clock($room, $nowMs);
    $id = ['w' => (int) $room['white_player_id'], 'b' => (int) $room['black_player_id']];
    $you = chess_room_color_of($room, (int) $viewerId);
    return [
        'code' => $room['code'],
        'status' => $room['status'],
        'result' => $room['result'],
        'result_text' => $room['result'] === null
            ? null
            : (CHESS_ROOM_RESULTS[$room['result']] ?? $room['result']),
        'winner' => $room['winner'],
        'fen' => $room['fen'],
        'turn' => chess_room_turn($room),
        'you' => $you,
        'seq' => (int) $room['seq'],
        'time_ms' => (int) $room['time_ms'],
        'clock' => ['w' => $clock['w'], 'b' => $clock['b']],
        'flagged' => chess_room_flagged($room, $nowMs),
        // 只有进行中的局才报提和：终局之后那一条即使还没删，也不该再让人答复。
        'draw_offer' => ($room['status'] === CHESS_ROOM_ACTIVE && $drawBy !== null)
            ? ['by' => $drawBy, 'mine' => $you === $drawBy]
            : null,
        'server_now_ms' => $nowMs,
        'players' => [
            'w' => ['id' => $id['w'] ?: null, 'nickname' => $names[$id['w']] ?? null],
            'b' => ['id' => $id['b'] ?: null, 'nickname' => $names[$id['b']] ?? null],
        ],
    ];
}
