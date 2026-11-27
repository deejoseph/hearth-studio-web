/** 预约邮件与学员投诉的纯校验层：没有 DOM，也不直接发请求。 */

export const COACH_INQUIRY_MIN = 20;
export const COACH_INQUIRY_MAX = 2000;
export const COACH_COMPLAINT_MIN = 20;
export const COACH_COMPLAINT_MAX = 3000;

export function normalizeCoachMessage(value) {
  return (typeof value === 'string' ? value : '')
    .replace(/[\u3000\s]+/g, ' ')
    .trim();
}

const coachId = (value) => {
  let id = null;
  if (typeof value === 'number') id = value;
  else if (typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value.trim())) id = Number(value.trim());
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
};

/** 邮件预约必须同时有教练、一段留言和明确联系许可。 */
export function validateInquiry(id, message, contactOk) {
  const target = coachId(id);
  if (target === null) return { ok: false, field: 'coach_id', text: '这位教练没法联系，请刷新名录后再试。' };
  if (typeof message !== 'string') {
    return { ok: false, field: 'message', text: '预约留言没有填好，请检查后再试。' };
  }
  const text = normalizeCoachMessage(message);
  if ([...text].length < COACH_INQUIRY_MIN) {
    return {
      ok: false,
      field: 'message',
      text: `写几句想约什么课、目前什么水平 —— 至少 ${COACH_INQUIRY_MIN} 个字（现在 ${[...text].length} 个）。`,
    };
  }
  if ([...text].length > COACH_INQUIRY_MAX) {
    return {
      ok: false,
      field: 'message',
      text: `预约留言请写在 ${COACH_INQUIRY_MAX} 个字以内（现在 ${[...text].length} 个字）。`,
    };
  }
  if (contactOk !== true) {
    return { ok: false, field: 'contact_ok', text: '请同意平台把账号邮箱交给教练，用于回复这次预约。' };
  }
  return { ok: true, payload: { coach_id: target, message: text, contact_ok: true } };
}

/** 投诉只收教练 id 与正文；身份由服务端从会话里取，前端绝不替它上传。 */
export function validateComplaint(id, value) {
  const target = coachId(id);
  if (target === null) return { ok: false, field: 'coach_id', text: '这位教练没法投诉，请刷新后再试。' };
  if (typeof value !== 'string') {
    return { ok: false, field: 'text', text: '投诉内容没有填好，请检查后再试。' };
  }
  const text = normalizeCoachMessage(value);
  if ([...text].length < COACH_COMPLAINT_MIN) {
    return {
      ok: false,
      field: 'text',
      text: `请写清楚发生了什么 —— 至少 ${COACH_COMPLAINT_MIN} 个字（现在 ${[...text].length} 个）。`,
    };
  }
  if ([...text].length > COACH_COMPLAINT_MAX) {
    return {
      ok: false,
      field: 'text',
      text: `投诉内容请写在 ${COACH_COMPLAINT_MAX} 个字以内（现在 ${[...text].length} 个字）。`,
    };
  }
  return { ok: true, payload: { coach_id: target, text } };
}

/**
 * 公开主页只认白名单里的四个字段。即使某天响应里误带了投诉人邮箱或姓名，
 * 这一层也不会把它交给渲染层，更不会出现在页面上。
 */
export function publicComplaints(coach) {
  const list = Array.isArray(coach?.complaints) ? coach.complaints : [];
  return list.filter((one) => one
    && typeof one.published_at === 'string' && one.published_at.trim()
    && typeof one.public_text === 'string' && one.public_text.trim())
    .map((one) => ({
      id: one.id,
      public_text: one.public_text,
      severity: one.severity ?? '',
      published_at: one.published_at ?? null,
    }));
}

export function complaintStatusLabel(status) {
  return ({
    pending: '待平台审核',
    under_review: '待平台审核',
    upheld: '已核实',
    rejected: '未核实，已结案',
    dismissed: '已结案',
    withdrawn: '已撤回',
  })[status] ?? '已提交';
}

export function complaintSeverityLabel(severity) {
  return ({
    normal: '一般',
    severe: '严重',
    low: '一般',
    minor: '一般',
    medium: '较重',
    high: '严重',
    major: '严重',
  })[severity] ?? '已记录';
}
