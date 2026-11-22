<?php
/**
 * 反向验证：故意把 PHP 裁判改坏八处，看对拍能不能各就抓到一类问题。
 *
 *   D:/tmp/php81/php.exe tools/chess_engine_mutate.php
 *
 * 全绿的报告只有在它能变红的时候才有意义 —— 一份"0 处不一致"既可能说明引擎对，
 * 也可能说明审计压根没在看。这文件就是用来区分这两种情况的：每处变异只改一行，
 * 改的就是引擎里一条独立规则（消歧、+/#、易位权利、吃过路兵格、50 步计数、
 * 王送吃过滤、兵吃子写法）。抓到就说明那条规则真的在被比对；漏了就是语料有洞，
 * 得去补局面而不是改引擎。
 *
 * 引擎和审计各拷一份到系统临时目录，保持 v1/ 与 tools/ 的相对位置 —— 审计里
 * `require __DIR__ . '/../v1/chess_engine.php'` 才会指向被改坏的那一份，
 * 仓库里的真文件一个字都不动。语料用默认位置（隔壁 chess-puter 仓库的 fixture）。
 *
 * 退出码：0 = 八处全变红且控制组全绿；1 = 有一处没抓到或控制组不干净。
 * 这文件不部署：它在 tools/ 下，而只有 v1/ 会同步到服务器的 /api/v1/。
 */

$root = dirname(__DIR__);
$engine_src = $root . '/v1/chess_engine.php';
$audit_src = $root . '/tools/chess_engine_audit.php';
$scratch = sys_get_temp_dir() . '/chess_engine_mutate';

// 审计的默认语料位置按它自己所在的目录算，拷进临时目录就不对了，所以这里显式给。
$fixtures = dirname($root, 1) . '/chess-puter/src/chess/tests/fixtures';

foreach ([$engine_src, $audit_src, $fixtures . '/legal.jsonl'] as $path) {
    if (!is_readable($path)) {
        fwrite(STDERR, "missing: {$path}\n  语料得先在隔壁仓库导出：node tools/export-legality-fixture.mjs\n");
        exit(2);
    }
}
@mkdir($scratch . '/v1', 0777, true);
@mkdir($scratch . '/tools', 0777, true);
$engine = $scratch . '/v1/chess_engine.php';
$audit = $scratch . '/tools/chess_engine_audit.php';
$clean = file_get_contents($engine_src);
// 审计本身每轮从仓库重读一份：留着的旧副本会掩盖"引擎改了但跑的是老审计"这类事。
file_put_contents($audit, file_get_contents($audit_src));

/** 每处变异：找不到要改的那一行 = 引擎长过了这行，这条结论作废，脚本会报错。 */
$mutations = [
    'M1 SAN 丢掉 +/#' => [
        "\$san .= count(chess_engine_legal_moves(\$next)) === 0 ? '#' : '+';",
        '',
    ],
    'M2 易位权利不清空' => [
        "        & (CHESS_ENGINE_CASTLE_MASK[\$move['from']] ?? 15)\n        & (CHESS_ENGINE_CASTLE_MASK[\$move['to']] ?? 15);",
        ";",
    ],
    'M3 不滤走王送吃的走法' => [
        "if (!chess_engine_in_check(\$next, \$us)) {",
        "if (true) {",
    ],
    'M4 吃过路兵格从不设置' => [
        "\$ep = \$move['flags'] === 'b' ? intdiv(\$move['from'] + \$move['to'], 2) : -1;",
        "\$ep = -1;",
    ],
    'M5 兵吃子写成直走' => [
        "\$san = \$move['captured'] !== null ? \$fromFile . 'x' . \$toSquare : \$toSquare;",
        "\$san = \$toSquare;",
    ],
    'M6 该用 rank 消歧时改用文件' => [
        "\$disambiguator = (string) (8 - (\$move['from'] >> 3));",
        "\$disambiguator = \$fromFile;",
    ],
    'M7 三颗同类子时不写全格' => [
        "\$disambiguator = chess_engine_index_to_square(\$move['from']);",
        "\$disambiguator = \$fromFile;",
    ],
    'M8 50 步计数从不复位' => [
        "    \$halfmove = (chess_engine_type(\$move['piece']) === 'p' || \$move['captured'] !== null)\n        ? 0\n        : \$pos['halfmove'] + 1;",
        "    \$halfmove = \$pos['halfmove'] + 1;",
    ],
    '控制：一个字都不改' => [null, null],
];

/** 从审计输出里抠出 mismatches 那一段：总数、按类别、以及有没有 parse 错误。 */
function read_verdict(array $lines): array
{
    $verdict = ['mismatches' => null, 'kinds' => [], 'crash' => null];
    $inProblems = false;
    foreach ($lines as $line) {
        if (preg_match('/^(?:PHP )?(?:Parse error|Fatal error|Warning)/', $line)) {
            $verdict['crash'] = trim($line);
        }
        if (preg_match('/^mismatches: (\d+)$/', $line, $m)) {
            $verdict['mismatches'] = (int) $m[1];
            $inProblems = true;
        } elseif ($inProblems && trim($line) === '') {
            $inProblems = false;   // 类别清单到空行为止，后面是失败样本
        } elseif ($inProblems && preg_match('/^  ([A-Za-z][A-Za-z ]*): (\d+)$/', $line, $m)) {
            $verdict['kinds'][$m[1]] = (int) $m[2];
        }
    }
    return $verdict;
}

$failures = [];
foreach ($mutations as $label => [$needle, $replacement]) {
    if ($needle === null) {
        file_put_contents($engine, $clean);
    } elseif (strpos($clean, $needle) === false) {
        echo "!! {$label}: 引擎里找不到要改的那一行，这条结论无效\n";
        $failures[] = $label . '（改不动）';
        continue;
    } else {
        file_put_contents($engine, str_replace($needle, $replacement, $clean));
    }

    $out = [];
    $code = 0;
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($audit)
        . ' --fixtures ' . escapeshellarg($fixtures) . ' --skip-perft 2>&1', $out, $code);
    $verdict = read_verdict($out);
    $at = 0;
    foreach ($out as $i => $line) {
        if (strpos($line, 'mismatches:') === 0 || $verdict['crash'] !== null) {
            $at = $i;
            break;
        }
    }

    $isControl = $needle === null;
    if ($verdict['mismatches'] === null) {
        $answer = '审计没跑到结论那一行';
        $failures[] = $label . '（无结论）';
        foreach (array_slice($out, 0, 6) as $line) {
            echo "    (原始输出) {$line}\n";
        }
        echo '    (exit ' . $code . ")\n";
    } elseif ($isControl) {
        // 控制组必须全绿，否则说明引擎本身就不干净，后面每一条红都不算数。
        $answer = $verdict['mismatches'] === 0
            ? '0 处（本来就该是 0）'
            : '不干净：' . $verdict['mismatches'] . ' 处';
        if ($verdict['mismatches'] !== 0 || $code !== 0) {
            $failures[] = $label . '（控制组不干净）';
        }
    } elseif ($verdict['mismatches'] > 0) {
        $answer = '抓到 ' . $verdict['mismatches'] . ' 处';
    } else {
        $answer = '没抓到 —— 语料里没有能暴露它的局面';
        $failures[] = $label . '（漏了）';
    }
    $kinds = $verdict['crash'] !== null
        ? $verdict['crash']
        : implode(', ', array_map(
            static fn($kind, $n) => "{$kind} ×{$n}",
            array_keys($verdict['kinds']),
            array_values($verdict['kinds'])
        ));
    printf("%-26s %-10s %s\n", $label, $answer, $kinds);

    if (!$isControl && $verdict['mismatches'] === 0) {
        foreach (array_slice($out, $at, 6) as $line) {
            echo "    {$line}\n";
        }
    }
}

foreach ([$engine, $audit] as $path) {
    @unlink($path);
}
@rmdir($scratch . '/v1');
@rmdir($scratch . '/tools');
@rmdir($scratch);

if ($failures) {
    echo "\n反向验证不成立：" . implode('、', $failures) . "\n";
    exit(1);
}
echo "\n八处变异全部变红，控制组全绿 —— 上面那些规则确实逐条在被比对。\n";
exit(0);
