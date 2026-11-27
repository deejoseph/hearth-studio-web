/**
 * 按学员偏好给教练排序：一份偏好 + 一位教练 → 几分、为什么。
 *
 * 只做展示，不做门禁 —— 这一层算出来的分数不能决定谁能开课堂、谁能上名录。
 * 那两件事的判定在服务器上（chess_guard.php 的 chess_player_can_teach、
 * chess_coach_ids），这里排错了顶多是名录顺序不好看。
 *
 * 为什么写在界面这一侧而不是后端：同一个教练在不同人屏幕上顺序不同，
 * 而名录是所有人共用的一份数据。放服务端要么按人重算（每刷一页一次查询），
 * 要么两边各维护一份规则 —— 后一种我们已经在 coachPref 的 key 上吃过一次教训。
 *
 * 口径和 chess_coach_core.php 一致的地方只有一处：选项 key 用的是
 * game/coachPref.js 那一份表，而那张表和后端白名单由 tests/coachPref.test.js 逐条比对。
 */

import { coachLabel, formatCny, parseCny } from './coachPref.js';
import { coachProfileLabels } from './coachProfile.js';

/** 各项值多少分。数字本身不重要，重要的是"能带你这一档"比"时区一样"重要。 */
const WEIGHT = {
  level: 6,
  goal: 3,
  format: 3,
  slot: 2,
  timezone: 4,
  language: 4,
  // 预算只做轻微加权：它不该把水平、目标这些硬匹配全盖过去。
  budget: 2,
};

/** 推荐区最多三张；名录接口仍可多取，排序与截断在界面这一层完成。 */
export const COACH_RECOMMENDATION_LIMIT = 3;

const asList = (value) => (Array.isArray(value)
  ? value.map((one) => String(one ?? '').trim()).filter(Boolean)
  : String(value ?? '').split(',').map((one) => one.trim()).filter(Boolean));

const overlap = (a, b) => asList(a).filter((one) => asList(b).includes(one));

/** 学员报的是当前水平，教练选的是接收档位；旧偏好 key 在这里换算。 */
const STUDENT_TO_ACCEPT_LEVEL = {
  zero: 'zero',
  moves: 'amateur5',
  play: 'amateur5',
  rated: 'master',
};

/**
 * 授课语言合不合。
 *
 * zh_en（"中英都行"）在两边含义不同：教练说都行 → 学员要中文或英文都接得住（满分）；
 * 学员说都行 → 教练只教一种也算能上，但这一条不如"完全对上"那么值得吹，给一半。
 */
function languageMatch(coachLang, studentLang) {
  if (!coachLang || !studentLang) return 0;
  if (coachLang === studentLang) return WEIGHT.language;
  if (coachLang === 'zh_en') return WEIGHT.language;
  if (studentLang === 'zh_en') return Math.round(WEIGHT.language / 2);
  return 0;
}

/** 价格未知（或学员没填上限）时不奖不罚；known over-budget 只轻扣一分并留下警示。 */
function budgetMatch(pref, coach) {
  const empty = { state: 'unknown', score: 0, reasons: [], warnings: [] };
  const max = parseCny(pref?.budget_max_cny);
  const rate = parseCny(coach?.profile?.hourly_rate_cny);
  if (!max.ok || max.value === null || !rate.ok || rate.value === null) return empty;
  if (rate.value > max.value) {
    return {
      state: 'over',
      score: -1,
      reasons: [],
      warnings: [`课时费 ${formatCny(rate.value)} / 60 分钟，高于你的预算上限 ${formatCny(max.value)}`],
    };
  }
  return {
    state: 'within',
    score: WEIGHT.budget,
    reasons: [`课时费 ${formatCny(rate.value)} / 60 分钟，在你的预算上限内`],
    warnings: [],
  };
}

/**
 * 一位教练对一份偏好 → {score, reasons}。
 *
 * reasons 只说真对上的事：界面把它印在"为什么排在这儿"那一行，
 * 编一句"经验丰富"就等于在名录上写广告。
 *
 * @param {object|null} pref 学员的偏好（coach_pref_public 的形状）；null = 还没填
 * @param {object} coach 名录里的一行（coach_directory_entry 的形状）
 */
export function matchCoach(pref, coach) {
  const profile = coach?.profile ?? {};
  if (!pref) {
    return { score: null, reasons: [], matched: false };
  }
  const reasons = [];
  const budget = budgetMatch(pref, coach);
  let score = budget.score;

  // 两边不是同一列：把学员当前水平换算成教练的接收档位再比。
  const acceptLevel = STUDENT_TO_ACCEPT_LEVEL[pref.level] ?? pref.level;
  if (asList(profile.levels).includes(acceptLevel)) {
    score += WEIGHT.level;
    const label = coachProfileLabels('levels', [acceptLevel])[0] ?? acceptLevel;
    reasons.push(`可接收「${label}」`);
  }

  const goals = overlap(profile.goals, pref.goals);
  if (goals.length) {
    score += WEIGHT.goal * goals.length;
    reasons.push(goals.map((one) => coachLabel('goals', one)).join('、'));
  }

  const formats = overlap(profile.formats, pref.formats);
  if (formats.length) {
    score += WEIGHT.format;
    reasons.push(formats.map((one) => coachLabel('formats', one)).join('或'));
  }

  const slots = overlap(profile.slots, pref.slots);
  if (slots.length) {
    score += WEIGHT.slot * slots.length;
    reasons.push(`在${slots.map((one) => coachLabel('slots', one)).join('、')}有空的`);
  }

  if (profile.timezone && profile.timezone === pref.timezone) {
    score += WEIGHT.timezone;
    reasons.push('和你同一个时区');
  }

  const lang = languageMatch(profile.language, pref.language);
  if (lang) {
    score += lang;
    reasons.push(profile.language === 'zh_en' ? '中文英文都行' : `用${coachLabel('language', profile.language)}上课`);
  }

  reasons.push(...budget.reasons);
  return { score, reasons, matched: score > 0, budget, warnings: budget.warnings };
}

/** 没填偏好时的顺序：填过资料的在前，然后按称号、等级分，最后按 id 稳住次序。 */
const TITLE_RANK = { gm: 8, im: 7, fm: 6, cm: 5, wgm: 8, wim: 7, wfm: 6, wcm: 5 };

function fallbackRank(coach) {
  const profile = coach?.profile ?? {};
  return [
    coach?.has_profile ? 1 : 0,
    TITLE_RANK[profile.title] ?? 0,
    // 和 coachBadges 同一个口径：先他自己登记的 elo，没有才退回站内算出来的 rating。
    Number(profile.elo ?? coach?.rating ?? 0) || 0,
    Number(profile.years ?? 0) || 0,
  ];
}

/**
 * 名录整页排序。pref 为 null 时也照排（按"资料全不全"），所以界面不必分两条路径。
 *
 * 同分不换序：稳定排序 + 最后按 player_id 收口，同一份数据刷新两次不会看到
 * 卡片自己换位 —— 人刚记住"第三个是谁"就换位置，比排得差更难受。
 */
export function rankCoaches(coaches, pref) {
  const scored = (coaches ?? []).map((coach, at) => ({
    coach,
    at,
    match: matchCoach(pref, coach),
  }));
  scored.forEach((item) => {
    item.fallback = fallbackRank(item.coach);
  });
  scored.sort((a, b) => {
    if (pref) {
      const byScore = (b.match.score ?? 0) - (a.match.score ?? 0);
      if (byScore !== 0) return byScore;
    }
    for (let i = 0; i < a.fallback.length; i += 1) {
      if (a.fallback[i] !== b.fallback[i]) return b.fallback[i] - a.fallback[i];
    }
    return a.at - b.at;
  });
  return scored;
}

/** 推荐区真正渲染的那一份：排完只取前三，绝不把超预算的教练过滤掉。 */
export function recommendedCoaches(coaches, pref) {
  return rankCoaches(coaches, pref).slice(0, COACH_RECOMMENDATION_LIMIT);
}

/** 卡片上那句"为什么排在这儿"：最多三条，多了读不完，而前几条本来就是分最高的。 */
export function matchReasons(match, limit = 3) {
  return (match?.reasons ?? []).filter(Boolean).slice(0, limit);
}
