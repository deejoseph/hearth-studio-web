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
 * 还没做的一步：推荐打分。库里现在只有学员这一半，教练的档案（教龄、
 * 能带的时间段、授课语言）还没有入驻表，所以 matchCoach(pref, coach) 之类
 * 要等那张表建好再写 —— 现在写只能凭想象定权重。
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
        'updated_at' => $row['updated_at'] ?? null,
    ];
}

/**
 * 有没有开课堂的资格。整条链路上只有这一行判它 —— 数据层（chess_app_is_teacher）、
 * 端点回给界面的 can_teach 都走这里，别再写一遍 === 'approved'。
 */
function coach_can_teach($status) {
    return coach_key($status) === 'approved';
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
        'joined_at' => $row['joined_at'] ?? null,
        'submitted_at' => $row['submitted_at'] ?? null,
        'decided_at' => $row['decided_at'] ?? null,
    ];
}
