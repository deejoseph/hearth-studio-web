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

/* --- note 只收字符串（发来个数组不能被写成 'Array'）--- */
$assert($bad($good(['note' => ['想周末']])) === ['bad_note', 'note'], 'note 给数组 → bad_note');
$assert($bad($good(['note' => 123])) === ['bad_note', 'note'], 'note 给数字 → bad_note');
$assert($ok($good(['note' => null]))['note'] === '', 'note 给 null 等于没填（漏传是常态，不报红字）');

/* ========== 教练申请（P4 资格位）========== */

/** 一段合格的介绍：16 个码点，比下限多出 6 个，改文案时看下面那条哨兵。 */
$introOk = '我教了三年少儿国象，带过零基础。';
$app = static function ($data) {
    $r = coach_app_normalize($data);
    return $r['ok'] ? $r['intro'] : null;
};
$appBad = static function ($data) {
    $r = coach_app_normalize($data);
    return $r['ok'] ? null : [$r['code'], $r['field']];
};

/* --- 介绍本身 --- */
$assert(COACH_INTRO_MIN === 10 && COACH_INTRO_MAX === 400,
    '界面上印的是"至少 10 个字、最多 400 个字"：改这两个数要同时改文案');
$assert(coach_len($introOk) === 16, '哨兵：样本文案确实在下限之上（改了这句就来看这条）');
$assert($app(['intro' => $introOk]) === $introOk, '一段正常的话原样收下');
$assert($appBad(['intro' => '']) === ['short_intro', 'intro'], '空着 → short_intro 并点名 intro');
$assert($appBad([]) === ['short_intro', 'intro'], '整个字段没发 → short_intro');
$assert($appBad('nope') === ['short_intro', 'intro'], 'body 不是对象 → short_intro');
$assert($appBad(['intro' => [$introOk]]) === ['short_intro', 'intro'], 'intro 给数组不能变成 "Array"');
$assert($appBad(['intro' => 123456789012]) === ['short_intro', 'intro'], 'intro 给数字同上');
$assert($appBad(['intro' => '我会下棋而已']) === ['short_intro', 'intro'], '会下棋不等于教得动：6 个字不够');
$atMin = $app(['intro' => str_repeat('马', COACH_INTRO_MIN)]);
$assert($atMin !== null && coach_len($atMin) === COACH_INTRO_MIN,
    '恰好 ' . COACH_INTRO_MIN . ' 个码点要收得住（下限含）');
$assert($appBad(['intro' => str_repeat('马', COACH_INTRO_MIN - 1)]) === ['short_intro', 'intro'],
    '短一个码点 → short_intro');
$atMax = $app(['intro' => str_repeat('马', COACH_INTRO_MAX)]);
$assert($atMax !== null && coach_len($atMax) === COACH_INTRO_MAX,
    '恰好 ' . COACH_INTRO_MAX . ' 个码点要收得住（库里那一列就是这个宽度）');
$assert($appBad(['intro' => str_repeat('马', COACH_INTRO_MAX + 1)]) === ['long_intro', 'intro'],
    '超一个码点 → long_intro');
$assert($appBad(['intro' => str_repeat('a', COACH_INTRO_MAX + 1)]) === ['long_intro', 'intro'],
    '按码点量：纯 ASCII 也一样');
$assert($app(['intro' => "  教了三年　国象\n带过零基础  "]) === '教了三年 国象 带过零基础',
    '首尾去掉、全角空格和换行归成一个普通空格（和偏好那条 note 同一口径）');
$assert($appBad(['intro' => "教了三年\xa0国象国象国象"]) === ['bad_intro', 'intro'],
    '单独的 0xA0 不是合法 UTF-8：宁可有话可说地拒掉，也不要让 INSERT 在半路失败');
$assert($appBad(['intro' => '　　　　　　　　　　　　']) === ['short_intro', 'intro'],
    '只有一串全角空格 = 没写东西，不能算它 12 个字过关');

/* --- can_teach：整条链路只有这一行判资格 --- */
$assert(coach_can_teach('approved') === true, 'approved 才算有资格');
foreach (['pending', 'rejected', '', 'Approved', 'APPROVED', null, false, 0, ['approved']] as $status) {
    $assert(coach_can_teach($status) === false,
        '别的一律不算：' . var_export($status, true));
}

/* --- decision：管理员点的那一下 --- */
$assert(coach_decision('approved') === 'approved', '批准');
$assert(coach_decision(' rejected ') === 'rejected', '只去空格,不改大小写');
foreach (['pending', 'approve', 'REJECTED', '', 'nope', null, true, 1, ['approved']] as $given) {
    $assert(coach_decision($given) === null, '不是那两个 key 就不认：' . var_export($given, true));
}

/* --- 状态机：三态之间只允许管理员那两种跳转 --- */
$assert(coach_app_decide('pending', 'approved') === 'approved', '待审 → 批准');
$assert(coach_app_decide('pending', 'rejected') === 'rejected', '待审 → 驳回');
$assert(coach_app_decide('approved', 'rejected') === 'rejected', '批准后还能撤 —— Eddie 定的"随时可撤"');
$assert(coach_app_decide('rejected', 'approved') === 'approved', '驳回后再申请、批了就是批了');
$assert(coach_app_decide('approved', 'approved') === 'approved', '重复点批准不会把状态弄坏');
$assert(coach_app_decide('pending', 'pending') === null, '没人能"批准成待审"');
foreach (['pending', 'approved', 'rejected'] as $from) {
    $assert(coach_app_decide($from, 'pending') === null, "{$from} 跳不到 pending（学员侧那条路不在这里）");
    $assert(coach_app_decide($from, 'delete') === null, "{$from} + 不认识的动作 → null");
    $assert(coach_app_decide($from, null) === null, "{$from} + 没选 → null");
}
foreach ([null, '', 'Approved', 'wait', 0, ['approved']] as $from) {
    $assert(coach_app_decide($from, 'approved') === null, '现在这一态不认识 → 不写：' . var_export($from, true));
}

/* --- 回给申请人的形状 --- */
$appPublic = coach_app_public([
    'status' => 'pending',
    'intro' => '教了三年少儿国象',
    'submitted_at' => '2026-11-26 10:00:00',
    'updated_at' => '2026-11-26 10:00:00',
    'decided_at' => null,
]);
$assert($appPublic['status'] === 'pending', '状态带回去');
$assert($appPublic['intro'] === '教了三年少儿国象', '介绍带回去,界面好让人改');
$assert($appPublic['decided_at'] === null, '还没审就是 null');
$assert(!array_key_exists('decided_by', $appPublic), '谁审的不给申请人看');
$assert(coach_app_public([]) === ['status' => 'pending', 'intro' => '', 'submitted_at' => null,
    'updated_at' => null, 'decided_at' => null], '行里缺字段不会给界面 undefined');

/* --- 管理员那一行：绝不能把凭据带上屏幕 --- */
$adminRow = coach_app_admin([
    'player_id' => '7',
    'status' => 'pending',
    'intro' => '教了三年少儿国象',
    'nickname' => '青瓷',
    'email' => 'a@b.c',
    'verified_at' => '2026-11-20 09:00:00',
    'rating' => '1450',
    'has_pref' => '1',
    'joined_at' => '2026-11-20 08:00:00',
    'submitted_at' => '2026-11-26 10:00:00',
    'decided_at' => null,
    // 故意塞进"源行"里：万一哪天有人往 chess_app_list() 的 SELECT 里加了这两列，
    // 下面那两条哨兵会当场红 —— 后台的屏幕是会拍照发群的。
    'password_hash' => '$2y$10$leak',
    'verify_token_hash' => 'deadbeef',
    'verify_expires' => '2026-12-01 00:00:00',
]);
$assert($adminRow['player_id'] === 7, 'player_id 取成整数（mysqli 回来的是串）');
$assert($adminRow['rating'] === 1450, 'rating 取成整数');
$assert($adminRow['verified'] === true, 'verified_at 有值 → verified true');
$assert($adminRow['has_pref'] === true, 'has_pref 的 "1" 变真值');
foreach (['password_hash', 'verify_token_hash', 'verify_expires'] as $secret) {
    $assert(!array_key_exists($secret, $adminRow), "管理员那一行不带 {$secret}");
}
$anonRow = coach_app_admin(['player_id' => 8, 'verified_at' => null, 'has_pref' => '0']);
$assert($anonRow['verified'] === false && $anonRow['has_pref'] === false, '"0" 和 null 都算没有');
$assert($anonRow['status'] === 'pending' && $anonRow['intro'] === '' && $anonRow['email'] === '',
    '缺字段时给空值,界面不用判 undefined');

printf("%d checks, %d failures\n", $checks, count($failures));
foreach ($failures as $label) {
    echo "  FAIL  {$label}\n";
}
exit(count($failures) === 0 ? 0 : 1);
