/**
 * 教练资料的数据层：称号表、各项上限、一张表单该不该发出去、名录卡片上那几句话。
 *
 * 这里没有 DOM 也没有 fetch，所以能在 vitest 里跑。界面在 ui/coachProfile.js，
 * 名录的排法在 game/coachMatch.js。
 *
 * 目标、形式、时段、语言与时区复用 game/coachPref.js 的 key；接收学生水平
 * 单独定义，因为"我现在什么水平"和"我接收哪一档"不是同一列。
 * key 同时和后端 v1/chess_coach_core.php 的白名单绑住：tests/coachPref.test.js
 * 与 tests/coachProfile.test.js 逐条比对，改一边不改另一边就会红。
 */

import { API_BASE } from '../net/auth.js';
import { COACH_OPTIONS, coachKeys, coachLabel, formatCny, parseCny } from './coachPref.js';

export const COACH_ACCEPT_LEVELS = [
  ['zero', '零基础'],
  ['amateur5', '业余五级以下'],
  ['amateur1', '业余一级以下'],
  ['master', '业余大师以上'],
];

/** 和后端 COACH_TAGLINE_MAX / COACH_HONORS_MAX / COACH_PHOTOS_MAX / COACH_CERTIFICATES_MAX 同一个数。 */
export const COACH_TAGLINE_MAX = 80;
export const COACH_HONORS_MAX = 300;
export const COACH_TEACHING_FOCUS_MAX = 300;
export const COACH_PHOTOS_MAX = 3;
export const COACH_CERTIFICATES_MAX = 6;
export const COACH_ELO_MIN = 600;
export const COACH_ELO_MAX = 2850;
export const COACH_YEARS_MAX = 60;
/** 三项招生说明分别与后端 COACH_*_MAX 同口径，按码点量。 */
export const COACH_ENROLLMENT_NOTES_MAX = 2000;
export const COACH_TUITION_TEXT_MAX = 1000;
export const COACH_SCHEDULE_TEXT_MAX = 1000;
export const COACH_GOALS_NOTE_MAX = 300;
export const COACH_CUSTOM_SLOTS_MAX = 20;
export const COACH_CUSTOM_SLOT_MAX = 80;
/** 单张图的字节上限（后端 COACH_IMAGE_BYTES_MAX）。界面上先拦一道，省一次上传往返。 */
export const COACH_IMAGE_BYTES_MAX = 2 * 1024 * 1024;

/**
 * FIDE 称号。中文说法 + 原文缩写一起印：来这儿找教练的人认的是 GM/IM 这几个字母，
 * 只给中文反而对不上他见过的证。
 *
 * 没有 nm（美国国内称号）：那套是 USCF 的，不是 FIDE 的。要加就在后端
 * COACH_TITLES 里加一档，两边同时改 —— 宁可界面上多一次改动，也不要库里
 * 冒出第五种口径。
 */
export const COACH_TITLES = [
  ['gm', '国际特级大师 GM'],
  ['im', '国际大师 IM'],
  ['fm', '棋联大师 FM'],
  ['cm', '棋联候选大师 CM'],
  ['wgm', '女子国际特级大师 WGM'],
  ['wim', '女子国际大师 WIM'],
  ['wfm', '女子棋联大师 WFM'],
  ['wcm', '女子棋联候选大师 WCM'],
];

/** 每一组选几个。全都能留空 —— 资料不是门槛，够不够格看的是申请状态。 */
export const COACH_PROFILE_RULES = {
  levels: { min: 0, max: 4 },
  goals: { min: 0, max: 5 },
  formats: { min: 0, max: 3 },
  slots: { min: 0, max: 4 },
};

/** 表单里从上到下这几组（多选那四组的遍历顺序）。 */
export const COACH_PROFILE_GROUPS = ['levels', 'goals', 'formats', 'slots'];

/** 一组的名字，红字挂上去时要说"哪一栏"。 */
export const COACH_PROFILE_TITLES = {
  title: '称号',
  elo: '国际等级分',
  years: '教龄',
  tagline: '一句话简介',
  honors: '荣誉与成绩',
  enrollment_notes: '招生须知',
  hourly_rate_cny: '每小时费率（人民币）',
  tuition_text: '课时费标准',
  schedule_text: '上课时段',
  levels: '可以接受什么水平的学生',
  goals: '擅长教什么',
  goals_note: '自填擅长方向',
  custom_slots: '自定义时段',
  teaching_focus: '补充说明（选填）',
  formats: '上课形式',
  slots: '方便的时间段',
  language: '授课语言',
  timezone: '所在时区',
  avatar: '头像',
  photos: '照片',
  certificates: '证书与荣誉图片',
};

export function coachTitleLabel(key) {
  if (!key) return '';
  return COACH_TITLES.find(([one]) => one === key)?.[1] ?? key;
}

/** 旧档位只在读取时换算，不把过时 key 再写回数据库。 */
export function normalizeCoachAcceptLevels(value) {
  const keys = Array.isArray(value) ? value : String(value ?? '').split(',');
  const legacy = { zero: 'zero', moves: 'amateur5', play: 'amateur5', rated: 'master' };
  const mapped = keys.map((key) => legacy[String(key).trim()] ?? String(key).trim());
  return COACH_ACCEPT_LEVELS.map(([key]) => key).filter((key) => mapped.includes(key));
}

/** 一句人类可读的话：给已选的值找出对应的说法（多选，逗号串或数组都吃）。 */
export function coachProfileLabels(group, value) {
  const keys = group === 'levels' ? normalizeCoachAcceptLevels(value)
    : Array.isArray(value) ? value : String(value ?? '').split(',');
  const labels = group === 'levels' ? COACH_ACCEPT_LEVELS : COACH_OPTIONS[group];
  return keys.map((key) => String(key).trim()).filter(Boolean)
    .map((key) => labels.find(([one]) => one === key)?.[1] ?? coachLabel(group, key));
}

/**
 * 一张图片该从哪个地址取。
 *
 * 名字是服务端随机生成的 24 位十六进制 + 扩展名，路径里没有任何一段来自人写的
 * 文件名（目录由后端按 (int)player_id 拼），所以这里拼出来的串不可能越界。
 */
export function coachPhotoUrl(playerId, name, thumb = 0) {
  if (!name) return '';
  const size = [96, 160, 320, 640, 960].includes(Number(thumb)) ? `&t=${Number(thumb)}` : '';
  return `${API_BASE}chess_coach_photo.php?c=${encodeURIComponent(playerId)}&f=${encodeURIComponent(name)}${size}`;
}

/**
 * 图片名的形状（和后端 COACH_IMAGE_PATTERN 同一条，tests/coachProfile.test.js 逐字比）。
 * 名字一律是服务端起的：随机 24 位十六进制 + 三种真图片扩展名之一。
 */
const isImageName = (name) => /^[a-f0-9]{24}\.(?:jpg|png|webp)$/.test(name);

/**
 * 一份资料表单 → 该发出去的 payload，或者一句"哪儿不对"。
 *
 * 前端再验一遍不是因为不信任后端（那边是唯一裁判），而是"等级分填了 1500 分左右"
 * 这种错，后端回一句 bad_profile 要一个往返，而这里能当场把红字挂进那一栏。
 *
 * 所有字段都可以留空：留空发空串，后端把 elo/years 的空串存成 NULL ——
 * "没登记"和"0 分"在名录上是两句话，这一层不能提前把空变成 0。
 *
 * @returns {{ok: true, payload: object} | {ok: false, field: string, text: string}}
 */
export function validateCoachProfile(form) {
  const source = form ?? {};
  const fail = (field, text) => ({ ok: false, field, text });
  const title = typeof source.title === 'string' ? source.title.trim() : '';
  if (title && !COACH_TITLES.some(([key]) => key === title)) {
    return fail('title', '称号只有列表里那几个。');
  }

  const number = (field, { min, max, unit }) => {
    const raw = source[field];
    const text = raw === null || raw === undefined ? '' : String(raw).trim();
    if (text === '') return { value: '' };
    if (!/^\d{1,4}$/.test(text)) return { error: `${COACH_PROFILE_TITLES[field]}要填数字，${unit}。` };
    const n = Number(text);
    if (n < min || n > max) {
      return { error: `${COACH_PROFILE_TITLES[field]}要在 ${min} 到 ${max} 之间。` };
    }
    return { value: String(n) };
  };

  const elo = number('elo', { min: COACH_ELO_MIN, max: COACH_ELO_MAX, unit: '没有等级分就空着' });
  if (elo.error) return fail('elo', elo.error);
  const years = number('years', { min: 0, max: COACH_YEARS_MAX, unit: '刚开始教就填 0' });
  if (years.error) return fail('years', years.error);

  const text = (field, max) => {
    const value = (typeof source[field] === 'string' ? source[field] : '')
      .replace(/[\u3000\s]+/g, ' ')
      .trim();
    // 按码点量：中文在 UTF-8 里 3 个字节一个字，按字节量的话人写到三分之一就被判超长。
    if ([...value].length > max) {
      return { error: `${COACH_PROFILE_TITLES[field]}请写在 ${max} 个字以内（现在 ${[...value].length} 个字）。` };
    }
    return { value };
  };
  const tagline = text('tagline', COACH_TAGLINE_MAX);
  if (tagline.error) return fail('tagline', tagline.error);
  const honors = text('honors', COACH_HONORS_MAX);
  if (honors.error) return fail('honors', honors.error);
  const teachingFocus = text('teaching_focus', COACH_TEACHING_FOCUS_MAX);
  if (teachingFocus.error) return fail('teaching_focus', teachingFocus.error);
  const goalsNote = text('goals_note', COACH_GOALS_NOTE_MAX);
  if (goalsNote.error) return fail('goals_note', goalsNote.error);
  const customSlots = customSlotList(source.custom_slots);
  if (customSlots.error) return fail('custom_slots', customSlots.error);
  const enrollmentNotes = text('enrollment_notes', COACH_ENROLLMENT_NOTES_MAX);
  if (enrollmentNotes.error) return fail('enrollment_notes', enrollmentNotes.error);
  const tuitionText = text('tuition_text', COACH_TUITION_TEXT_MAX);
  if (tuitionText.error) return fail('tuition_text', tuitionText.error);
  const scheduleText = text('schedule_text', COACH_SCHEDULE_TEXT_MAX);
  if (scheduleText.error) return fail('schedule_text', scheduleText.error);
  const hourlyRate = parseCny(source.hourly_rate_cny);
  if (!hourlyRate.ok) return fail('hourly_rate_cny', '每小时费率请填 0 到 100000 的非负整数（人民币元），不确定就留空。');

  const avatarImage = images('avatar', 1);
  if (avatarImage.error) return fail('avatar', avatarImage.error);
  const photoList = images('photos', COACH_PHOTOS_MAX);
  if (photoList.error) return fail('photos', photoList.error);
  const certificateList = images('certificates', COACH_CERTIFICATES_MAX);
  if (certificateList.error) return fail('certificates', certificateList.error);

  const payload = {
    title,
    elo: elo.value,
    years: years.value,
    tagline: tagline.value,
    honors: honors.value,
    teaching_focus: teachingFocus.value,
    goals_note: goalsNote.value,
    custom_slots: customSlots.value,
    enrollment_notes: enrollmentNotes.value,
    hourly_rate_cny: hourlyRate.value,
    tuition_text: tuitionText.value,
    schedule_text: scheduleText.value,
    language: one('language'),
    timezone: one('timezone'),
    avatar: avatarImage.value[0] ?? '',
    photos: photoList.value,
    certificates: certificateList.value,
  };
  for (const group of COACH_PROFILE_GROUPS) {
    const chosen = pick(group);
    const { max } = COACH_PROFILE_RULES[group];
    if (chosen.length > max) {
      return fail(group, `「${COACH_PROFILE_TITLES[group]}」最多选 ${max} 项，现在选了 ${chosen.length} 项。`);
    }
    payload[group] = chosen;
  }
  return { ok: true, payload };

  /** 单选：留空允许，填了就必须是那组里的一个 key。 */
  function one(group) {
    const value = typeof source[group] === 'string' ? source[group].trim() : '';
    return value && coachKeys(group).includes(value) ? value : '';
  }

  /** 多选：去重 + 只留我发出去的 key（别人手改过的 DOM 不该把没见过的值送到服务端）。 */
  function pick(group) {
    const value = source[group];
    if (group === 'levels') return normalizeCoachAcceptLevels(value);
    const list = Array.isArray(value) ? value : String(value ?? '').split(',');
    const allowed = coachKeys(group);
    return [...new Set(list.map((key) => String(key).trim()).filter(Boolean))]
      .filter((key) => allowed.includes(key));
  }

  function customSlotList(value) {
    const list = Array.isArray(value) ? value : [];
    if (list.length > COACH_CUSTOM_SLOTS_MAX) {
      return { error: `自定义时段最多 ${COACH_CUSTOM_SLOTS_MAX} 条。` };
    }
    const kept = [];
    for (const item of list) {
      if (typeof item !== 'string') return { error: '自定义时段请一行填一条。' };
      const slot = item.replace(/[\u3000\s]+/g, ' ').trim();
      if ([...slot].length > COACH_CUSTOM_SLOT_MAX) {
        return { error: `每一条自定义时段请写在 ${COACH_CUSTOM_SLOT_MAX} 个字以内。` };
      }
      if (slot && !kept.includes(slot)) kept.push(slot);
    }
    return { value: kept };
  }

  /**
   * 图片那一两栏：只认服务端起过的那种名字。
   *
   * 🔴 形状不对就当这一栏不对、当场说一句，而不是悄悄丢掉那一张 —— 保存是整份
   * 覆盖，少发一个名字等于把那张图从库里删了。"丢了东西但不吭声"是这类表单最难
   * 查的一种错。
   */
  function images(field, max) {
    const value = source[field];
    const list = Array.isArray(value) ? value : String(value ?? '').split(',');
    const kept = [...new Set(list.map((name) => String(name).trim()).filter(Boolean))];
    if (kept.some((name) => !isImageName(name))) {
      return { error: `${COACH_PROFILE_TITLES[field]}的文件名认不出来，请重新传一张。` };
    }
    if (kept.length > max) {
      return { error: `${COACH_PROFILE_TITLES[field]}最多 ${max} 张（现在 ${kept.length} 张）。` };
    }
    return { value: kept };
  }
}

/**
 * 抬头那几枚小徽章：称号、等级分、教龄。没填的不出现（不印"暂无"），
 * 一屏要看七八张卡，空话比空白更挡眼。
 *
 * 等级分先看教练自己登记的 elo，没有才退回账号那个 rating：前者是他报的
 * "我是多少分"，后者是站内下的棋算出来的，两个不是一回事，但名录上只显示一个。
 */
export function coachBadges(coach) {
  const profile = coach?.profile ?? {};
  const bits = [];
  if (profile.title) bits.push(coachTitleLabel(profile.title));
  const elo = profile.elo ?? coach?.rating;
  if (elo) bits.push(`等级分 ${elo}`);
  if (profile.years !== null && profile.years !== undefined && profile.years !== '') {
    bits.push(`教龄 ${profile.years} 年`);
  }
  const rate = formatCny(profile.hourly_rate_cny);
  if (rate) bits.push(`${rate} / 60 分钟`);
  return bits;
}

/** 卡片上的"可接收……/擅长……"那一串（最多两样，多了读不完）。 */
export function coachProfileTags(coach, limit = 2) {
  const profile = coach?.profile ?? {};
  const shown = [
    ...coachProfileLabels('levels', profile.levels).map((one) => `可接收「${one}」`),
    ...coachProfileLabels('goals', profile.goals),
  ];
  return shown.slice(0, limit);
}

/**
 * 教练主页上那几行"能带什么 / 怎么上 / 什么时候"。
 *
 * 空的组整行不出：主页是给人扫的，七行里五行写着"未填"还不如什么都没有。
 * 行的标题和表单里的 legend 同源（COACH_PROFILE_TITLES），措辞只用改一处。
 */
export function coachProfileRows(coach) {
  const profile = coach?.profile ?? {};
  const rows = [];
  for (const group of COACH_PROFILE_GROUPS) {
    const labels = coachProfileLabels(group, profile[group]);
    if (labels.length) rows.push({ label: COACH_PROFILE_TITLES[group], text: labels.join('、') });
    if (group === 'goals' && String(profile.goals_note ?? '').trim()) {
      rows.push({ label: COACH_PROFILE_TITLES.goals_note, text: profile.goals_note });
    }
    if (group === 'slots' && (profile.custom_slots ?? []).length) {
      rows.push({ label: COACH_PROFILE_TITLES.custom_slots, text: profile.custom_slots.join('、') });
    }
  }
  if (String(profile.teaching_focus ?? '').trim()) {
    rows.push({ label: COACH_PROFILE_TITLES.teaching_focus, text: profile.teaching_focus });
  }
  if (profile.language) {
    rows.push({ label: COACH_PROFILE_TITLES.language, text: coachLabel('language', profile.language) });
  }
  if (profile.timezone) {
    rows.push({ label: COACH_PROFILE_TITLES.timezone, text: coachLabel('timezone', profile.timezone) });
  }
  return rows;
}

/** 主页固定展示的四个招生栏目；没填时由界面写"暂未填写"，不把空栏藏掉。 */
export function coachEnrollmentRows(coach) {
  const profile = coach?.profile ?? {};
  const clean = (value) => typeof value === 'string' ? value.trim() : '';
  const rate = formatCny(profile.hourly_rate_cny);
  return [
    { key: 'enrollment_notes', label: COACH_PROFILE_TITLES.enrollment_notes, text: clean(profile.enrollment_notes) },
    {
      key: 'hourly_rate_cny',
      label: COACH_PROFILE_TITLES.hourly_rate_cny,
      text: rate ? `${rate} / 60 分钟` : '',
    },
    { key: 'tuition_text', label: COACH_PROFILE_TITLES.tuition_text, text: clean(profile.tuition_text) },
    { key: 'schedule_text', label: COACH_PROFILE_TITLES.schedule_text, text: clean(profile.schedule_text) },
  ];
}
