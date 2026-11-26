<?php
/**
 * 房间规则层的离线重放测试：不连数据库、不发 HTTP，纯函数进纯函数出。
 *
 *   D:/tmp/php81/php.exe tools/chess_room_core_test.php
 *   … --fixtures <目录> --quiet
 *
 * 为什么要单独立一个文件：线上那六个房间端点跑在共享主机上，本地既没有 MySQL 也
 * 没有会话，端点本身没法在这儿跑。所以把在线对弈里最容易错的四件事（该谁走、
 * 时钟怎么算、这步合不合法、什么时候算结束）全收在纯的规则层，这里用真棋谱重放验它。
 *
 * 主线是重放 games.jsonl：把 3733 手真棋按"两个人轮流下"过一遍 chess_room_move ——
 *   1. 每手之前先让"不该走的那一方"试一次，必须被 not_your_turn 挡下，且局面不动；
 *   2. 该走的一方走完，规则层算出的 FEN 与 JS 引擎导出的 next 逐字符相同；
 *   3. seq 严格 +1，事件里的 SAN 就是规范写法那一串；
 *   4. 每方的剩余时间恰好等于"该方走过的手数 × 每手 1000 毫秒"扣出来的值 ——
 *      这一条证明 tick 只烧轮到自己的那一份钟，不烧对方的。
 * 它顺带补上了走法对拍没覆盖的一块：对拍比的是"PHP 自己 parse 再 to_fen 是原样"，
 * 没比"PHP 走完这一手之后的局面 == JS 走完这一手之后的局面"。
 *
 * 这文件不部署：它在 tools/ 下，而只有 v1/ 会同步到服务器的 /api/v1/。
 */

require_once __DIR__ . '/../v1/chess_room_core.php';

$fixtures = dirname(__DIR__, 2) . '/chess-puter/src/chess/tests/fixtures';
for ($i = 1; $i < count($argv); $i++) {
    if ($argv[$i] === '--fixtures') {
        $fixtures = $argv[++$i] ?? $fixtures;
    } else {
        fwrite(STDERR, "unknown argument: {$argv[$i]}\n");
        exit(2);
    }
}
$gamesPath = $fixtures . '/games.jsonl';
if (!is_readable($gamesPath)) {
    fwrite(STDERR, "missing fixture: {$gamesPath}\n  run node tools/export-legality-fixture.mjs first\n");
    exit(2);
}

$checks = 0;
$failures = [];
$assert = static function ($cond, $label) use (&$checks, &$failures) {
    $checks++;
    if (!$cond) {
        $failures[] = $label;
    }
};

/**
 * 造一个"已经在下"的房间。规则和端点看到的房间就是这一个数组，
 * 字段和 chess_room_from_row 出来的完全一致（int/null 的口径也要一致）。
 */
$roomAt = static function (string $fen, int $white = 1, int $black = 2, int $timeMs = CHESS_ROOM_TIME_MS): array {
    return [
        'id' => 7,
        'code' => 'ABCDEF',
        'white_player_id' => $white,
        'black_player_id' => $black,
        'fen' => $fen,
        'status' => CHESS_ROOM_ACTIVE,
        'result' => null,
        'winner' => null,
        'time_ms' => $timeMs,
        'white_ms' => $timeMs,
        'black_ms' => $timeMs,
        'turn_started_ms' => 0,
        'seq' => 0,
    ];
};
/** 造一个等人的房间（起钟之前的状态）。 */
$waiting = static function (int $creatorId, string $creatorColor): array {
    $made = chess_room_new($creatorId, $creatorColor, CHESS_ROOM_TIME_MS, 'ABCDEF');
    return $made['room'];
};

/* ==========================================================================
 * 1. 房间码：字母表、生成、以及用户输入怎么收
 * ======================================================================== */
$alphabet = CHESS_ROOM_CODE_ALPHABET;
$assert(strlen($alphabet) === 32, 'room code alphabet is 32 chars');
foreach (['O', '0', 'I', '1'] as $bad) {
    $assert(strpos($alphabet, $bad) === false, "room code alphabet excludes {$bad}");
}
// L 故意留在字母表里：大写的 L 和数字 1 长得不像，去掉它只会少掉 1/24 的组合空间。
$assert(strpos($alphabet, 'L') !== false, 'room code alphabet keeps L');
$assert(count(array_count_values(str_split($alphabet))) === 32, 'room code alphabet has no repeats');

$seen = [];
for ($i = 0; $i < 5000; $i++) {
    $code = chess_room_code();
    $assert(strlen($code) === 6 && strspn($code, $alphabet) === 6, 'generated code is 6 valid chars');
    $seen[$code] = true;
}
$assert(count($seen) >= 4900, 'generated codes barely repeat (' . count($seen) . '/5000)');

foreach ([
    ['abcdef', 'ABCDEF'], [' ABC DEF ', 'ABCDEF'], ['ABCDEF', 'ABCDEF'], ['ab23cd', 'AB23CD'],
    ['ABCD34', 'ABCD34'], ['zzzzzz', 'ZZZZZZ'], ['222222', '222222'],
] as [$in, $want]) {
    $assert(chess_room_norm_code($in) === $want, "norm_code({$in}) = {$want}");
}
// O/0/I/1 是"看着像"的那几个：小写转大写之后它们落在字母表外，所以在门口就被拒，
// 而不是查一遍库回一个"找不到房间"。
foreach (['', 'ABCDE', 'ABCDEFG', 'ABODEF', 'AB0DEF', 'ABIDEF', 'AB1DEF', 'ABCDEF0', 'abc-opq', 'a b c d e f g', 'hello!', '12345'] as $in) {
    $assert(chess_room_norm_code($in) === '', 'norm_code rejects ' . var_export($in, true));
}
$assert(chess_room_norm_code(null) === '', 'norm_code(null) is empty');

/* ==========================================================================
 * 2. 开房间：颜色、时间边界、座位
 * ======================================================================== */
$asWhite = $waiting(1, 'w');
$assert($asWhite['white_player_id'] === 1 && $asWhite['black_player_id'] === null, 'creator taking white sits in the white seat');
$asBlack = $waiting(1, 'b');
$assert($asBlack['white_player_id'] === null && $asBlack['black_player_id'] === 1, 'creator taking black sits in the black seat');
foreach ([$asWhite, $asBlack] as $idx => $room) {
    $label = "room #{$idx}";
    $assert($room['status'] === CHESS_ROOM_WAITING, "{$label} starts waiting");
    $assert($room['fen'] === CHESS_ENGINE_START_FEN, "{$label} starts at the initial position");
    $assert($room['turn_started_ms'] === null, "{$label} does not run a clock while waiting");
    $assert($room['white_ms'] === CHESS_ROOM_TIME_MS && $room['black_ms'] === CHESS_ROOM_TIME_MS, "{$label} both clocks at full");
    $assert($room['seq'] === 0 && $room['result'] === null && $room['winner'] === null, "{$label} starts clean");
}

$got = ['w' => 0, 'b' => 0];
for ($i = 0; $i < 200; $i++) {
    $made = chess_room_new(1, 'random', CHESS_ROOM_TIME_MS);
    $room = $made['room'];
    $side = $room['white_player_id'] === 1 ? 'w' : 'b';
    $got[$side]++;
    $assert($made['err'] === null && in_array($side, ['w', 'b'], true), 'random resolves to a real seat');
    $assert(($room['black_player_id'] ?? null) === null || $room['black_player_id'] === 1, 'random leaves exactly one seat filled');
}
$assert($got['w'] > 40 && $got['b'] > 40, 'random color is not one-sided (' . $got['w'] . 'w/' . $got['b'] . 'b)');

foreach ([CHESS_ROOM_TIME_MIN_MS, CHESS_ROOM_TIME_MAX_MS] as $edge) {
    $made = chess_room_new(1, 'w', $edge);
    $assert($made['err'] === null && $made['room']['time_ms'] === $edge, "time {$edge} is inside the allowed range");
}
foreach ([CHESS_ROOM_TIME_MIN_MS - 1, 0, -5, CHESS_ROOM_TIME_MAX_MS + 1] as $edge) {
    $assert(chess_room_new(1, 'w', $edge)['err'] === 'bad_room_time', "time {$edge} is refused");
}
$assert(chess_room_new(1, 'x', CHESS_ROOM_TIME_MS)['err'] === 'bad_room_color', 'unknown color is refused');
$assert(chess_room_new(0, 'w', CHESS_ROOM_TIME_MS)['err'] === 'sign_in_required', 'nobody cannot open a room');

/* ==========================================================================
 * 3. 进房：座位、房主不能自己坐对面、起钟
 * ======================================================================== */
$joined = chess_room_join($asWhite, 2, 5000);
$assert($joined['err'] === null, 'second player joins a waiting room');
$assert($joined['seat'] === 'black_player_id', 'the open seat reported for a white-created room is black');
$assert($joined['room']['status'] === CHESS_ROOM_ACTIVE, 'joining activates the room');
$assert($joined['room']['turn_started_ms'] === 5000, 'the clock starts when the second player sits down');

$mirror = chess_room_join($asBlack, 2, 8000);
$assert($mirror['seat'] === 'white_player_id', 'the open seat reported for a black-created room is white');

$assert(chess_room_join($asWhite, 1, 1000)['err'] === 'room_full', 'the creator cannot take the seat opposite themselves');
$assert(chess_room_join($joined['room'], 3, 1000)['err'] === 'room_full', 'a third player cannot sit in an active room');
$over = $roomAt(CHESS_ENGINE_START_FEN);
$over['status'] = CHESS_ROOM_OVER;
$assert(chess_room_join($over, 3, 1000)['err'] === 'room_not_active', 'a finished room cannot be joined');
$assert(chess_room_join($joined['room'], 9, 1000)['err'] === 'room_full', 'joining an active room is full even for someone else');

/* ==========================================================================
 * 4. 时钟：只烧轮到自己的那一份
 * ======================================================================== */
$ticked = chess_room_tick($roomAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1, 2, 60000), 4500);
$assert($ticked['white_ms'] === 55500, 'white burns its own clock while it is white to move');
$assert($ticked['black_ms'] === 60000, 'black does not burn while it is not black to move');
$assert($ticked['turn_started_ms'] === 4500, 'tick re-bases the clock at the moment it settled');

$stale = $roomAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', 1, 2, 60000);
$stale['status'] = CHESS_ROOM_WAITING;
$assert(chess_room_tick($stale, 999999) === $stale, 'a waiting room never burns');
$done = $roomAt(CHESS_ENGINE_START_FEN);
$done['status'] = CHESS_ROOM_OVER;
$assert(chess_room_tick($done, 999999) === $done, 'a finished room never burns');
$paused = $roomAt(CHESS_ENGINE_START_FEN);
$paused['turn_started_ms'] = null;
$assert(chess_room_tick($paused, 999999) === $paused, 'no start stamp means nothing to settle');

$clamped = chess_room_tick($roomAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1, 2, 60000), 5000000);
$assert($clamped['white_ms'] === 0, 'a clock clamps at zero instead of going negative');

$shown = chess_room_clock($roomAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1, 2, 10000), 4000);
$assert($shown === ['w' => 6000, 'b' => 10000], 'the displayed clock counts down only the side to move');

$waitingView = $asWhite;
$assert(chess_room_clock($waitingView, 900000) === ['w' => CHESS_ROOM_TIME_MS, 'b' => CHESS_ROOM_TIME_MS],
    'a waiting room shows full clocks, not an elapsed count');

$flagRoom = $roomAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1, 2, 1000);
$assert(chess_room_flagged($flagRoom, 2000) === CHESS_ENGINE_WHITE, 'the side to move is the one that flags');
// 钟归零但轮不到他走 —— 不该判负（不动自己的钟就不可能输在时间上）
$sleeping = $roomAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', 1, 2, 600000);
$sleeping['white_ms'] = 0;
$sleeping['turn_started_ms'] = 0;
$assert(chess_room_flagged($sleeping, 100000) === null, 'a clock at zero for the side NOT to move is not a flag');
$assert(chess_room_flagged($done, 999999) === null, 'a finished room reports no flag');
$assert(chess_room_flagged($asWhite, 999999) === null, 'a waiting room reports no flag');
$assert(chess_room_flagged($flagRoom, 500) === null, 'before the clock runs out nobody has flagged');

/* ==========================================================================
 * 5. 走子前的每道门：状态、身份、该谁、合法与否
 * ======================================================================== */
$room = $roomAt(CHESS_ENGINE_START_FEN);
$san = 'e4';

$wrongSeat = chess_room_move($room, 3, $san, 1000);
$assert($wrongSeat['err'] === 'not_room_member', 'a stranger cannot move in someone else’s room');
$assert($wrongSeat['event'] === null, 'a rejected move produces no event');
$assert($wrongSeat['room']['fen'] === CHESS_ENGINE_START_FEN, 'a stranger’s attempt leaves the position alone');

$notYet = chess_room_move($asWhite, 1, $san, 1000);
$assert($notYet['err'] === 'room_not_active', 'no moves before the second player sits down');
$finished = $roomAt(CHESS_ENGINE_START_FEN);
$finished['status'] = CHESS_ROOM_OVER;
$assert(chess_room_move($finished, 1, $san, 1000)['err'] === 'room_over', 'no moves after the game is over');

// e5 是黑方的兵、Qxd8 被自己的兵挡着、O-O 此时没资格、Nxh9 没有这个格子 ——
// 都不合法；e2e4/Nb1c3 是 UCI 写法，同一手棋但引擎只认规范 SAN。
foreach (['e5', 'Qxd8', 'O-O', '', '  ', ' nonsense', 'e4e4', 'Nxh9', 'e2e4', 'Nb1c3', 'Pe4', 'e4+', 'e4++'] as $bad) {
    $refused = chess_room_move($room, 1, $bad, 1000);
    $assert($refused['err'] === 'illegal_move', 'refuses not-legal-or-not-canonical SAN: ' . var_export($bad, true));
    $assert($refused['room']['fen'] === CHESS_ENGINE_START_FEN, 'a refused move leaves the position alone');
    $assert($refused['room']['seq'] === 0, 'a refused move does not advance seq');
}

$corrupt = chess_room_move($roomAt('this is not a fen', 1, 2), 1, $san, 1000);
$assert($corrupt['err'] === 'server', 'a position the server itself cannot read is the server’s fault, not the player’s');

$turnProbe = $roomAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1');
$assert(chess_room_turn($turnProbe) === CHESS_ENGINE_BLACK, 'turn comes from the position, not from a cached field');
$assert(chess_room_turn($roomAt('garbage')) === null, 'an unreadable position has no turn');

$tooLate = $roomAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1, 2, 1000);
$flagged = chess_room_move($tooLate, 1, $san, 5000);
$assert($flagged['err'] === 'flagged', 'a legal move played after the clock hit zero does not count');
$assert($flagged['room']['status'] === CHESS_ROOM_OVER, 'the flag closes the room');
$assert($flagged['room']['result'] === 'timeout-white', 'the flag is recorded as white flagging');
$assert($flagged['room']['winner'] === CHESS_ENGINE_BLACK, 'black wins on a white flag');
$assert($flagged['room']['fen'] === CHESS_ENGINE_START_FEN, 'the flagged move is not played');
$assert($flagged['event'] === null, 'a flagged move writes no event');
$assert($flagged['room']['white_ms'] === 0, 'the flagged clock is settled to zero in the returned room');

/* ==========================================================================
 * 6. 一手成功的走子：seq、事件内容、时钟结算
 * ======================================================================== */
$played = chess_room_move($room, 1, $san, 2500);
$assert($played['err'] === null, 'white opens with e4');
$assert($played['room']['fen'] === 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 'e4 reaches the expected position');
$assert($played['room']['seq'] === 1, 'one accepted move advances seq by exactly one');
$assert($played['room']['turn_started_ms'] === 2500, 'the clock re-bases when the move is accepted');
$assert($played['room']['white_ms'] === CHESS_ROOM_TIME_MS - 2500, 'white paid for its own thinking time');
$assert($played['room']['black_ms'] === CHESS_ROOM_TIME_MS, 'black has not started paying yet');
$assert($played['event']['seq'] === 1, 'the event carries the new seq');
$assert($played['event']['san'] === $san, 'the event stores the canonical SAN it accepted');
$assert($played['event']['fen_after'] === $played['room']['fen'], 'the event’s position is the position the room ended up in');
$assert($played['event']['played_by'] === 1, 'the event records who played it');
$assert($played['event']['clock'] === chess_room_clock($played['room'], 2500), 'the event carries the clocks at that moment');
$assert($played['event']['status'] === CHESS_ROOM_ACTIVE, 'the event records that play continues');
$assert($played['event']['result'] === null && $played['event']['winner'] === null, 'an ordinary move decides nothing');
$assert(chess_room_color_of($played['room'], 1) === CHESS_ENGINE_WHITE, 'white is still white after the move');

$blackAnswer = chess_room_move($played['room'], 2, 'e5', 6000);
$assert($blackAnswer['err'] === null, 'black answers e5');
$assert($blackAnswer['room']['seq'] === 2, 'seq keeps counting up');
$assert($blackAnswer['room']['black_ms'] === CHESS_ROOM_TIME_MS - 3500, 'black pays from when it sat down, not from game start');

$again = chess_room_move($blackAnswer['room'], 1, 'e4', 7000);
$assert($again['err'] === 'illegal_move', 'the same move played twice in a row is refused');
$assert(chess_room_move($blackAnswer['room'], 1, 'Nf3', 7000)['err'] === null, 'white can still play a real move');

/* ==========================================================================
 * 7. 结束条件：将死、逼和、认输、超时结案
 * ======================================================================== */
$mate = chess_room_move($roomAt('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', 1, 2), 1, 'Ra8#', 1000);
$assert($mate['err'] === null, 'the mating move is accepted');
$assert($mate['room']['status'] === CHESS_ROOM_OVER, 'checkmate ends the room');
$assert($mate['room']['result'] === 'checkmate', 'the result is checkmate');
$assert($mate['room']['winner'] === CHESS_ENGINE_WHITE, 'white wins the mate');
$assert($mate['event']['status'] === CHESS_ROOM_OVER && $mate['event']['result'] === 'checkmate',
    'the event that ends the game says so');

$out = chess_room_outcome('R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1');
$assert($out['over'] && $out['result'] === 'checkmate' && $out['winner'] === CHESS_ENGINE_WHITE, 'outcome reads a mate on the board');
$out = chess_room_outcome('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
$assert($out['over'] && $out['result'] === 'stalemate' && $out['winner'] === null, 'outcome reads a stalemate as a draw');
$out = chess_room_outcome(CHESS_ENGINE_START_FEN);
$assert(!$out['over'], 'the opening position is not over');
$out = chess_room_outcome('not a fen');
$assert(!$out['over'] && $out['result'] === null, 'an unreadable position is not declared over');

$giveUp = chess_room_resign($roomAt('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 1, 2), 2, 9000);
$assert($giveUp['err'] === null, 'black resigns');
$assert($giveUp['room']['status'] === CHESS_ROOM_OVER, 'resigning closes the room');
$assert($giveUp['room']['result'] === 'resign-black', 'the result names who resigned');
$assert($giveUp['room']['winner'] === CHESS_ENGINE_WHITE, 'white wins a black resignation');
$assert($giveUp['room']['seq'] === 0, 'resigning does not advance seq (it is not a move)');
$assert($giveUp['room']['black_ms'] === CHESS_ROOM_TIME_MS - 9000, 'the resigning side still paid its own time');
$assert(chess_room_resign($roomAt(CHESS_ENGINE_START_FEN), 3, 1000)['err'] === 'not_room_member', 'a stranger cannot resign your game');
$assert(chess_room_resign($giveUp['room'], 2, 1000)['err'] === 'room_over', 'you cannot resign twice');
$assert(chess_room_resign($asWhite, 1, 1000)['err'] === 'room_not_active', 'you cannot resign before the game starts');

$closed = chess_room_close($roomAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', 1, 2, 1000), 7000);
$assert($closed['err'] === null && $closed['room']['result'] === 'timeout-black', 'close finalizes a black flag');
$assert($closed['room']['winner'] === CHESS_ENGINE_WHITE, 'close names the winner on a flag');
$assert($closed['room']['status'] === CHESS_ROOM_OVER, 'close leaves the room over');
$unchanged = chess_room_close($roomAt(CHESS_ENGINE_START_FEN, 1, 2, 60000), 1000);
$assert($unchanged['err'] === null && $unchanged['room']['status'] === CHESS_ROOM_ACTIVE, 'close with time left changes nothing');
$assert($unchanged['room']['white_ms'] === 59000, 'close still settles the running clock');
$assert($closed['room']['seq'] === 0, 'close does not advance seq');
foreach ([$asWhite, $done] as $idx => $room) {
    $result = chess_room_close($room, 999999);
    $assert($result['room'] === $room, "close leaves room #{$idx} alone");
}

/* ==========================================================================
 * 8. 给客户端看的那一份：字段、身份、结果文案
 * ======================================================================== */
$live = chess_room_join($asWhite, 2, 1000)['room'];
$live = chess_room_move($live, 1, 'e4', 4000)['room'];
$view = chess_room_public($live, 6000, [1 => 'Ada', 2 => 'Joe'], 2);
$assert($view['code'] === 'ABCDEF', 'the view carries the room code');
$assert($view['you'] === CHESS_ENGINE_BLACK, 'the view tells each player which side they are');
$assert($view['turn'] === CHESS_ENGINE_BLACK, 'the view says whose move it is');
$assert($view['seq'] === 1 && $view['status'] === CHESS_ROOM_ACTIVE, 'the view carries seq and status');
$assert($view['clock'] === chess_room_clock($live, 6000), 'the view’s clocks match the rules layer');
// 白在 1000 坐下、4000 走了一手（付 3000）；黑 1000 坐下、轮到它一直到 6000（付 2000）
$assert($view['clock'] === ['w' => CHESS_ROOM_TIME_MS - 3000, 'b' => CHESS_ROOM_TIME_MS - 2000],
    'the view’s clocks are the arithmetic they should be');
$assert($view['flagged'] === null, 'nobody has flagged in the view');
$assert($view['server_now_ms'] === 6000, 'the view stamps the server clock for client-side offset');
$assert($view['fen'] === $live['fen'], 'the view carries the position');
$assert($view['players']['w'] === ['id' => 1, 'nickname' => 'Ada'], 'the view names white');
$assert($view['players']['b'] === ['id' => 2, 'nickname' => 'Joe'], 'the view names black');
$assert(chess_room_public($live, 6000, [], 2)['players']['w']['nickname'] === null, 'a missing nickname stays null instead of an empty string');
$assert(chess_room_public($live, 6000, [], 0)['you'] === null, 'a viewer who is not in the room has no side');
$assert(chess_room_public($asWhite, 6000, [], 1)['players']['b']['id'] === null, 'an empty seat has no player id');
$assert(chess_room_public($mate['room'], 6000, [], 1)['result_text'] === CHESS_ROOM_RESULTS['checkmate'], 'the view spells out the result');
$assert(chess_room_public($live, 6000, [], 1)['result_text'] === null, 'a running game has no result text');
foreach (array_keys(CHESS_ROOM_RESULTS) as $key) {
    $row = $roomAt(CHESS_ENGINE_START_FEN);
    $row['status'] = CHESS_ROOM_OVER;
    $row['result'] = $key;
    $assert(chess_room_public($row, 0, [], 1)['result_text'] === CHESS_ROOM_RESULTS[$key], "result text exists for {$key}");
}

/* ==========================================================================
 * 9. 提和：谁都能提、一房一条、只有对面能答复、超时优先于和棋
 * ======================================================================== */
$drawRoom = $roomAt(CHESS_ENGINE_START_FEN, 1, 2);
$offer = chess_room_draw_offer($drawRoom, 1, 1000);
$assert($offer['err'] === null, 'white can offer a draw');
$assert($offer['offer']['by'] === CHESS_ENGINE_WHITE, 'the offer records who made it');
$assert($offer['offer']['at_ms'] === 1000, 'the offer stamps the moment it was made');
$assert($offer['room']['seq'] === 0 && $offer['room']['fen'] === CHESS_ENGINE_START_FEN,
    'offering changes neither seq nor position');
$assert($offer['room']['white_ms'] === CHESS_ROOM_TIME_MS - 1000, 'offering still settles the clock');
$assert(chess_room_draw_offer($drawRoom, 3, 1000)['err'] === 'not_room_member',
    'a stranger cannot offer a draw in someone else’s room');
$assert(chess_room_draw_offer($drawRoom, 1, 1000, ['by' => CHESS_ENGINE_BLACK])['err'] === 'draw_pending',
    'a second offer waits for an answer instead of stacking');
$assert(chess_room_draw_offer($drawRoom, 1, 1000, ['by' => CHESS_ENGINE_WHITE])['err'] === 'draw_pending',
    'even the same side cannot offer twice');
$assert(chess_room_draw_offer($asWhite, 1, 1000)['err'] === 'room_not_active',
    'a waiting room has nothing to agree to');
$overRoom = $roomAt(CHESS_ENGINE_START_FEN);
$overRoom['status'] = CHESS_ROOM_OVER;
$assert(chess_room_draw_offer($overRoom, 1, 1000)['err'] === 'room_over', 'a finished game takes no offers');

$answered = chess_room_draw_answer($drawRoom, 2, true, 2000, ['by' => CHESS_ENGINE_WHITE]);
$assert($answered['err'] === null && $answered['accepted'] === true, 'the opponent can accept');
$assert($answered['room']['status'] === CHESS_ROOM_OVER, 'accepting ends the game');
$assert($answered['room']['result'] === 'agreement', 'the result is agreement');
$assert($answered['room']['winner'] === null, 'agreement has no winner');
$assert($answered['room']['seq'] === 0, 'accepting does not advance seq');
$assert($answered['room']['white_ms'] === CHESS_ROOM_TIME_MS - 2000,
    'accepting settles the clock of the side to move, not the one answering');

$declined = chess_room_draw_answer($drawRoom, 2, false, 2000, ['by' => CHESS_ENGINE_WHITE]);
$assert($declined['err'] === null && $declined['accepted'] === false, 'the opponent can decline');
$assert($declined['room']['status'] === CHESS_ROOM_ACTIVE && $declined['room']['result'] === null,
    'declining leaves the game running');
$assert($declined['room']['fen'] === CHESS_ENGINE_START_FEN && $declined['room']['seq'] === 0,
    'declining changes no chess at all');

$assert(chess_room_draw_answer($drawRoom, 1, true, 2000, ['by' => CHESS_ENGINE_WHITE])['err'] === 'not_your_offer',
    'the offerer cannot accept their own offer');
$assert(chess_room_draw_answer($drawRoom, 2, true, 2000, null)['err'] === 'no_draw_offer',
    'answering nothing is refused');
$assert(chess_room_draw_answer($drawRoom, 3, true, 2000, ['by' => CHESS_ENGINE_WHITE])['err'] === 'not_room_member',
    'a stranger cannot answer for somebody else');
$assert(chess_room_draw_answer($overRoom, 2, true, 2000, ['by' => CHESS_ENGINE_WHITE])['err'] === 'room_over',
    'a finished game takes no answers');

// 黑该走、黑只剩 1 秒：到第 7 秒，提和的和答复的都该先读到"黑超时"。
$flagDraw = $roomAt('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', 1, 2, 1000);
$lateOffer = chess_room_draw_offer($flagDraw, 2, 7000);
$assert($lateOffer['err'] === 'flagged', 'a draw offer after the clock ran out is not an offer');
$assert($lateOffer['room']['result'] === 'timeout-black', 'the flag decides the game, not the offer');
$lateAnswer = chess_room_draw_answer($flagDraw, 1, true, 7000, ['by' => CHESS_ENGINE_BLACK]);
$assert($lateAnswer['err'] === 'flagged', 'accepting after the opponent’s flag fell does not save them');
$assert($lateAnswer['room']['result'] === 'timeout-black', 'the flag still decides the game');

$drawView = chess_room_public($drawRoom, 1000, [], 2, CHESS_ENGINE_WHITE);
$assert($drawView['draw_offer'] === ['by' => 'w', 'mine' => false],
    'the other side sees the pending offer as theirs to answer');
$assert(chess_room_public($drawRoom, 1000, [], 1, CHESS_ENGINE_WHITE)['draw_offer']['mine'] === true,
    'the offering side sees it as its own');
$assert(chess_room_public($drawRoom, 1000, [], 2)['draw_offer'] === null,
    'no offer is null, not an empty object');
$assert(chess_room_public($answered['room'], 1000, [], 2, CHESS_ENGINE_WHITE)['draw_offer'] === null,
    'a finished game does not carry an offer');

/* ==========================================================================
 * 10. 主线：真棋谱逐手重放
 * ======================================================================== */
$lines = [];
$handle = fopen($gamesPath, 'r');
while (($line = fgets($handle)) !== false) {
    $line = trim($line);
    if ($line === '') {
        continue;
    }
    $decoded = json_decode($line, true);
    if (!is_array($decoded) || !isset($decoded['fen'], $decoded['san'], $decoded['next'])) {
        fwrite(STDERR, "bad fixture line: " . substr($line, 0, 80) . "\n");
        exit(2);
    }
    $lines[] = $decoded;
}
fclose($handle);
if (!$lines) {
    fwrite(STDERR, "fixture is empty: {$gamesPath}\n");
    exit(2);
}

$PLY_MS = 1000;
$replay = [
    'plies' => 0, 'runs' => 0, 'wrongTurnRefused' => 0, 'gamesEnded' => 0,
    'byResult' => [], 'whitePlies' => 0, 'blackPlies' => 0, 'drift' => 0,
];
// 每方每小时的上限：一局长棋 400 手 × 1000 毫秒也才 400 秒，重放里不该出现超时，
// 出现了就说明烧钟烧错了边。
$roomTime = CHESS_ROOM_TIME_MAX_MS;

$run = [];
$flush = static function (array $run) use (&$replay, $assert, $roomAt, $PLY_MS, $roomTime) {
    if (!$run) {
        return;
    }
    $replay['runs']++;
    $room = $roomAt($run[0]['fen'], 1, 2, $roomTime);
    $now = 0;
    $paid = ['w' => 0, 'b' => 0];

    foreach ($run as $index => $line) {
        if ($room['fen'] !== $line['fen']) {
            $replay['drift']++;
            $assert(false, "replay drifted off the score at ply {$index}: {$room['fen']} != {$line['fen']}");
            return;
        }
        $turn = chess_room_turn($room);
        $mover = $turn === CHESS_ENGINE_WHITE ? 1 : 2;
        $other = $turn === CHESS_ENGINE_WHITE ? 2 : 1;
        $now += $PLY_MS;

        $probe = chess_room_move($room, $other, $line['san'], $now);
        if ($probe['err'] === 'not_your_turn') {
            $replay['wrongTurnRefused']++;
        }
        $assert($probe['err'] === 'not_your_turn', 'ply ' . $replay['plies'] . ': the side not to move was refused, got ' . var_export($probe['err'], true));
        $assert($probe['room']['fen'] === $line['fen'] && $probe['room']['seq'] === $room['seq'],
            'ply ' . $replay['plies'] . ': a refused attempt leaves position and seq untouched');

        $step = chess_room_move($room, $mover, $line['san'], $now);
        $assert($step['err'] === null, 'ply ' . $replay['plies'] . " ({$line['san']}): accepted, got " . var_export($step['err'], true));
        if ($step['err'] !== null) {
            return;
        }
        $room = $step['room'];
        $replay['plies']++;
        $paid[$turn]++;
        if ($turn === CHESS_ENGINE_WHITE) {
            $replay['whitePlies']++;
        } else {
            $replay['blackPlies']++;
        }

        $assert($room['fen'] === $line['next'], 'ply ' . $replay['plies'] . " ({$line['san']}): the position after the move must equal the JS engine’s");
        $assert($room['seq'] === $index + 1, 'ply ' . $replay['plies'] . ': seq counts accepted moves, one per ply');
        $assert($step['event']['san'] === $line['san'], 'ply ' . $replay['plies'] . ': the stored SAN is the fixture’s own');
        $assert($step['event']['fen_after'] === $line['next'], 'ply ' . $replay['plies'] . ': the stored position is the one played to');
        $assert($step['event']['played_by'] === $mover, 'ply ' . $replay['plies'] . ': the event records the mover');

        if ($room['status'] === CHESS_ROOM_OVER) {
            $assert($index === count($run) - 1, 'ply ' . $replay['plies'] . ': the game ended mid-score, the fixture kept playing');
            break;
        }
    }

    $whitePays = $paid['w'];
    $blackPays = $paid['b'];
    $assert($room['white_ms'] === $roomTime - $whitePays * $PLY_MS,
        'a game burned white exactly ' . $whitePays . " plies × {$PLY_MS}ms, got {$room['white_ms']}");
    $assert($room['black_ms'] === $roomTime - $blackPays * $PLY_MS,
        'a game burned black exactly ' . $blackPays . " plies × {$PLY_MS}ms, got {$room['black_ms']}");
    $assert($room['white_ms'] > 0 && $room['black_ms'] > 0, 'no game in the corpus ran out of clock');

    if ($room['status'] === CHESS_ROOM_OVER) {
        $replay['gamesEnded']++;
        $result = (string) $room['result'];
        $replay['byResult'][$result] = ($replay['byResult'][$result] ?? 0) + 1;
        $assert($result === 'checkmate' || $result === 'stalemate', "a game ended by {$result}");
    }
};

foreach ($lines as $line) {
    if (!$run) {
        $run[] = $line;
        continue;
    }
    $last = $run[count($run) - 1];
    // 上一手的局面 == 这一手的局面 ⇒ 还在同一盘棋里
    if ($last['next'] === $line['fen']) {
        $run[] = $line;
        continue;
    }
    $flush($run);
    $run = [$line];
}
$flush($run);

ksort($replay['byResult']);

/* ==========================================================================
 * 汇总
 * ======================================================================== */
printf("games.jsonl      %d plies read\n", count($lines));
printf("replayed         games %d / plies %d (white %d, black %d)\n",
    $replay['runs'], $replay['plies'], $replay['whitePlies'], $replay['blackPlies']);
printf("wrong-turn probe %d attempts refused\n", $replay['wrongTurnRefused']);
printf("ended on board   %d (%s)\n", $replay['gamesEnded'],
    $replay['byResult'] ? implode(', ', array_map(static fn ($k, $v) => "{$k} x{$v}", array_keys($replay['byResult']), $replay['byResult'])) : 'none');
printf("replay drift     %d\n", $replay['drift']);
printf("checks           %d\n", $checks);

if ($failures) {
    fwrite(STDERR, "\nFAILURES " . count($failures) . " (first 20)\n");
    foreach (array_slice($failures, 0, 20) as $failure) {
        fwrite(STDERR, '  - ' . $failure . "\n");
    }
    exit(1);
}
echo "\nAGREES: the room rules layer replays the whole corpus clean\n";
exit(0);
