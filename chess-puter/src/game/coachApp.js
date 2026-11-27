/**
 * 教练申请的数据层：字数上下限、这段话该不该发出去、每一态说什么。
 *
 * 这里没有 DOM 也没有 fetch，所以能在 vitest 里跑；界面在 ui/coachApp.js，
 * 判定以服务端为准（v1/chess_coach_core.php），这一层只为了少一次往返、
 * 并把红字挂在对的框上。
 *
 * 🔴 COACH_INTRO_MIN / COACH_INTRO_MAX 和后端 chess_coach_core.php 里那两个常量
 * 是同一份契约（tests/coachApp.test.js 逐字比对，连库里那一列的宽度一起比）。
 * 只改这里 = 人写到四百字被服务端判超长；只改那边 = 界面上印的数字在说谎。
 */

export const COACH_INTRO_MIN = 10;
export const COACH_INTRO_MAX = 400;

/** 界面只认这四态。后端给的是 app.status + can_teach，在这里折成一个。 */
export const COACH_APP_STATES = ['none', 'pending', 'approved', 'rejected'];

/**
 * chess_coach_app_get.php 的那一份回复 → 界面上的一态。
 *
 * 先问 can_teach 再问 status：前者是后端算好的"能不能开课堂"，是权威的那一句。
 * 万一哪天库里出现第四个状态，界面按 can_teach 走还是对的（不能开就是不能开），
 * 而不是自己猜一个状态然后把【开课堂】按钮点亮。
 */
export function coachAppState(reply) {
  if (reply?.can_teach) return 'approved';
  const status = reply?.app?.status;
  return status === 'pending' || status === 'rejected' ? status : 'none';
}

/** 和后端 coach_trim 同一口径：全角空格/换行归成一个普通空格，首尾去掉。 */
export function normalizeIntro(text) {
  return (typeof text === 'string' ? text : '').replace(/[\u3000\s]+/g, ' ').trim();
}

/** 按码点量（中文一个字三个字节，按 length 量会先撞到上限）。 */
export function introLength(text) {
  return [...normalizeIntro(text)].length;
}

/**
 * 一段介绍 → 该发出去的 payload，或者一句"哪儿不对"。
 * @returns {{ok: true, payload: {intro: string}} | {ok: false, field: string, text: string}}
 */
export function validateCoachIntro(text) {
  const intro = normalizeIntro(text);
  const len = [...intro].length;
  if (len < COACH_INTRO_MIN) {
    return {
      ok: false,
      field: 'intro',
      text: `写几句你带过谁、教过什么 —— 至少 ${COACH_INTRO_MIN} 个字（现在 ${len} 个）。`,
    };
  }
  if (len > COACH_INTRO_MAX) {
    return {
      ok: false,
      field: 'intro',
      text: `介绍请写在 ${COACH_INTRO_MAX} 个字以内（现在 ${len} 个）。`,
    };
  }
  return { ok: true, payload: { intro } };
}

/** 课堂上那一行：为什么这个人现在能不能点【开课堂】。 */
export function coachAppNote(state) {
  return {
    none: '开课堂要先申请成为教练 —— 写几句你的经历，我们一个一个看。',
    pending: '申请已经交上去了，管理员看过就能开课堂。',
    rejected: '上一次没能通过。可以再提交一份，或写信到 admin@ichessgeek.com 问清楚。',
    approved: '教练资格已通过，随时能开课堂。',
  }[state] ?? '';
}

/** 那个按钮上的话。三态是三种不同的动作，不是一句话重复三遍。 */
export function coachAppBtnLabel(state) {
  return {
    none: '申请成为教练',
    pending: '看我的申请',
    rejected: '重新申请',
    approved: '我的申请',
  }[state] ?? '申请成为教练';
}

/**
 * 对话框里那一句提醒。
 *
 * approved 单独有一条不是啰嗦：提交一份新介绍会把状态写回 pending，也就是说
 * "改一下介绍"这个动作当场撤掉自己的资格。这一条必须让人在点之前看见，
 * 所以界面在已批准时直接把输入框锁住、把提交按钮收掉（见 ui/coachApp.js）。
 */
export function coachAppDialogHint(state) {
  return {
    none: '这一段是给管理员看的：教过谁、教多久、能带什么程度的学生。审核通过后你才能开课堂。',
    pending: '已经交上去了。想改就改，改完还是"待审核"，会重新排到管理员面前。',
    rejected: '可以再提交一份。写清楚你想带几个学生、什么时间段，我们通过得更快。',
    approved: '资格已通过，这一段现在改不了 —— 重新提交会把状态退回待审核，也就开不了课堂了。要改请联系 admin@ichessgeek.com。',
  }[state] ?? '';
}

/** 待审/已批的那一行时间：只到"哪天"，界面上没人需要秒。 */
export function coachAppWhen(state, app) {
  const at = state === 'rejected'
    ? (app?.decided_at ?? app?.submitted_at)
    : (app?.submitted_at ?? app?.updated_at);
  return typeof at === 'string' ? at.slice(0, 10) : '';
}

/** 已经交过的那一段话（pending/rejected 要在对话框里摆回去让人改）。 */
export function coachAppIntro(app) {
  return typeof app?.intro === 'string' ? app.intro : '';
}
