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
// 管理员批的是"能不能教"，称号/等级分/教龄是他核对的那三样，所以要出现在列表行上。
$proRow = coach_app_admin(['player_id' => 9, 'status' => 'pending', 'title' => 'im', 'elo' => '2210',
    'years' => '7', 'password_hash' => '$2y$10$leak']);
$assert($proRow['title'] === 'im' && $proRow['elo'] === '2210' && $proRow['years'] === '7',
    '申请列表带上称号/ELO/教龄,管理员有的可判');
$assert(!array_key_exists('password_hash', $proRow), '带了资料列也没把密码哈希带上屏幕');
$assert($proRow['elo'] === '2210', '库里回来的整数保持原样(这里不换算,换算在资料那一路判)');

/* ========== 教练资料（名录上那张门面）========== */

$prof = static function ($data) {
    $r = coach_profile_normalize($data);
    return $r['ok'] ? $r['profile'] : null;
};
$profBad = static function ($data) {
    $r = coach_profile_normalize($data);
    return $r['ok'] ? null : [$r['code'], $r['field']];
};

/** 一张 24 位十六进制的合法文件名，改坏用例时只改一处。 */
$imgA = 'a1b2c3d4e5f60718293a4b5c.jpg';
$imgB = '0f1e2d3c4b5a69788796a5b4.png';
$imgC = 'deadbeefdeadbeefdeadbeef.webp';
$imgD = '0123456789abcdef01234567.jpg';

/** 一份什么都对的资料。 */
$full = static function (array $over = []) use ($imgD) {
    return array_merge([
        'title' => 'im',
        'elo' => 2210,
        'years' => 7,
        'tagline' => '带零基础到比赛',
        'honors' => '市青少年锦标赛 优秀教练',
        'language' => 'zh_en',
        'timezone' => 'Asia/Shanghai',
        'levels' => ['zero', 'moves'],
        'goals' => ['tactics', 'basics'],
        'formats' => ['one', 'group'],
        'slots' => ['wkend_am'],
        'avatar' => 'a1b2c3d4e5f60718293a4b5c.jpg',
        'photos' => ['0f1e2d3c4b5a69788796a5b4.png'],
        'certificates' => [$imgD],
    ], $over);
};

/* --- 一份完整表 --- */
$p = $prof($full());
$assert($p !== null, '一份完整资料该通过');
$assert($p['title'] === 'im', 'title 原样');
$assert($p['elo'] === 2210, 'elo 取成整数');
$assert($p['years'] === 7, 'years 取成整数');
$assert($p['levels'] === 'zero,moves', 'levels 按白名单顺序,不按点击顺序');
$assert($p['goals'] === 'basics,tactics', 'goals 与学员那侧同一套 key');
$assert($p['formats'] === 'one,group', 'formats 两条');
$assert($p['slots'] === 'wkend_am', 'slots 一条');
$assert($p['avatar'] === $imgA, 'avatar 原样(形状已判过)');
$assert($p['photos'] === $imgB, 'photos 一张');
$assert($p['certificates'] === $imgD, 'certificates 一张');

/* --- 每个字段都可以留空：资料不是门槛 --- */
$assert($prof([]) !== null, '整张表单空着也要存得下 —— 判够不够格的是申请状态,不是这里');
$blank = $prof([]);
foreach (['title', 'tagline', 'honors', 'language', 'timezone', 'levels', 'goals',
    'formats', 'slots', 'avatar', 'photos', 'certificates'] as $key) {
    $assert(($blank[$key] ?? '缺键') === '', "空着 {$key} 存空串");
}
$assert($blank['elo'] === null && $blank['years'] === null, 'elo/years 空着是 null,不是 0');
$assert($prof($full(['elo' => '', 'years' => '']))['elo'] === null, '显式发空串 = 清空登记');
$assert($prof($full(['years' => 0]))['years'] === 0, '0 年教龄收得住,且和"没填"不是一回事');
$assert($profBad($full(['years' => '三年'])) === ['bad_profile', 'years'], 'years 要数字,不收汉字');
$assert($profBad($full(['years' => 61])) === ['bad_profile', 'years'], 'years 超 ' . COACH_YEARS_MAX . ' 年拒');
$assert($prof($full(['years' => COACH_YEARS_MAX]))['years'] === COACH_YEARS_MAX, 'years 上限含');

/* --- title --- */
foreach (COACH_TITLES as $t) {
    $assert($prof($full(['title' => $t]))['title'] === $t, "title 每一个都收：{$t}");
}
$assert($prof($full(['title' => ' im ']))['title'] === 'im', 'title 只去空格');
$assert($profBad($full(['title' => 'IM'])) === ['bad_profile', 'title'], '大小写不一样就是不认');
$assert($profBad($full(['title' => 'nm'])) === ['bad_profile', 'title'],
    '美国那套称号不在这里：宁可让界面加一档,也不要库里冒出第五种口径');
$assert($profBad($full(['title' => ['im']])) === ['bad_profile', 'title'], 'title 给数组 → bad_profile');
$assert($profBad($full(['title' => 123])) === ['bad_profile', 'title'], 'title 给数字同上');

/* --- elo --- */
foreach ([[1500, 1500], ['1500', 1500], [' 2210 ', 2210], [COACH_ELO_MIN, COACH_ELO_MIN],
    [COACH_ELO_MAX, COACH_ELO_MAX]] as [$given, $want]) {
    $got = $prof($full(['elo' => $given]));
    $assert($got !== null && $got['elo'] === $want, 'elo ' . var_export($given, true) . " → {$want}");
}
foreach ([0, 599, 2851, 99999, '1500 分左右', 'abc', '-100', '1e3', [1500], 1234.5] as $given) {
    $assert($profBad($full(['elo' => $given])) === ['bad_profile', 'elo'],
        'elo 这种形状不收：' . var_export($given, true));
}

/* --- tagline / honors：码点口径同 note --- */
$assert($prof($full(['tagline' => "  带零基础　到比赛\n  "]))['tagline'] === '带零基础 到比赛',
    '简介同 coach_trim 口径：全角空格和换行归成一个普通空格');
$assert($prof($full(['tagline' => str_repeat('马', COACH_TAGLINE_MAX)])) !== null,
    '简介恰好 ' . COACH_TAGLINE_MAX . ' 个字收得住');
$assert($profBad($full(['tagline' => str_repeat('马', COACH_TAGLINE_MAX + 1)]))
    === ['long_tagline', 'tagline'], '简介超一个码点 → long_tagline 并点名这一组');
$assert($prof($full(['tagline' => "带\x00零基础"]))['tagline'] === '带 零基础',
    'NUL 那种控制字节被 coach_trim 换成空格（和 note 同一口径），不会进库');
$assert($profBad($full(['tagline' => "带\xa0零基础"])) === ['bad_tagline', 'tagline'],
    '单独的 0xA0 不是合法 UTF-8 → bad_tagline（不让 INSERT 在半路失败）');
$assert($profBad($full(['tagline' => ['带零基础']])) === ['bad_tagline', 'tagline'],
    '简介给数组不能存成 "Array"');
$assert($prof($full(['honors' => str_repeat('奖', COACH_HONORS_MAX)])) !== null,
    '荣誉恰好 ' . COACH_HONORS_MAX . ' 个字收得住');
$assert($profBad($full(['honors' => str_repeat('奖', COACH_HONORS_MAX + 1)]))
    === ['long_honors', 'honors'], '荣誉超长 → long_honors');
$assert($profBad($full(['honors' => "奖\xa0杯"])) === ['bad_honors', 'honors'], '荣誉坏字节 → bad_honors');

/* --- 多选：可以整条不填，但填了就得全认 --- */
$assert($prof($full(['levels' => []]))['levels'] === '', 'levels 不填允许');
$assert($prof($full(['levels' => '']))['levels'] === '',
    'levels 发空串也当"一个都没选",而不是"选了一个不存在的 key"');
$assert($prof($full(['levels' => ['rated', 'zero', 'moves', 'play']]))['levels']
    === 'zero,moves,play,rated', 'levels 四条选满,按白名单顺序');
$assert($profBad($full(['levels' => ['zero', 'nope']])) === ['bad_profile', 'levels'],
    'levels 混一项不认识 → bad_profile 并点名');
$assert($prof($full(['goals' => ['basics', 'tactics', 'contest']]))['goals'] === 'basics,tactics,contest',
    'goals 三条恰好到上限');
$assert($profBad($full(['goals' => ['basics', 'tactics', 'opening', 'endgame']]))
    === ['bad_profile', 'goals'], 'goals 四条超上限 ' . COACH_GOALS_MAX_COACH . '（五项全勾等于没标）');
$assert($prof($full(['goals' => ['tactics', 'tactics']]))['goals'] === 'tactics', 'goals 重复项吃掉');
$assert($profBad($full(['formats' => ['one', 'group', 'review', 'one']])) === ['bad_profile', 'formats'],
    'formats 条目数比白名单还多就不收：那 ' . COACH_FORMATS_MAX_COACH . ' 种能全列,四条不行');
$assert($prof($full(['slots' => ['wkend_ev', 'wk_ev', 'wkend_pm', 'wkend_am']]))['slots']
    === 'wk_ev,wkend_am,wkend_pm,wkend_ev', 'slots 四个全选满');
$assert($profBad($full(['language' => 'fr'])) === ['bad_profile', 'language'],
    '语言只有中英和"都行",别的没有');
$assert($profBad($full(['timezone' => 'Beijing'])) === ['bad_profile', 'timezone'],
    '时区存 IANA 名,城市名不收');

/* --- 图片文件名：形状判死,路径根本进不来 --- */
foreach ([$imgA, $imgB, $imgC] as $name) {
    $assert($prof($full(['avatar' => $name]))['avatar'] === $name, "合法文件名照收：{$name}");
}
foreach ([
    '../' . $imgA,
    'coach_media/9/' . $imgA,
    $imgA . '.php',
    'a1b2c3d4e5f60718293a4b5.jpg',
    'A1B2C3D4E5F60718293A4B5C.JPG',
    'a1b2c3d4e5f60718293a4b5c.gif',
    'a1b2c3d4e5f60718293a4b5c.jpg\x00.png',
    '',
] as $i => $name) {
    if ($name === '') {
        continue;
    }
    $assert($profBad($full(['avatar' => $name])) === ['bad_image', 'avatar'],
        '这种名字一律不收：' . var_export($name, true));
}
$assert($prof($full(['avatar' => ' ' . $imgA . ' ']))['avatar'] === $imgA, '文件名只去首尾空格');
$assert($prof($full(['photos' => [$imgB, $imgC, $imgA]]))['photos'] === "{$imgB},{$imgC},{$imgA}",
    '照片保留教练排的顺序(第一张是封面),不像选项那样有规范次序');
$assert($prof($full(['photos' => [$imgB, $imgB]]))['photos'] === $imgB, '照片重复吃掉');
$assert($prof($full(['photos' => $imgB]))['photos'] === $imgB, '照片发单个字符串当一张');
$assert($prof($full(['photos' => '']))['photos'] === '', '照片清空发空串');
$assert($prof($full(['photos' => []]))['photos'] === '', '照片清空发空数组');
$assert($prof($full(['photos' => [$imgA, $imgB, $imgC, $imgA]]))['photos'] === "{$imgA},{$imgB},{$imgC}",
    '重复的那一张不占额度：四条目去重成三张，正好是上限');
$assert($profBad($full(['photos' => [$imgA, $imgB, $imgC, $imgD]]))
    === ['too_many_photos', 'photos'], '照片第四张 → too_many_photos');
$assert($profBad($full(['photos' => [$imgA, '../x.jpg']])) === ['bad_image', 'photos'],
    '照片里混一个坏名字,整份都不落库');

/* --- certificates：独立六张，不占照片那三张 --- */
$certNames = [];
for ($i = 1; $i <= COACH_CERTIFICATES_MAX; $i++) {
    $certNames[] = str_pad(dechex($i), 24, '0', STR_PAD_LEFT) . '.jpg';
}
$assert($prof($full(['certificates' => $certNames]))['certificates'] === implode(',', $certNames),
    '证书六张恰好到上限,按发来的顺序收下');
$assert($prof($full(['certificates' => [$certNames[2], $certNames[0], $certNames[2]]]))['certificates']
    === "{$certNames[2]},{$certNames[0]}", '证书保留顺序,重复项不占额度');
$assert($prof($full(['certificates' => $certNames[0]]))['certificates'] === $certNames[0],
    '证书发单个字符串当一张');
$assert($prof($full(['certificates' => '']))['certificates'] === '', '证书清空发空串');
$assert($prof($full(['certificates' => []]))['certificates'] === '', '证书清空发空数组');
$seventh = str_pad(dechex(COACH_CERTIFICATES_MAX + 1), 24, '0', STR_PAD_LEFT) . '.png';
$assert($profBad($full(['certificates' => [...$certNames, $seventh]]))
    === ['too_many_certificates', 'certificates'], '证书第七张 → too_many_certificates');
$assert($profBad($full(['certificates' => [$imgA, $imgB . '.php']]))
    === ['bad_image', 'certificates'], '证书里混坏名字 → bad_image 并点名 certificates');
$assert($profBad($full(['certificates' => ['../' . $imgA]]))
    === ['bad_image', 'certificates'], '证书文件名不许带路径');

/* --- 库里的一行 → 回给界面 --- */
$row = coach_profile_public($p);
$assert($row['levels'] === ['zero', 'moves'], '回界面时多选变数组');
$assert($row['photos'] === [$imgB], '照片变数组,顺序还是那一列');
$assert($row['certificates'] === [$imgD], '证书变数组,公开主页拿得到');
$assert($row['elo'] === 2210 && $row['years'] === 7, '整数带回去');
$empty = coach_profile_public([]);
$assert($empty['title'] === '' && $empty['levels'] === [] && $empty['photos'] === []
    && $empty['certificates'] === [] && $empty['elo'] === null && $empty['updated_at'] === null,
    '空行不会给界面 undefined');
$zero = coach_profile_public(['elo' => '0', 'years' => '0']);
$assert($zero['elo'] === 0 && $zero['years'] === 0, '库里的 "0" 还是 0,不会被当成没登记');

/* --- 名录/主页上的一行 --- */
$entry = coach_directory_entry([
    'player_id' => '12',
    'nickname' => '青瓷',
    'rating' => '1450',
    // 故意塞进来：哪天有人往 chess_coach_rows() 的 SELECT 里加了这几列，
    // 下面的哨兵会当场红 —— 名录是公开页面。
    // intro 这一列确实在申请那趟查询里出现过，但它是写给管理员看的，
    // 界面上承诺了"只有管理员看得到"，所以公开行里必须没有它。
    'intro' => '教了三年少儿国象',
    'submitted_at' => '2026-11-26 10:00:00',
    'status' => 'approved',
    'profile_at' => '2026-11-26 12:00:00',
    'title' => 'im',
    'elo' => '2210',
    'years' => '7',
    'levels' => 'zero,moves',
    'photos' => "{$imgB},{$imgC}",
    'certificates' => $imgD,
    'avatar' => $imgA,
    'email' => 'a@b.c',
    'verified_at' => '2026-11-20 09:00:00',
    'password_hash' => '$2y$10$leak',
]);
$assert($entry['player_id'] === 12, 'player_id 取成整数（mysqli 回来的是串）');
$assert($entry['nickname'] === '青瓷' && $entry['rating'] === 1450, '名头和等级分带出去');
$assert($entry['profile']['levels'] === ['zero', 'moves'], '资料那一坨按 public 的形状');
$assert($entry['profile']['photos'] === [$imgB, $imgC], '照片是数组,第一张当封面');
$assert($entry['profile']['certificates'] === [$imgD], '证书按 public 的形状上主页');
$assert($entry['profile']['updated_at'] === '2026-11-26 12:00:00', '资料改过的时刻取 profile_at');
$assert($entry['has_profile'] === true, '填过了就说填过了');
foreach (['email', 'verified_at', 'password_hash'] as $secret) {
    $assert(!array_key_exists($secret, $entry), "名录那一行不带 {$secret}");
    $assert(!array_key_exists($secret, $entry['profile']), "profile 里也不带 {$secret}");
}
foreach (['intro', 'submitted_at', 'status'] as $private) {
    $assert(!array_key_exists($private, $entry), "申请那一段（{$private}）不上公开页");
}
$bare = coach_directory_entry(['player_id' => 3]);
$assert($bare['has_profile'] === false, '只有 id 的一行 = 还没填资料');
$assert($bare['nickname'] === '' && $bare['rating'] === null, '缺字段给空值,界面不用判 undefined');
$assert($bare['profile']['elo'] === null && $bare['profile']['photos'] === [], '资料整坨是默认形状');
$assert(coach_directory_entry(['player_id' => 4, 'rating' => ''])['rating'] === null,
    '没登记等级分是 null,不是 0 —— 0 分会被读成"很弱"');
$assert(coach_profile_filled(coach_profile_public(['elo' => 0])) === true,
    'elo 0 也是填过了：0 和没填不是一回事');
$assert(coach_profile_filled(coach_profile_public(['years' => 0])) === true, '0 年教龄同上');
$assert(coach_profile_filled(coach_profile_public(['photos' => $imgA])) === true,
    '只传了一张照片也算填过（那一行是先建起来的）');
$assert(coach_profile_filled(coach_profile_public(['certificates' => $imgA])) === true,
    '只传一张证书也算填过,不会显示成"还没填资料"');

/* --- 上传那张图该不该收 --- */
[$name, $code] = coach_image_store_name(['mime' => 'image/jpeg', 0 => 800, 1 => 600], 1024, 'a1b2c3d4e5f60718293a4b5c');
$assert($code === null && $name === $imgA, '真 JPEG → 用真类型给的扩展名');
foreach ([['image/png', 'png'], ['image/webp', 'webp']] as [$mime, $ext]) {
    [$n2, $c2] = coach_image_store_name(['mime' => $mime, 0 => 100, 1 => 100], 10, 'a1b2c3d4e5f60718293a4b5c');
    $assert($c2 === null && substr($n2, -strlen($ext)) === $ext, "{$mime} 存成 .{$ext}");
}
foreach ([['mime' => 'image/gif', 0 => 10, 1 => 10], ['mime' => 'text/php', 0 => 10, 1 => 10],
    ['mime' => '', 0 => 10, 1 => 10], []] as $info) {
    [, $c] = coach_image_store_name($info, 1024, 'a1b2c3d4e5f60718293a4b5c');
    $assert($c === 'bad_image', '不是那三种图就不收：' . var_export($info, true));
}
foreach ([[0, '零字节'], [COACH_IMAGE_BYTES_MAX + 1, '超两兆']] as [$bytes, $why]) {
    [, $c] = coach_image_store_name(['mime' => 'image/jpeg', 0 => 100, 1 => 100], $bytes,
        'a1b2c3d4e5f60718293a4b5c');
    $assert($c === 'big_image', "字节数不对（{$why}）→ big_image");
}
foreach ([[4001, 100], [100, 4001], [0, 100], [8000, 8000]] as [$w, $h]) {
    [, $c] = coach_image_store_name(['mime' => 'image/jpeg', 0 => $w, 1 => $h], 1024,
        'a1b2c3d4e5f60718293a4b5c');
    $assert($c === 'big_image', "边长 {$w}x{$h} → big_image");
}
[, $c] = coach_image_store_name(['mime' => 'image/jpeg', 0 => 100, 1 => 100], 1024, 'DEADBEEF');
$assert($c === 'bad_image', '随机名不是那 24 位十六进制就不落盘(不给目录里留脏文件)');
$assert(COACH_IMAGE_BYTES_MAX === 2097152 && COACH_PHOTOS_MAX === 3 && COACH_CERTIFICATES_MAX === 6,
    '界面上印的是"两兆、照片三张、证书六张"：改这三个数要同时改文案');

printf("%d checks, %d failures\n", $checks, count($failures));
foreach ($failures as $label) {
    echo "  FAIL  {$label}\n";
}
exit(count($failures) === 0 ? 0 : 1);
