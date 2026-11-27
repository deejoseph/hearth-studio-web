import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COACH_APP_STATES,
  COACH_INTRO_MAX,
  COACH_INTRO_MIN,
  coachAppBtnLabel,
  coachAppDialogHint,
  coachAppIntro,
  coachAppState,
  coachAppNote,
  coachAppWhen,
  introLength,
  normalizeIntro,
  validateCoachIntro,
} from '../src/game/coachApp.js';

/**
 * 教练申请的判定层（src/game/coachApp.js）。
 *
 * 这一块值得单测的只有两样：服务端那一态折成界面一态的规则（决定【开课堂】
 * 点不点得动），和字数上下限。剩下的是文案。
 *
 * 🔴 两个常量与后端 v1/chess_coach_core.php 是同一份契约，所以最后一节直接把 PHP
 * 读来逐字比对，并检查 chess_class_create.php 里那道门还在不在 —— 端点是服务端的事，
 * 离线跑不起来，只能这样钉住：删掉 gating 的那一行，这个测试就红。
 */

const UI_SOURCE = readFileSync(new URL('../src/ui/coachApp.js', import.meta.url), 'utf8');
const MARKUP = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const NET = readFileSync(new URL('../src/net/auth.js', import.meta.url), 'utf8');
const API = [
  resolve(process.cwd(), '../../ichessgeek-api/v1'),
  resolve(process.cwd(), '../../../ichessgeek-api/v1'),
].find((path) => existsSync(path));
const CORE = readFileSync(resolve(API, 'chess_coach_core.php'), 'utf8');
const GUARD = readFileSync(resolve(API, 'chess_guard.php'), 'utf8');
const CREATE = readFileSync(resolve(API, 'chess_class_create.php'), 'utf8');

const han = '带过六个学生，教了三年'; // 11 个字
const pad = (n) => han.repeat(Math.ceil(n / han.length)).slice(0, n);

describe('服务端那一态 → 界面上的一态', () => {
  it('can_teach 优先于 status：那是后端算好的那一句', () => {
    // 库里出现自相矛盾的行（状态没跟上）时，界面按"能不能开"走，
    // 而不是自己挑一个状态把按钮点亮或按灭。
    expect(coachAppState({ can_teach: true, app: { status: 'pending' } })).toBe('approved');
    expect(coachAppState({ can_teach: true, app: null })).toBe('approved');
  });

  it('不能开的时候才看 status', () => {
    for (const status of ['pending', 'rejected']) {
      expect(coachAppState({ can_teach: false, app: { status } })).toBe(status);
    }
  });

  it('没交过、或者库里冒出一个界面不认识的态，都算 none', () => {
    expect(coachAppState({ can_teach: false, app: null })).toBe('none');
    expect(coachAppState({ can_teach: false, app: { status: 'waitlist' } })).toBe('none');
    expect(coachAppState({ can_teach: false, app: {} })).toBe('none');
  });

  it('回复缺字段也不能崩，更不许把按钮点亮', () => {
    for (const reply of [{}, null, undefined, { app: 'x' }]) {
      expect(coachAppState(reply)).toBe('none');
    }
  });

  it('四态都覆盖到了，界面只认这四个', () => {
    expect(COACH_APP_STATES).toEqual(['none', 'pending', 'approved', 'rejected']);
  });
});

describe('介绍怎么归一、怎么量', () => {
  it('换行、全角空格、nbsp 收成一个空格，首尾去掉', () => {
    expect(normalizeIntro(' 带过\u3000六个 \n 学生 ')).toBe('带过 六个 学生');
  });

  it('非字符串不是崩溃，是空', () => {
    for (const value of [undefined, null, 0, false, {}, ['a']]) {
      expect(normalizeIntro(value)).toBe('');
    }
  });

  it('按码点量，所以中文不是被字节数提前判超长', () => {
    expect(Buffer.byteLength(pad(COACH_INTRO_MIN), 'utf8')).toBeGreaterThan(COACH_INTRO_MIN);
    expect(introLength(pad(COACH_INTRO_MIN))).toBe(COACH_INTRO_MIN);
  });

  it('空的、只有空格的都算零个字', () => {
    expect(introLength('')).toBe(0);
    expect(introLength(' \u3000\n ')).toBe(0);
  });
});

describe('这一段能不能发出去', () => {
  it('刚好下限就发得出，发出去的 payload 只有 intro 一项', () => {
    const result = validateCoachIntro(pad(COACH_INTRO_MIN));
    expect(result.ok).toBe(true);
    expect(Object.keys(result.payload)).toEqual(['intro']);
    expect(result.payload.intro).toBe(pad(COACH_INTRO_MIN));
  });

  it('少一个字就拦住，并把当前字数回给人看', () => {
    const result = validateCoachIntro(pad(COACH_INTRO_MIN - 1));
    expect(result).toEqual({
      ok: false,
      field: 'intro',
      text: `写几句你带过谁、教过什么 —— 至少 ${COACH_INTRO_MIN} 个字（现在 ${COACH_INTRO_MIN - 1} 个）。`,
    });
  });

  it('刚好上限发得出，多一个字就报超长', () => {
    expect(validateCoachIntro(pad(COACH_INTRO_MAX)).ok).toBe(true);
    const over = validateCoachIntro(pad(COACH_INTRO_MAX + 1));
    expect(over.field).toBe('intro');
    expect(over.text).toBe(`介绍请写在 ${COACH_INTRO_MAX} 个字以内（现在 ${COACH_INTRO_MAX + 1} 个）。`);
  });

  it('归一之后才判长度：光打字空格不算写了东西', () => {
    expect(validateCoachIntro(' '.repeat(COACH_INTRO_MIN + 5)).ok).toBe(false);
  });

  it('空着是一句"再写几句"，不是一句报错', () => {
    expect(validateCoachIntro('').text).toContain(`至少 ${COACH_INTRO_MIN} 个字`);
  });
});

describe('每一态说的话', () => {
  it('四态各有一行解释，一个都不许空着', () => {
    for (const state of COACH_APP_STATES) {
      expect(coachAppNote(state), state).toBeTruthy();
      expect(coachAppDialogHint(state), state).toBeTruthy();
    }
  });

  it('按钮上那四句是四个动作，不是同一句重复四遍', () => {
    const labels = COACH_APP_STATES.map(coachAppBtnLabel);
    expect(new Set(labels).size).toBe(COACH_APP_STATES.length);
    expect(labels).toEqual(['申请成为教练', '看我的申请', '我的申请', '重新申请']);
  });

  it('界面不认识的态退回"申请成为教练"，而不是 undefined 印在按钮上', () => {
    expect(coachAppBtnLabel('waitlist')).toBe('申请成为教练');
    expect(coachAppBtnLabel(null)).toBe('申请成为教练');
    expect(coachAppNote('waitlist')).toBe('');
  });

  it('已批准那一句必须说清"重新提交会退回待审核"', () => {
    // 这是这一态唯一会让人吃亏的地方：改一次介绍 = 当场撤掉自己的资格。
    expect(coachAppDialogHint('approved')).toContain('待审核');
  });
});

describe('那行日期', () => {
  it('待审/已批看提交那天，驳回看答复那天', () => {
    const app = { submitted_at: '2026-11-20 03:04:05', decided_at: '2026-11-25 09:00:00' };
    expect(coachAppWhen('pending', app)).toBe('2026-11-20');
    expect(coachAppWhen('approved', app)).toBe('2026-11-20');
    expect(coachAppWhen('rejected', app)).toBe('2026-11-25');
  });

  it('驳回却没有答复时间时退回提交时间，不写一个空括号', () => {
    expect(coachAppWhen('rejected', { submitted_at: '2026-11-20 00:00:00' })).toBe('2026-11-20');
  });

  it('没交过、或者那一列不是字符串 → 空串（那一行整条收起）', () => {
    expect(coachAppWhen('none', null)).toBe('');
    expect(coachAppWhen('pending', { submitted_at: null })).toBe('');
    expect(coachAppWhen('pending', { submitted_at: 12345 })).toBe('');
  });

  it('已经交过的那段话原样摆回去，缺列就当没写过', () => {
    expect(coachAppIntro({ intro: '带过六个学生' })).toBe('带过六个学生');
    for (const app of [null, {}, { intro: null }, { intro: 7 }]) {
      expect(coachAppIntro(app)).toBe('');
    }
  });
});

describe('和后端的契约', () => {
  const phpInt = (name) => {
    const hit = CORE.match(new RegExp(`const ${name} = (\\d+);`));
    if (!hit) throw new Error(`chess_coach_core.php 里找不到 ${name}`);
    return Number(hit[1]);
  };

  it('两个字数上限和后端取同一个数（界面上印着它，错了就在说谎）', () => {
    expect(phpInt('COACH_INTRO_MIN')).toBe(COACH_INTRO_MIN);
    expect(phpInt('COACH_INTRO_MAX')).toBe(COACH_INTRO_MAX);
  });

  it('库里那一列的宽度就是那个上限，不然写到边就被截了', () => {
    expect(GUARD).toContain(`intro VARCHAR(" . COACH_INTRO_MAX . ")`);
  });

  it('发出去的字段名和后端读的那个键一致', () => {
    expect(CORE).toContain("\$data['intro']");
    expect(UI_SOURCE).toContain('chess_coach_app_get.php');
    expect(UI_SOURCE).toContain('chess_coach_app_save.php');
    for (const file of ['chess_coach_app_get.php', 'chess_coach_app_save.php']) {
      expect(existsSync(resolve(API, file)), file).toBe(true);
    }
  });

  it('开课堂那道门还在：chess_class_create.php 必须问一次 chess_require_teacher', () => {
    // 这一条是整块功能的实质。端点跑不起来，那就钉它那一行代码。
    expect(CREATE).toContain('chess_require_teacher($conn, $id)');
  });

  it('提交端点先要登录、再要确认邮箱，最后才判资格', () => {
    const save = readFileSync(resolve(API, 'chess_coach_app_save.php'), 'utf8');
    expect(save).toContain('chess_require_verified()');
    expect(save).toContain('chess_player_can_teach');
    expect(save).toContain("chess_err('already_teacher')");
  });

  it('后端列出的每一个申请态，界面都认', () => {
    const block = CORE.match(/const COACH_APP_STATUSES = \[([^\]]*)\];/);
    const server = [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    expect(server.sort()).toEqual([...COACH_APP_STATES].filter((s) => s !== 'none').sort());
  });

  it('后端可能回的每一个 code 在 net/auth.js 里都有一句话', () => {
    for (const code of ['teacher_only', 'short_intro', 'long_intro', 'bad_intro', 'already_teacher']) {
      expect(GUARD, `${code} 在后端`).toMatch(new RegExp(`'${code}' =>`));
      expect(NET, `${code} 有中文说法`).toMatch(new RegExp(`\\n *${code}:`));
    }
  });
});

describe('界面与标记', () => {
  it('面板要的元素 id 在 index.html 里都在（只改一边就会哑掉）', () => {
    const htmlIds = new Set([...MARKUP.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const wanted = [...UI_SOURCE.matchAll(/\$\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]);
    expect(wanted.length).toBeGreaterThan(8);
    for (const id of wanted) expect(htmlIds.has(id), id).toBe(true);
  });

  it('输入框的 maxlength 比真上限宽：超了要看得见一句红字，不是打字打不上去', () => {
    const box = MARKUP.match(/id="coach-app-intro"[^>]*maxlength="(\d+)"/) ||
      MARKUP.match(/maxlength="(\d+)"[^>]*id="coach-app-intro"/);
    if (!box) throw new Error('找不到 #coach-app-intro 的 maxlength');
    expect(Number(box[1])).toBeGreaterThan(COACH_INTRO_MAX);
    expect(Number(box[1])).toBeLessThanOrEqual(COACH_INTRO_MAX * 1.5);
  });

  it('计数那一行的初值和上限一致', () => {
    expect(MARKUP).toContain(`0 / ${COACH_INTRO_MAX}`);
  });

  it('【开课堂】的资格说明不能是页面加载时就写死的那句话', () => {
    // 那一行由 ui/coachApp.js 按服务端回的态填；HTML 里必须是空的。
    const note = MARKUP.match(/<p class="class-teacher-note"[^>]*id="class-teacher-note"[^>]*>([^<]*)</);
    expect(note, '找不到 #class-teacher-note').toBeTruthy();
    expect(note[1].trim()).toBe('');
    expect(note[0]).toContain('hidden');
  });
});
