<?php
/**
 * 反向验证：故意把教练那层规则逐条改坏（下面 $mutations 里一处一条），看测试能不能各抓到一类问题。
 *
 *   D:/tmp/php81/php.exe tools/chess_coach_core_mutate.php
 *
 * 和 chess_class_core_mutate.php 同一个道理：一份"全绿"既可能说明规则层对，
 * 也可能说明测试压根没在看。这里挑的每一处都是一条独立规则 ——
 * 介绍的下限/上限（含边界差一个）、非字符串、够不够格、大小写、状态机的两头的门、
 * 回给申请人/管理员的形状、资料与预约的边界、撤销优先级，以及申诉的哈希和
 * 公开/私有白名单。抓到就说明那条规则真在被覆盖；漏了要补用例，不是改规则层。
 *
 * 规则层和测试各拷一份到系统临时目录，保持 v1/ 与 tools/ 的相对位置 ——
 * 测试里的 require 才会指向被改坏的那一份，仓库里的真文件一个字都不动。
 * 两元素变异默认改教练核心；三元素变异的第一项是 coach 或 complaint。
 *
 * 退出码：0 = 每一处都变红且控制组全绿；1 = 有一处没抓到或控制组不干净。
 * 这文件不部署：它在 tools/ 下，而只有 v1/ 会同步到服务器的 /api/v1/。
 */

$root = dirname(__DIR__);
$core_src = $root . '/v1/chess_coach_core.php';
$complaint_src = $root . '/v1/chess_coach_complaint_core.php';
$test_src = $root . '/tools/chess_coach_core_test.php';
$scratch = sys_get_temp_dir() . '/chess_coach_core_mutate';

foreach ([$core_src, $complaint_src, $test_src] as $path) {
    if (!is_readable($path)) {
        fwrite(STDERR, "missing: {$path}\n");
        exit(2);
    }
}
@mkdir($scratch . '/v1', 0777, true);
@mkdir($scratch . '/tools', 0777, true);
$core = $scratch . '/v1/chess_coach_core.php';
$complaint = $scratch . '/v1/chess_coach_complaint_core.php';
$test = $scratch . '/tools/chess_coach_core_test.php';
$clean = [
    'coach' => file_get_contents($core_src),
    'complaint' => file_get_contents($complaint_src),
];
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
        "    return coach_key(\$status) === 'approved' && !coach_standing_is_revoked(\$standing);",
        "    return coach_key(\$status) !== 'rejected';",
    ],
    'M7 资格判定时把大小写抹平' => [
        "    return coach_key(\$status) === 'approved' && !coach_standing_is_revoked(\$standing);",
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

    /* --- 教练资料（P4 门面）--- */
    'M14 elo 下限放到 1' => [
        'const COACH_ELO_MIN = 600;',
        'const COACH_ELO_MIN = 1;',
    ],
    'M15 elo 上限放到 9999' => [
        'const COACH_ELO_MAX = 2850;',
        'const COACH_ELO_MAX = 9999;',
    ],
    'M16 空着的 elo 存成 0' => [
        "    if (\$value === null || \$value === '') {\n        return [null, \$field, null];\n    }",
        "    if (\$value === null || \$value === '') {\n        return [0, \$field, null];\n    }",
    ],
    'M17 教龄上限放到 99' => [
        'const COACH_YEARS_MAX = 60;',
        'const COACH_YEARS_MAX = 99;',
    ],
    'M18 称号白名单里多一档 nm' => [
        "const COACH_TITLES = ['gm', 'im', 'fm', 'cm', 'wgm', 'wim', 'wfm', 'wcm'];",
        "const COACH_TITLES = ['gm', 'im', 'fm', 'cm', 'wgm', 'wim', 'wfm', 'wcm', 'nm'];",
    ],
    'M19 简介按字节量长度' => [
        '    if (coach_len($s) > $max) {',
        '    if (strlen($s) > $max) {',
    ],
    'M20 简介收数组（存成 "Array"）' => [
        "    if (!is_string(\$value)) {\n        return ['', \$field, \$badCode];\n    }",
        '',
    ],
    'M21 简介不再判坏字节' => [
        "    if (\$s !== '' && !coach_is_utf8(\$s)) {",
        '    if (false) {',
    ],
    'M22 照片上限放到 9' => [
        'const COACH_PHOTOS_MAX = 3;',
        'const COACH_PHOTOS_MAX = 9;',
    ],
    'M23 图片名不要求收尾（.jpg.php 混进来）' => [
        "const COACH_IMAGE_PATTERN = '/^[a-f0-9]{24}\\.(?:jpg|png|webp)\$/';",
        "const COACH_IMAGE_PATTERN = '/^[a-f0-9]{24}\\.(?:jpg|png|webp)/';",
    ],
    'M24 单张图不判字节上限' => [
        '    if (!is_array($info) || $bytes <= 0 || $bytes > COACH_IMAGE_BYTES_MAX) {',
        '    if (!is_array($info) || $bytes <= 0) {',
    ],
    'M25 单张图不判边长' => [
        '    if ($w < 1 || $h < 1 || $w > COACH_IMAGE_SIDE_MAX || $h > COACH_IMAGE_SIDE_MAX) {',
        '    if ($w < 1 || $h < 1) {',
    ],
    'M26 0 年教龄回界面当成没登记' => [
        "        return \$value === null || \$value === '' ? null : (int) \$value;",
        '        return (int) $value ?: null;',
    ],
    'M27 擅长方向上限放到 9（全勾也收）' => [
        'const COACH_GOALS_MAX_COACH = 3;',
        'const COACH_GOALS_MAX_COACH = 9;',
    ],
    'M28 多选不再把空串当"一个都没选"' => [
        "    if (\$value === null || \$value === '') {\n        \$value = [];\n    }",
        '',
    ],
    'M29 名录那行把 email 带出去' => [
        "        'nickname' => (string) (\$row['nickname'] ?? ''),\n        'rating' =>",
        "        'nickname' => (string) (\$row['nickname'] ?? ''),\n        'email' => \$row['email'] ?? '',\n        'rating' =>",
    ],
    'M30 名录永远说"填过资料"' => [
        "        'has_profile' => coach_profile_filled(\$profile),",
        "        'has_profile' => true,",
    ],
    // 这一条盯的是"公开页把申请那一段带出去"：intro 在库里是给管理员看的，
    // 界面上写死了"只有管理员看得到"，所以哪天有人顺手加回来必须当场红。
    'M31 名录把申请介绍带出去' => [
        "        'profile' => \$profile,",
        "        'intro' => (string) (\$row['intro'] ?? ''),\n        'profile' => \$profile,",
    ],
    'M32 名录把提交日期带出去' => [
        "        'profile' => \$profile,",
        "        'submitted_at' => \$row['submitted_at'] ?? null,\n        'profile' => \$profile,",
    ],
    'M33 证书上限放到 9' => [
        'const COACH_CERTIFICATES_MAX = 6;',
        'const COACH_CERTIFICATES_MAX = 9;',
    ],
    'M34 公开资料漏掉证书' => [
        "        'certificates' => \$list(\$row['certificates'] ?? ''),\n",
        '',
    ],
    'M35 只传证书不算填过资料' => [
        "    foreach (['levels', 'goals', 'formats', 'slots', 'photos', 'certificates'] as \$key) {",
        "    foreach (['levels', 'goals', 'formats', 'slots', 'photos'] as \$key) {",
    ],

    /* --- 学员预算、详细时间与教练公开资料 --- */
    'M36 预算下限高于上限也收' => [
        "    if (\$budgetMin !== null && \$budgetMax !== null && \$budgetMin > \$budgetMax) {",
        "    if (false) {",
    ],
    'M37 金额上限放到一百万' => [
        'const COACH_MONEY_MAX = 100000;',
        'const COACH_MONEY_MAX = 1000000;',
    ],
    'M38 空预算默认成 0' => [
        "function coach_money_opt(\$value, \$min, \$max, \$field, \$code) {\n    if (\$value === null || \$value === '') {\n        return [null, \$field, null];\n    }",
        "function coach_money_opt(\$value, \$min, \$max, \$field, \$code) {\n    if (\$value === null || \$value === '') {\n        return [0, \$field, null];\n    }",
    ],
    'M39 详细时间上限放到 501' => [
        'const COACH_SCHEDULE_NOTE_MAX = 500;',
        'const COACH_SCHEDULE_NOTE_MAX = 501;',
    ],
    'M40 详细时间漏传变成 null' => [
        "            'schedule_note' => \$scheduleNote,",
        "            'schedule_note' => null,",
    ],
    'M41 招生说明不再限 2000 字' => [
        "        \$data['enrollment_notes'] ?? '', COACH_ENROLLMENT_NOTES_MAX, 'enrollment_notes',",
        "        \$data['enrollment_notes'] ?? '', 9999, 'enrollment_notes',",
    ],
    'M42 每小时价格放到一百万' => [
        "        \$data['hourly_rate_cny'] ?? null, 0, COACH_MONEY_MAX, 'hourly_rate_cny', 'bad_rate'",
        "        \$data['hourly_rate_cny'] ?? null, 0, 1000000, 'hourly_rate_cny', 'bad_rate'",
    ],
    'M43 新公开资料一律清空' => [
        "        'enrollment_notes' => (string) (\$row['enrollment_notes'] ?? ''),\n        'tuition_text' => (string) (\$row['tuition_text'] ?? ''),\n        'schedule_text' => (string) (\$row['schedule_text'] ?? ''),\n        'hourly_rate_cny' => \$num(\$row['hourly_rate_cny'] ?? null),",
        "        'enrollment_notes' => '',\n        'tuition_text' => '',\n        'schedule_text' => '',\n        'hourly_rate_cny' => null,",
    ],
    'M44 0 元价格回界面变成没填' => [
        "        'hourly_rate_cny' => \$num(\$row['hourly_rate_cny'] ?? null),",
        "        'hourly_rate_cny' => (\$row['hourly_rate_cny'] ?? null) ?: null,",
    ],
    'M45 新文字字段不算填过资料' => [
        "    foreach (['title', 'tagline', 'honors', 'enrollment_notes', 'tuition_text',\n        'schedule_text', 'language', 'timezone', 'avatar'] as \$key) {",
        "    foreach (['title', 'tagline', 'honors', 'language', 'timezone', 'avatar'] as \$key) {",
    ],
    'M46 0 元价格不算填过资料' => [
        "    return (\$profile['elo'] ?? null) !== null || (\$profile['years'] ?? null) !== null\n        || (\$profile['hourly_rate_cny'] ?? null) !== null;",
        "    return (\$profile['elo'] ?? null) !== null || (\$profile['years'] ?? null) !== null;",
    ],
    'M47 公开资料把 email 带出去' => [
        "        'certificates' => \$list(\$row['certificates'] ?? ''),\n        'updated_at' => \$row['updated_at'] ?? null,",
        "        'certificates' => \$list(\$row['certificates'] ?? ''),\n        'email' => \$row['email'] ?? '',\n        'updated_at' => \$row['updated_at'] ?? null,",
    ],

    /* --- 预约请求 --- */
    'M48 预约许可收整数 1' => [
        "    if ((\$data['contact_ok'] ?? null) !== true) {",
        "    if ((\$data['contact_ok'] ?? null) !== true && (\$data['contact_ok'] ?? null) !== 1\n        && (\$data['contact_ok'] ?? null) !== '1') {",
    ],
    'M49 教练 ID 收前导零' => [
        "    if (is_string(\$value) && preg_match('/^[1-9]\\d{0,9}\$/D', trim(\$value))) {",
        "    if (is_string(\$value) && preg_match('/^\\d{1,10}\$/D', trim(\$value))) {",
    ],
    'M50 预约说明下限放到 19' => [
        '    if ($len < 20 || $len > 2000) {',
        '    if ($len < 19 || $len > 2000) {',
    ],
    'M51 预约说明上限放到 2001' => [
        '    if ($len < 20 || $len > 2000) {',
        '    if ($len < 20 || $len > 2001) {',
    ],
    'M52 预约说明按字节量长度' => [
        '    $len = coach_len($message);',
        '    $len = strlen($message);',
    ],
    'M53 预约说明收数组' => [
        "    \$given = \$data['message'] ?? '';\n    if (!is_string(\$given)) {\n        return \$fail('bad_message', 'message');\n    }",
        "    \$given = \$data['message'] ?? '';",
    ],
    'M54 教练 ID 收 0' => [
        '        return $value > 0 && $value <= 2147483647 ? $value : null;',
        '        return $value >= 0 && $value <= 2147483647 ? $value : null;',
    ],

    /* --- 生效中的撤销 --- */
    'M55 批准状态越过撤销' => [
        "    return coach_key(\$status) === 'approved' && !coach_standing_is_revoked(\$standing);",
        "    return coach_key(\$status) === 'approved';",
    ],
    'M56 空恢复时间算已恢复' => [
        "        && (\$restoredAt === null || \$restoredAt === '');",
        "        && \$restoredAt === null;",
    ],
    'M57 管理员越过生效中的撤销' => [
        "    return !coach_standing_is_revoked(\$standing)\n        && (\$isAdmin === true || coach_can_teach(\$status));",
        "    return \$isAdmin === true || coach_can_teach(\$status, \$standing);",
    ],

    /* --- 申诉核心：边界、哈希、决定与隐私白名单 --- */
    'C1 申诉下限放到 19' => [
        'complaint',
        '    if ($len < COACH_COMPLAINT_TEXT_MIN || $len > COACH_COMPLAINT_TEXT_MAX) {',
        '    if ($len < COACH_COMPLAINT_TEXT_MIN - 1 || $len > COACH_COMPLAINT_TEXT_MAX) {',
    ],
    'C2 申诉上限放到 3001' => [
        'complaint',
        '    if ($len < COACH_COMPLAINT_TEXT_MIN || $len > COACH_COMPLAINT_TEXT_MAX) {',
        '    if ($len < COACH_COMPLAINT_TEXT_MIN || $len > COACH_COMPLAINT_TEXT_MAX + 1) {',
    ],
    'C3 申诉正文按字节量长度' => [
        'complaint',
        '    $len = coach_len($text);',
        '    $len = strlen($text);',
    ],
    'C4 重复哈希不再按教练隔离' => [
        'complaint',
        "        'text_hash' => hash('sha256', \$coachId . ':' . \$text), 'code' => null, 'field' => null];",
        "        'text_hash' => hash('sha256', \$text), 'code' => null, 'field' => null];",
    ],
    'C5 申诉状态多收 approved' => [
        'complaint',
        "const COACH_COMPLAINT_STATUSES = ['pending', 'upheld', 'rejected'];",
        "const COACH_COMPLAINT_STATUSES = ['pending', 'upheld', 'rejected', 'approved'];",
    ],
    'C6 严重程度多收 high' => [
        'complaint',
        "const COACH_COMPLAINT_SEVERITIES = ['normal', 'severe'];",
        "const COACH_COMPLAINT_SEVERITIES = ['normal', 'severe', 'high'];",
    ],
    'C7 处理动作收 approve' => [
        'complaint',
        "    if (\$action !== 'uphold' && \$action !== 'reject') {",
        "    if (\$action !== 'uphold' && \$action !== 'reject' && \$action !== 'approve') {",
    ],
    'C8 revoke 收字符串 true' => [
        'complaint',
        "    if (array_key_exists('revoke', \$data) && !is_bool(\$data['revoke'])) {",
        "    if (array_key_exists('revoke', \$data) && !is_bool(\$data['revoke'])\n        && \$data['revoke'] !== 'true') {",
    ],
    'C9 驳回也能撤销资格' => [
        'complaint',
        "    if (\$action === 'reject') {\n        if (\$revoke) {\n            return \$fail('bad_revoke', 'revoke');\n        }",
        "    if (\$action === 'reject') {",
    ],
    'C10 普通申诉也能撤销资格' => [
        'complaint',
        "    if (\$revoke && \$severity !== 'severe') {",
        '    if (false) {',
    ],
    'C11 维持申诉允许空公开说明' => [
        'complaint',
        "    if (\$publicText === '' || coach_len(\$publicText) > COACH_COMPLAINT_PUBLIC_MAX) {",
        "    if (coach_len(\$publicText) > COACH_COMPLAINT_PUBLIC_MAX) {",
    ],
    'C12 公开说明上限放到 3001' => [
        'complaint',
        'const COACH_COMPLAINT_PUBLIC_MAX = 3000;',
        'const COACH_COMPLAINT_PUBLIC_MAX = 3001;',
    ],
    'C13 恢复原因收数组' => [
        'complaint',
        "    if (!is_string(\$value)) {\n        return ['ok' => false, 'reason' => '', 'code' => 'bad_restore_reason'];\n    }\n    \$reason = coach_trim(\$value);",
        "    \$reason = coach_trim(\$value);",
    ],
    'C14 恢复原因按字节量长度' => [
        'complaint',
        "    if (\$reason === '' || !coach_is_utf8(\$reason) || coach_len(\$reason) > COACH_RESTORE_REASON_MAX) {",
        "    if (\$reason === '' || !coach_is_utf8(\$reason) || strlen(\$reason) > COACH_RESTORE_REASON_MAX) {",
    ],
    'C15 公开申诉夹带原始正文' => [
        'complaint',
        "        'public_text' => (string) (\$row['public_text'] ?? ''),",
        "        'text' => (string) (\$row['text'] ?? ''),\n        'public_text' => (string) (\$row['public_text'] ?? ''),",
    ],
    'C16 私有申诉夹带举报人 ID' => [
        'complaint',
        "        'coach_id' => (int) (\$row['coach_id'] ?? 0),\n        'text' => (string) (\$row['text'] ?? ''),",
        "        'coach_id' => (int) (\$row['coach_id'] ?? 0),\n        'reporter_id' => (int) (\$row['reporter_id'] ?? 0),\n        'text' => (string) (\$row['text'] ?? ''),",
    ],
    'C17 被驳回正文回到教练屏幕' => [
        'complaint',
        "        \$out['text'] = '';",
        "        \$out['text'] = (string) (\$row['text'] ?? '');",
    ],
    'C18 被驳回公开说明回到教练' => [
        'complaint',
        "        \$out['public_text'] = '';",
        "        \$out['public_text'] = (string) (\$row['public_text'] ?? '');",
    ],
    'C19 管理员申诉夹带邮箱' => [
        'complaint',
        "        'coach_nickname' => (string) (\$row['coach_nickname'] ?? \$row['coach_name'] ?? ''),",
        "        'coach_nickname' => (string) (\$row['coach_nickname'] ?? \$row['coach_name'] ?? ''),\n        'email' => (string) (\$row['email'] ?? ''),",
    ],
    'C20 举报回执夹带原始正文' => [
        'complaint',
        "        'status' => (string) (\$row['status'] ?? 'pending'),\n        'created_at' => \$row['created_at'] ?? null,",
        "        'status' => (string) (\$row['status'] ?? 'pending'),\n        'text' => (string) (\$row['text'] ?? ''),\n        'created_at' => \$row['created_at'] ?? null,",
    ],
    'C21 standing 夹带举报人 ID' => [
        'complaint',
        "        'coach_id' => (int) (\$row['player_id'] ?? \$row['coach_id'] ?? 0),",
        "        'coach_id' => (int) (\$row['player_id'] ?? \$row['coach_id'] ?? 0),\n        'reporter_id' => (int) (\$row['reporter_id'] ?? 0),",
    ],
    'C22 恢复原因上限放到 1001' => [
        'complaint',
        'const COACH_RESTORE_REASON_MAX = 1000;',
        'const COACH_RESTORE_REASON_MAX = 1001;',
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
foreach ($mutations as $label => $mutation) {
    $target = count($mutation) === 2 ? 'coach' : $mutation[0];
    [$needle, $replacement] = count($mutation) === 2 ? $mutation : array_slice($mutation, 1);
    $path = $target === 'complaint' ? $complaint : $core;

    file_put_contents($core, $clean['coach']);
    file_put_contents($complaint, $clean['complaint']);
    if ($needle === null) {
        // 控制组两份都保持原样。
    } elseif (strpos($clean[$target], $needle) === false) {
        echo "!! {$label}: 规则层里找不到要改的那一行，这条结论作废\n";
        $missed[] = $label . '（改不动）';
        continue;
    } else {
        file_put_contents($path, str_replace($needle, $replacement, $clean[$target]));
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
@unlink($complaint);
@unlink($test);
@rmdir($scratch . '/v1');
@rmdir($scratch . '/tools');
@rmdir($scratch);

if ($missed) {
    echo "\n反向验证不成立：" . implode('、', $missed) . "\n";
    exit(1);
}
echo "\n" . (count($mutations) - 1) . " 处变异全部变红，控制组全绿 —— 上面那些规则确实逐条在被测试覆盖。\n";
exit(0);
