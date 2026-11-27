/**
 * The account API: /api/v1/chess_*.php on the origin that serves this board.
 *
 * Same origin as the page, so nothing to configure: no CORS preflight, no CSP
 * change, and the session cookie is HttpOnly — this module never sees a token,
 * the browser attaches the cookie by itself.
 *
 * Every failure carries a stable `code` (see CHESS_ERRORS in the backend's
 * chess_guard.php), and the sentence shown here is looked up from that code
 * rather than pasted from the server. The two wordings are independent on
 * purpose: the API's own text is written for the Chinese pages beside this one
 * and says things like "操作失败", while the board speaks to a player sitting in
 * front of a chess position and wants to say which field to fix. An unknown
 * code lands on the generic line, so a renamed code shows a plain "出了点问题"
 * instead of a sentence from another part of the site.
 */

export const API_BASE = '/api/v1/';

const PROBLEM_TEXT = {
  bad_email: '这个邮箱地址看着不太对。',
  short_nickname: '昵称至少两个字。',
  short_password: '密码至少 8 位。',
  long_password: '密码太长了。',
  weak_password: '这个密码太容易被猜到，换一个。',
  missing_fields: '邮箱和密码都要填。',
  bad_credentials: '邮箱或密码不对。',
  sign_in_required: '请先登录。',
  no_such_player: '这个账号已经不在了。',
  too_many_logins: '失败次数太多，请 15 分钟后再试。',
  too_many_registrations:
    '这个网络这一小时注册的次数太多了。请一小时后再试，或写信到 admin@ichessgeek.com。',
  too_many_sends: '这一小时从这里发的邮件太多了，稍后再试。',
  mail_failed: '邮件发不出去，请联系 admin@ichessgeek.com。',
  method: '浏览器没能把这一步发出去，请再试一次。',
  content_type: '浏览器没能把这一步发出去，请再试一次。',
  bad_body: '浏览器没能把这一步发出去，请再试一次。',
  service: '服务器暂时没响应，过一分钟再试。',
  timeout: '服务器很久没有响应，请稍后再试。',
  verify_failed: '验证暂时不可用，请稍后再试。',
  network: '连不上服务器。请检查网络后再试。',
  server: '出了点问题，请再试一次。',

  // Rooms. The referee's codes, worded for the player looking at the board.
  verify_required:
    '先把邮箱确认了 —— 我们发你的那封邮件里的链接，点一下就能和人下棋。',
  bad_room_code: '这不是房间码：六位字母和数字，中间不要空格。',
  no_such_room: '没有这个房间码的对局。请核对一下再试。',
  room_full: '这一局已经坐满两个人了。',
  room_not_active: '这一局现在不走棋。',
  room_over: '这一局已经结束了。',
  not_room_member: '这一局里没有你。',
  not_your_turn: '该对方走棋了。',
  illegal_move: '这一步在当前的局面上不合法。',
  flagged: '有一边的钟走完了，这一局已经结束。',
  stale_move: '你这一步落下去之前，局面已经往前走了。',
  bad_room_time: '一局的时间在一方 10 秒到 1 小时之间。',
  bad_room_color: '请选白方、黑方或随机。',
  too_many_rooms: '你刚刚开好几局了。请一小时后再试。',
  too_many_joins: '短时间内试的房间码太多，等几分钟再试。',

  bad_class_code: '课堂码是四位数字，中间不要空格。',
  no_such_class: '没有这个课堂码。请核对一下再试。',
  class_closed: '这个课堂已经结束了。',
  not_class_member: '你不在这个课堂里。',
  not_teacher: '这一步只有老师能做。',
  teacher_no_hand: '老师不用举手，可以直接走棋或给学生批准。',
  no_permission: '现在轮不到你走，先等老师批准。',
  already_approved: '老师已经让你走这一步了，不用再举手。',
  bad_action: '没有这个举手动作，请刷新后再试。',
  bad_move: '这一步看着不像一步棋，请重新走。',
  bad_player_id: '请选择一位课堂里的学生。',
  stale: '课堂已经往前走了，请等棋盘同步后再试。',

  // 教练偏好。后端回这些 code 时还会带一个 field（哪一组不对），面板按它亮红框。
  bad_pref: '有一项没选上，或者选得比上限还多。',
  long_note: '自我介绍太长了，缩一缩再存。',
  bad_note: '自我介绍里有打不出来的字符，重写一遍就好。',
  bad_budget: '预算请填 0 到 100000 的非负整数，下限不能高于上限。',
  long_schedule: '详细时间说明太长了，缩到 240 个字以内再存。',
  bad_schedule: '详细时间说明里有打不出来的字符，重写一遍就好。',

  // 教练申请。开课堂的资格由服务端判（chess_guard.php 里的 chess_require_teacher），
  // 所以 teacher_only 这一句要给出路，不只是"不行"。
  teacher_only: '开课堂要先申请成为教练 —— 在旁边那一栏写几句你的经历。',
  short_intro: '再写几句：至少 10 个字，说清楚带过谁、教了多久。',
  long_intro: '介绍太长了，缩到 400 个字以内再交。',
  bad_intro: '介绍里有打不出来的字符，重写一遍就好。',
  already_teacher: '这份申请已经通过了，不用再交一遍。',

  // 教练资料与照片。同样按 code 出句子，后端还带 field（哪一组不对），表单按它亮红框。
  bad_profile: '有一项填得不对：称号、等级分、教龄，或者选项里的某一项。',
  long_tagline: '一句话简介太长了，缩一缩再存。',
  bad_tagline: '简介里有打不出来的字符，重写一遍就好。',
  long_honors: '荣誉那一栏太长了，缩一缩再存。',
  bad_honors: '荣誉里有打不出来的字符，重写一遍就好。',
  no_such_coach: '这位教练还没进名录。',
  bad_image: '那不是浏览器能显示的图片。换一张 JPG、PNG 或 WebP 试试。',
  big_image: '这张图太大：两兆以内、每边四千像素以内。',
  too_many_photos: '照片最多三张，先删一张再传。',
  too_many_certificates: '证书图片最多六张，先删一张再传。',
  too_many_uploads: '刚刚传的图片太多了，等一小时再试。',
  bad_rate: '每小时费率请填 0 到 100000 的非负整数（人民币元），不确定就留空。',
  long_enrollment_notes: '招生须知太长了，缩到 2000 个字以内再存。',
  bad_enrollment_notes: '招生须知里有打不出来的字符，重写一遍就好。',
  long_tuition: '课时费标准太长了，缩到 1000 个字以内再存。',
  bad_tuition: '课时费标准里有打不出来的字符，重写一遍就好。',
  long_schedule_text: '上课时段说明太长了，缩到 1000 个字以内再存。',
  bad_schedule_text: '上课时段说明里有打不出来的字符，重写一遍就好。',

  // 教练市场：预约走平台转信，投诉由平台私下审核。
  coach_revoked: '这位教练的资格已被撤销，恢复前不能使用教练功能。',
  bad_coach_id: '这位教练现在没法联系，请刷新名录后再试。',
  contact_required: '请同意平台把账号邮箱交给教练，用于回复这次预约。',
  short_message: '预约留言至少写 20 个字，说清楚想约什么课。',
  long_message: '预约留言太长了，缩到 2000 个字以内再发。',
  bad_message: '预约留言里有打不出来的字符，重写一遍就好。',
  bad_request_id: '这次预约的请求标识不对，请重新打开预约窗口。',
  inquiry_pending: '上一封预约邮件还在发送，请稍等再重试。',
  inquiry_conflict: '这次预约标识已经用于另一段留言，请重新打开预约窗口。',
  too_many_inquiries: '今天发的预约有点多，稍后再试。',
  bad_complaint: '投诉内容里有打不出来的字符，重写一遍就好。',
  short_complaint: '请写清楚发生了什么 —— 至少 20 个字，平台才能核实。',
  long_complaint: '投诉内容太长了，缩到 3000 个字以内再交。',
  complaint_target_invalid: '只能投诉当前或曾经的教练。',
  complaint_pending: '你对这位教练已有一条待处理投诉，不用重复提交。',
  duplicate_complaint: '相同内容的投诉已经提交过了。',
  too_many_complaints: '今天交的投诉有点多，稍后再试。',
  coach_only: '教练账号不能提交学员投诉。',
};

/**
 * What to say for a reply. Never the server's own wording: an unexpected code
 * (or no code at all) lands on the generic line.
 */
export function problemText(reply) {
  return PROBLEM_TEXT[reply?.code] ?? PROBLEM_TEXT.server;
}

/**
 * One call, one shape: the server's JSON plus `ok`, or `{ok:false, code:'network'}`
 * when the request itself failed or the body was not JSON. It never throws, so
 * callers branch on `reply.ok` and nothing else.
 *
 * The HTTP status is deliberately not passed up: register answers with its own
 * `status` field ('created' or 'submitted'), and a number from here would
 * replace it.
 *
 * `timeoutMs` bounds how long a caller is willing to wait for an answer; 0
 * means no bound (the room poll and the classroom poll use this same `call`).
 */
export async function call(endpoint, { method = 'POST', body, fetchImpl, timeoutMs = 0 } = {}) {
  const fetchJson = fetchImpl ?? globalThis.fetch;
  const init = { method, credentials: 'same-origin' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let timer = null;
  if (timeoutMs > 0) {
    const controller = new AbortController();
    init.signal = controller.signal;
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }

  let response;
  try {
    response = await fetchJson(API_BASE + endpoint, init);
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, code, message: problemText({ code }) };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }

  let reply = null;
  try {
    reply = await response.json();
  } catch {
    reply = null;
  }
  if (!reply || typeof reply !== 'object') {
    const offline = response.status >= 500 ? 'service' : 'server';
    return { ok: false, code: offline, message: problemText({ code: offline }) };
  }
  if (reply.ok === false || !response.ok) {
    return { ...reply, ok: false, message: problemText(reply) };
  }
  return reply;
}

/**
 * 一次图片上传。和 call() 同一套错误形状，唯一的区别是 body 用 FormData：
 * multipart 的 boundary 必须由浏览器自己算（手填 Content-Type 会把它顶掉，
 * 服务端就解析不出文件），所以这里刻意不设任何 header。
 *
 * 上传比 JSON 慢得多（一张一兆的图在手机上要几秒），超时给到 60 秒；
 * 到点回一句 timeout，界面上那个"上传中…"必须能自己收回来。
 */
export async function upload(endpoint, form, { fetchImpl, timeoutMs = 60000 } = {}) {
  const fetchForm = fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchForm(API_BASE + endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      body: form,
      signal: controller.signal,
    });
  } catch (error) {
    const code = error?.name === 'AbortError' ? 'timeout' : 'network';
    return { ok: false, code, message: problemText({ code }) };
  } finally {
    clearTimeout(timer);
  }

  let reply = null;
  try {
    reply = await response.json();
  } catch {
    reply = null;
  }
  if (!reply || typeof reply !== 'object') {
    const offline = response.status >= 500 ? 'service' : 'server';
    return { ok: false, code: offline, message: problemText({ code: offline }) };
  }
  if (reply.ok === false || !response.ok) {
    return { ...reply, ok: false, message: problemText(reply) };
  }
  return reply;
}

/**
 * The five calls the panel makes. `fetchImpl` is there for the tests, which
 * run without a DOM and have no fetch.
 *
 * These get a bound: 注册要等服务器同步发确认信，慢起来几十秒。到点就回一句
 * "没等到"，面板才不会一直灰着按钮、让人以为窗口死了。
 */
const ACCOUNT_TIMEOUT_MS = 30000;

export function makeAccountApi({ fetchImpl } = {}) {
  const ask = (endpoint, options = {}) =>
    call(endpoint, { ...options, fetchImpl, timeoutMs: ACCOUNT_TIMEOUT_MS });
  return {
    who: () => ask('chess_me.php', { method: 'GET' }),
    signIn: (email, password) => ask('chess_login.php', { body: { email, password } }),
    create: (email, password, nickname) =>
      ask('chess_register.php', { body: { email, password, nickname } }),
    signOut: () => ask('chess_logout.php', { body: {} }),
    resend: () => ask('chess_resend.php', { body: {} }),
  };
}

/**
 * The verification link lands back here as /chess/?verify=… (chess_verify.php
 * redirects rather than printing a page, so the API never has to know the
 * board's markup). Returns the sentence to show, or null for a plain visit.
 */
export function verifyNews(search) {
  const kind = new URLSearchParams(search ?? '').get('verify');
  if (kind === 'ok') {
    return { verified: true, text: '邮箱已经确认好了。这个标签页可以关了。' };
  }
  if (kind === 'already') {
    return { verified: true, text: '这个邮箱之前已经确认过了。' };
  }
  if (kind === 'expired') {
    return { verified: false, text: '那个链接已经过期了。请回棋盘按「重发邮件」。' };
  }
  if (kind === 'bad') {
    return { verified: false, text: '那个链接不是我们发出来的。' };
  }
  return null;
}
