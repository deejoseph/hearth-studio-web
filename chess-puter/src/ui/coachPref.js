/**
 * 教练偏好的面板（见 game/coachPref.js 里的选项与上限）。
 *
 * 只做四件事：按选项表生成控件、打开时问一次服务端把这个人填过的摆回去、
 * 保存前在本地拦一道、把结果写回卡片上那一行。
 *
 * 判定以服务端为准：这里的校验只为了"红字挂在哪一组"和少一次往返。
 * 谁没登录就先去登录 —— 这份偏好是挂在账号上的，不是挂在这台设备上，
 * 所以换台电脑接着改也在。
 */

import { call } from '../net/auth.js';
import { translateUserText } from '../i18n.js';
import {
  COACH_GROUPS,
  COACH_GROUP_TITLES,
  COACH_RULES,
  COACH_NOTE_MAX,
  COACH_SCHEDULE_NOTE_MAX,
  COACH_OPTIONS,
  coachPrefSummary,
  normalizeCoachText,
  validateCoachForm,
} from '../game/coachPref.js';

const $ = (id) => document.getElementById(id);

/** 面板上会亮红框的区块：六组选项，加自我介绍、预算与详细时间说明。 */
const SECTIONS = [...COACH_GROUPS, 'note', 'budget', 'schedule_note'];

/** 哪些组是"只能选一个"（radio），哪些是"可选几个"（checkbox）。 */
const SINGLE = new Set(['level', 'language']);
const sectionId = (field) => `pref-${field.replaceAll('_', '-')}-group`;

function optionInput(group, [key, label]) {
  const wrap = document.createElement('label');
  wrap.className = 'pref-choice';

  const box = document.createElement('input');
  box.type = SINGLE.has(group) ? 'radio' : 'checkbox';
  box.name = `pref-${group}`;
  box.value = key;

  const text = document.createElement('span');
  text.textContent = label;

  wrap.append(box, text);
  return wrap;
}

/** 一组选项 → 控件。时区九项，摊成 chips 太长，用一个 select。 */
function buildGroup(container, group) {
  if (group === 'timezone') {
    const select = document.createElement('select');
    select.name = 'pref-timezone';
    select.id = 'pref-timezone';
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '选一个';
    select.append(blank, ...COACH_OPTIONS.timezone.map(([key, label]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = label;
      return opt;
    }));
    container.append(select);
    return;
  }
  container.append(...COACH_OPTIONS[group].map((option) => optionInput(group, option)));
}

function chosen(group) {
  return [...document.querySelectorAll(`input[name="pref-${group}"]:checked`)].map((i) => i.value);
}

function setChosen(group, keys) {
  const wanted = new Set(Array.isArray(keys) ? keys : keys ? [keys] : []);
  for (const box of document.querySelectorAll(`input[name="pref-${group}"]`)) {
    box.checked = wanted.has(box.value);
  }
}

function legendOf(group) {
  const legend = document.createElement('span');
  legend.className = 'pref-legend-text';
  legend.textContent = COACH_GROUP_TITLES[group];
  return legend;
}

function hintOf(group) {
  const { min, max } = COACH_RULES[group];
  const hint = document.createElement('span');
  hint.className = 'pref-hint';
  if (max === 1) hint.textContent = '选一项';
  else if (min === 0) hint.textContent = '可不填';
  else hint.textContent = min === max ? `选 ${min} 项` : `选 ${min}–${max} 项`;
  return hint;
}

/**
 * @param {{
 *   showToast(text: string): void,
 *   player(): object|null,        // 账号面板里那个人，null 表示没登录
 *   openAccount(which?: string): void,
 *   onPrefChange?(): void,        // 名录要按这份偏好重排，所以填完得叫一声
 * }} deps
 * @returns {{open(): void, refresh(): void, value(): object|null}}
 */
export function mountCoachPref({ showToast, player, openAccount, onPrefChange }) {
  // 六组选项是这里生成的（选项表在 game/coachPref.js），所以先把控件建出来
  // 再去取元素引用 —— 反过来做的话 el.timezone 会是个 null，
  // 而"打开面板就报错"这种错在只有 HTML 静态元素的版本里看不见。
  for (const group of COACH_GROUPS) {
    buildGroup($(`pref-${group}-choices`), group);
    // 标题和"选几项"那句都写进来：报错时要点名这一组，用的就是同一句话，
    // HTML 里再印一遍迟早会对不上。
    $(`pref-${group}-legend`).replaceChildren(legendOf(group), hintOf(group));
  }

  const el = {
    trigger: $('coach-pref-btn'),
    quickTrigger: $('coach-pref-quick-btn'),
    state: $('coach-pref-state'),
    dialog: $('coach-pref-dialog'),
    error: $('coach-pref-error'),
    note: $('pref-note'),
    counter: $('pref-note-count'),
    budgetMin: $('pref-budget-min'),
    budgetMax: $('pref-budget-max'),
    scheduleNote: $('pref-schedule-note'),
    scheduleCount: $('pref-schedule-note-count'),
    contact: $('pref-contact'),
    timezone: $('pref-timezone'),
    saveBtn: $('coach-pref-save-btn'),
    closeBtn: $('coach-pref-close-btn'),
  };

  /** 服务端那份（或 null：还没填过）。保存成功后换成服务端回的形状。 */
  let current = null;
  let busy = false;
  let request = 0;
  let dialogAccount = null;

  function idleSave() {
    busy = false;
    el.saveBtn.disabled = false;
    el.saveBtn.textContent = '保存';
  }

  function isCurrent(ticket, whoId) {
    return ticket === request && player()?.id === whoId;
  }

  function showError(text, field) {
    // 后端把预算错误挂到具体列，界面是一组两个输入框；归一到同一组再标红。
    const budgetField = field;
    if (field === 'budget_min_cny' || field === 'budget_max_cny') field = 'budget';
    el.error.textContent = text;
    el.error.hidden = false;
    for (const section of SECTIONS) {
      $(sectionId(section))?.classList.toggle('invalid', section === field);
    }
    if (field === 'note') {
      el.note.focus();
    } else if (field === 'schedule_note') {
      el.scheduleNote.focus();
    } else if (field === 'budget') {
      (budgetField === 'budget_max_cny' ? el.budgetMax : el.budgetMin).focus();
    } else if (field) {
      $(`pref-${field}-choices`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  function clearError() {
    el.error.hidden = true;
    el.error.textContent = '';
    for (const section of SECTIONS) {
      $(sectionId(section))?.classList.remove('invalid');
    }
  }

  function paintCounter() {
    const n = [...normalizeCoachText(el.note.value)].length;
    el.counter.textContent = `${n} / ${COACH_NOTE_MAX}`;
    el.counter.classList.toggle('over', n > COACH_NOTE_MAX);
    const scheduleLength = [...normalizeCoachText(el.scheduleNote.value)].length;
    el.scheduleCount.textContent = `${scheduleLength} / ${COACH_SCHEDULE_NOTE_MAX}`;
    el.scheduleCount.classList.toggle('over', scheduleLength > COACH_SCHEDULE_NOTE_MAX);
  }

  function formState() {
    return {
      level: chosen('level'),
      goals: chosen('goals'),
      formats: chosen('formats'),
      slots: chosen('slots'),
      timezone: el.timezone.value,
      language: chosen('language'),
      note: el.note.value,
      contactOk: el.contact.checked,
      budgetMinCny: el.budgetMin.value,
      budgetMaxCny: el.budgetMax.value,
      scheduleNote: el.scheduleNote.value,
    };
  }

  /** 把面板摆成 current 的样子（没填过就全空）。 */
  function fill(pref) {
    for (const group of COACH_GROUPS) {
      if (group === 'timezone') continue;
      setChosen(group, pref ? pref[group] : []);
    }
    el.timezone.value = pref?.timezone ?? '';
    el.note.value = pref?.note ?? '';
    el.budgetMin.value = pref?.budget_min_cny ?? '';
    el.budgetMax.value = pref?.budget_max_cny ?? '';
    el.scheduleNote.value = pref?.schedule_note ?? '';
    el.contact.checked = pref?.contact_ok === true;
    paintCounter();
  }

  function paintCard() {
    const scheduleNote = typeof current?.schedule_note === 'string' ? current.schedule_note.trim() : '';
    const noteToken = '\uE100';
    const summary = coachPrefSummary(scheduleNote ? { ...current, schedule_note: noteToken } : current);
    el.state.textContent = translateUserText(summary, scheduleNote ? [noteToken] : [])
      .split(noteToken).join(scheduleNote);
    el.state.setAttribute('data-i18n-skip', '');
    el.state.classList.toggle('hidden', !current);
    el.trigger.querySelector('.coach-pref-btn-label').textContent = current
      ? '改我想找的教练'
      : '我想找什么样的教练';
    el.quickTrigger.querySelector('.coach-pref-quick-label').textContent = current
      ? '更新我的匹配偏好'
      : '填写偏好，匹配教练';
  }

  async function load(ticket = ++request, whoId = player()?.id) {
    const reply = await call('chess_coach_pref_get.php', { method: 'GET' });
    if (!isCurrent(ticket, whoId)) return { ok: false, stale: true };
    if (!reply.ok) {
      current = null;
      paintCard();
      return { ok: false, text: reply.message };
    }
    current = reply.pref ?? null;
    paintCard();
    return { ok: true };
  }

  async function open() {
    if (!player()) {
      openAccount('signin');
      showToast('先登录再填这张表 —— 偏好是记在账号上的。');
      return;
    }
    const ticket = ++request;
    const whoId = player()?.id;
    dialogAccount = whoId;
    clearError();
    $('coach-card').open = true;
    el.saveBtn.disabled = true;
    el.dialog.showModal();
    const loaded = await load(ticket, whoId);
    if (!isCurrent(ticket, whoId) || !el.dialog.open) return;
    fill(current);
    el.saveBtn.disabled = false;
    if (!loaded.ok && current === null) {
      showError(loaded.text ?? '这份偏好没能取回来，请再试一次。', null);
      el.closeBtn.focus();
      return;
    }
    (current ? el.saveBtn : $('pref-level-choices').querySelector('input'))?.focus();
  }

  async function save() {
    if (busy || !player()) return;
    const checked = validateCoachForm(formState());
    if (!checked.ok) {
      showError(checked.text, checked.field);
      return;
    }
    const ticket = ++request;
    const whoId = player()?.id;
    clearError();
    busy = true;
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = '保存中…';

    const reply = await call('chess_coach_pref_save.php', { body: checked.payload });
    if (!isCurrent(ticket, whoId)) {
      if (player()?.id !== whoId) idleSave();
      return;
    }
    if (reply.ok) {
      current = reply.pref ?? null;
      paintCard();
      fill(current);
      el.dialog.close();
      onPrefChange?.();
      showToast(current ? '记下了。教练入驻时按这个给你推荐。' : '偏好已保存。');
    } else {
      showError(reply.message ?? '没能存上，请再试一次。', reply.field ?? null);
    }
    idleSave();
  }

  el.trigger.addEventListener('click', open);
  el.quickTrigger.addEventListener('click', open);
  el.saveBtn.addEventListener('click', save);
  el.closeBtn.addEventListener('click', () => el.dialog.close());
  el.dialog.addEventListener('close', () => {
    request += 1;
    dialogAccount = null;
    idleSave();
    clearError();
  });
  el.note.addEventListener('input', paintCounter);
  el.scheduleNote.addEventListener('input', () => {
    paintCounter();
    if (!el.error.hidden) clearError();
  });
  for (const input of [el.budgetMin, el.budgetMax]) {
    input.addEventListener('input', () => {
      if (!el.error.hidden) clearError();
    });
  }
  // 改任何一项就把红字收掉：留着一句"要选一项"在人已选好之后，比不提示更烦人。
  for (const group of COACH_GROUPS) {
    $(`pref-${group}-choices`).addEventListener('change', () => {
      if (!el.error.hidden) clearError();
    });
  }
  el.note.addEventListener('input', () => {
    if (!el.error.hidden) clearError();
  });
  globalThis.window?.addEventListener('chess-language-change', paintCard);

  function refresh() {
    const whoId = player()?.id;
    const accountChanged = dialogAccount !== null && dialogAccount !== whoId;
    current = null;
    idleSave();
    paintCard();
    if (accountChanged && el.dialog.open) el.dialog.close();
    const ticket = ++request;
    if (!whoId) {
      dialogAccount = null;
      onPrefChange?.();
      return Promise.resolve(null);
    }
    return load(ticket, whoId).then((result) => {
      if (!result.stale) onPrefChange?.();
      return result;
    });
  }

  return { open, refresh, value: () => current };
}
