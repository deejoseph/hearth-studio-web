<?php
/**
 * 教练偏好规则层的离线测试：不连数据库、不发 HTTP，纯函数进纯函数出。
 *
 *   D:/tmp/php81/php.exe tools/chess_coach_core_test.php
 *
 * 为什么要单独立一个文件：这份偏好的全部风险都在"什么算一个合法选择"上 ——
 * 白名单外的值一旦能落库，之后按选项数人就会数出看不见的桶；而这段逻辑跑在
 * 共享主机上，本地既没有 MySQL 也没有会话，端点本身没法在这儿跑。
 * 所以把判定收在纯层里，这里拿一份完整表和一批坏输入验它。
 *
 * 这文件不部署：它在 tools/ 下，而只有 v1/ 会同步到服务器的 /api/v1/。
 */

require_once __DIR__ . '/../v1/chess_coach_core.php';

$checks = 0;
$failures = [];
$assert = static function ($cond, $label) use (&$checks, &$failures) {
    $checks++;
    if (!$cond) {
        $failures[] = $label;
    }
};

/** 一份"什么都对"的输入，坏用例在它上面改一处，免得同时改坏两处。 */
$good = static function (array $over = []) {
    // array_merge 而不是 "+"：加号是左边的键赢，那样每一个"改一处"的用例
    // 都会悄悄被基表里那一份顶掉，测的其实还是那份完整表。
    return array_merge([
        'level' => 'moves',
        'goals' => ['tactics', 'basics'],
        'formats' => ['one'],
        'slots' => ['wkend_am'],
        'timezone' => 'Asia/Shanghai',
        'language' => 'zh',
        'note' => '想周末上课',
        'contact_ok' => true,
    ], $over);
};

$ok = static function ($data) {
    $r = coach_pref_normalize($data);
    return $r['ok'] ? $r['pref'] : null;
};
$bad = static function ($data) {
    $r = coach_pref_normalize($data);
    return $r['ok'] ? null : [$r['code'], $r['field']];
};

/* --- 一份完整表 --- */
$p = $ok($good());
$assert($p !== null, '完整的一份该通过');
$assert($p['level'] === 'moves', 'level 原样收下');
$assert($p['goals'] === 'basics,tactics', 'goals 按白名单顺序排,不按点击顺序');
$assert($p['formats'] === 'one', 'formats 一条');
$assert($p['slots'] === 'wkend_am', 'slots 一条');
$assert($p['timezone'] === 'Asia/Shanghai', 'timezone 存 IANA 名');
$assert($p['language'] === 'zh', 'language 一条');
$assert($p['note'] === '想周末上课', 'note 原样');
$assert($p['contact_ok'] === 1, 'contact_ok true → 1');

/* --- 单选 --- */
foreach (['level', 'timezone', 'language'] as $field) {
    $missing = $good();
    unset($missing[$field]);
    $assert($bad($missing) === ['bad_pref', $field], "缺 {$field} → bad_pref 并点名这一组");
    $assert($bad($good([$field => 'nope'])) === ['bad_pref', $field], "{$field} 白名单外 → bad_pref");
    $assert($bad($good([$field => 123])) === ['bad_pref', $field], "{$field} 给数字 → bad_pref");
    $assert($bad($good([$field => ['zh']])) === ['bad_pref', $field], "{$field} 给数组 → bad_pref");
}
$assert($ok($good(['level' => ' play ']))['level'] === 'play', '单选只去空格,不改大小写');
$assert($bad($good(['level' => 'PLAY'])) === ['bad_pref', 'level'],
    '大小写不一样就是不认 —— 时区名（Asia/Shanghai）靠这条规则原样进出');
$assert($ok($good(['timezone' => ' Asia/Shanghai ']))['timezone'] === 'Asia/Shanghai',
    '时区名去掉首尾空格后照收,不被小写化打死');
foreach (COACH_LEVELS as $level) {
    $assert($ok($good(['level' => $level]))['level'] === $level, "level 每一个选项都收：{$level}");
}
foreach (COACH_TIMEZONES as $zone) {
    $assert($ok($good(['timezone' => $zone]))['timezone'] === $zone, "timezone 每一个都收：{$zone}");
}
foreach (COACH_LANGUAGES as $lang) {
    $assert($ok($good(['language' => $lang]))['language'] === $lang, "language 每一个都收：{$lang}");
}

/* --- goals：多选 1–3 --- */
$assert($bad($good(['goals' => []])) === ['bad_pref', 'goals'], 'goals 一条不选 → bad_pref');
$assert($bad($good(['goals' => 'nope'])) === ['bad_pref', 'goals'], 'goals 给一个白名单外的字符串');
$assert($ok($good(['goals' => 'tactics']))['goals'] === 'tactics', 'goals 给单条字符串当一项');
$assert($ok($good(['goals' => ['tactics', 'tactics', 'basics']]))['goals'] === 'basics,tactics',
    'goals 重复项吃掉');
$assert($ok($good(['goals' => ['contest', 'endgame', 'opening']]))['goals'] === 'opening,endgame,contest',
    'goals 到上限三条,顺序照白名单');
$assert($bad($good(['goals' => ['basics', 'tactics', 'opening', 'endgame']])) === ['bad_pref', 'goals'],
    'goals 四条超上限');
$assert($bad($good(['goals' => ['tactics', '']])) === ['bad_pref', 'goals'], 'goals 混一条空串');
$assert($bad($good(['goals' => ['tactics', 'rating']])) === ['bad_pref', 'goals'], 'goals 混一项不认识');

/* --- formats：多选 1–2 --- */
$assert($ok($good(['formats' => ['group', 'one']]))['formats'] === 'one,group', 'formats 两条按白名单');
$assert($bad($good(['formats' => ['one', 'group', 'review']])) === ['bad_pref', 'formats'],
    'formats 三条超上限');
$assert($bad($good(['formats' => []])) === ['bad_pref', 'formats'], 'formats 一条不选 → bad_pref');

/* --- slots：可以整条不填 --- */
$assert($ok($good(['slots' => []]))['slots'] === '', 'slots 不填是允许的,存空串');
$assert($ok($good(['slots' => ['wkend_ev', 'wk_ev', 'wkend_pm', 'wkend_am']]))['slots']
    === 'wk_ev,wkend_am,wkend_pm,wkend_ev', 'slots 四个全选满,按白名单顺序');
$assert($bad($good(['slots' => ['mon_9am']])) === ['bad_pref', 'slots'], 'slots 问"几点"这种值不收');
$assert($bad($good(['slots' => ['wk_ev', 'wk_ev', 'wkend_am', 'wkend_pm', 'wkend_ev']]))
    === ['bad_pref', 'slots'], 'slots 条目数超过白名单长度就拒(不猜他到底选了几个)');

/* --- note --- */
$assert($ok($good(['note' => '']))['note'] === '', 'note 空串允许');
$assert($ok($good(['note' => '  想补战术  ']))['note'] === '想补战术', 'note 去首尾空格');
$assert($ok($good(['note' => "想补\t战术\n比赛"]))['note'] === '想补 战术 比赛',
    '制表/换行换成空格,内容整段留着(不是遇到控制字符就丢)');
$assert($ok($good(['note' => '想学　战术']))['note'] === '想学 战术', '全角空格变成一个普通空格');
$assert($ok($good(['note' => "想学\xc2\xa0战术"]))['note'] === '想学 战术', '&nbsp; 那个 U+00A0 变成普通空格');
$assert($bad($good(['note' => "想学\xa0战术"])) === ['bad_note', 'note'],
    '单独的 0xA0 不是合法 UTF-8：宁可有话可说地拒掉，也不要让 INSERT 在半路失败');
$assert($ok($good(['note' => "想学\r\n战术"]))['note'] === '想学 战术', '换行不留下空行,压成一个空格');
$assert($bad($good(['note' => '字'])) === null, '单字 note 允许(哨兵:确认没误伤)');
$edge = $ok($good(['note' => str_repeat('马', COACH_NOTE_MAX)]));
$assert($edge !== null, 'note 恰好 ' . COACH_NOTE_MAX . ' 个汉字要收得住(按码点量,不是字节)');
$over = $bad($good(['note' => str_repeat('马', COACH_NOTE_MAX + 1)]));
$assert($over === ['long_note', 'note'], 'note 超出一个码点 → long_note 并点名 note');
$assert($bad($good(['note' => str_repeat('a', COACH_NOTE_MAX + 1)])) === ['long_note', 'note'],
    'note 按码点量:纯 ASCII 也一样');

/* --- contact_ok：只能显式给 --- */
foreach ([[true, 1], [1, 1], ['1', 1], [false, 0], [0, 0], ['0', 0], ['yes', 0], [null, 0]] as [$given, $want]) {
    $got = $ok($good(['contact_ok' => $given]));
    $assert($got !== null && $got['contact_ok'] === $want, 'contact_ok ' . var_export($given, true) . ' → ' . $want);
}
$noConsent = $good();
unset($noConsent['contact_ok']);
$assert($ok($noConsent)['contact_ok'] === 0, '漏传 contact_ok 算不同意 —— 不能默认把邮箱给出去');

/* --- 整体形状 --- */
$assert(coach_pref_normalize('nope')['ok'] === false, 'body 不是对象 → 不通过');
$assert(coach_pref_normalize([]) === ['ok' => false, 'pref' => null, 'code' => 'bad_pref', 'field' => 'level'],
    '空对象第一个问的是 level');

/* --- 库里的一行 → 回给界面的形状 --- */
$public = coach_pref_public([
    'level' => 'play',
    'goals' => 'basics,tactics',
    'formats' => 'one',
    'slots' => '',
    'timezone' => 'Asia/Shanghai',
    'language' => 'zh_en',
    'note' => '想周末',
    'contact_ok' => '1',
    'updated_at' => '2026-11-25 23:59:59',
]);
$assert($public['goals'] === ['basics', 'tactics'], '回界面时多选变数组');
$assert($public['slots'] === [], '空串变空数组,界面不用判 null');
$assert($public['contact_ok'] === true, 'contact_ok 从小整数串变真值');
$assert($public['updated_at'] === '2026-11-25 23:59:59', '最后修改的时刻带回去');
$empty = coach_pref_public(['level' => 'zero', 'goals' => '', 'formats' => '', 'slots' => '',
    'timezone' => 'Asia/Shanghai', 'language' => 'zh', 'contact_ok' => '0']);
$assert($empty['goals'] === [] && $empty['note'] === '' && $empty['contact_ok'] === false && $empty['updated_at'] === null,
    '行里缺 note/updated_at 也不会给界面 undefined');

/* --- 往返：normalize 出来的串能被 public 还原成同一份选择 --- */
$round = $ok($good(['goals' => ['endgame', 'basics'], 'formats' => ['review', 'one']]));
$back = coach_pref_public($round);
$assert($back['goals'] === ['basics', 'endgame'], '往返后 goals 还是那两项');
$assert($back['formats'] === ['one', 'review'], '往返后 formats 还是那两项');

printf("%d checks, %d failures\n", $checks, count($failures));
foreach ($failures as $label) {
    echo "  FAIL  {$label}\n";
}
exit(count($failures) === 0 ? 0 : 1);
