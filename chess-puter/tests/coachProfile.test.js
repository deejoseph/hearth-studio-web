import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COACH_CERTIFICATES_MAX,
  COACH_CUSTOM_SLOT_MAX,
  COACH_CUSTOM_SLOTS_MAX,
  COACH_GOALS_NOTE_MAX,
  COACH_ACCEPT_LEVELS,
  COACH_ELO_MAX,
  COACH_ELO_MIN,
  COACH_HONORS_MAX,
  COACH_IMAGE_BYTES_MAX,
  COACH_PHOTOS_MAX,
  COACH_PROFILE_GROUPS,
  COACH_PROFILE_RULES,
  COACH_PROFILE_TITLES,
  COACH_TAGLINE_MAX,
  COACH_TEACHING_FOCUS_MAX,
  COACH_TITLES,
  COACH_YEARS_MAX,
  coachBadges,
  coachPhotoUrl,
  coachProfileLabels,
  coachProfileRows,
  coachProfileTags,
  coachTitleLabel,
  validateCoachProfile,
} from '../src/game/coachProfile.js';

/**
 * 教练资料的数据层（src/game/coachProfile.js）+ 名录的隐私底线。
 *
 * 盯四件事：
 * 1. 一份表单发出去的形状（二十一个键）和后端 coach_profile_normalize 一致；
 * 2. 数字和字数的口径 —— 空、0、超一个字的边界，这三样最容易各写一套；
 * 3. 界面要的元素 id 在 index.html 里都在（两边只改一边就会"打开面板就报错"）；
 * 4. 🔴 公开那一行永远不带 email、也不带申请时写给管理员看的 intro。
 *    这条不是"更好"，是界面上印了对人的一句承诺，只能靠机器守着。
 */

const PROFILE_CORE = readFileSync(new URL('../src/game/coachProfile.js', import.meta.url), 'utf8');
const PROFILE_UI = readFileSync(new URL('../src/ui/coachProfile.js', import.meta.url), 'utf8');
const DIRECTORY_UI = readFileSync(new URL('../src/ui/coachDirectory.js', import.meta.url), 'utf8');
const MARKUP = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const STYLE = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const API = [
  resolve(process.cwd(), '../../ichessgeek-api/v1'),
  resolve(process.cwd(), '../../../ichessgeek-api/v1'),
].find((path) => existsSync(path));
const CORE = readFileSync(resolve(API, 'chess_coach_core.php'), 'utf8');
const GUARD = readFileSync(resolve(API, 'chess_guard.php'), 'utf8');

/** 服务端起的那种图片名：24 位十六进制 + 真类型给的扩展名（jpeg 存成 jpg，没有 .jpeg）。 */
const PIC = 'deadbeefdeadbeefdeadbeef.jpg';
const PIC2 = 'cafebabecafebabecafebabe.png';
const PIC3 = '0123456789abcdef01234567.webp';

/** 一份每项都填了的合格表单；每个用例只覆盖它在意的那一格。 */
const good = (over = {}) => ({
  title: 'im',
  elo: '2412',
  years: '9',
  tagline: '把战术讲成人话',
  honors: '带出过三位省赛冠军',
  teaching_focus: '擅长把战术题拆成几步提问',
  goals_note: '退役棋手复棋',
  custom_slots: ['柏林时间周二 06:30–07:15'],
  language: 'zh',
  timezone: 'Asia/Shanghai',
  levels: ['amateur5', 'amateur1'],
  goals: ['tactics'],
  formats: ['one', 'review'],
  slots: ['wkend_am'],
  avatar: PIC,
  photos: [PIC2, PIC3],
  certificates: [PIC],
  ...over,
});

describe('一份教练资料能不能发出去', () => {
  it('二十一项全发：整份覆盖，后端才分得出"清空"和"没带这个键"', () => {
    const result = validateCoachProfile(good());
    expect(result.ok).toBe(true);
    expect(Object.keys(result.payload).sort()).toEqual([
      'avatar',
      'certificates',
      'custom_slots',
      'elo',
      'enrollment_notes',
      'formats',
      'goals',
      'goals_note',
      'honors',
      'hourly_rate_cny',
      'language',
      'levels',
      'photos',
      'schedule_text',
      'slots',
      'tagline',
      'teaching_focus',
      'timezone',
      'title',
      'tuition_text',
      'years',
    ]);
  });

  it('一个字都不填也算合格 —— 资料不是入驻门槛', () => {
    const { ok, payload } = validateCoachProfile({});
    expect(ok).toBe(true);
    expect(payload.title).toBe('');
    expect(payload.elo).toBe('');
    expect(payload.years).toBe('');
    expect(payload.levels).toEqual([]);
    expect(payload.photos).toEqual([]);
    expect(payload.certificates).toEqual([]);
  });

  it('称号只认列表里那几个', () => {
    expect(validateCoachProfile(good({ title: 'supercoach' }))).toEqual({
      ok: false,
      field: 'title',
      text: '称号只有列表里那几个。',
    });
    expect(validateCoachProfile(good({ title: '' })).ok).toBe(true);
  });

  it.each([
    ['1500 分左右', '国际等级分要填数字，没有等级分就空着。'],
    ['abc', '国际等级分要填数字，没有等级分就空着。'],
    ['99999', '国际等级分要填数字，没有等级分就空着。'],
    [`${COACH_ELO_MIN - 1}`, `国际等级分要在 ${COACH_ELO_MIN} 到 ${COACH_ELO_MAX} 之间。`],
    [`${COACH_ELO_MAX + 1}`, `国际等级分要在 ${COACH_ELO_MIN} 到 ${COACH_ELO_MAX} 之间。`],
  ])('等级分 %s 被当场拦下，不等一个往返', (value, text) => {
    const result = validateCoachProfile(good({ elo: value }));
    expect(result.ok).toBe(false);
    expect(result.field).toBe('elo');
    expect(result.text).toBe(text);
  });

  it('边界上的两个数收，教龄 0 也收 —— 刚起步不是没填', () => {
    expect(validateCoachProfile(good({ elo: `${COACH_ELO_MIN}` })).ok).toBe(true);
    expect(validateCoachProfile(good({ elo: `${COACH_ELO_MAX}` })).ok).toBe(true);
    expect(validateCoachProfile(good({ years: '0' })).payload.years).toBe('0');
    expect(validateCoachProfile(good({ years: `${COACH_YEARS_MAX + 1}` }))).toEqual({
      ok: false,
      field: 'years',
      text: `教龄要在 0 到 ${COACH_YEARS_MAX} 之间。`,
    });
  });

  it('数字前后的空格不算字', () => {
    expect(validateCoachProfile(good({ elo: ' 2412 ' })).payload.elo).toBe('2412');
    expect(validateCoachProfile(good({ years: ' 09 ' })).payload.years).toBe('9');
  });

  it('教练固定授课方向可全选，未知项不会从 DOM 混进请求', () => {
    const all = ['basics', 'tactics', 'opening', 'endgame', 'contest'];
    expect(validateCoachProfile(good({ goals: all })).payload.goals).toEqual(all);
    expect(validateCoachProfile(good({ goals: [...all, 'mindgames'] })).payload.goals).toEqual(all);
  });

  it('自填授课方向可留空，也按码点量限制', () => {
    expect(validateCoachProfile(good({ goals_note: '' })).payload.goals_note).toBe('');
    const text = '棋'.repeat(COACH_GOALS_NOTE_MAX);
    expect(validateCoachProfile(good({ goals_note: text })).ok).toBe(true);
    expect(validateCoachProfile(good({ goals_note: `${text}棋` }))).toEqual({
      ok: false,
      field: 'goals_note',
      text: `自填擅长方向请写在 ${COACH_GOALS_NOTE_MAX} 个字以内（现在 ${COACH_GOALS_NOTE_MAX + 1} 个字）。`,
    });
  });

  it('自定义时段可添加任意时间文本，去重并保留逗号原样', () => {
    const slots = ['  柏林时间　周二 06:30–07:15 ', '北京时间周五 21:00 后，可换时段', '柏林时间 周二 06:30–07:15'];
    expect(validateCoachProfile(good({ custom_slots: slots })).payload.custom_slots).toEqual([
      '柏林时间 周二 06:30–07:15', '北京时间周五 21:00 后，可换时段',
    ]);
  });

  it('自定义时段限制条数、单条长度和输入类型', () => {
    const slots = Array.from({ length: COACH_CUSTOM_SLOTS_MAX }, (_, at) => `时段 ${at}`);
    expect(validateCoachProfile(good({ custom_slots: slots })).payload.custom_slots).toEqual(slots);
    expect(validateCoachProfile(good({ custom_slots: [...slots, '再来一条'] }))).toEqual({
      ok: false,
      field: 'custom_slots',
      text: `自定义时段最多 ${COACH_CUSTOM_SLOTS_MAX} 条。`,
    });
    expect(validateCoachProfile(good({ custom_slots: ['时'.repeat(COACH_CUSTOM_SLOT_MAX + 1)] }))).toEqual({
      ok: false,
      field: 'custom_slots',
      text: `每一条自定义时段请写在 ${COACH_CUSTOM_SLOT_MAX} 个字以内。`,
    });
    expect(validateCoachProfile(good({ custom_slots: [123] }))).toEqual({
      ok: false,
      field: 'custom_slots',
      text: '自定义时段请一行填一条。',
    });
  });

  it('四组多选全可以整条不填，和"至少选一项"的偏好表不一样', () => {
    for (const group of COACH_PROFILE_GROUPS) {
      expect(validateCoachProfile(good({ [group]: [] })).ok, group).toBe(true);
    }
  });

  it('旧档位在发出去前换算，重复项只算一项', () => {
    expect(validateCoachProfile(good({ levels: ['play', 'play'] })).payload.levels).toEqual([
      'amateur5',
    ]);
    expect(validateCoachProfile(good({ levels: ['moves', 'play', 'rated'] })).payload.levels)
      .toEqual(['amateur5', 'master']);
    // 'review' 是「上课形式」的选项，出现在「擅长教什么」里只能来自漏删的旧控件
    expect(validateCoachProfile(good({ goals: ['tactics', 'review', 'made-up'] })).payload.goals)
      .toEqual(['tactics']);
  });

  it('多选也吃逗号串：库里读回来直接再发一次不用先拆', () => {
    expect(validateCoachProfile(good({ levels: 'zero,amateur5' })).payload.levels)
      .toEqual(['zero', 'amateur5']);
  });

  it('照片名不对就当场说一句，不悄悄少存一张（保存是整份覆盖）', () => {
    expect(validateCoachProfile(good({ photos: [PIC, '../../etc/passwd', `${PIC}.php`] }))).toEqual({
      ok: false,
      field: 'photos',
      text: '照片的文件名认不出来，请重新传一张。',
    });
    // 重复的名字只算一张，所以四串里其实三项，不该报错
    expect(validateCoachProfile(good({ photos: `${PIC},${PIC2},${PIC3},${PIC}` })).payload.photos)
      .toHaveLength(COACH_PHOTOS_MAX);
    expect(validateCoachProfile(good({ photos: [PIC, PIC, PIC2] })).ok).toBe(true);
  });

  it('证书图片最多六张，非法名字和超量都不能悄悄丢掉', () => {
    const names = Array.from({ length: COACH_CERTIFICATES_MAX }, (_, at) =>
      `${at.toString(16).padStart(24, '0')}.jpg`);
    expect(validateCoachProfile(good({ certificates: names })).payload.certificates).toEqual(names);
    expect(validateCoachProfile(good({ certificates: [...names, names[0]] })).payload.certificates)
      .toEqual(names);
    expect(validateCoachProfile(good({ certificates: [...names, 'ffffffffffffffffffffffff.webp'] })))
      .toEqual({
        ok: false,
        field: 'certificates',
        text: `证书与荣誉图片最多 ${COACH_CERTIFICATES_MAX} 张（现在 ${COACH_CERTIFICATES_MAX + 1} 张）。`,
      });
    expect(validateCoachProfile(good({ certificates: [PIC, '../secret.png'] }))).toEqual({
      ok: false,
      field: 'certificates',
      text: '证书与荣誉图片的文件名认不出来，请重新传一张。',
    });
  });

  it('头像同理，而且只容一张', () => {
    expect(validateCoachProfile(good({ avatar: `../${PIC}` }))).toEqual({
      ok: false,
      field: 'avatar',
      text: '头像的文件名认不出来，请重新传一张。',
    });
    expect(validateCoachProfile(good({ avatar: PIC })).payload.avatar).toBe(PIC);
    expect(validateCoachProfile(good({ avatar: [PIC, PIC2] }))).toEqual({
      ok: false,
      field: 'avatar',
      text: '头像最多 1 张（现在 2 张）。',
    });
  });

  it('语言/时区填了不认识的就当没填，不送去服务端挨一句 bad_profile', () => {
    expect(validateCoachProfile(good({ language: 'fr', timezone: 'Mars/Olympus' })).payload)
      .toMatchObject({ language: '', timezone: '' });
  });
});

describe('字数按码点量', () => {
  const han = '带出过三位省赛冠军两位全国八强';
  const pad = (n) => han.repeat(Math.ceil(n / han.length)).slice(0, n);

  it('中文不按字节量，否则写到三分之一就被判超长', () => {
    const text = pad(COACH_HONORS_MAX);
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(COACH_HONORS_MAX);
    expect(validateCoachProfile(good({ honors: text })).ok).toBe(true);
  });

  it('多一个字就报超长，并把当前字数回给人看', () => {
    expect(validateCoachProfile(good({ tagline: pad(COACH_TAGLINE_MAX + 1) }))).toEqual({
      ok: false,
      field: 'tagline',
      text: `一句话简介请写在 ${COACH_TAGLINE_MAX} 个字以内（现在 ${COACH_TAGLINE_MAX + 1} 个字）。`,
    });
  });

  it('教学补充说明可留空，也按码点量限制', () => {
    expect(validateCoachProfile(good({ teaching_focus: '' })).payload.teaching_focus).toBe('');
    const text = '马'.repeat(COACH_TEACHING_FOCUS_MAX);
    expect(validateCoachProfile(good({ teaching_focus: text })).ok).toBe(true);
    expect(validateCoachProfile(good({ teaching_focus: `${text}马` }))).toEqual({
      ok: false,
      field: 'teaching_focus',
      text: `补充说明（选填）请写在 ${COACH_TEACHING_FOCUS_MAX} 个字以内（现在 ${COACH_TEACHING_FOCUS_MAX + 1} 个字）。`,
    });
  });

  it('全角空格、nbsp、换行都归成一个空格再算', () => {
    const payload = validateCoachProfile(good({ honors: ' 省赛\u3000冠军 \n 八强 ' })).payload;
    expect(payload.honors).toBe('省赛 冠军 八强');
  });
});

describe('名录卡片与主页上那几句话', () => {
  const coach = (profile, over = {}) => ({
    player_id: 7,
    nickname: '王老师',
    rating: 2210,
    has_profile: true,
    profile: { title: '', elo: null, years: null, tagline: '', honors: '', ...profile },
    ...over,
  });

  it('徽章只说填了的：没填的不印"暂无"', () => {
    expect(coachBadges(coach({ title: 'gm', elo: 2412, years: 9 }))).toEqual([
      '国际特级大师 GM', '等级分 2412', '教龄 9 年',
    ]);
    expect(coachBadges(coach({}))).toEqual([]);
    expect(coachBadges(coach({ years: 0 }))).toEqual(['教龄 0 年']);
    expect(coachBadges(null)).toEqual([]);
  });

  it('等级分只认教练自己填的 Elo，未填时不显示账号 rating', () => {
    expect(coachBadges(coach({ elo: 1500 }, { rating: 2210 }))).toContain('等级分 1500');
    expect(coachBadges(coach({ elo: null }, { rating: 400 }))).toEqual([]);
    expect(coachBadges(coach({ elo: '' }, { rating: 400 }))).toEqual([]);
  });

  it('卡片上的接收档位与方向标签最多两样，多了读不完', () => {
    expect(coachProfileTags(coach({ levels: ['zero', 'amateur5'], goals: ['tactics', 'opening'] })))
      .toEqual(['可接收「零基础」', '可接收「业余五级以下」']);
    expect(coachProfileTags(coach({ levels: ['moves', 'rated'] })))
      .toEqual(['可接收「业余五级以下」', '可接收「业余大师以上」']);
    expect(coachProfileTags(coach({}))).toEqual([]);
  });

  it('主页那几行：空的组整行不出，标题和表单里的 legend 同一句', () => {
    const rows = coachProfileRows(coach({
      levels: ['amateur5'], teaching_focus: '擅长带入门学员建立规则感',
      goals: [], formats: ['one', 'group'], slots: ['wkend_am'],
      language: 'zh_en', timezone: 'Asia/Shanghai',
    }));
    expect(rows).toEqual([
      { label: COACH_PROFILE_TITLES.levels, text: '业余五级以下' },
      { label: COACH_PROFILE_TITLES.formats, text: '一对一、小组课' },
      { label: COACH_PROFILE_TITLES.slots, text: '周末上午' },
      { label: COACH_PROFILE_TITLES.teaching_focus, text: '擅长带入门学员建立规则感' },
      { label: COACH_PROFILE_TITLES.language, text: '中英都行' },
      { label: COACH_PROFILE_TITLES.timezone, text: '中国（UTC+8）' },
    ]);
    expect(coachProfileRows(coach({}))).toEqual([]);
  });

  it('主页展示全部授课方向和自定义时段，逗号不会被拆成多项', () => {
    const rows = coachProfileRows(coach({
      goals: ['basics', 'tactics', 'opening', 'endgame', 'contest'],
      goals_note: '退役棋手复棋',
      custom_slots: ['柏林时间周二 06:30–07:15', '北京时间周五 21:00 后，可换时段'],
    }));
    expect(rows).toEqual([
      { label: COACH_PROFILE_TITLES.goals, text: '打基础、补战术、学开局、学残局、准备比赛' },
      { label: COACH_PROFILE_TITLES.goals_note, text: '退役棋手复棋' },
      { label: COACH_PROFILE_TITLES.custom_slots, text: '柏林时间周二 06:30–07:15、北京时间周五 21:00 后，可换时段' },
    ]);
  });

  it('库里出来一个界面不认的 key 时原样印出来，好排查', () => {
    expect(coachProfileLabels('goals', ['tactics', 'mindgames'])).toEqual(['补战术', 'mindgames']);
    expect(coachTitleLabel('gm')).toBe('国际特级大师 GM');
    expect(coachTitleLabel('nm')).toBe('nm');
    expect(coachTitleLabel('')).toBe('');
  });

  it('图片地址只走那个下发端点，名字与人写的文件名无关', () => {
    const url = coachPhotoUrl(7, PIC);
    expect(url).toContain('chess_coach_photo.php?c=7&f=');
    expect(url).not.toContain('coach_media');
    expect(coachPhotoUrl(7, '')).toBe('');
    expect(coachPhotoUrl(7, '../x.jpg')).not.toContain('../');
    expect(coachPhotoUrl(7, PIC, 320)).toContain('&t=320');
    expect(coachPhotoUrl(7, PIC, 123)).not.toContain('&t=');
  });
});

describe('界面与后端的契约', () => {
  /** 从 PHP 里取一个 `const NAME = [...]` 的字符串列表。 */
  const phpList = (name) => {
    const block = CORE.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
    if (!block) throw new Error(`chess_coach_core.php 里找不到 ${name}`);
    return [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  };

  const phpNum = (name) => {
    const hit = CORE.match(new RegExp(`const ${name} = ([^;]+);`));
    if (!hit) throw new Error(`chess_coach_core.php 里找不到 ${name}`);
    // eslint-disable-next-line no-new-func
    return Number(Function(`return (${hit[1]});`)());
  };

  /** 函数体：从 `function 名字(` 到顶格的 } —— 上面的 docblock 不算进来。 */
  const phpFn = (source, name) => {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`找不到 ${name}()`);
    const end = source.indexOf('\n}', start);
    return source.slice(start, end).replace(/\/\/[^\n]*/g, '');
  };

  it('称号的 key 和后端白名单一字不差（顺序也要一样）', () => {
    expect(COACH_TITLES.map(([key]) => key)).toEqual(phpList('COACH_TITLES'));
  });

  it('接收档位的 key 和后端白名单一字不差（顺序也要一样）', () => {
    expect(COACH_ACCEPT_LEVELS.map(([key]) => key)).toEqual(phpList('COACH_ACCEPT_LEVELS'));
  });

  it('四个数字上限两边取同一个数', () => {
    expect(COACH_ELO_MIN).toBe(phpNum('COACH_ELO_MIN'));
    expect(COACH_ELO_MAX).toBe(phpNum('COACH_ELO_MAX'));
    expect(COACH_YEARS_MAX).toBe(phpNum('COACH_YEARS_MAX'));
    expect(COACH_IMAGE_BYTES_MAX).toBe(phpNum('COACH_IMAGE_BYTES_MAX'));
  });

  it('文本、照片与证书的上限两边取同一个数', () => {
    expect(COACH_TAGLINE_MAX).toBe(phpNum('COACH_TAGLINE_MAX'));
    expect(COACH_HONORS_MAX).toBe(phpNum('COACH_HONORS_MAX'));
    expect(COACH_TEACHING_FOCUS_MAX).toBe(phpNum('COACH_TEACHING_FOCUS_MAX'));
    expect(COACH_GOALS_NOTE_MAX).toBe(phpNum('COACH_GOALS_NOTE_MAX'));
    expect(COACH_CUSTOM_SLOTS_MAX).toBe(phpNum('COACH_CUSTOM_SLOTS_MAX'));
    expect(COACH_CUSTOM_SLOT_MAX).toBe(phpNum('COACH_CUSTOM_SLOT_MAX'));
    expect(COACH_PHOTOS_MAX).toBe(phpNum('COACH_PHOTOS_MAX'));
    expect(COACH_CERTIFICATES_MAX).toBe(phpNum('COACH_CERTIFICATES_MAX'));
  });

  it('每组能选几项和后端那四个数一致（slots 后端按白名单长度算）', () => {
    expect(COACH_PROFILE_RULES.levels.max).toBe(phpNum('COACH_LEVELS_MAX'));
    expect(COACH_PROFILE_RULES.goals.max).toBe(phpNum('COACH_GOALS_MAX_COACH'));
    expect(COACH_PROFILE_RULES.formats.max).toBe(phpNum('COACH_FORMATS_MAX_COACH'));
    expect(COACH_PROFILE_RULES.slots.max).toBe(phpList('COACH_SLOTS').length);
  });

  it('图片文件名的形状两边是同一条正则', () => {
    // 界面那条是从 game/coachProfile.js 的源码里抓出来的字面量，和 PHP 那个常量
    // 逐字比 —— 两处各写一套形状，早晚有一边放过一个带斜杠的名字。
    const jsLiteral = PROFILE_CORE.match(/\/(\^\[a-f0-9\][^\n]*?)\/\.test\(/)?.[1];
    const phpLiteral = CORE.match(/const COACH_IMAGE_PATTERN = '\/([^']+)\/';/)?.[1];
    expect(jsLiteral, '界面那条图片名正则没抓到').toBeTruthy();
    expect(phpLiteral).toBe(jsLiteral);
  });

  it('后端那三种 MIME 落的扩展名，正是界面那条正则收的三种', () => {
    // 现场表现值得记一下：后端把 image/jpeg 存成 .jpg，所以库里永远没有 .jpeg，
    // 界面要是多收一种，就会去取一个根本不存在的文件（碎图标，且不吭声）。
    const exts = [...CORE.matchAll(/'image\/[a-z]+' => '([a-z]+)'/g)].map((m) => m[1]).sort();
    expect(exts).toEqual(['jpg', 'png', 'webp']);
  });

  it('每一栏都有中文标题，报错时点名点得出', () => {
    for (const key of [...COACH_PROFILE_GROUPS, 'title', 'elo', 'years', 'tagline', 'honors',
      'teaching_focus', 'goals_note', 'custom_slots', 'enrollment_notes', 'hourly_rate_cny', 'tuition_text', 'schedule_text',
      'language', 'timezone', 'avatar', 'photos', 'certificates']) {
      expect(COACH_PROFILE_TITLES[key], key).toBeTruthy();
    }
  });

  it('面板要的元素 id 在 index.html 里都在（两边只改一边就会哑掉）', () => {
    const htmlIds = new Set([...MARKUP.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const wanted = new Set(
      [...`${PROFILE_UI}\n${DIRECTORY_UI}`.matchAll(/\$\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]),
    );
    // 三个下拉框本体是 buildSelect 当场赋的 id（赋的是变量，静态抓不到），
    // 四组多选的容器与 legend、以及报错时点名的栏都是模板字符串拼的。
    const generated = new Set(['cp-title', 'cp-language', 'cp-timezone']);
    for (const group of COACH_PROFILE_GROUPS) {
      wanted.add(`cp-${group}-choices`);
      wanted.add(`cp-${group}-legend`);
    }
    for (const key of Object.keys(COACH_PROFILE_TITLES)) {
      wanted.add(`cp-${key.replaceAll('_', '-')}-group`);
    }
    for (const id of wanted) {
      expect(htmlIds.has(id) || generated.has(id), id).toBe(true);
    }
  });

  it('推荐教练默认折叠，而且在下棋功能键下面', () => {
    const opening = MARKUP.match(/<details\b[^>]*\bid="coach-card"[^>]*>/)?.[0] ?? '';
    expect(opening).not.toBe('');
    expect(opening).not.toMatch(/\bopen\b/);
    expect(MARKUP).toMatch(/<summary\b[^>]*\bid="coach-title"/);
    expect(MARKUP.indexOf('id="coach-card"')).toBeGreaterThan(MARKUP.indexOf('id="controls"'));
  });

  it('看主页与约课是等宽按钮，保留间距和独立点击区域', () => {
    expect(DIRECTORY_UI).toContain("text('article', 'coach-item')");
    expect(DIRECTORY_UI).toContain("button('看主页', 'btn btn-ghost btn-sm'");
    expect(DIRECTORY_UI).toContain("button('约课', 'btn btn-primary btn-sm'");
    expect(DIRECTORY_UI).toContain('actions.append(home, enroll)');
    const rule = STYLE.match(/\.coach-item-actions\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(rule).toMatch(/display:\s*flex/);
    expect(rule).toMatch(/gap:\s*8px/);
    const buttonRule = STYLE.match(/\.coach-item-actions \.btn\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(buttonRule).toMatch(/flex:\s*1 1 0/);
    expect(buttonRule).toMatch(/min-width:\s*0/);
  });

  it('头像图片绝对铺满圆框，避免被 flex 收缩成小图', () => {
    const rule = STYLE.match(/\.coach-avatar img\s*\{([^}]+)\}/)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/inset:\s*0/);
    expect(rule).toMatch(/width:\s*100%/);
    expect(rule).toMatch(/height:\s*100%/);
    expect(rule).toMatch(/object-fit:\s*cover/);
  });

  it('公开那一行取不到邮箱，也取不到申请时写给管理员的那段', () => {
    for (const [source, name] of [[CORE, 'coach_directory_entry'], [GUARD, 'chess_coach_rows']]) {
      const body = phpFn(source, name);
      for (const forbidden of ['email', 'verified_at', 'password_hash', 'intro', 'reset_hash']) {
        expect(body.includes(forbidden), `${name} 里出现 ${forbidden}`).toBe(false);
      }
    }
  });

  it('界面上也没有第二条取邮箱的路：名录与资料面板都不提 email', () => {
    for (const source of [DIRECTORY_UI, PROFILE_UI]) {
      expect(source.includes('email')).toBe(false);
    }
  });
});
