/** 某一位教练的招生说明与邮件预约；只经 net/auth.js 的 call() 发请求。 */

import { call } from '../net/auth.js';
import { setUserText } from '../i18n.js';
import { coachEnrollmentRows } from '../game/coachProfile.js';
import {
  COACH_INQUIRY_MAX,
  COACH_INQUIRY_MIN,
  normalizeCoachMessage,
  validateInquiry,
} from '../game/coachMarketplace.js';

const $ = (id) => document.getElementById(id);

export function mountCoachEnrollment({ showToast, player, openAccount }) {
  const el = {
    form: $('coach-enroll-form'),
    dialog: $('coach-enroll-dialog'),
    name: $('coach-enroll-name'),
    rows: $('coach-enroll-rows'),
    message: $('coach-enroll-message'),
    counter: $('coach-enroll-count'),
    contact: $('coach-enroll-contact'),
    error: $('coach-enroll-error'),
    save: $('coach-enroll-submit'),
    close: $('coach-enroll-close-btn'),
  };
  let selected = null;
  let busy = false;
  let request = 0;
  let requestId = null;

  function idle() {
    busy = false;
    el.save.disabled = false;
    el.save.textContent = '邮件预约';
  }

  function showError(text, field) {
    el.error.textContent = text;
    el.error.hidden = !text;
    el.message.setAttribute('aria-invalid', String(field === 'message' && !!text));
    el.contact.setAttribute('aria-invalid', String(field === 'contact_ok' && !!text));
    $('coach-enroll-message-group')?.classList.toggle('invalid', field === 'message' && !!text);
  }

  function paintCounter() {
    const length = [...normalizeCoachMessage(el.message.value)].length;
    el.counter.textContent = `${length} / ${COACH_INQUIRY_MAX}`;
    el.counter.classList.toggle('over', length > COACH_INQUIRY_MAX);
  }

  function fill(coach) {
    if (coach.nickname) setUserText(el.name, coach.nickname);
    else {
      el.name.removeAttribute('data-i18n-skip');
      el.name.textContent = '教练';
    }
    el.rows.replaceChildren(...coachEnrollmentRows(coach).map((row) => {
      const section = document.createElement('section');
      section.className = 'coach-enrollment-row';
      const title = document.createElement('h3');
      title.textContent = row.label;
      const body = document.createElement('p');
      if (row.text && row.key !== 'hourly_rate_cny') setUserText(body, row.text);
      else body.textContent = row.text || '暂未填写，可在预约邮件中询问。';
      section.append(title, body);
      return section;
    }));
    el.message.value = '';
    el.contact.checked = false;
    requestId = null;
    paintCounter();
    showError('', null);
  }

  function open(coach) {
    if (!coach?.player_id) return;
    const who = player();
    if (!who) {
      openAccount('signin');
      showToast('先登录并确认邮箱，再发预约邮件。');
      return;
    }
    if (!who.verified) {
      openAccount('account');
      showToast('先确认账号邮箱，平台才能把预约转给教练。');
      return;
    }
    // 关闭再打开会使上一趟响应失效，busy 不会卡在新表单上。
    request += 1;
    idle();
    selected = coach;
    fill(coach);
    el.dialog.showModal();
    el.message.focus();
  }

  async function submit() {
    if (busy || !selected) return;
    const checked = validateInquiry(selected.player_id, el.message.value, el.contact.checked);
    if (!checked.ok) {
      showError(checked.text, checked.field);
      (checked.field === 'contact_ok' ? el.contact : el.message).focus();
      return;
    }
    const target = selected;
    const who = player();
    const ticket = ++request;
    busy = true;
    el.save.disabled = true;
    el.save.textContent = '发送中…';
    showError('', null);

    requestId ??= crypto.randomUUID();
    const reply = await call('chess_coach_inquiry.php', {
      body: { ...checked.payload, request_id: requestId },
    });
    if (ticket !== request || player()?.id !== who?.id || !player()?.verified) return;
    idle();
    if (!reply.ok) {
      if (reply.code === 'bad_request_id' || reply.code === 'inquiry_conflict') requestId = null;
      showError(reply.message ?? '没能发出去，请再试一次。', reply.field ?? null);
      return;
    }
    requestId = null;
    if (selected?.player_id === target.player_id) {
      el.dialog.close();
      selected = null;
    }
    showToast('预约已通过平台转给教练，教练会私下回复你的账号邮箱。');
  }

  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });
  el.close.addEventListener('click', () => el.dialog.close());
  el.dialog.addEventListener('close', () => {
    request += 1;
    selected = null;
    requestId = null;
    idle();
    showError('', null);
  });
  el.message.addEventListener('input', () => {
    requestId = null;
    paintCounter();
    showError('', null);
  });
  el.contact.addEventListener('change', () => showError('', null));

  return {
    open,
    /** 退出登录或邮箱验证失效时收掉表单，并让在途响应失效。 */
    syncGate: () => {
      if (!player()?.verified) {
        request += 1;
        selected = null;
        requestId = null;
        idle();
        showError('', null);
        if (el.dialog.open) el.dialog.close();
      }
    },
    min: COACH_INQUIRY_MIN,
  };
}
