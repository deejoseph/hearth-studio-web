/**
 * 教练资料的数据层：称号表、各项上限、一张表单该不该发出去、名录卡片上那几句话。
 *
 * 这里没有 DOM 也没有 fetch，所以能在 vitest 里跑。界面在 ui/coachProfile.js，
 * 名录的排法在 game/coachMatch.js。
 *
 * 🔴 选项的 key 全部复用 game/coachPref.js 那一份（学员填的表和教练填的表共用
 * 同一批 key），匹配因此是"同一列东西对同一列东西"，不会出现两边各数一套口径。
 * key 同时和后端 v1/chess_coach_core.php 的白名单绑住：tests/coachPref.test.js
 * 逐条比对，改一边不改另一边就会红。
 */

import { COACH_OPTIONS, coachKeys, coachLabel } from './coachPref.js';
import { API_BASE } from '../net/auth.js';

/** 和后端 COACH_TAGLINE_MAX / COACH_HONORS_MAX / COACH_PHOTOS_MAX / COACH_CERTIFICATES_MAX 同一个数。 */
export const COACH_TAGLINE_MAX = 80;
export const COACH_HONORS_MAX = 300;
export const COACH_PHOTOS_MAX = 3;
export const COACH_CERTIFICATES_MAX = 6;
export const COACH_ELO_MIN = 600;
export const COACH_ELO_MAX = 2850;
export const COACH_YEARS_MAX = 60;
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
  goals: { min: 0, max: 3 },
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
  levels: '能带到什么水平',
  goals: '擅长教什么',
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

/**
 * 教练那一侧叫 levels，学员那一侧叫 level（复数指"能带好几档"）。
 * key 是同一批，只是名字不同 —— 这里换回 coachPref 那套名字去查说法。
 */
function prefGroup(group) {
  return group === 'levels' ? 'level' : group;
}

/** 一句人类可读的话：给已选的值找出对应的说法（多选，逗号串或数组都吃）。 */
export function coachProfileLabels(group, value) {
  const keys = Array.isArray(value) ? value : String(value ?? '').split(',');
  return keys.map((key) => String(key).trim()).filter(Boolean)
    .map((key) => coachLabel(prefGroup(group), key));
}

/**
 * 一张图片该从哪个地址取。
 *
 * 名字是服务端随机生成的 24 位十六进制 + 扩展名，路径里没有任何一段来自人写的
 * 文件名（目录由后端按 (int)player_id 拼），所以这里拼出来的串不可能越界。
 */
export function coachPhotoUrl(playerId, name) {
  if (!name) return '';
  return `${API_BASE}chess_coach_photo.php?c=${encodeURIComponent(playerId)}&f=${encodeURIComponent(name)}`;
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
    const list = Array.isArray(value) ? value : String(value ?? '').split(',');
    const allowed = coachKeys(group === 'levels' ? 'level' : group);
    return [...new Set(list.map((key) => String(key).trim()).filter(Boolean))]
      .filter((key) => allowed.includes(key));
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
  return bits;
}

/** 卡片上的"能带……/教战术……"那一串（最多两样，多了读不完）。 */
export function coachProfileTags(coach, limit = 2) {
  const profile = coach?.profile ?? {};
  const shown = [
    // 档位那几句话本身是整句（"能完整下棋，想提高"），直接接在"能带"后面读不通，
    // 所以套一层书名号当引用。
    ...coachProfileLabels('levels', profile.levels).map((one) => `能带「${one}」`),
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
  }
  if (profile.language) {
    rows.push({ label: COACH_PROFILE_TITLES.language, text: coachLabel('language', profile.language) });
  }
  if (profile.timezone) {
    rows.push({ label: COACH_PROFILE_TITLES.timezone, text: coachLabel('timezone', profile.timezone) });
  }
  return rows;
}
