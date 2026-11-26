<?php
/**
 * 课堂错误码的离线契约测试：不连数据库、不发 HTTP。
 *
 *   D:/tmp/php81/php.exe tools/chess_guard_errors_test.php
 */

require_once __DIR__ . '/../v1/chess_guard.php';

$checks = 0;
$failures = [];
$assert = static function ($cond, $label) use (&$checks, &$failures) {
    $checks++;
    if (!$cond) {
        $failures[] = $label;
    }
};

$statuses = [
    'bad_class_code' => 400,
    'no_such_class' => 404,
    'class_closed' => 409,
    'not_class_member' => 403,
    'not_teacher' => 403,
    'teacher_no_hand' => 400,
    'no_permission' => 403,
    'already_approved' => 409,
    'bad_action' => 400,
    'bad_move' => 400,
    'bad_player_id' => 400,
    'stale' => 409,
];
foreach ($statuses as $code => $status) {
    $row = CHESS_ERRORS[$code] ?? null;
    $assert(is_array($row), "课堂错误码存在：{$code}");
    $assert(($row[0] ?? '') !== '', "课堂错误码有中文文案：{$code}");
    $assert(($row[1] ?? null) === $status, "课堂错误码状态码：{$code}");
    $assert(($row[0] ?? '') !== CHESS_ERRORS['server'][0], "课堂错误码不落通用文案：{$code}");
}

$codes = [];
foreach (glob(__DIR__ . '/../v1/chess_class_*.php') as $file) {
    preg_match_all("/chess_err\\('([^']+)'/", (string) file_get_contents($file), $matches);
    foreach ($matches[1] as $code) {
        $codes[$code] = true;
        $assert(isset(CHESS_ERRORS[$code]), basename($file) . " 的错误码已登记：{$code}");
    }
}
$assert(isset($codes['stale']), '课堂标注、举手和批准的并发冲突使用 stale');
$assert(isset($codes['stale_move']), '课堂走子的并发冲突使用 stale_move');

if ($failures) {
    fwrite(STDERR, implode(PHP_EOL, $failures) . PHP_EOL);
    exit(1);
}
echo "PASS: {$checks} checks" . PHP_EOL;
