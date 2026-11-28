/** 学员投诉表单，以及学员/教练各自私有的投诉记录。 */

import { call } from '../net/auth.js';
import { setUserText, userText } from '../i18n.js';
import {
  COACH_COMPLAINT_MAX,
  COACH_COMPLAINT_MIN,
  complaintSeverityLabel,
  complaintStatusLabel,
  normalizeCoachMessage,
  validateComplaint,
} from '../game/coachMarketplace.js';

const $ = (id) => document.getElementById(id);

export function mountCoachComplaint({ showToast, player, openAccount, wasTeacher, onChanged }) {
  const el = {
    form: $('coach-complaint-form'),
    dialog: $('coach-complaint-dialog'),
    name: $('coach-complaint-name'),
    text: $('coach-complaint-text'),
    counter: $('coach-complaint-count'),
    error: $('coach-complaint-error'),
    save: $('coach-complaint-submit'),
    close: $('coach-complaint-close-btn'),
    trigger: $('coach-complaints-btn'),
    history: $('coach-complaints-dialog'),
    historyTitle: $('coach-complaints-title'),
    historyList: $('coach-complaints-history-list'),
    historyState: $('coach-complaints-history-state'),
    historyClose: $('coach-complaints-close-btn'),
    historyRefresh: $('coach-complaints-history-refresh'),
  };
  let selected = null;
  let complaints = [];
  let busy = false;
  let submitRequest = 0;
  let historyBusy = false;
  let historyRequest = 0;
  let historyRole = null;
  let historyAccount = null;

  const coachRole = () => wasTeacher() === true;

  // 历史教练即使被撤销，也仍是教练，不能冒充学员投诉。
  const isStudent = () => Boolean(player()?.verified) && wasTeacher() === false;
  const isCoach = () => Boolean(player()?.verified) && wasTeacher() === true;
  const canViewHistory = () => isStudent() || isCoach();

  function idleSubmit() {
    busy = false;
    el.save.disabled = false;
    el.save.textContent = '提交投诉';
  }

  function clearHistory() {
    complaints = [];
    el.historyList.replaceChildren();
    el.historyState.textContent = '';
    el.historyState.hidden = true;
  }

  function showError(text, field) {
    el.error.textContent = text;
    el.error.hidden = !text;
    el.text.setAttribute('aria-invalid', String(field === 'text' && !!text));
    $('coach-complaint-text-group')?.classList.toggle('invalid', field === 'text' && !!text);
  }

  function paintCounter() {
    const length = [...normalizeCoachMessage(el.text.value)].length;
    el.counter.textContent = `${length} / ${COACH_COMPLAINT_MAX}`;
    el.counter.classList.toggle('over', length > COACH_COMPLAINT_MAX);
  }

  function open(coach) {
    const who = player();
    if (!who) {
      openAccount('signin');
      showToast('先登录并确认邮箱，再提交投诉。');
      return;
    }
    if (wasTeacher() === null) {
      showToast('正在确认账号身份，请稍后再试。');
      return;
    }
    if (isCoach()) {
      showToast('教练账号不能提交学员投诉。');
      return;
    }
    if (!who.verified) {
      openAccount('account');
      showToast('先确认账号邮箱，平台才能核实投诉。');
      return;
    }
    if (!coach?.player_id) return;
    submitRequest += 1;
    idleSubmit();
    selected = coach;
    if (coach.nickname) setUserText(el.name, coach.nickname);
    else {
      el.name.removeAttribute('data-i18n-skip');
      el.name.textContent = '教练';
    }
    el.text.value = '';
    paintCounter();
    showError('', null);
    el.dialog.showModal();
    el.text.focus();
  }

  async function submit() {
    if (busy || !selected || !isStudent()) return;
    const checked = validateComplaint(selected.player_id, el.text.value);
    if (!checked.ok) {
      showError(checked.text, checked.field);
      el.text.focus();
      return;
    }
    const who = player();
    const ticket = ++submitRequest;
    busy = true;
    el.save.disabled = true;
    el.save.textContent = '提交中…';
    showError('', null);
    const reply = await call('chess_coach_complaint_save.php', { body: checked.payload });
    if (ticket !== submitRequest || player()?.id !== who?.id || !isStudent()) return;
    idleSubmit();
    if (!reply.ok) {
      if (reply.code === 'coach_only') syncGate();
      showError(reply.message ?? '没能交上去，请再试一次。', reply.field ?? null);
      return;
    }
    el.dialog.close();
    selected = null;
    onChanged?.();
    showToast('投诉已交给平台私下核实，可在「我的投诉记录」查看处理结果。');
  }

  function paintHistory() {
    el.historyList.replaceChildren(...complaints.map((one) => {
      const item = document.createElement('article');
      item.className = 'coach-complaint-item';
      const head = document.createElement('h3');
      const submitted = one.relation === 'submitted';
      if (submitted) {
        head.append(document.createTextNode('我提交的'));
        if (one.coach_nickname) {
          head.append(document.createTextNode(' · 关于 '), userText(one.coach_nickname));
        }
      } else {
        head.append(document.createTextNode('我收到的匿名申诉'));
      }
      head.append(document.createTextNode(` · ${complaintStatusLabel(one.status)}`));
      const at = typeof one.created_at === 'string' ? one.created_at.slice(0, 10) : '';
      if (at) head.append(document.createTextNode(` · ${at}`));
      const body = document.createElement('p');
      setUserText(body, typeof one.text === 'string' ? one.text : '');
      const severity = document.createElement('p');
      severity.className = 'coach-complaint-severity';
      severity.textContent = `平台记录：${complaintSeverityLabel(one.severity)}`;
      item.append(head);
      if (body.textContent) item.append(body);
      item.append(severity);
      const decision = typeof one.public_text === 'string' ? one.public_text.trim() : '';
      if (one.status === 'upheld' && decision) {
        const published = document.createElement('p');
        published.className = 'coach-complaint-public-text';
        published.append(document.createTextNode('平台公开说明：'), userText(decision));
        item.append(published);
      }
      return item;
    }));
    const empty = complaints.length === 0;
    el.historyState.textContent = empty
      ? '还没有申诉记录。'
      : `共 ${complaints.length} 条记录。`;
    el.historyState.hidden = false;
  }

  async function refreshHistory() {
    if (!canViewHistory()) {
      clearHistory();
      return { ok: false };
    }
    if (historyBusy) return { ok: true };
    const who = player();
    const role = coachRole();
    const ticket = ++historyRequest;
    historyBusy = true;
    el.historyRefresh.disabled = true;
    el.historyState.textContent = '正在取投诉记录…';
    el.historyState.hidden = false;
    const reply = await call('chess_coach_complaint_get.php', { method: 'GET' });
    if (ticket !== historyRequest || player()?.id !== who?.id || coachRole() !== role || !canViewHistory()) {
      return { ok: false, stale: true };
    }
    historyBusy = false;
    el.historyRefresh.disabled = false;
    if (!reply.ok) {
      el.historyState.textContent = reply.message ?? '投诉记录没取回来，请再试一次。';
      return reply;
    }
    complaints = Array.isArray(reply.complaints) ? reply.complaints : [];
    paintHistory();
    return reply;
  }

  function openHistory() {
    if (!canViewHistory()) {
      showToast('登录并确认邮箱后，才能查看投诉记录。');
      return;
    }
    historyRole = coachRole();
    historyAccount = player()?.id;
    el.historyTitle.textContent = historyRole ? '我的教练申诉记录' : '我的投诉记录';
    el.history.showModal();
    void refreshHistory();
  }

  function syncGate() {
    const roleChanged = historyRole !== null
      && (historyAccount !== player()?.id || historyRole !== coachRole());
    submitRequest += 1;
    historyRequest += 1;
    historyBusy = false;
    idleSubmit();
    el.historyRefresh.disabled = false;
    el.trigger.hidden = !canViewHistory();
    el.trigger.querySelector('.coach-complaints-label').textContent = isCoach()
      ? '我的教练申诉'
      : '我的投诉记录';
    if (!canViewHistory()) clearHistory();
    if (roleChanged) {
      clearHistory();
      if (el.history.open) el.history.close();
    }
    if (!isStudent()) {
      selected = null;
      showError('', null);
      if (el.dialog.open) el.dialog.close();
    }
    if (!canViewHistory() && el.history.open) el.history.close();
  }

  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void submit();
  });
  el.close.addEventListener('click', () => el.dialog.close());
  el.dialog.addEventListener('close', () => {
    submitRequest += 1;
    selected = null;
    idleSubmit();
    showError('', null);
  });
  el.trigger.addEventListener('click', openHistory);
  el.historyClose.addEventListener('click', () => el.history.close());
  el.history.addEventListener('close', () => {
    historyRequest += 1;
    historyRole = null;
    historyAccount = null;
    clearHistory();
  });
  el.historyRefresh.addEventListener('click', () => void refreshHistory());
  el.text.addEventListener('input', () => {
    paintCounter();
    showError('', null);
  });
  syncGate();

  return {
    open,
    refresh: refreshHistory,
    syncGate,
    isStudent,
  };
}
