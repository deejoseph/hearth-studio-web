<?php
/**
 * PHP/JS 走法对拍：拿棋盘 JS 引擎自己导出的 fixture，逐条比 PHP 裁判的答案。
 *
 *   D:/tmp/php81/php.exe tools/chess_engine_audit.php
 *   … tools/chess_engine_audit.php --fixtures <目录> --limit 2000 --skip-perft
 *
 * fixture 由 chess-puter/src/chess/tools/export-legality-fixture.mjs 生成，
 * 三个文件：
 *   legal.jsonl  {fen, uci[], san[], check}   一个局面的全部合法走法
 *   games.jsonl  {fen, san, next}             一手棋和走完之后的局面
 *   perft.json   各种深度的节点数，含仓库之外发表过的参考值
 *
 * 比的是四件事，缺一不可：
 *   1. 同一局面两边列出的合法走法集合完全相同（不比顺序，比集合 —— 服务器只
 *      关心"这步能不能走"，顺序是界面事）。
 *   2. 每个走法写出来的 SAN 完全相同（消歧、+/#、O-O、=Q 的写法）。
 *   3. PHP 的 SAN 解析能还原出同一手棋，且走完之后的 FEN 逐字符相同 —— 这条
 *      管的是易位权利、吃过路兵格、50 步和回合计数有没有更新错。
 *   4. FEN 解析再序列化回来是原样（规范化口径一致），以及 perft 节点数。
 *
 * 顺序不比 = 排序后比集合；其余全部严格相等。任何一条对不上都是 bug，退出码 1。
 * 这文件不部署：它在 tools/ 下，而只有 v1/ 会同步到服务器的 /api/v1/。
 */

require_once __DIR__ . '/../v1/chess_engine.php';

$argv0 = array_shift($argv);
$fixtures = null;
$limit = 0;
$skipPerft = false;
for ($i = 0; $i < count($argv); $i++) {
    $flag = $argv[$i];
    if ($flag === '--fixtures') {
        $fixtures = $argv[++$i] ?? null;
    } elseif ($flag === '--limit') {
        $limit = (int) ($argv[++$i] ?? 0);
    } elseif ($flag === '--skip-perft') {
        $skipPerft = true;
    } else {
        fwrite(STDERR, "unknown argument: {$flag}\n");
        exit(2);
    }
}
if ($fixtures === null) {
    // 默认在隔壁那个仓库里 —— 走法的标准由它定，fixture 不该复制一份到这边。
    $fixtures = dirname(__DIR__, 2)
        . '/chess-puter/src/chess/tests/fixtures';
}
foreach (['legal.jsonl', 'games.jsonl', 'perft.json'] as $name) {
    $path = $fixtures . '/' . $name;
    if (!is_readable($path)) {
        fwrite(STDERR, "missing fixture: {$path}\n  run node tools/export-legality-fixture.mjs first\n");
        exit(2);
    }
}

/** 失败样本攒着，最后统一打印；前 20 条够定位，多打印只是刷屏。 */
const AUDIT_SAMPLES = 20;

$counts = [
    'positions' => 0,
    'movesCompared' => 0,
    'ply' => 0,
    'fenRoundTrip' => 0,
    'perftRows' => 0,
];
$problems = [];
$coverage = [
    'positionsInCheck' => 0, 'positionsWithEpSquare' => 0, 'terminalPositions' => 0,
    'sanCastleKings' => 0, 'sanCastleQueens' => 0, 'sanPromotions' => 0,
    'sanChecks' => 0, 'sanMates' => 0, 'sanDisambiguated' => 0,
    'sanFullSquareDisambiguated' => 0,
];

/**
 * 三个同子都能到同一格时，SAN 必须写完整出发格（`Nd2e4`）。这一支只有专门摆的
 * 局面才会出现，所以单独计数，让它有没有被测到一眼可见。
 */
function audit_full_square_disambiguated(string $san): bool {
    $m = [];
    if (!preg_match('/^([KQRBN])([a-h1-8]{0,2})(x?)([a-h][1-8])([+#]?)$/', $san, $m)) {
        return false;
    }
    return preg_match('/^[a-h][1-8]$/', $m[2]) === 1;
}

/**
 * SAN 里除棋子字母和目标格之外还剩点什么，就是消歧：`Nbd2`、`R1a3`、`Nba5x`…
 * `Nxe4` 不算 —— 那是吃子的 x。
 */
function audit_disambiguated(string $san): bool {
    $m = [];
    if (!preg_match('/^([KQRBN])([a-h1-8]{0,2})(x?)([a-h][1-8])([+#]?)$/', $san, $m)) {
        return false;
    }
    return strlen($m[2]) > 0;
}

function note(array &$problems, string $kind, string $detail, int $cap = AUDIT_SAMPLES) {
    $seen = 0;
    foreach ($problems as $p) {
        if ($p['kind'] === $kind) $seen++;
    }
    if ($seen < $cap) {
        $problems[] = ['kind' => $kind, 'detail' => $detail];
    }
}

/** PHP 列的合法走法，两种写法各一份，都排好序 —— 比集合不比顺序。 */
function php_answer(array $pos): array {
    $legal = chess_engine_legal_moves($pos);
    $uci = [];
    $san = [];
    foreach ($legal as $move) {
        $uci[] = chess_engine_index_to_square($move['from'])
            . chess_engine_index_to_square($move['to'])
            . ($move['promotion'] ?? '');
        $san[] = chess_engine_to_san($pos, $move, $legal);
    }
    sort($uci);
    sort($san);
    return [$legal, $uci, $san];
}

function same_list(array $a, array $b): bool {
    return count($a) === count($b) && array_diff($a, $b) === [] && array_diff($b, $a) === [];
}

/** 两边差在哪：只少了什么、只多了什么，各取前 8 个。 */
function diff_list(array $want, array $got): string {
    $missing = array_slice(array_values(array_diff($want, $got)), 0, 8);
    $extra = array_slice(array_values(array_diff($got, $want)), 0, 8);
    return 'js-only[' . implode(' ', $missing) . '] php-only[' . implode(' ', $extra) . ']';
}

/* ------------------------------------------------------------------ */
/* 1 + 2 + 4：每个局面，合法走法集合、SAN、FEN 往返                     */
/* ------------------------------------------------------------------ */

$fh = fopen($fixtures . '/legal.jsonl', 'r');
while (($line = fgets($fh)) !== false) {
    $line = trim($line);
    if ($line === '') {
        continue;
    }
    if ($limit && $counts['positions'] >= $limit) {
        break;
    }
    $want = json_decode($line, true);
    if ($want === null) {
        note($problems, 'fixture unreadable', 'legal.jsonl line ' . ($counts['positions'] + 1));
        continue;
    }
    $counts['positions']++;
    $fen = $want['fen'];

    $pos = chess_engine_parse_fen($fen);
    if ($pos === null) {
        note($problems, 'fen rejected', $fen);
        continue;
    }
    $back = chess_engine_to_fen($pos);
    if ($back !== $fen) {
        note($problems, 'fen round-trip', "want {$fen} got {$back}");
    } else {
        $counts['fenRoundTrip']++;
    }

    $inCheck = chess_engine_in_check($pos, $pos['turn']);
    if ($inCheck !== $want['check']) {
        note($problems, 'check flag', $fen . ' js=' . var_export($want['check'], true)
            . ' php=' . var_export($inCheck, true));
    }

    list(, $uci, $san) = php_answer($pos);
    $counts['movesCompared'] += count($want['uci']);

    if (!same_list($want['uci'], $uci)) {
        note($problems, 'legal move list', $fen . ' ' . diff_list($want['uci'], $uci));
        continue;
    }
    if (!same_list($want['san'], $san)) {
        note($problems, 'SAN spelling', $fen . ' ' . diff_list($want['san'], $san));
    }

    foreach ($want['san'] as $s) {
        if ($s === 'O-O' || $s === 'O-O+') $coverage['sanCastleKings']++;
        if (strpos($s, 'O-O-O') === 0) $coverage['sanCastleQueens']++;
        if (audit_disambiguated($s)) $coverage['sanDisambiguated']++;
        if (audit_full_square_disambiguated($s)) $coverage['sanFullSquareDisambiguated']++;
        if (strpos($s, '=') !== false) $coverage['sanPromotions']++;
        if (substr($s, -1) === '#') $coverage['sanMates']++;
        elseif (substr($s, -1) === '+') $coverage['sanChecks']++;
    }
    if ($want['uci'] === []) {
        $coverage['terminalPositions']++;
    }
    if ($want['check']) {
        $coverage['positionsInCheck']++;
    }
    if (explode(' ', $fen)[3] !== '-') {
        $coverage['positionsWithEpSquare']++;
    }
}
fclose($fh);

/* ------------------------------------------------------------------ */
/* 3：SAN 解析 + 走完之后                                            */
/* ------------------------------------------------------------------ */

$fh = fopen($fixtures . '/games.jsonl', 'r');
while (($line = fgets($fh)) !== false) {
    $line = trim($line);
    if ($line === '') {
        continue;
    }
    $row = json_decode($line, true);
    $counts['ply']++;
    $pos = chess_engine_parse_fen($row['fen']);
    if ($pos === null) {
        note($problems, 'game fen rejected', $row['fen'] . ' ' . $row['san']);
        continue;
    }

    $move = chess_engine_from_san($pos, $row['san']);
    if ($move === null) {
        // 是"这步不合法"还是"合法但我认不出这个写法"？把 PHP 自己写出来的那批
        // SAN 里最像的列出来，一眼就能分清。
        list(, , $sans) = php_answer($pos);
        $tail = substr($row['san'], -2);
        $near = array_values(array_filter($sans, function ($s) use ($tail) {
            return substr($s, -2) === $tail;
        }));
        note($problems, 'SAN not parsed', $row['fen'] . ' ' . $row['san']
            . ' php-sans[' . implode(' ', array_slice($near, 0, 8)) . ']');
        continue;
    }
    $next = chess_engine_to_fen(chess_engine_move($pos, $move));
    if ($next !== $row['next']) {
        note($problems, 'fen after move', $row['fen'] . ' ' . $row['san']
            . "\n    js  {$row['next']}\n    php {$next}");
    }
}
fclose($fh);

/* ------------------------------------------------------------------ */
/* 4：perft —— 生成器有没有在更深的树里漏掉/多出走法                   */
/* ------------------------------------------------------------------ */

/** 纯计数：走到 $depth 层一共有多少个叶子。 */
function audit_perft(array $pos, int $depth): int {
    if ($depth === 0) {
        return 1;
    }
    $nodes = 0;
    foreach (chess_engine_legal_moves($pos) as $move) {
        $next = chess_engine_move($pos, $move);
        $nodes += $depth === 1 ? 1 : audit_perft($next, $depth - 1);
    }
    return $nodes;
}

if (!$skipPerft) {
    $rows = json_decode(file_get_contents($fixtures . '/perft.json'), true);
    foreach ($rows as $row) {
        $counts['perftRows']++;
        foreach ($row['depths'] as $entry) {
            if ($entry['nodes'] !== $entry['reference'] && $entry['reference'] !== null) {
                note($problems, 'fixture perft vs published', $row['fen']
                    . ' depth ' . $entry['depth'] . ' js=' . $entry['nodes']
                    . ' published=' . $entry['reference']);
                continue;
            }
            $got = audit_perft(chess_engine_parse_fen($row['fen']), $entry['depth']);
            if ($got !== $entry['nodes']) {
                note($problems, 'perft nodes', $row['fen'] . ' depth ' . $entry['depth']
                    . ' js=' . $entry['nodes'] . ' php=' . $got);
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* 报告                                                              */
/* ------------------------------------------------------------------ */

$byKind = [];
foreach ($problems as $p) {
    $byKind[$p['kind']] = ($byKind[$p['kind']] ?? 0) + 1;
}
echo "compared\n";
foreach ($counts as $label => $n) {
    echo "  {$label}: {$n}\n";
}
echo "notation features seen in legal.jsonl\n";
foreach ($coverage as $label => $n) {
    echo "  {$label}: {$n}\n";
}
echo "mismatches: " . count($problems) . "\n";
if ($byKind) {
    foreach ($byKind as $kind => $n) {
        echo "  {$kind}: {$n}\n";
    }
    echo "\nfirst samples\n";
    foreach (array_slice($problems, 0, 12) as $p) {
        echo "  [{$p['kind']}] {$p['detail']}\n";
    }
}
echo (count($problems) === 0 ? "AGREES\n" : "DISAGREES\n");
exit(count($problems) === 0 ? 0 : 1);
