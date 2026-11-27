<?php
/**
 * 反向验证：故意把课堂规则层改坏十处，看测试能不能各抓到一类问题。
 *
 *   D:/tmp/php81/php.exe tools/chess_class_core_mutate.php   （约 10 秒）
 *
 * 和 chess_room_core_mutate.php 同一个道理：一份"全绿"既可能说明规则层对，
 * 也可能说明测试压根没在看。每处变异只改一行，改的就是课堂层里一条独立规则
 * （课堂码格式、状态门、权限门、走法合法性、seq 涨不涨、标注权限、举手状态、
 * 批准权限、公开视图的角色判定、回合读取）。
 * 抓到就说明那条规则真的在被测试覆盖；漏了就是要补测试用例，而不是改规则层。
 *
 * 规则层和测试各拷一份到系统临时目录，保持 v1/ 与 tools/ 的相对位置 —— 测试里
 * `require __DIR__ . '/../v1/chess_class_core.php'` 才会指向被改坏的那一份，
 * 仓库里的真文件一个字都不动。
 *
 * 退出码：0 = 十处全变红且控制组全绿；1 = 有一处没抓到或控制组不干净。
 * 这文件不部署：它在 tools/ 下，而只有 v1/ 会同步到服务器的 /api/v1/。
 */

$root = dirname(__DIR__);
$core_src = $root . '/v1/chess_class_core.php';
$engine_src = $root . '/v1/chess_engine.php';
$test_src = $root . '/tools/chess_class_core_test.php';
$scratch = sys_get_temp_dir() . '/chess_class_core_mutate';

foreach ([$core_src, $engine_src, $test_src] as $path) {
    if (!is_readable($path)) {
        fwrite(STDERR, "missing: {$path}\n");
        exit(2);
    }
}
@mkdir($scratch . '/v1', 0777, true);
@mkdir($scratch . '/tools', 0777, true);
$core = $scratch . '/v1/chess_class_core.php';
$test = $scratch . '/tools/chess_class_core_test.php';
$clean = file_get_contents($core_src);
// 引擎和测试本身每轮从仓库重读一份：留着的旧副本会掩盖"改了规则但跑的是老测试"这类事。
file_put_contents($scratch . '/v1/chess_engine.php', file_get_contents($engine_src));
file_put_contents($test, file_get_contents($test_src));

/** 每处变异：找不到要改的那一行 = 规则层长过了这行，这条结论作废，脚本会报错。 */
$mutations = [
    'M1 课堂码长度错' => [
        "const CHESS_CLASS_CODE_LENGTH = 4;",
        "const CHESS_CLASS_CODE_LENGTH = 6;",
    ],
    'M2 状态门不判' => [
        "    if (\$class['status'] !== CHESS_CLASS_OPEN) {\n        return ['err' => 'class_closed', 'class' => \$class, 'event' => null];",
        "    if (false) {\n        return ['err' => null, 'class' => \$class, 'event' => null];",
    ],
    'M3 权限门不判' => [
        "    if (!\$canMove) {\n        return ['err' => 'no_permission', 'class' => \$class, 'event' => null];",
        "    if (false) {\n        return ['err' => null, 'class' => \$class, 'event' => null];",
    ],
    'M4 seq 不涨' => [
        "    \$class['seq']++;\n    \$event = [\n        'seq' => \$class['seq'],\n        'type' => CHESS_EVT_MOVE,",
        "    \$class['seq'] = \$class['seq'];\n    \$event = [\n        'seq' => \$class['seq'],\n        'type' => CHESS_EVT_MOVE,",
    ],
    'M5 标注权限不判' => [
        "    if (!\$isTeacher) {\n        return ['err' => 'no_permission', 'class' => \$class, 'event' => null];",
        "    if (false) {\n        return ['err' => null, 'class' => \$class, 'event' => null];",
    ],
    'M6 举手状态写错' => [
        "        \$newStatus = CHESS_HAND_RAISED;",
        "        \$newStatus = CHESS_HAND_NONE;",
    ],
    'M7 批准权限不判' => [
        "    if (!\$isTeacher) {\n        return ['err' => 'no_permission', 'class' => \$class, 'event' => null];\n    }\n    \$newStatus = \$approve ? CHESS_HAND_APPROVED : CHESS_HAND_NONE;",
        "    if (false) {\n        return ['err' => null, 'class' => \$class, 'event' => null];\n    }\n    \$newStatus = \$approve ? CHESS_HAND_APPROVED : CHESS_HAND_NONE;",
    ],
    'M8 公开视图角色判定错' => [
        "            \$canMove = (\$m['role'] === CHESS_CLASS_TEACHER && \$teacherCanTeach)\n                || (\$m['hand_status'] === CHESS_HAND_APPROVED);",
        "            \$canMove = false;",
    ],
    'M9 回合读取错' => [
        "    \$turn = ((\$parts[1] ?? 'w') === 'b') ? 'b' : 'w';",
        "    \$turn = 'w';",
    ],
    'M10 已批准不能再举不判' => [
        "        if (\$currentHandStatus === CHESS_HAND_APPROVED) {\n            return ['err' => 'already_approved', 'class' => \$class, 'event' => null];",
        "        if (false) {\n            return ['err' => null, 'class' => \$class, 'event' => null];",
    ],
    'M11 公开视图无视教练资格' => [
        "            \$canMove = (\$m['role'] === CHESS_CLASS_TEACHER && \$teacherCanTeach)\n                || (\$m['hand_status'] === CHESS_HAND_APPROVED);",
        "            \$canMove = (\$m['role'] === CHESS_CLASS_TEACHER)\n                || (\$m['hand_status'] === CHESS_HAND_APPROVED);",
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
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($test) . ' 2>&1', $out, $code);
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
echo "\n" . (count($mutations) - 1) . " 处变异全部变红，控制组全绿 —— 上面那些规则确实逐条在被测试覆盖。\n";
exit(0);
