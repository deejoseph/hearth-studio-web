<?php
/**
 * 课堂规则层的离线测试：不连数据库、不发 HTTP，纯函数进纯函数出。
 *
 *   D:/tmp/php81/php.exe tools/chess_class_core_test.php
 *
 * 课堂模式和房间模式的区别决定了测试的侧重不同：
 * - 没有计时器、没有胜负判定 ⇒ 不需要 games.jsonl 重放
 * - 成员模型是 1 老师 + N 学生 ⇒ 要测"谁有权限做什么"
 * - 事件类型有四种（走子/标注/举手/批准）⇒ 每种都要过一遍门
 *
 * 主线是模拟一个课堂的生命周期：老师建课堂 → 学生进来 → 举手 → 老师批准 →
 * 学生走一步 → 老师画标注 → 学生再举手 → 老师关闭课堂。每一步都验：
 *   1. 权限门（状态、角色、举手状态）
 *   2. seq 严格 +1
 *   3. 事件类型和内容
 *   4. 公开视图给每个成员看到的是对的
 *
 * 这文件不部署：它在 tools/ 下，而只有 v1/ 会同步到服务器的 /api/v1/。
 */

require_once __DIR__ . '/../v1/chess_class_core.php';

$checks = 0;
$failures = [];
$assert = static function ($cond, $label) use (&$checks, &$failures) {
    $checks++;
    if (!$cond) {
        $failures[] = $label;
    }
};

/** 造一个"已经开课"的课堂。 */
$classAt = static function (string $fen, int $teacherId = 1, int $seq = 0): array {
    return [
        'code' => '1234',
        'teacher_id' => $teacherId,
        'fen' => $fen,
        'status' => CHESS_CLASS_OPEN,
        'seq' => $seq,
    ];
};

/** 造一个成员列表。 */
$members = static function (array $rows): array {
    return array_map(static function ($row) {
        return [
            'player_id' => $row[0],
            'nickname' => $row[1] ?? null,
            'role' => $row[2] ?? CHESS_CLASS_STUDENT,
            'hand_status' => $row[3] ?? CHESS_HAND_NONE,
        ];
    }, $rows);
};

/* ==========================================================================
 * 1. 课堂码：数字、长度、生成、以及用户输入怎么收
 * ======================================================================== */
$seen = [];
for ($i = 0; $i < 5000; $i++) {
    $code = chess_class_code();
    $assert(strlen($code) === CHESS_CLASS_CODE_LENGTH, 'generated code is 4 chars');
    $assert(ctype_digit($code), 'generated code is all digits');
    $seen[$code] = true;
}
$assert(count($seen) >= 3500, 'generated codes barely repeat (' . count($seen) . '/5000)');

foreach ([
    ['1234', '1234'], [' 1234 ', '1234'], ['0000', '0000'], ['9999', '9999'],
    ['1 2 3 4', '1234'], ["\t12\t34\t", '1234'],
] as [$in, $want]) {
    $assert(chess_class_norm_code($in) === $want, "norm_code({$in}) = {$want}");
}
foreach (['', '123', '12345', 'abcd', '12ab', 'hello', '12.34'] as $in) {
    $assert(chess_class_norm_code($in) === '', 'norm_code rejects ' . var_export($in, true));
}
$assert(chess_class_norm_code(null) === '', 'norm_code(null) is empty');

/* ==========================================================================
 * 2. 建课堂：老师、起始局面、状态
 * ======================================================================== */
$made = chess_class_new(42);
$assert($made['err'] === null, 'new class has no error');
$assert($made['class']['teacher_id'] === 42, 'new class records the teacher');
$assert($made['class']['fen'] === CHESS_ENGINE_START_FEN, 'new class starts at the initial position');
$assert($made['class']['status'] === CHESS_CLASS_OPEN, 'new class is open');
$assert($made['class']['seq'] === 0, 'new class starts at seq 0');
$assert(strlen($made['class']['code']) === CHESS_CLASS_CODE_LENGTH, 'new class has a 4-digit code');
$assert(ctype_digit($made['class']['code']), 'new class code is all digits');

/* ==========================================================================
 * 3. 走子前的每道门：状态、权限、合法与否
 * ======================================================================== */
$class = $classAt(CHESS_ENGINE_START_FEN);
$san = 'e4';

// 课堂关闭 ⇒ 谁都走不了
$closed = $class;
$closed['status'] = CHESS_CLASS_CLOSED;
$refused = chess_class_move($closed, $san, 1, true);
$assert($refused['err'] === 'class_closed', 'closed class refuses all moves');
$assert($refused['event'] === null, 'a rejected move produces no event');
$assert($refused['class']['fen'] === CHESS_ENGINE_START_FEN, 'a rejected move leaves the position alone');

// 没权限 ⇒ 走不了（学生没举手、或举了手但老师没批准）
$noPerm = chess_class_move($class, $san, 2, false);
$assert($noPerm['err'] === 'no_permission', 'a student without approval cannot move');
$assert($noPerm['event'] === null, 'no permission produces no event');
$assert($noPerm['class']['fen'] === CHESS_ENGINE_START_FEN, 'no permission leaves the position alone');

// 不合法的走法
foreach (['e5', 'Qxd8', 'O-O', '', 'e2e4', 'Nb1c3', 'Pe4', 'e4+', 'Nxh9'] as $bad) {
    $refused = chess_class_move($class, $bad, 1, true);
    $assert($refused['err'] === 'illegal_move', 'refuses illegal SAN: ' . var_export($bad, true));
    $assert($refused['class']['fen'] === CHESS_ENGINE_START_FEN, 'an illegal move leaves the position alone');
    $assert($refused['class']['seq'] === 0, 'an illegal move does not advance seq');
}

// 读不懂的局面 ⇒ 服务端的问题，不是玩家的
$corrupt = chess_class_move($classAt('this is not a fen'), $san, 1, true);
$assert($corrupt['err'] === 'server', 'an unreadable position is the server\'s fault');

/* ==========================================================================
 * 4. 一手成功的走子：seq、事件内容
 * ======================================================================== */
$played = chess_class_move($class, $san, 1, true);
$assert($played['err'] === null, 'white opens with e4');
$assert($played['class']['fen'] === 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 'e4 reaches the expected position');
$assert($played['class']['seq'] === 1, 'one accepted move advances seq by exactly one');
$assert($played['event']['seq'] === 1, 'the event carries the new seq');
$assert($played['event']['type'] === CHESS_EVT_MOVE, 'the event type is move');
$assert($played['event']['data']['san'] === $san, 'the event stores the canonical SAN');
$assert($played['event']['data']['fen_after'] === $played['class']['fen'], 'the event\'s position is the position the class ended up in');
$assert($played['event']['data']['turn'] === CHESS_ENGINE_BLACK, 'the event records whose turn it is now');
$assert($played['event']['actor_id'] === 1, 'the event records who moved');

// 黑方应一步
$blackAnswer = chess_class_move($played['class'], 'e5', 2, true);
$assert($blackAnswer['err'] === null, 'black answers e5');
$assert($blackAnswer['class']['seq'] === 2, 'seq keeps counting up');

// 老师也能走（课堂模式里老师随时可以走，不受举手限制）
$teacherMove = chess_class_move($blackAnswer['class'], 'Nf3', 1, true);
$assert($teacherMove['err'] === null, 'the teacher can move too (when canMove is true)');

/* ==========================================================================
 * 5. 标注：只有老师能画
 * ======================================================================== */
$class = $classAt(CHESS_ENGINE_START_FEN);
$annotations = [
    ['type' => 'square', 'square' => 'e4', 'color' => 'green'],
    ['type' => 'arrow', 'from' => 'e2', 'to' => 'e4', 'color' => 'blue'],
];

// 课堂关闭 ⇒ 不能画
$closed = $class;
$closed['status'] = CHESS_CLASS_CLOSED;
$refused = chess_class_annotate($closed, $annotations, 1, true);
$assert($refused['err'] === 'class_closed', 'closed class refuses annotations');

// 学生不能画
$student = chess_class_annotate($class, $annotations, 2, false);
$assert($student['err'] === 'no_permission', 'a student cannot annotate');
$assert($student['event'] === null, 'a student annotation produces no event');

// 老师能画
$teacher = chess_class_annotate($class, $annotations, 1, true);
$assert($teacher['err'] === null, 'the teacher can annotate');
$assert($teacher['class']['seq'] === 1, 'annotation advances seq');
$assert($teacher['event']['type'] === CHESS_EVT_ANNOTATION, 'the event type is annotation');
$assert($teacher['event']['data']['annotations'] === $annotations, 'the event carries the annotations');
$assert($teacher['event']['data']['fen'] === $class['fen'], 'the event carries the current position');
$assert($teacher['event']['actor_id'] === 1, 'the event records the teacher');

// 空标注也能广播（清除所有标注）
$cleared = chess_class_annotate($class, [], 1, true);
$assert($cleared['err'] === null, 'the teacher can clear annotations');
$assert($cleared['event']['data']['annotations'] === [], 'clearing sends an empty list');

/* ==========================================================================
 * 6. 举手：学生举手、放下手、已批准不能再举
 * ======================================================================== */
$class = $classAt(CHESS_ENGINE_START_FEN);

// 课堂关闭 ⇒ 不能举手
$closed = $class;
$closed['status'] = CHESS_CLASS_CLOSED;
$refused = chess_class_hand($closed, 2, 'raise', CHESS_HAND_NONE);
$assert($refused['err'] === 'class_closed', 'closed class refuses hand raise');

// 学生举手
$raised = chess_class_hand($class, 2, 'raise', CHESS_HAND_NONE);
$assert($raised['err'] === null, 'a student can raise hand');
$assert($raised['hand_status'] === CHESS_HAND_RAISED, 'hand status becomes raised');
$assert($raised['class']['seq'] === 1, 'hand raise advances seq');
$assert($raised['event']['type'] === CHESS_EVT_HAND, 'the event type is hand');
$assert($raised['event']['data']['player_id'] === 2, 'the event records the student');
$assert($raised['event']['data']['status'] === CHESS_HAND_RAISED, 'the event records the new status');

// 已批准的学生不能再举手
$approved = $class;
$alreadyApproved = chess_class_hand($approved, 2, 'raise', CHESS_HAND_APPROVED);
$assert($alreadyApproved['err'] === 'already_approved', 'an approved student cannot raise again');

// 学生放下手
$lowered = chess_class_hand($raised['class'], 2, 'lower', CHESS_HAND_RAISED);
$assert($lowered['err'] === null, 'a student can lower hand');
$assert($lowered['hand_status'] === CHESS_HAND_NONE, 'hand status becomes none');

// 无效动作
$badAction = chess_class_hand($class, 2, 'wave', CHESS_HAND_NONE);
$assert($badAction['err'] === 'bad_action', 'an unknown action is refused');

/* ==========================================================================
 * 7. 批准：老师批准或收回学生的走子权限
 * ======================================================================== */
$class = $classAt(CHESS_ENGINE_START_FEN);

// 课堂关闭 ⇒ 不能批准
$closed = $class;
$closed['status'] = CHESS_CLASS_CLOSED;
$refused = chess_class_approve($closed, 2, true, true);
$assert($refused['err'] === 'class_closed', 'closed class refuses approval');

// 学生不能批准别人
$student = chess_class_approve($class, 3, true, false);
$assert($student['err'] === 'no_permission', 'a student cannot approve');

// 老师批准学生
$approved = chess_class_approve($class, 2, true, true);
$assert($approved['err'] === null, 'the teacher can approve a student');
$assert($approved['hand_status'] === CHESS_HAND_APPROVED, 'hand status becomes approved');
$assert($approved['class']['seq'] === 1, 'approval advances seq');
$assert($approved['event']['type'] === CHESS_EVT_APPROVE, 'the event type is approve');
$assert($approved['event']['data']['player_id'] === 2, 'the event records the student');
$assert($approved['event']['data']['status'] === CHESS_HAND_APPROVED, 'the event records the new status');
$assert($approved['event']['actor_id'] === 1, 'the event records the teacher as actor');

// 老师收回权限
$revoked = chess_class_approve($approved['class'], 2, false, true);
$assert($revoked['err'] === null, 'the teacher can revoke approval');
$assert($revoked['hand_status'] === CHESS_HAND_NONE, 'hand status becomes none');

/* ==========================================================================
 * 8. 公开视图：每个成员看到的是对的
 * ======================================================================== */
$class = $classAt('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1', 1, 5);
$memberList = $members([
    [1, 'Teacher', CHESS_CLASS_TEACHER, CHESS_HAND_NONE],
    [2, 'Alice', CHESS_CLASS_STUDENT, CHESS_HAND_RAISED],
    [3, 'Bob', CHESS_CLASS_STUDENT, CHESS_HAND_APPROVED],
    [4, 'Carol', CHESS_CLASS_STUDENT, CHESS_HAND_NONE],
]);

// 老师视图
$teacherView = chess_class_public($class, $memberList, 1);
$assert($teacherView['code'] === '1234', 'the view carries the class code');
$assert($teacherView['status'] === CHESS_CLASS_OPEN, 'the view carries the status');
$assert($teacherView['fen'] === $class['fen'], 'the view carries the position');
$assert($teacherView['turn'] === CHESS_ENGINE_BLACK, 'the view says whose move it is');
$assert($teacherView['seq'] === 5, 'the view carries seq');
$assert($teacherView['you']['role'] === CHESS_CLASS_TEACHER, 'the teacher sees their role');
$assert($teacherView['you']['hand'] === CHESS_HAND_NONE, 'the teacher has no hand status');
$assert($teacherView['you']['can_move'] === true, 'the teacher can always move');
$ineligibleTeacherView = chess_class_public($class, $memberList, 1, false);
$assert($ineligibleTeacherView['you']['role'] === CHESS_CLASS_TEACHER,
    'an ineligible teacher still sees the historical teacher role');
$assert($ineligibleTeacherView['you']['can_move'] === false,
    'an ineligible or revoked teacher cannot move');
$approvedStudentView = chess_class_public($class, $memberList, 3, false);
$assert($approvedStudentView['you']['can_move'] === true,
    'teacher ineligibility does not revoke an already approved student move');
$assert(count($teacherView['members']) === 4, 'the view lists all members');
$assert($teacherView['members'][0]['id'] === 1 && $teacherView['members'][0]['nickname'] === 'Teacher', 'the view names the teacher');
$assert($teacherView['members'][1]['role'] === CHESS_CLASS_STUDENT && $teacherView['members'][1]['hand'] === CHESS_HAND_RAISED, 'the view shows Alice raised');

// 学生视图：Alice（举了手但没被批准）
$aliceView = chess_class_public($class, $memberList, 2);
$assert($aliceView['you']['role'] === CHESS_CLASS_STUDENT, 'Alice sees her role');
$assert($aliceView['you']['hand'] === CHESS_HAND_RAISED, 'Alice sees her hand status');
$assert($aliceView['you']['can_move'] === false, 'Alice cannot move (not approved)');

// 学生视图：Bob（被批准了）
$bobView = chess_class_public($class, $memberList, 3);
$assert($bobView['you']['role'] === CHESS_CLASS_STUDENT, 'Bob sees his role');
$assert($bobView['you']['hand'] === CHESS_HAND_APPROVED, 'Bob sees his hand status');
$assert($bobView['you']['can_move'] === true, 'Bob can move (approved)');

// 学生视图：Carol（什么都没做）
$carolView = chess_class_public($class, $memberList, 4);
$assert($carolView['you']['role'] === CHESS_CLASS_STUDENT, 'Carol sees her role');
$assert($carolView['you']['hand'] === CHESS_HAND_NONE, 'Carol sees her hand status');
$assert($carolView['you']['can_move'] === false, 'Carol cannot move (not approved)');

// 不在课堂里的人
$viewerView = chess_class_public($class, $memberList, 99);
$assert($viewerView['you']['role'] === null, 'a viewer has no role');
$assert($viewerView['you']['can_move'] === false, 'a viewer cannot move');

// 回合从 FEN 读：白方走
$whiteTurn = chess_class_public($classAt(CHESS_ENGINE_START_FEN), $members([[1, 'T', CHESS_CLASS_TEACHER]]), 1);
$assert($whiteTurn['turn'] === CHESS_ENGINE_WHITE, 'the opening position is white to move');

// 回合从 FEN 读：黑方走（白走了 e4）
$afterE4 = chess_class_public($classAt('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'), $members([[1, 'T', CHESS_CLASS_TEACHER]]), 1);
$assert($afterE4['turn'] === CHESS_ENGINE_BLACK, 'after e4 it is black to move');

/* ==========================================================================
 * 9. 生命周期：完整模拟一个课堂
 * ======================================================================== */
// 老师建课堂
$session = chess_class_new(1);
$assert($session['err'] === null, 'lifecycle: teacher creates class');
$class = $session['class'];

// 学生进来（这里不测 join 逻辑，只模拟成员列表）
$roster = $members([
    [1, 'Teacher', CHESS_CLASS_TEACHER, CHESS_HAND_NONE],
    [2, 'Alice', CHESS_CLASS_STUDENT, CHESS_HAND_NONE],
]);

// Alice 举手
$raised = chess_class_hand($class, 2, 'raise', CHESS_HAND_NONE);
$assert($raised['err'] === null, 'lifecycle: Alice raises hand');
$class = $raised['class'];
$roster[1]['hand_status'] = CHESS_HAND_RAISED;

// 老师批准 Alice
$approved = chess_class_approve($class, 2, true, true);
$assert($approved['err'] === null, 'lifecycle: teacher approves Alice');
$class = $approved['class'];
$roster[1]['hand_status'] = CHESS_HAND_APPROVED;

// Alice 走 e4（canMove = true 因为被批准了）
$moved = chess_class_move($class, 'e4', 2, true);
$assert($moved['err'] === null, 'lifecycle: Alice moves e4');
$class = $moved['class'];

// Alice 走完后权限收回（这里模拟调用方逻辑：走完后 hand_status 重置为 none）
$roster[1]['hand_status'] = CHESS_HAND_NONE;

// 老师画标注
$annotated = chess_class_annotate($class, [['type' => 'square', 'square' => 'e4', 'color' => 'green']], 1, true);
$assert($annotated['err'] === null, 'lifecycle: teacher annotates');
$class = $annotated['class'];

// 公开视图：Alice 现在不能走了（hand_status = none）
$view = chess_class_public($class, $roster, 2);
$assert($view['you']['can_move'] === false, 'lifecycle: Alice cannot move after her turn');

// 老师关闭课堂
$class['status'] = CHESS_CLASS_CLOSED;
$refused = chess_class_move($class, 'e5', 2, true);
$assert($refused['err'] === 'class_closed', 'lifecycle: closed class refuses moves');

/* ==========================================================================
 * 汇总
 * ======================================================================== */
printf("checks           %d\n", $checks);

if ($failures) {
    fwrite(STDERR, "\nFAILURES " . count($failures) . " (first 20)\n");
    foreach (array_slice($failures, 0, 20) as $failure) {
        fwrite(STDERR, '  - ' . $failure . "\n");
    }
    exit(1);
}
echo "\nAGREES: the class rules layer passes all tests\n";
exit(0);
