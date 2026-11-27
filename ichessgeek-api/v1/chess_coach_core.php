<?php
/**
 * 教练偏好的规则层：棋盘表单发来的一个对象进来，能落库的那一份出去 ——
 * 不碰数据库、不碰会话，全是纯函数，所以能离线测（tools/chess_coach_core_test.php）。
 *
 * 这里存的是"学员想找什么样的教练"，不是注册信息：想法会变，随时能改，
 * 所以注册流程里一个字都不填，改这偏好也不影响账号。
 *
 * 存的值全是下面白名单里的 ASCII key。界面上的中文句子在棋盘那侧（
 * chess-puter/src/chess/src/game/coachPref.js），两边共用的是 key 不是措辞：
 * 加一个选项要同时改那两处，改中文不用动代码。
 *
 * 教练的资料在下面的"教练资料"一节：那份是学员在名录上看到的门面，
 * 和这里的偏好共用同一批选项 key（水平/目标/形式/时段/语言/时区），
 * 所以"匹配得上"是两边同一套词在比，不是两套近义词。
 * 打分本身在棋盘那侧（src/chess/src/game/coachMatch.js）：它只决定名录的排序
 * 和卡片上那几行理由，不参与任何资格判定，所以不在这里留一份镜像实现。
 *
 * 禁止直接 URL 访问（同目录 .htaccess 已 FilesMatch 拒绝）。
 */

/** 当前水平：单选，必填。四档足够把"零基础"和"打过比赛"分开。 */
const COACH_LEVELS = ['zero', 'moves', 'play', 'rated'];

/** 主要目标：多选，1–3 个。超过三个等于没重点，教练也排不出课。 */
const COACH_GOALS = ['basics', 'tactics', 'opening', 'endgame', 'contest'];
const COACH_GOALS_MAX = 3;

/** 上课形式：多选，1–2 个。"只批改棋谱"和"一对一"是三种不同的活儿。 */
const COACH_FORMATS = ['one', 'group', 'review'];
const COACH_FORMATS_MAX = 2;

/** 方便时段：多选，0–4 个，可以整条不填。按"和时区搭配的粗段"问，不问具体几点。 */
const COACH_SLOTS = ['wk_ev', 'wkend_am', 'wkend_pm', 'wkend_ev'];

/** 时区：单选，必填。存 IANA 名字，将来排课要靠它把时段换算到教练那一侧。 */
const COACH_TIMEZONES = [
    'Asia/Shanghai', 'Asia/Singapore', 'Asia/Bangkok', 'Asia/Dubai',
    'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles',
    'Australia/Sydney',
];

/** 授课语言：单选，必填。中英都行是一个真实选项，不是"两个都选"。 */
const COACH_LANGUAGES = ['zh', 'en', 'zh_en'];

/** 补充说明的码点上限。库里那一列按字符建，两边取同一个数。 */
const COACH_NOTE_MAX = 240;

/** 招生补充、收费说明、详细时间与预算的共同口径。 */
const COACH_ENROLLMENT_NOTES_MAX = 2000;
const COACH_TUITION_TEXT_MAX = 1000;
const COACH_SCHEDULE_TEXT_MAX = 1000;
const COACH_SCHEDULE_NOTE_MAX = 240;
const COACH_MONEY_MAX = 100000;

/* --------------------------------------------------------------------------
 * 想当教练的那一份申请。和偏好的区别：偏好是"我想要什么"，随时能改；
 * 申请是"我要替别人上课"，交上来就要有人审，审过才算数。
 * ------------------------------------------------------------------------ */

/**
 * 三态。'pending' 是唯一能从界面进去的状态 —— approved / rejected 只能由
 * 管理员那侧写（coach_admin_decide.php），端点这边没有能让自己的申请变
 * approved 的路径。这一条是整个资格位的支点：棋盘上任何一个人发什么都
 * 换不来开课堂的权利。
 */
const COACH_APP_STATUSES = ['pending', 'approved', 'rejected'];

/** 自我介绍的码点区间。下限是真的有用：空着一段话，管理员没东西可判。 */
const COACH_INTRO_MIN = 10;
const COACH_INTRO_MAX = 400;

/** 管理员点的是批准还是拒绝。'pending' 不在这里 —— 没人能"批准成待审"。 */
const COACH_DECISIONS = ['approved', 'rejected'];

/**
 * "按码点量长度"和"按码点截断"必须同一口径，否则同一段中文会被量成两种长度。
 * 和 chess_guard.php 的 chess_len/chess_trim 是同一套写法：共享主机不一定编了
 * mbstring，所以每个 mb_* 调用都留 preg_split('//u') 这条退路。
 */
function coach_len($s) {
    if (function_exists('mb_strlen')) {
        return mb_strlen($s, 'UTF-8');
    }
    return count(preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: []);
}

function coach_cut($s, $max) {
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $max, 'UTF-8');
    }
    return implode('', array_slice(preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) ?: [], 0, $max));
}

function coach_trim($value) {
    // 空白要归一成"一个普通空格"再 trim：中文输入里最常见的是全角空格 U+3000
    //（E3 80 80），网页上还常有 &nbsp; 带进来的 U+00A0。留着它们，
    // 一句"想补　战术"在教练那边看着就像两个词中间断了半行。
    $s = str_replace(["\xE3\x80\x80", "\xC2\xA0", "\0"], ' ', (string) ($value ?? ''));
    // 控制字符按字节删（ASCII 控制字节不会出现在 UTF-8 多字节序列里）。
    // 带 /u 的版本遇到坏字节会整段返回 null —— 那等于把人写的说明清空。
    $s = preg_replace('/[\x00-\x1F\x7F]/', ' ', $s) ?? '';
    $s = preg_replace('/ {2,}/', ' ', $s) ?? '';
    return trim($s);
}

/**
 * 选项 key 一律"只去空格、不改大小写"。
 *
 * 不做 strtolower：白名单里有时区名（Asia/Shanghai），小写化会把每一个真时区
 * 都判成不合法 —— 而这种错的现场表现是"表单怎么填都说不合法"，比严格一点麻烦得多。
 * key 是界面发来的固定字符串，不是人敲的，没有宽容的必要。
 */
function coach_key($value) {
    return is_string($value) ? trim($value) : null;
}

/**
 * 单选：值必须在白名单里，否则算这条没填对。
 * 返回 [key|null, field|null] —— field 让界面知道该把红字挂在哪一组上。
 */
function coach_pick($value, array $allowed, $field) {
    $key = coach_key($value);
    return [$key !== null && in_array($key, $allowed, true) ? $key : null, $field];
}

/**
 * 多选：收一个数组，去重后按白名单顺序排好。
 *
 * 按白名单顺序而不是"用户点击顺序"排：同一份选择每次都存成同一个串，
 * 之后统计"多少人想补战术"才是数一列，而不是把 h 种排列各算一份。
 * 传进来的顺序因此不能保留 —— 这里没有"第一志愿"的意思。
 *
 * 返回 [csv|null, field|null]；null 表示这一组不合格。
 */
function coach_pick_many($value, array $allowed, $min, $max, $field) {
    if (is_string($value)) {
        // 单选取了一个值又发到多选字段上：只此一个时当它是一条，不然算没填对
        $value = [$value];
    }
    if (!is_array($value) || count($value) > count($allowed)) {
        return [null, $field];
    }
    $picked = [];
    foreach ($value as $item) {
        $key = coach_key($item);
        $at = $key === null ? false : array_search($key, $allowed, true);
        if ($at === false) {
            return [null, $field];
        }
        $picked[$at] = true;   // 重复的那一个自然被吃掉
    }
    if (count($picked) < $min || count($picked) > $max) {
        return [null, $field];
    }
    $keys = array_keys($picked);
    sort($keys);
    return [implode(',', array_map(static fn ($i) => $allowed[$i], $keys)), $field];
}

/**
 * 是不是一段能安全进 utf8mb4 的文本。
 *
 * 用 json_encode 判：它对坏字节返回 false，而这个判断不依赖 mbstring
 * （chess_guard 那边每个 mb_* 都留退路，就是因为它不一定编了）。
 * 不挡这一条的后果是 INSERT 直接失败，人看到的是一句"操作失败"，
 * 而他刚写的说明其实没什么不对 —— 只是混进了坏字节。
 */
function coach_is_utf8($s) {
    return json_encode($s) !== false;
}

/**
 * 一个偏好对象 → 能落库的那一份。
 *
 * 返回 ['ok'=>bool, 'pref'=>array|null, 'code'=>string|null, 'field'=>string|null]。
 * code 只有三种：bad_pref（某一项不在白名单/数量不对）、long_note（说明太长）、
 * bad_note（说明里有坏字节，进不了库）。落库的形状由这里定死，端点不再自己拼，
 * 所以库里的列和这里说的永远一致。
 */
function coach_pref_normalize($data) {
    $fail = static function ($code, $field) {
        return ['ok' => false, 'pref' => null, 'code' => $code, 'field' => $field];
    };
    if (!is_array($data)) {
        return $fail('bad_pref', null);
    }

    [$level, $field] = coach_pick($data['level'] ?? null, COACH_LEVELS, 'level');
    if ($level === null) {
        return $fail('bad_pref', $field);
    }

    [$goals, $field] = coach_pick_many($data['goals'] ?? null, COACH_GOALS, 1, COACH_GOALS_MAX, 'goals');
    if ($goals === null) {
        return $fail('bad_pref', $field);
    }

    [$formats, $field] = coach_pick_many($data['formats'] ?? null, COACH_FORMATS, 1, COACH_FORMATS_MAX, 'formats');
    if ($formats === null) {
        return $fail('bad_pref', $field);
    }

    // 时段可以一个都不选（有人只是先说说水平和目标），但选了就得全认
    [$slots, $field] = coach_pick_many(
        $data['slots'] ?? [],
        COACH_SLOTS,
        0,
        count(COACH_SLOTS),
        'slots'
    );
    if ($slots === null) {
        return $fail('bad_pref', $field);
    }

    [$timezone, $field] = coach_pick($data['timezone'] ?? null, COACH_TIMEZONES, 'timezone');
    if ($timezone === null) {
        return $fail('bad_pref', $field);
    }

    [$language, $field] = coach_pick($data['language'] ?? null, COACH_LANGUAGES, 'language');
    if ($language === null) {
        return $fail('bad_pref', $field);
    }

    // note 只收字符串：数组经 coach_trim 会变成 'Array' 五个字，安安静静存进库，
    // 教练那边看到的就是一句没头没尾的话。
    $givenNote = $data['note'] ?? '';
    if (!is_string($givenNote)) {
        return $fail('bad_note', 'note');
    }
    $note = coach_trim($givenNote);
    if ($note !== '' && !coach_is_utf8($note)) {
        return $fail('bad_note', 'note');
    }
    if (coach_len($note) > COACH_NOTE_MAX) {
        return $fail('long_note', 'note');
    }

    [$budgetMin, $field, $code] = coach_money_opt(
        $data['budget_min_cny'] ?? null, 0, COACH_MONEY_MAX, 'budget_min_cny', 'bad_budget'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }
    [$budgetMax, $field, $code] = coach_money_opt(
        $data['budget_max_cny'] ?? null, 0, COACH_MONEY_MAX, 'budget_max_cny', 'bad_budget'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }
    if ($budgetMin !== null && $budgetMax !== null && $budgetMin > $budgetMax) {
        return $fail('bad_budget', 'budget_max_cny');
    }

    [$scheduleNote, $field, $code] = coach_text_opt(
        $data['schedule_note'] ?? '', COACH_SCHEDULE_NOTE_MAX, 'schedule_note', 'long_schedule', 'bad_schedule'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    // 联系许可只能显式给。缺字段算"不同意"，不能让一个漏传把人的邮箱交出去
    $contact = $data['contact_ok'] ?? false;
    $contactOk = (int) ($contact === true || $contact === 1 || $contact === '1');

    return [
        'ok' => true,
        'pref' => [
            'level' => $level,
            'goals' => $goals,
            'formats' => $formats,
            'slots' => $slots,
            'timezone' => $timezone,
            'language' => $language,
            'note' => $note,
            'contact_ok' => $contactOk,
            'budget_min_cny' => $budgetMin,
            'budget_max_cny' => $budgetMax,
            'schedule_note' => $scheduleNote,
        ],
        'code' => null,
        'field' => null,
    ];
}

/** 库里的一行（多选是逗号串）→ 回给界面的形状（多选是数组）。 */
function coach_pref_public($row) {
    $list = static function ($value) {
        $value = trim((string) ($value ?? ''));
        return $value === '' ? [] : explode(',', $value);
    };
    return [
        'level' => $row['level'],
        'goals' => $list($row['goals']),
        'formats' => $list($row['formats']),
        'slots' => $list($row['slots']),
        'timezone' => $row['timezone'],
        'language' => $row['language'],
        'note' => $row['note'] ?? '',
        'contact_ok' => (bool) ($row['contact_ok'] ?? false),
        'budget_min_cny' => isset($row['budget_min_cny']) && $row['budget_min_cny'] !== ''
            ? (int) $row['budget_min_cny'] : null,
        'budget_max_cny' => isset($row['budget_max_cny']) && $row['budget_max_cny'] !== ''
            ? (int) $row['budget_max_cny'] : null,
        'schedule_note' => (string) ($row['schedule_note'] ?? ''),
        'updated_at' => $row['updated_at'] ?? null,
    ];
}

/** 只有正在生效且没有恢复的撤销记录才挡住资格。 */
function coach_standing_is_revoked($standing) {
    if (!is_array($standing)) {
        return coach_key($standing) === 'revoked';
    }
    $restoredAt = $standing['restored_at'] ?? null;
    return coach_key($standing['status'] ?? null) === 'revoked'
        && ($restoredAt === null || $restoredAt === '');
}

/** 申请本身的资格；撤销记录优先于批准状态。 */
function coach_can_teach($status, $standing = null) {
    return coach_key($status) === 'approved' && !coach_standing_is_revoked($standing);
}

/** 管理员或已批准申请都能教，但都不能越过正在生效的撤销。 */
function coach_eligible($status, $isAdmin, $standing = null) {
    return !coach_standing_is_revoked($standing)
        && ($isAdmin === true || coach_can_teach($status));
}

/**
 * 一份申请 → 能落库的那一份。
 *
 * 只有一个字段，所以判定也只剩"这段话能不能用"：
 * short_intro（空着或太短，管理员没东西可判）、long_intro（超过 400 码点，
 * 库里那一列装不下）、bad_intro（混了坏字节，INSERT 会直接失败）。
 * 和偏好那条 note 一样，字数按码点量 —— 一句中文按字节量能翻三倍，
 * 界面写的"最多 400 字"就不是同一个 400。
 */
function coach_app_normalize($data) {
    $fail = static function ($code) {
        return ['ok' => false, 'intro' => '', 'code' => $code, 'field' => 'intro'];
    };
    if (!is_array($data)) {
        return $fail('short_intro');
    }

    // 只收字符串。发来个数组就当成"没写"：coach_trim 会把数组硬转成 'Array' 五个字，
    // 那种东西不该出现在管理员的审核屏上。
    $given = $data['intro'] ?? '';
    if (!is_string($given)) {
        return $fail('short_intro');
    }
    $intro = coach_trim($given);
    if ($intro !== '' && !coach_is_utf8($intro)) {
        return $fail('bad_intro');
    }
    $len = coach_len($intro);
    if ($len < COACH_INTRO_MIN) {
        return $fail('short_intro');
    }
    if ($len > COACH_INTRO_MAX) {
        return $fail('long_intro');
    }

    return ['ok' => true, 'intro' => $intro, 'code' => null, 'field' => null];
}

/** 管理员点的那一下是不是"批准/拒绝"里的一个。别的值一律不认。 */
function coach_decision($value) {
    $key = coach_key($value);
    return $key !== null && in_array($key, COACH_DECISIONS, true) ? $key : null;
}

/**
 * 状态机：现在这一态 + 管理员这一个动作 → 下一态；null 表示这一步不成立。
 *
 * 三条都真会用到，所以写出来而不是"显然"：
 *   pending → approved/rejected  正常审核
 *   rejected → approved           看错了要能改
 *   approved → rejected           撤销开课堂的资格
 * 唯一不给的是任何态 → pending：重新提交走的是学员那侧的 upsert
 * （chess_app_submit），不是管理员的动作。把它放进这张表就等于给后台
 * 开了一个"把已批准的教练打回待审"的按钮，而那个位置点下去是静默丢权限的。
 */
function coach_app_decide($status, $decision) {
    $from = coach_key($status);
    $to = coach_decision($decision);
    // 现在这一态必须是那三个之一。库里冒出第四个值说明数据被谁改坏了，
    // 这时候照写新状态会把痕迹盖掉，回头查不到是怎么来的。
    if ($to === null || !in_array($from, COACH_APP_STATUSES, true)) {
        return null;
    }
    return $to;
}

/** 申请人自己看到的那一份：不带谁审的、不带管理员的任何信息。 */
function coach_app_public($row) {
    return [
        'status' => $row['status'] ?? 'pending',
        'intro' => $row['intro'] ?? '',
        'submitted_at' => $row['submitted_at'] ?? null,
        'updated_at' => $row['updated_at'] ?? null,
        'decided_at' => $row['decided_at'] ?? null,
    ];
}

/**
 * 管理员列表里的一行。
 *
 * email/nickname 是判这个人能不能教书要看的，也是管理员回复申请人的唯一途径 ——
 * 而 password_hash / verify_token_hash 一列都不在这里出现，连读都不读
 * （见 chess_guard.php 的 chess_app_list()，SELECT 里就没有那两列）。
 *
 * has_pref 带的是"这个人填过想找什么样的教练"：他自己来下过棋、还写了偏好，
 * 是管理员判"是学员还是来打广告"时最省事的一条线索。
 */
function coach_app_admin($row) {
    return [
        'player_id' => (int) ($row['player_id'] ?? 0),
        'status' => $row['status'] ?? 'pending',
        'intro' => $row['intro'] ?? '',
        'nickname' => $row['nickname'] ?? '',
        'email' => $row['email'] ?? '',
        'verified' => ($row['verified_at'] ?? null) !== null,
        'rating' => (int) ($row['rating'] ?? 1200),
        'has_pref' => (int) ($row['has_pref'] ?? 0) > 0,
        'title' => (string) ($row['title'] ?? ''),
        'elo' => $row['elo'] ?? null,
        'years' => $row['years'] ?? null,
        'joined_at' => $row['joined_at'] ?? null,
        'submitted_at' => $row['submitted_at'] ?? null,
        'decided_at' => $row['decided_at'] ?? null,
    ];
}

/* --------------------------------------------------------------------------
 * 教练的资料（名录上那张门面）。
 *
 * 为什么不并进 chess_coach_apps：那行是审核记录，重新提交一次介绍就会把状态
 * 写回 pending、把上次的结论清掉（chess_app_submit）。资料不该跟着陪葬 ——
 * 一个已批准的教练换张头像，不该当场丢掉开课堂的权利。所以资料单表、
 * 只由教练自己写，判够不够格的还是申请那一行的 status。
 *
 * 🔴 每一个字段都可以留空。资料是慢慢补的，不是门槛：什么都还没填的教练
 * 照样出现在名录里，只是卡片上少几行。这里绝不判"填全了没"。
 *
 * 选项 key 全部复用上面偏好那几张白名单（水平/目标/形式/时段/语言/时区）——
 * 学员要的和一个教练能给的，必须是同一套词，否则匹配出来的是近义词。
 * ------------------------------------------------------------------------ */

/**
 * FIDE 称号。只收这几个小写 key，中文（国际大师、棋协大师……）在棋盘那侧。
 * 女子称号单列（wgm/wim/wfm/wcm），因为它们是四张不同的证，不是"女子版"的修饰。
 */
const COACH_TITLES = ['gm', 'im', 'fm', 'cm', 'wgm', 'wim', 'wfm', 'wcm'];

/**
 * ELO 区间。下限压到 600：青少年登记分能低到三位数，卡在 1000 会把真人判成非法。
 * 上限 2850 给世界第一留了余量，同时还能挡住"手滑多打一个 0"。
 */
const COACH_ELO_MIN = 600;
const COACH_ELO_MAX = 2850;

/** 教龄上限（年）。超过这个数多半是填错了，不是真教了这么久。 */
const COACH_YEARS_MAX = 60;

/** 一句话简介与荣誉的码点上限。库里那两列按这两个数建，界面上印的也是这两个数。 */
const COACH_TAGLINE_MAX = 80;
const COACH_HONORS_MAX = 300;

/** 照片上限。三张足够说明"这个人在教棋"，再多就是相册，而这是名录不是网盘。 */
const COACH_PHOTOS_MAX = 3;

/** 证书与荣誉图片上限。证书要完整露出，六张足够放主要资历。 */
const COACH_CERTIFICATES_MAX = 6;

/** 图片文件名形状：随机 24 位十六进制 + 三种真图片扩展名之一。 */
const COACH_IMAGE_PATTERN = '/^[a-f0-9]{24}\.(?:jpg|png|webp)$/';

/** 上传时认的三种真图片，key 是 getimagesize() 报的 MIME。 */
const COACH_IMAGE_TYPES = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/webp' => 'webp',
];

/** 单张图的字节上限与边长上限。名录一页十几张卡，图是这台机器上最贵的那部分。 */
const COACH_IMAGE_BYTES_MAX = 2 * 1024 * 1024;
const COACH_IMAGE_SIDE_MAX = 4000;

/**
 * 多选上限：能带的水平 1–4、擅长方向 1–3、上课形式 1–3、时段 0–4（时段可以不填）。
 *
 * levels/formats 这两个数和白名单一样长，意思是"全列都允许"：确实有人就是从零基础
 * 带到有等级分，也确实有人三种形式都开 —— 那不是超卖。留着这两个数而不是写死
 * count()，是因为白名单以后加一档时这两个口径不该跟着自动放宽。
 * goals 收到 3 条（白名单有 5 项）：五项全勾在名录上等于什么都没标，
 * 而这份资料存在的理由就是让人看出这个人擅长什么。
 */
const COACH_LEVELS_MAX = 4;
const COACH_GOALS_MAX_COACH = 3;
const COACH_FORMATS_MAX_COACH = 3;

/**
 * 可选单选：留空 = "没填"（存空串），填了就必须是白名单里的 key。
 * 返回 [值, 字段, 错误码|null]，第三项非 null 时前两项没人该看。
 */
function coach_pick_opt($value, array $allowed, $field, $code = 'bad_profile') {
    if ($value === null || $value === '') {
        return ['', $field, null];
    }
    $key = coach_key($value);
    if ($key === '' || !in_array($key, $allowed, true)) {
        return ['', $field, $code];
    }
    return [$key, $field, null];
}

/**
 * 可选整数：留空给 null（"没登记"和"0 分"是两件事，不能都存成 0）；
 * 只收纯数字串或整数，别的形状一律不合格 —— 界面发的是数字输入框，
 * 收到 '1500 分左右' 那种东西说明有人在绕界面，那更该挡住。
 */
function coach_int_opt($value, $min, $max, $field, $code = 'bad_profile') {
    if ($value === null || $value === '') {
        return [null, $field, null];
    }
    if (is_int($value)) {
        $n = $value;
    } elseif (is_string($value) && preg_match('/^\d{1,4}$/', trim($value))) {
        $n = (int) trim($value);
    } else {
        return [null, $field, $code];
    }
    if ($n < $min || $n > $max) {
        return [null, $field, $code];
    }
    return [$n, $field, null];
}

/** 金额允许到六位，空值保持 null；0 元和没填预算不是一回事。 */
function coach_money_opt($value, $min, $max, $field, $code) {
    if ($value === null || $value === '') {
        return [null, $field, null];
    }
    if (is_int($value)) {
        $n = $value;
    } elseif (is_string($value) && preg_match('/^\d{1,6}$/', trim($value))) {
        $n = (int) trim($value);
    } else {
        return [null, $field, $code];
    }
    if ($n < $min || $n > $max) {
        return [null, $field, $code];
    }
    return [$n, $field, null];
}

/** ID 只收正整数或十进制数字串，不让 "1abc"、数组和浮点数混进查询。 */
function coach_positive_id($value) {
    if (is_int($value)) {
        return $value > 0 && $value <= 2147483647 ? $value : null;
    }
    if (is_string($value) && preg_match('/^[1-9]\d{0,9}$/D', trim($value))) {
        $id = (int) trim($value);
        return $id <= 2147483647 ? $id : null;
    }
    return null;
}

/** 预约请求：许可必须显式为 true，正文按码点量长度。 */
function coach_inquiry_normalize($data) {
    $fail = static function ($code, $field = null) {
        return ['ok' => false, 'coach_id' => null, 'message' => '', 'contact_ok' => false,
            'code' => $code, 'field' => $field];
    };
    if (!is_array($data)) {
        return $fail('bad_body');
    }
    $coachId = coach_positive_id($data['coach_id'] ?? null);
    if ($coachId === null) {
        return $fail('bad_coach_id', 'coach_id');
    }
    if (($data['contact_ok'] ?? null) !== true) {
        return $fail('contact_required', 'contact_ok');
    }
    $given = $data['message'] ?? '';
    if (!is_string($given)) {
        return $fail('bad_message', 'message');
    }
    $message = coach_trim($given);
    if ($message !== '' && !coach_is_utf8($message)) {
        return $fail('bad_message', 'message');
    }
    $len = coach_len($message);
    if ($len < 20 || $len > 2000) {
        return $fail($len < 20 ? 'short_message' : 'long_message', 'message');
    }
    $requestId = $data['request_id'] ?? null;
    if ($requestId !== null
        && (!is_string($requestId) || !preg_match('/^[A-Za-z0-9_-]{16,128}$/D', $requestId))) {
        return $fail('bad_request_id', 'request_id');
    }
    return ['ok' => true, 'coach_id' => $coachId, 'message' => $message, 'contact_ok' => true,
        'request_id' => $requestId, 'code' => null, 'field' => null];
}

/**
 * 可选文本。判定和偏好那条 note 完全同口径（coach_trim → 坏字节 → 码点上限），
 * 因为同一句中文按字节量能差三倍，界面上印的上限必须是同一个量法。
 */
function coach_text_opt($value, $max, $field, $longCode, $badCode) {
    if ($value === null) {
        return ['', $field, null];
    }
    // 只收字符串：数组经 coach_trim 会变成 'Array' 五个字，安安静静进库。
    if (!is_string($value)) {
        return ['', $field, $badCode];
    }
    $s = coach_trim($value);
    if ($s !== '' && !coach_is_utf8($s)) {
        return ['', $field, $badCode];
    }
    if (coach_len($s) > $max) {
        return ['', $field, $longCode];
    }
    return [$s, $field, null];
}

/**
 * 多选，可以整条不填（min 固定 0）。去重 + 按白名单顺序排，同 coach_pick_many：
 * 之后按选项数人、算匹配度数的都是同一列，而不是几种排列。
 */
function coach_many_opt($value, array $allowed, $max, $field, $code = 'bad_profile') {
    // 空串按"一个都没选"处理，而不是丢给 coach_pick_many：那边把字符串包成
    // 单元素数组，'' 就成了"选了一个不存在的 key"，报出来的是一句"选项不对"，
    // 而人其实什么都没勾。
    if ($value === null || $value === '') {
        $value = [];
    }
    [$csv, $badField] = coach_pick_many($value, $allowed, 0, $max, $field);
    return $csv === null ? ['', $field, $code] : [$csv, $field, null];
}

/**
 * 一个图片文件名 → 规范名。
 *
 * 只认那个形状，不认路径：库里存的就是这一串，取文件时目录由服务端拼
 * （coach_media/<player_id>/），所以这里放过一个带斜杠或 ".." 的名字，
 * 就等于把整台主机的文件系统交出去。形状先判死，后面连读都不去读。
 */
function coach_image_name($value, $field = 'avatar', $code = 'bad_image') {
    $name = is_string($value) ? trim($value) : null;
    if ($name === null || $name === '') {
        return ['', $field, null];
    }
    return preg_match(COACH_IMAGE_PATTERN, $name) ? [$name, $field, null] : ['', $field, $code];
}

/**
 * 一串图片文件名（照片）。这里保留发来的顺序，只去重 ——
 * 第一张是要当封面显示的，顺序是教练自己排的，不像选项那样有"规范次序"可言。
 */
function coach_image_list($value, $max, $field = 'photos', $code = 'bad_image', $tooManyCode = 'too_many_photos') {
    if ($value === null || $value === '') {
        return ['', $field, null];
    }
    if (is_string($value)) {
        $value = explode(',', $value);
    }
    if (!is_array($value)) {
        return ['', $field, $code];
    }
    $kept = [];
    foreach ($value as $item) {
        [$name, , $bad] = coach_image_name($item, $field, $code);
        if ($bad !== null) {
            return ['', $field, $bad];
        }
        if ($name === '' || isset($kept[$name])) {
            continue;
        }
        $kept[$name] = true;
    }
    if (count($kept) > $max) {
        return ['', $field, $tooManyCode];
    }
    return [implode(',', array_keys($kept)), $field, null];
}

/**
 * 一份资料表单 → 能落库的那一份。
 *
 * 覆盖式保存：界面先把当前那一份读回来再整份发回，所以这里不必区分
 * "没发这个键"和"发了空串" —— 那两种都按"清空"处理。少一套缺省语义，
 * 就少一处只有真浏览器才能发现的漏存（同页多组控件共用一个 name 那类坑）。
 */
function coach_profile_normalize($data) {
    $fail = static function ($code, $field) {
        return ['ok' => false, 'profile' => null, 'code' => $code, 'field' => $field];
    };
    if (!is_array($data)) {
        return $fail('bad_profile', null);
    }

    $out = [];

    [$out['title'], $field, $code] = coach_pick_opt($data['title'] ?? '', COACH_TITLES, 'title');
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['elo'], $field, $code] = coach_int_opt($data['elo'] ?? '', COACH_ELO_MIN, COACH_ELO_MAX, 'elo');
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['years'], $field, $code] = coach_int_opt($data['years'] ?? '', 0, COACH_YEARS_MAX, 'years');
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['tagline'], $field, $code] = coach_text_opt(
        $data['tagline'] ?? '', COACH_TAGLINE_MAX, 'tagline', 'long_tagline', 'bad_tagline'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['honors'], $field, $code] = coach_text_opt(
        $data['honors'] ?? '', COACH_HONORS_MAX, 'honors', 'long_honors', 'bad_honors'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['enrollment_notes'], $field, $code] = coach_text_opt(
        $data['enrollment_notes'] ?? '', COACH_ENROLLMENT_NOTES_MAX, 'enrollment_notes',
        'long_enrollment_notes', 'bad_enrollment_notes'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['tuition_text'], $field, $code] = coach_text_opt(
        $data['tuition_text'] ?? '', COACH_TUITION_TEXT_MAX, 'tuition_text', 'long_tuition', 'bad_tuition'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['schedule_text'], $field, $code] = coach_text_opt(
        $data['schedule_text'] ?? '', COACH_SCHEDULE_TEXT_MAX, 'schedule_text', 'long_schedule_text', 'bad_schedule_text'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['hourly_rate_cny'], $field, $code] = coach_money_opt(
        $data['hourly_rate_cny'] ?? null, 0, COACH_MONEY_MAX, 'hourly_rate_cny', 'bad_rate'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['language'], $field, $code] = coach_pick_opt($data['language'] ?? '', COACH_LANGUAGES, 'language');
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['timezone'], $field, $code] = coach_pick_opt($data['timezone'] ?? '', COACH_TIMEZONES, 'timezone');
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['levels'], $field, $code] = coach_many_opt(
        $data['levels'] ?? [], COACH_LEVELS, COACH_LEVELS_MAX, 'levels'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['goals'], $field, $code] = coach_many_opt(
        $data['goals'] ?? [], COACH_GOALS, COACH_GOALS_MAX_COACH, 'goals'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['formats'], $field, $code] = coach_many_opt(
        $data['formats'] ?? [], COACH_FORMATS, COACH_FORMATS_MAX_COACH, 'formats'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['slots'], $field, $code] = coach_many_opt(
        $data['slots'] ?? [], COACH_SLOTS, count(COACH_SLOTS), 'slots'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['avatar'], $field, $code] = coach_image_name($data['avatar'] ?? '', 'avatar');
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['photos'], $field, $code] = coach_image_list($data['photos'] ?? '', COACH_PHOTOS_MAX, 'photos');
    if ($code !== null) {
        return $fail($code, $field);
    }

    [$out['certificates'], $field, $code] = coach_image_list(
        $data['certificates'] ?? '', COACH_CERTIFICATES_MAX, 'certificates', 'bad_image', 'too_many_certificates'
    );
    if ($code !== null) {
        return $fail($code, $field);
    }

    return ['ok' => true, 'profile' => $out, 'code' => null, 'field' => null];
}

/** 库里的一行（多选与照片是逗号串）→ 回给界面的形状（数组）。 */
function coach_profile_public($row) {
    $list = static function ($value) {
        $value = trim((string) ($value ?? ''));
        return $value === '' ? [] : explode(',', $value);
    };
    // elo/years 用 isset 而不是 ?:：0 年教龄和没登记是两件事，
    // 一个要显示"0 年"（刚起步），一个要整行不出现。
    $num = static function ($value) {
        return $value === null || $value === '' ? null : (int) $value;
    };
    return [
        'title' => (string) ($row['title'] ?? ''),
        'elo' => $num($row['elo'] ?? null),
        'years' => $num($row['years'] ?? null),
        'tagline' => (string) ($row['tagline'] ?? ''),
        'honors' => (string) ($row['honors'] ?? ''),
        'enrollment_notes' => (string) ($row['enrollment_notes'] ?? ''),
        'tuition_text' => (string) ($row['tuition_text'] ?? ''),
        'schedule_text' => (string) ($row['schedule_text'] ?? ''),
        'hourly_rate_cny' => $num($row['hourly_rate_cny'] ?? null),
        'language' => (string) ($row['language'] ?? ''),
        'timezone' => (string) ($row['timezone'] ?? ''),
        'levels' => $list($row['levels'] ?? ''),
        'goals' => $list($row['goals'] ?? ''),
        'formats' => $list($row['formats'] ?? ''),
        'slots' => $list($row['slots'] ?? ''),
        'avatar' => (string) ($row['avatar'] ?? ''),
        'photos' => $list($row['photos'] ?? ''),
        'certificates' => $list($row['certificates'] ?? ''),
        'updated_at' => $row['updated_at'] ?? null,
    ];
}

/**
 * 这份资料填过没有。
 *
 * 全空的一行和"根本没这一行"在界面上要说同一句话（"还没填资料"），
 * 而 chess_profile_ensure() 会因为传了一张照片就先建一行 —— 那时候别的列
 * 还全是默认值。所以这里判的是内容，不是有没有行。
 */
function coach_profile_filled($profile) {
    foreach (['title', 'tagline', 'honors', 'enrollment_notes', 'tuition_text',
        'schedule_text', 'language', 'timezone', 'avatar'] as $key) {
        if ((string) ($profile[$key] ?? '') !== '') {
            return true;
        }
    }
    foreach (['levels', 'goals', 'formats', 'slots', 'photos', 'certificates'] as $key) {
        if ((array) ($profile[$key] ?? []) !== []) {
            return true;
        }
    }
    // 0 元、0 分、0 年都是填过了，不是没填。
    return ($profile['elo'] ?? null) !== null || ($profile['years'] ?? null) !== null
        || ($profile['hourly_rate_cny'] ?? null) !== null;
}

/**
 * 名录/主页上的一行 → 给界面的形状。
 *
 * 🔴 这一行里没有 email，也没有 verified_at：名录是公开页面，
 * 邮箱进了它就等于把每个教练的邮箱挂在网上。要联系走的是站内那套，不是这里。
 * intro（申请时写给管理员看的那段经历）也不在这里 —— 界面上那句承诺是
 * "只有管理员看得到"，把它印到公开主页上就是食言。教练要对外说的话，
 * 在资料那一份里自己填（tagline / honors）。
 *
 * 入参是 chess_coach_rows() 那条 JOIN 出来的扁平行（资料列没建时用 ?? 兜默认值），
 * 资料那一坨整个交给 coach_profile_public() 整形，界面因此只有一条读路径。
 */
function coach_directory_entry($row) {
    $profile = coach_profile_public($row);
    $profile['updated_at'] = $row['profile_at'] ?? null;
    $rating = $row['rating'] ?? null;
    return [
        'player_id' => (int) ($row['player_id'] ?? 0),
        'nickname' => (string) ($row['nickname'] ?? ''),
        'rating' => $rating === null || $rating === '' ? null : (int) $rating,
        'profile' => $profile,
        'has_profile' => coach_profile_filled($profile),
    ];
}

/**
 * 上传的那份临时图 → 该不该收。
 *
 * 判据来自 getimagesize()（读文件头，不看人给的 MIME）：浏览器说的
 * Content-Type 是客户端字段，把 .php 改名成 .jpg 再标 image/jpeg 照样能过。
 * 这里要的是"它真是这三种图之一，并且尺寸在预算内"。
 *
 * 返回 [规范名|null, 错误码|null]；规范名 = 随机 24 位十六进制 + 真类型给的扩展名。
 */
function coach_image_store_name($info, $bytes, $randHex) {
    if (!is_array($info) || $bytes <= 0 || $bytes > COACH_IMAGE_BYTES_MAX) {
        return [null, 'big_image'];
    }
    $ext = COACH_IMAGE_TYPES[$info['mime'] ?? ''] ?? null;
    if ($ext === null) {
        return [null, 'bad_image'];
    }
    $w = (int) ($info[0] ?? 0);
    $h = (int) ($info[1] ?? 0);
    if ($w < 1 || $h < 1 || $w > COACH_IMAGE_SIDE_MAX || $h > COACH_IMAGE_SIDE_MAX) {
        return [null, 'big_image'];
    }
    if (!preg_match('/^[a-f0-9]{24}$/', $randHex)) {
        return [null, 'bad_image'];
    }
    return [$randHex . '.' . $ext, null];
}
