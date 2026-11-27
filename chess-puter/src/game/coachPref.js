/**
 * 教练偏好的数据层：选项表、字数与数量上限、一份表单该不该发出去。
 *
 * 这里没有 DOM 也没有 fetch，所以能在 vitest 里跑。界面在 ui/coachPref.js，
 * 它按这张表生成控件，因此"选项"只有一处定义 —— 加一档水平不用改 HTML。
 *
 * 🔴 每一项的 key 和后端 v1/chess_coach_core.php 里的白名单是同一份契约
 * （那边只有 key，中文只在界面这边）。加/改/删一个选项要同时改那两处：
 * key 对不上，服务端会回 bad_pref，界面上就是"这一项不对"。
 * 只改中文措辞不用动后端。
 */

/** 和后端 COACH_NOTE_MAX 同一个数（字，不是字节）。改这里要改那边。 */
export const COACH_NOTE_MAX = 240;

/**
 * 每组的选项：[key, 界面上的说法]。顺序就是界面排下来的顺序，
 * 也是存进库时的顺序（后端按白名单顺序归一，见 chess_coach_core.php）。
 */
export const COACH_OPTIONS = {
  level: [
    ['zero', '完全零基础'],
    ['moves', '会走子，想下完整一盘'],
    ['play', '能完整下棋，想提高'],
    ['rated', '有等级分，打过比赛'],
  ],
  goals: [
    ['basics', '打基础'],
    ['tactics', '补战术'],
    ['opening', '学开局'],
    ['endgame', '学残局'],
    ['contest', '准备比赛'],
  ],
  formats: [
    ['one', '一对一'],
    ['group', '小组课'],
    ['review', '只批改棋谱'],
  ],
  slots: [
    ['wk_ev', '工作日晚间'],
    ['wkend_am', '周末上午'],
    ['wkend_pm', '周末下午'],
    ['wkend_ev', '周末晚上'],
  ],
  timezone: [
    ['Asia/Shanghai', '中国（UTC+8）'],
    ['Asia/Singapore', '新加坡 / 马来西亚（UTC+8）'],
    ['Asia/Bangkok', '泰国（UTC+7）'],
    ['Asia/Dubai', '中东（UTC+4）'],
    ['Europe/London', '英国（UTC+0/+1）'],
    ['Europe/Berlin', '欧洲中部（UTC+1/+2）'],
    ['America/New_York', '北美东部'],
    ['America/Los_Angeles', '北美太平洋'],
    ['Australia/Sydney', '悉尼'],
  ],
  language: [
    ['zh', '中文'],
    ['en', '英文'],
    ['zh_en', '中英都行'],
  ],
};

/** 面板上从上到下这六组，也是校验和生成控件的遍历顺序。 */
export const COACH_GROUPS = ['level', 'goals', 'formats', 'slots', 'timezone', 'language'];

/** 每组的数量要求。min 为 0 表示这一组可以整条不填。 */
export const COACH_RULES = {
  level: { min: 1, max: 1 },
  goals: { min: 1, max: 3 },
  formats: { min: 1, max: 2 },
  slots: { min: 0, max: 4 },
  timezone: { min: 1, max: 1 },
  language: { min: 1, max: 1 },
};

/** 界面上点名某组时用的标题，和 fieldset 的 legend 一致。 */
export const COACH_GROUP_TITLES = {
  level: '现在的水平',
  goals: '想学什么',
  formats: '想怎么上课',
  slots: '方便的时间段',
  timezone: '你在哪个时区',
  language: '授课语言',
  note: '补充说明',
};

/** 一组允许哪些 key（生成控件、也用来判断"这是不是我发出去的选项"）。 */
export function coachKeys(group) {
  return (COACH_OPTIONS[group] ?? []).map(([key]) => key);
}

/** 一句人类可读的话：给已选的值找出对应的说法。找不到就说 key，好排查。 */
export function coachLabel(group, key) {
  return COACH_OPTIONS[group]?.find(([one]) => one === key)?.[1] ?? key;
}

/**
 * 一份表单状态 → 该发出去的 payload，或者一句"哪儿不对"。
 *
 * 为什么前端要再验一遍（后端也会验）：这里拦下的是"少选了一项"这种手快,
 * 红字直接挂在那一组下面，人一眼知道改哪儿；后端那句是兜底，来得慢、
 * 还要一次往返。两边都只是把门，判定以那边为准。
 *
 * @param {{level?: string, goals?: string[], formats?: string[], slots?: string[],
 *          timezone?: string, language?: string, note?: string, contactOk?: boolean}} form
 * @returns {{ok: true, payload: object} | {ok: false, field: string, text: string}}
 */
export function validateCoachForm(form) {
  const source = form ?? {};
  const pick = (group) => {
    const value = source[group];
    const list = Array.isArray(value) ? value : value ? [value] : [];
    // 去重 + 只留我发出去的选项：别人手改过的 DOM、或者一个漏删的旧控件
    // 都不该把没见过的 key 送到服务端去。
    const allowed = coachKeys(group);
    return [...new Set(list)].filter((key) => allowed.includes(key));
  };

  for (const group of COACH_GROUPS) {
    const { min, max } = COACH_RULES[group];
    const chosen = pick(group);
    if (chosen.length < min) {
      const text = min === 1
        ? `「${COACH_GROUP_TITLES[group]}」要选一项。`
        : `「${COACH_GROUP_TITLES[group]}」至少选 ${min} 项。`;
      return { ok: false, field: group, text };
    }
    if (chosen.length > max) {
      return {
        ok: false,
        field: group,
        text: `「${COACH_GROUP_TITLES[group]}」最多选 ${max} 项，现在选了 ${chosen.length} 项。`,
      };
    }
  }

  // 说明按"字"量而不是按字节量：中文一条消息 3 个字节一个字，
  // 拿 length 量的话人写到八十个字就被判超长。
  const note = (typeof source.note === 'string' ? source.note : '')
    .replace(/[\u3000\s]+/g, ' ')
    .trim();
  if ([...note].length > COACH_NOTE_MAX) {
    return {
      ok: false,
      field: 'note',
      text: `补充说明请写在 ${COACH_NOTE_MAX} 个字以内（现在 ${[...note].length} 个字）。`,
    };
  }

  return {
    ok: true,
    payload: {
      level: pick('level')[0],
      goals: pick('goals'),
      formats: pick('formats'),
      slots: pick('slots'),
      timezone: pick('timezone')[0],
      language: pick('language')[0],
      note,
      contact_ok: source.contactOk === true,
    },
  };
}

/**
 * 卡片上那行"已经记下了什么"。不重复整张表 —— 只把教练最需要先看到的
 * 三项（水平、想学什么、怎么上）串成一句话，其余的进面板再看。
 */
export function coachPrefSummary(pref) {
  if (!pref) return '';
  const list = (group, value) => {
    const keys = Array.isArray(value) ? value : value ? [value] : [];
    return keys.map((key) => coachLabel(group, key)).join('、');
  };
  const parts = [
    list('level', pref.level),
    list('goals', pref.goals),
    list('formats', pref.formats),
  ].filter(Boolean);
  if (parts.length === 0) return '';
  const at = typeof pref.updated_at === 'string' ? pref.updated_at.slice(0, 10) : '';
  return `已记下：${parts.join(' · ')}${at ? `（${at} 填的）` : ''}`;
}
