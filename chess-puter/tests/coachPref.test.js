import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COACH_GROUPS,
  COACH_GROUP_TITLES,
  COACH_NOTE_MAX,
  COACH_RULES,
  coachKeys,
  coachLabel,
  coachPrefSummary,
  validateCoachForm,
} from '../src/game/coachPref.js';

/**
 * 教练偏好的判定层（src/game/coachPref.js）。
 *
 * 这里盯的是三件容易坏的事：每组选几项（少一项是发不出去的）、多选里混进
 * 我根本没发出去的 key（旧控件漏删、或者 DOM 被人手改过）、以及说明的字数
 * 按"字"量而不是按字节量。
 *
 * 🔴 选项 key 和后端 v1/chess_coach_core.php 的白名单是同一份契约，所以最后
 * 有一节直接把那个 PHP 文件读来比对 —— 这边加了一档、那边忘了加，现场表现是
 * "这一项不对"，人在界面上怎么改都存不上，这种错只能靠机器拦。
 */

const UI_SOURCE = readFileSync(new URL('../src/ui/coachPref.js', import.meta.url), 'utf8');
const MARKUP = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const CORE = readFileSync(
  new URL('../../../../ichessgeek-api/v1/chess_coach_core.php', import.meta.url),
  'utf8',
);

/** 一份哪一项都没动过的合格表单；每个用例只覆盖它在意的那一格。 */
const good = (over = {}) => ({
  level: ['play'],
  goals: ['tactics', 'opening'],
  formats: ['one'],
  slots: ['wkend_am'],
  timezone: 'Asia/Shanghai',
  language: ['zh'],
  note: '想每周一次',
  contactOk: true,
  ...over,
});

describe('一份表单能不能发出去', () => {
  it('各项齐了就走通，发出去的是白名单里的 key', () => {
    const result = validateCoachForm(good());
    expect(result.ok).toBe(true);
    expect(result.payload).toEqual({
      level: 'play',
      goals: ['tactics', 'opening'],
      formats: ['one'],
      slots: ['wkend_am'],
      timezone: 'Asia/Shanghai',
      language: 'zh',
      note: '想每周一次',
      contact_ok: true,
    });
  });

  it('发出去的形状和后端落库的那八项一致', () => {
    expect(Object.keys(validateCoachForm(good()).payload).sort()).toEqual([
      'contact_ok',
      'formats',
      'goals',
      'language',
      'level',
      'note',
      'slots',
      'timezone',
    ]);
  });

  it('整张表空着时先点名第一组，红字才知道挂哪儿', () => {
    const empty = validateCoachForm({});
    expect(empty).toEqual({ ok: false, field: 'level', text: '「现在的水平」要选一项。' });
  });

  it.each([
    ['level', 'play', '现在的水平'],
    ['timezone', 'Asia/Shanghai', '你在哪个时区'],
    ['language', 'zh', '授课语言'],
  ])('单选组 %s 空着就说“要选一项”', (group, value, title) => {
    expect(validateCoachForm(good({ [group]: [] }))).toEqual({
      ok: false,
      field: group,
      text: `「${title}」要选一项。`,
    });
  });

  it('多选超过上限时把数字一起报出来', () => {
    expect(validateCoachForm(good({ goals: ['basics', 'tactics', 'opening', 'endgame'] }))).toEqual({
      ok: false,
      field: 'goals',
      text: '「想学什么」最多选 3 项，现在选了 4 项。',
    });
    expect(validateCoachForm(good({ formats: ['one', 'group', 'review'] }))).toEqual({
      ok: false,
      field: 'formats',
      text: '「想怎么上课」最多选 2 项，现在选了 3 项。',
    });
  });

  it('时段可以整条不填 —— 只想说水平和目标的人是多数', () => {
    expect(validateCoachForm(good({ slots: [] })).ok).toBe(true);
  });

  it('认得 checkbox 那种“一个值的数组”，也认得 select 那种光字符串', () => {
    const payload = validateCoachForm(good({ level: 'rated', timezone: 'Europe/Berlin' })).payload;
    expect(payload.level).toBe('rated');
    expect(payload.timezone).toBe('Europe/Berlin');
  });
});

describe('混进来的东西不能送到服务端', () => {
  it('重复勾选只算一项', () => {
    expect(validateCoachForm(good({ level: ['play', 'play'] })).payload.level).toBe('play');
    expect(validateCoachForm(good({ goals: ['tactics', 'tactics'] })).payload.goals).toEqual([
      'tactics',
    ]);
  });

  it('不是我这组发出去的 key 会被丢掉', () => {
    // 'review' 是「想怎么上课」的选项，出现在「想学什么」里只能来自漏删的旧控件
    const result = validateCoachForm(good({ goals: ['tactics', 'review', 'nonsense'] }));
    expect(result.payload.goals).toEqual(['tactics']);
  });

  it('丢完之后不够数，就按“少选”报而不是让它带着脏值出门', () => {
    expect(validateCoachForm(good({ goals: ['made-up'] }))).toEqual({
      ok: false,
      field: 'goals',
      text: '「想学什么」要选一项。',
    });
  });

  it('联系许可只认真正的 true：漏传、字符串、数字都算不同意', () => {
    for (const value of [undefined, false, '1', 1, 'true']) {
      expect(validateCoachForm(good({ contactOk: value })).payload.contact_ok).toBe(false);
    }
    expect(validateCoachForm(good({ contactOk: true })).payload.contact_ok).toBe(true);
  });
});

describe('补充说明的字数', () => {
  const han = '想找一个能讲清楚战术的教练'; // 13 个字
  const pad = (n) => han.repeat(Math.ceil(n / han.length)).slice(0, n);

  it('按码点量，所以中文不会被字节数坑到', () => {
    const text = pad(COACH_NOTE_MAX);
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(COACH_NOTE_MAX);
    expect(validateCoachForm(good({ note: text })).ok).toBe(true);
  });

  it('多一个字就报超长，并把当前字数回给人看', () => {
    const result = validateCoachForm(good({ note: pad(COACH_NOTE_MAX + 1) }));
    expect(result.field).toBe('note');
    expect(result.text).toBe(`补充说明请写在 ${COACH_NOTE_MAX} 个字以内（现在 241 个字）。`);
  });

  it('换行、全角空格、nbsp 都归成一个空格再算', () => {
    const payload = validateCoachForm(good({ note: ' 想补\u3000战术 \n 学开局 ' })).payload;
    expect(payload.note).toBe('想补 战术 学开局');
  });

  it('没填说明不是错', () => {
    expect(validateCoachForm(good({ note: '' })).payload.note).toBe('');
    expect(validateCoachForm(good({ note: undefined })).payload.note).toBe('');
  });
});

describe('卡片上那行小结', () => {
  it('没填过就是空串，卡片整行藏起来', () => {
    expect(coachPrefSummary(null)).toBe('');
    expect(coachPrefSummary({})).toBe('');
  });

  it('只串水平、想学什么、怎么上课三项，其余进面板再看', () => {
    expect(
      coachPrefSummary({
        level: 'zero',
        goals: ['basics', 'tactics'],
        formats: ['one'],
        slots: ['wk_ev'],
        timezone: 'Asia/Shanghai',
        language: 'zh',
        updated_at: '2026-11-25 03:12:00',
      }),
    ).toBe('已记下：完全零基础 · 打基础、补战术 · 一对一（2026-11-25 填的）');
  });

  it('日期取不到就不写括号，服务端没回那一列也不碍事', () => {
    expect(coachPrefSummary({ level: 'play', goals: ['tactics'], formats: ['one'] })).toBe(
      '已记下：能完整下棋，想提高 · 补战术 · 一对一',
    );
  });

  it('只填了一部分时也照说，不硬凑分隔符', () => {
    expect(coachPrefSummary({ level: 'rated' })).toBe('已记下：有等级分，打过比赛');
  });

  it('库里出来一个界面不认的 key 时原样印出来，好排查', () => {
    expect(coachLabel('level', 'grandmaster')).toBe('grandmaster');
    expect(coachPrefSummary({ level: 'grandmaster' })).toBe('已记下：grandmaster');
  });
});

describe('界面与后端的契约', () => {
  /** 从 PHP 里取一个 `const NAME = [...]` 的字符串列表。 */
  const phpList = (name) => {
    const block = CORE.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
    if (!block) throw new Error(`chess_coach_core.php 里找不到 ${name}`);
    return [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  };

  const SERVER_GROUPS = {
    level: 'COACH_LEVELS',
    goals: 'COACH_GOALS',
    formats: 'COACH_FORMATS',
    slots: 'COACH_SLOTS',
    timezone: 'COACH_TIMEZONES',
    language: 'COACH_LANGUAGES',
  };

  it('每组的 key 和后端白名单一字不差（顺序也要一样，库里按它排）', () => {
    for (const group of COACH_GROUPS) {
      expect(coachKeys(group), group).toEqual(phpList(SERVER_GROUPS[group]));
    }
  });

  it('说明的字数上限两边取同一个数', () => {
    const noteMax = CORE.match(/const COACH_NOTE_MAX = (\d+);/);
    expect(noteMax && Number(noteMax[1])).toBe(COACH_NOTE_MAX);
  });

  it('每组都有中文标题，报错时点名得了', () => {
    for (const group of [...COACH_GROUPS, 'note']) {
      expect(COACH_GROUP_TITLES[group], group).toBeTruthy();
    }
  });

  it('面板要的元素 id 在 index.html 里都在（两边只改一边就会哑掉）', () => {
    const htmlIds = new Set([...MARKUP.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    // 时区那个 select 是 buildGroup 当场建出来的，不在 HTML 里，所以它自己写的
    // id 也算"有出处"；剩下每一个 $('…') 都必须能在 index.html 里查到。
    const builtHere = new Set(
      [...UI_SOURCE.matchAll(/\.id = '([^']+)'/g)].map((m) => m[1]),
    );
    const wanted = new Set(
      [...UI_SOURCE.matchAll(/\$\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]),
    );
    // 六组的控件容器和 legend 是用模板字符串拼出来的，静态正则抓不到
    for (const group of COACH_GROUPS) {
      wanted.add(`pref-${group}-choices`);
      wanted.add(`pref-${group}-legend`);
    }
    for (const section of [...COACH_GROUPS, 'note']) {
      wanted.add(`pref-${section}-group`);
    }
    for (const id of wanted) {
      expect(htmlIds.has(id) || builtHere.has(id), id).toBe(true);
    }
  });

  it('界面里当单选（radio）的那两组，正是规则里 max 为 1 的那两组', () => {
    const declared = [...UI_SOURCE.matchAll(/const SINGLE = new Set\(\[([^\]]*)\]\)/g)][0][1];
    const inUi = [...declared.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    // 时区同样是单选，但它用 select 建（见 buildGroup），所以不在 radio 那一堆里
    const expected = COACH_GROUPS
      .filter((group) => COACH_RULES[group].max === 1 && group !== 'timezone')
      .sort();
    expect(inUi).toEqual(expected);
  });
});
