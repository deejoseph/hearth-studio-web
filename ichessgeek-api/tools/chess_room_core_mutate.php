<?php
/**
 * 反向验证：故意把房间规则层改坏十四处，看重放测试能不能各抓到一类问题。
 *
 *   D:/tmp/php81/php.exe tools/chess_room_core_mutate.php   （约 30 秒）
 *
 * 和 chess_engine_mutate.php 同一个道理：一份"3733 手全绿"既可能说明规则层对，
 * 也可能说明测试压根没在看。每处变异只改一行，改的就是房间层里一条独立规则
 * （该谁走、烧谁的钟、钟归零算不算、seq 涨不涨、局面结束没有、房间码字母表、
 * 将死的胜者是谁、房主能不能自己坐对面、状态门、读不懂局面怪谁）。
 * 抓到就说明那条规则真的在被重放比对；漏了就是要补测试用例，而不是改规则层。
 *
 * 提和那四处（叠第二条、自己接受自己的、拒绝当同意、和棋写成逼和）是这一批加的：
 * 和棋是唯一一条两边都不输的终局，写错方向比走子写错更难在界面上看出来。
 *
 * 规则层和测试各拷一份到系统临时目录，保持 v1/ 与 tools/ 的相对位置 —— 测试里
 * `require __DIR__ . '/../v1/chess_room_core.php'` 才会指向被改坏的那一份，
 * 仓库里的真文件一个字都不动。语料用默认位置，这里显式传过去。
 *
 * 退出码：0 = 十处全变红且控制组全绿；1 = 有一处没抓到或控制组不干净。
 * 这文件不部署：它在 tools/ 下，而只有 v1/ 会同步到服务器的 /api/v1/。
 */

$root = dirname(__DIR__);
$core_src = $root . '/v1/chess_room_core.php';
$engine_src = $root . '/v1/chess_engine.php';
$test_src = $root . '/tools/chess_room_core_test.php';
$scratch = sys_get_temp_dir() . '/chess_room_core_mutate';

// 测试的默认语料位置按它自己所在的目录算，拷进临时目录就不对了，所以这里显式给。
$fixtures = dirname($root, 1) . '/chess-puter/src/chess/tests/fixtures';

foreach ([$core_src, $engine_src, $test_src, $fixtures . '/games.jsonl'] as $path) {
    if (!is_readable($path)) {
        fwrite(STDERR, "missing: {$path}\n  语料得先在隔壁仓库导出：node tools/export-legality-fixture.mjs\n");
        exit(2);
    }
}
@mkdir($scratch . '/v1', 0777, true);
@mkdir($scratch . '/tools', 0777, true);
$core = $scratch . '/v1/chess_room_core.php';
$test = $scratch . '/tools/chess_room_core_test.php';
$clean = file_get_contents($core_src);
// 引擎和测试本身每轮从仓库重读一份：留着的旧副本会掩盖"改了规则但跑的是老测试"这类事。
file_put_contents($scratch . '/v1/chess_engine.php', file_get_contents($engine_src));
file_put_contents($test, file_get_contents($test_src));

/** 每处变异：找不到要改的那一行 = 规则层长过了这行，这条结论作废，脚本会报错。 */
$mutations = [
    'M1 该谁走不判' => [
        "    if (\$pos['turn'] !== \$side) {",
        '    if (false) {',
    ],
    'M2 烧错一方的钟' => [
        "\$key = \$turn === CHESS_ENGINE_WHITE ? 'white_ms' : 'black_ms';",
        "\$key = \$turn === CHESS_ENGINE_WHITE ? 'black_ms' : 'white_ms';",
    ],
    'M3 钟归零不判' => [
        '    if ($flagged !== null) {',
        '    if (false) {',
    ],
    'M4 seq 不涨' => [
        "    \$room['seq'] = (int) \$room['seq'] + 1;",
        "    \$room['seq'] = (int) \$room['seq'];",
    ],
    'M5 不读局面的结束' => [
        '    $outcome = chess_room_outcome($fen);',
        "    \$outcome = ['over' => false, 'result' => null, 'winner' => null];",
    ],
    'M6 房间码含易混字符' => [
        "const CHESS_ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';",
        "const CHESS_ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';",
    ],
    'M7 将死的胜者写反' => [
        "        return ['over' => true, 'result' => 'checkmate', 'winner' => chess_engine_other(\$loser)];",
        "        return ['over' => true, 'result' => 'checkmate', 'winner' => \$loser];",
    ],
    'M8 房主可坐对面' => [
        "    if (\$open === null || \$playerId === (int) \$room['white_player_id'] || \$playerId === (int) \$room['black_player_id']) {",
        '    if ($open === null) {',
    ],
    'M9 状态门不判' => [
        "    if (\$room['status'] !== CHESS_ROOM_ACTIVE) {\n        return ['room' => \$room, 'event' => null, 'err' => \$room['status'] === CHESS_ROOM_OVER ? 'room_over' : 'room_not_active'];",
        "    if (false) {\n        return ['room' => \$room, 'event' => null, 'err' => null];",
    ],
    'M10 读不懂局面怪玩家' => [
        "        return ['room' => \$room, 'event' => null, 'err' => 'server'];",
        "        return ['room' => \$room, 'event' => null, 'err' => 'illegal_move'];",
    ],
    'M11 提和可以叠第二条' => [
        '    if ($pending !== null) {',
        '    if (false) {',
    ],
    'M12 提和方能自己接受' => [
        "    if (\$pending['by'] === \$side) {",
        '    if (false) {',
    ],
    'M13 拒绝也当同意' => [
        '    if (!$accept) {',
        '    if (false) {',
    ],
    'M14 和棋写成逼和' => [
        "    \$room['result'] = 'agreement';",
        "    \$room['result'] = 'stalemate';",
    ],
    '控制：一个字都不改' => [null, null],
];

/** 从测试输出里抠出结论：失败条数、跑了多少断言、有没有直接崩掉。 */
function read_verdict(array $lines): array
{
    $verdict = ['failures' => null, 'checks' => null, 'agrees' => false, 'samples' => [], 'crash' => null];
    $inFailures = false;
    foreach ($lines as $line) {
        if (preg_match('/^(?:PHP )?(?:Parse error|Fatal error|Warning)/', $line)) {
            $verdict['crash'] = trim($line);
        }
        if (preg_match('/^FAILURES (\d+)/', $line, $m)) {
            $verdict['failures'] = (int) $m[1];
            $inFailures = true;
        } elseif ($inFailures && preg_match('/^ +- (.+)$/', $line, $m)) {
            $verdict['samples'][] = $m[1];
        }
        if (preg_match('/^AGREES:/', $line)) {
            $verdict['agrees'] = true;
        }
        if (preg_match('/^checks +(\d+)$/', $line, $m)) {
            $verdict['checks'] = (int) $m[1];
        }
    }
    return $verdict;
}

$failures = [];
foreach ($mutations as $label => [$needle, $replacement]) {
    if ($needle === null) {
        file_put_contents($core, $clean);
    } elseif (strpos($clean, $needle) === false) {
        echo "!! {$label}: 规则层里找不到要改的那一行，这条结论作废\n";
        $failures[] = $label . '（改不动）';
        continue;
    } else {
        file_put_contents($core, str_replace($needle, $replacement, $clean));
    }

    $out = [];
    $code = 0;
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($test)
        . ' --fixtures ' . escapeshellarg($fixtures) . ' 2>&1', $out, $code);
    $verdict = read_verdict($out);

    $isControl = $needle === null;
    if ($isControl) {
        // 控制组必须全绿，否则说明规则层本身就不干净，后面每一条红都不算数。
        $green = $code === 0 && $verdict['agrees'];
        $answer = $green
            ? '全绿（' . $verdict['checks'] . ' 条断言）'
            : '不干净：' . ($verdict['failures'] ?? '没跑到结论那一行');
        if (!$green) {
            $failures[] = $label . '（控制组不干净）';
        }
    } elseif ($code !== 0) {
        $answer = '抓到 ' . ($verdict['failures'] ?? '?') . ' 条';
    } else {
        $answer = '没抓到 —— 用例里没有能暴露它的输入';
        $failures[] = $label . '（漏了）';
    }
    printf("%-24s %-22s %s\n", $label, $answer,
        $verdict['crash'] ?? ($verdict['samples'][0] ?? ''));

    if (!$isControl && $verdict['failures'] === null) {
        foreach (array_slice($out, 0, 6) as $line) {
            echo "    (原始输出) {$line}\n";
        }
        echo '    (exit ' . $code . ")\n";
    }
}

foreach ([$core, $test, $scratch . '/v1/chess_engine.php'] as $path) {
    @unlink($path);
}
@rmdir($scratch . '/v1');
@rmdir($scratch . '/tools');
@rmdir($scratch);

if ($failures) {
    echo "\n反向验证不成立：" . implode('、', $failures) . "\n";
    exit(1);
}
echo "\n" . (count($mutations) - 1) . " 处变异全部变红，控制组全绿 —— 上面那些规则确实逐条在被重放比对。\n";
exit(0);
