<?php
/**
 * 反向验证：故意把教练那层规则改坏十三处，看测试能不能各抓到一类问题。
 *
 *   D:/tmp/php81/php.exe tools/chess_coach_core_mutate.php
 *
 * 和 chess_class_core_mutate.php 同一个道理：一份"全绿"既可能说明规则层对，
 * 也可能说明测试压根没在看。这里挑的每一处都是申请通道里一条独立规则 ——
 * 介绍的下限/上限（含边界差一个）、非字符串、够不够格、大小写、状态机的两头的门、
 * 回给申请人/管理员的形状。抓到就说明那条规则真在被覆盖；漏了要补用例，
 * 不是改规则层。
 *
 * 规则层和测试各拷一份到系统临时目录，保持 v1/ 与 tools/ 的相对位置 —— 测试里
 * `require __DIR__ . '/../v1/chess_coach_core.php'` 才会指向被改坏的那一份，
 * 仓库里的真文件一个字都不动。
 *
 * 退出码：0 = 十三处全变红且控制组全绿；1 = 有一处没抓到或控制组不干净。
 * 这文件不部署：它在 tools/ 下，而只有 v1/ 会同步到服务器的 /api/v1/。
 */

$root = dirname(__DIR__);
$core_src = $root . '/v1/chess_coach_core.php';
$test_src = $root . '/tools/chess_coach_core_test.php';
$scratch = sys_get_temp_dir() . '/chess_coach_core_mutate';

foreach ([$core_src, $test_src] as $path) {
    if (!is_readable($path)) {
        fwrite(STDERR, "missing: {$path}\n");
        exit(2);
    }
}
@mkdir($scratch . '/v1', 0777, true);
@mkdir($scratch . '/tools', 0777, true);
$core = $scratch . '/v1/chess_coach_core.php';
$test = $scratch . '/tools/chess_coach_core_test.php';
$clean = file_get_contents($core_src);
// 测试每轮从仓库重读一份：留着的旧副本会掩盖"改了规则但跑的是老测试"这类事。
file_put_contents($test, file_get_contents($test_src));

$INTRO_GUARD = "    \$given = \$data['intro'] ?? '';\n    if (!is_string(\$given)) {\n        return \$fail('short_intro');\n    }";
$NOTE_GUARD = "    \$givenNote = \$data['note'] ?? '';\n    if (!is_string(\$givenNote)) {\n        return \$fail('bad_note', 'note');\n    }";

/** 每处变异：找不到要改的那一行 = 规则层长过了这行，这条结论作废，脚本会报错。 */
$mutations = [
    'M1 介绍下限放到 1' => [
        'const COACH_INTRO_MIN = 10;',
        'const COACH_INTRO_MIN = 1;',
    ],
    'M2 介绍上限放到 4000' => [
        'const COACH_INTRO_MAX = 400;',
        'const COACH_INTRO_MAX = 4000;',
    ],
    'M3 下限差一个（10 不收）' => [
        '    if ($len < COACH_INTRO_MIN) {',
        '    if ($len <= COACH_INTRO_MIN) {',
    ],
    'M4 上限差一个（400 不收）' => [
        '    if ($len > COACH_INTRO_MAX) {',
        '    if ($len >= COACH_INTRO_MAX) {',
    ],
    'M5 intro 收数字' => [
        $INTRO_GUARD,
        "    \$given = \$data['intro'] ?? '';",
    ],
    'M6 谁都能开课堂' => [
        "    return coach_key(\$status) === 'approved';",
        "    return coach_key(\$status) !== 'rejected';",
    ],
    'M7 资格判定时把大小写抹平' => [
        "    return coach_key(\$status) === 'approved';",
        "    return strtolower(trim((string) \$status)) === 'approved';",
    ],
    'M8 后台能把人打回待审' => [
        "const COACH_DECISIONS = ['approved', 'rejected'];",
        "const COACH_DECISIONS = ['approved', 'rejected', 'pending'];",
    ],
    'M9 不认识的状态照写' => [
        '    if ($to === null || !in_array($from, COACH_APP_STATUSES, true)) {',
        '    if ($to === null) {',
    ],
    'M10 把"谁审的"给申请人' => [
        "        'updated_at' => \$row['updated_at'] ?? null,\n        'decided_at' => \$row['decided_at'] ?? null,\n    ];",
        "        'updated_at' => \$row['updated_at'] ?? null,\n        'decided_at' => \$row['decided_at'] ?? null,\n        'decided_by' => \$row['decided_by'] ?? null,\n    ];",
    ],
    'M11 后台那行把密码散列带出去' => [
        "    return [\n        'player_id' => (int) (\$row['player_id'] ?? 0),",
        "    return [\n        'password_hash' => \$row['password_hash'] ?? '',\n        'player_id' => (int) (\$row['player_id'] ?? 0),",
    ],
    'M12 note 收数组' => [
        $NOTE_GUARD,
        "    \$givenNote = \$data['note'] ?? '';",
    ],
    'M13 漏传 contact_ok 算同意' => [
        "    \$contactOk = (int) (\$contact === true || \$contact === 1 || \$contact === '1');",
        '    $contactOk = (int) ($contact !== false && $contact !== null);',
    ],
    '控制：一个字都不改' => [null, null],
];

/** 从测试输出里抠出结论：断言条数、失败条数、头几条失败叫什么、有没有直接崩掉。 */
function read_verdict(array $lines): array
{
    $verdict = ['checks' => null, 'failures' => null, 'samples' => [], 'crash' => null];
    foreach ($lines as $line) {
        if (preg_match('/^(?:PHP )?(?:Parse error|Fatal error|Warning|Deprecated)/', $line)) {
            $verdict['crash'] = trim($line);
        }
        if (preg_match('/^(\d+) checks, (\d+) failures/', $line, $m)) {
            $verdict['checks'] = (int) $m[1];
            $verdict['failures'] = (int) $m[2];
        } elseif (preg_match('/^ {2}FAIL  (.+)$/', $line, $m)) {
            $verdict['samples'][] = $m[1];
        }
    }
    return $verdict;
}

$missed = [];
foreach ($mutations as $label => [$needle, $replacement]) {
    if ($needle === null) {
        file_put_contents($core, $clean);
    } elseif (strpos($clean, $needle) === false) {
        echo "!! {$label}: 规则层里找不到要改的那一行，这条结论作废\n";
        $missed[] = $label . '（改不动）';
        continue;
    } else {
        file_put_contents($core, str_replace($needle, $replacement, $clean));
    }

    $out = [];
    $code = 0;
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($test) . ' 2>&1', $out, $code);
    $verdict = read_verdict($out);

    $isControl = $needle === null;
    if ($isControl) {
        // 控制组必须全绿，否则后面每一条红都不算数。
        $green = $code === 0 && $verdict['failures'] === 0;
        $answer = $green
            ? '全绿（' . $verdict['checks'] . ' 条断言）'
            : '不干净：' . ($verdict['failures'] ?? '没跑到结论那一行');
        if (!$green) {
            $missed[] = $label . '（控制组不干净）';
        }
    } elseif ($code !== 0) {
        $answer = '抓到 ' . ($verdict['failures'] ?? '?') . ' 条';
    } else {
        $answer = '没抓到 —— 用例里没有能暴露它的输入';
        $missed[] = $label . '（漏了）';
    }
    printf("%-34s %-22s %s\n", $label, $answer,
        $verdict['crash'] ?? ($verdict['samples'][0] ?? ''));

    if (!$isControl && $verdict['failures'] === null) {
        foreach (array_slice($out, 0, 6) as $line) {
            echo "    (原始输出) {$line}\n";
        }
        echo '    (exit ' . $code . ")\n";
    }
}

@unlink($core);
@unlink($test);
@rmdir($scratch . '/v1');
@rmdir($scratch . '/tools');
@rmdir($scratch);

if ($missed) {
    echo "\n反向验证不成立：" . implode('、', $missed) . "\n";
    exit(1);
}
echo "\n十三处变异全部变红，控制组全绿 —— 上面那些规则确实逐条在被测试覆盖。\n";
exit(0);
