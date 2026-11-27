/**
 * 课堂上那一小块"申请成为教练"的界面（选项与话术在 game/coachApp.js）。
 *
 * 只做三件事：把服务端那一态摆在面板上（那一行解释 + 【开课堂】能不能点）、
 * 提供一个只有一段话的对话框、提交后按服务端回的重新摆一遍。
 *
 * 为什么【开课堂】要跟着状态禁用：不合格的点击换来的是服务器一句 403，
 * 那句话来得慢、还让人以为是自己点坏了。但"不知道"的时候（没登录、
 * 或者这一次没取回来）按钮照旧能点 —— 那时该由服务端说话，
 * 而不是界面拿一个没读到的值把人挡在门外。
 *
 * 真正的门在库里（chess_require_teacher），不在这里：这里的 disabled 只是
 * 少让人点一次错，直接对一个端点发请求是拦不住的，那一条由后端判。
 */

import { call } from '../net/auth.js';
import {
  COACH_INTRO_MAX,
  coachAppBtnLabel,
  coachAppDialogHint,
  coachAppIntro,
  coachAppState,
  coachAppNote,
  coachAppWhen,
  introLength,
  validateCoachIntro,
} from '../game/coachApp.js';

const $ = (id) => document.getElementById(id);

/**
 * @param {{
 *   showToast(text: string): void,
 *   player(): object|null,
 *   openAccount(which?: string): void,
 *   onStateChange(state: string|null): void,   // 由 main.js 决定【开课堂】能不能点
 * }} deps
 * @returns {{refresh(): Promise<any>, open(): void, state(): string|null, noteBlocked(): void}}
 */
export function mountCoachApp({ showToast, player, openAccount, onStateChange }) {
  const el = {
    note: $('class-teacher-note'),
    applyBtn: $('coach-apply-btn'),
    applyLabel: $('coach-apply-label'),
    dialog: $('coach-app-dialog'),
    hint: $('coach-app-hint'),
    when: $('coach-app-when'),
    intro: $('coach-app-intro'),
    counter: $('coach-app-count'),
    error: $('coach-app-error'),
    saveBtn: $('coach-app-save-btn'),
    closeBtn: $('coach-app-close-btn'),
  };

  /** 服务端算出来的那一态；null = 这一趟没问到（没登录，或取回来失败）。 */
  let state = null;
  let app = null;
  let busy = false;

  function paintNote() {
    // 没登录/没取到就把那一行收掉，而不是默认"你还不够格"：
    // 一个拿不到的值不该在界面上变成一句结论。
    el.note.textContent = state === null ? '' : coachAppNote(state);
    el.note.hidden = state === null;
    el.applyLabel.textContent = coachAppBtnLabel(state ?? 'none');
    onStateChange(state);
  }

  function paintCounter() {
    const n = introLength(el.intro.value);
    el.counter.textContent = `${n} / ${COACH_INTRO_MAX}`;
    el.counter.classList.toggle('over', n > COACH_INTRO_MAX);
  }

  function showError(text) {
    el.error.textContent = text;
    el.error.hidden = !text;
  }

  /** 对话框摆成当前这一态：已批准的是读、不是改；别的把原文放回去让人接着写。 */
  function fillDialog() {
    const shown = state ?? 'none';
    el.hint.textContent = coachAppDialogHint(shown);
    const at = coachAppWhen(shown, app);
    el.when.textContent = at ? `${shown === 'rejected' ? '上次答复于' : '提交于'} ${at}` : '';
    el.when.hidden = !at;
    el.intro.value = coachAppIntro(app);
    const locked = state === 'approved';
    el.intro.readOnly = locked;
    // 提交按钮直接收掉而不是禁用：已批准的人按下去只会换来一句 409，
    // 而那句"你已经能开课堂了"读起来像是出了错。
    el.saveBtn.hidden = locked;
    paintCounter();
    showError('');
  }

  async function load() {
    const reply = await call('chess_coach_app_get.php', { method: 'GET' });
    if (!reply.ok) {
      // 会话在别处过期了、或后端这会儿不响应：那一行收掉、【开课堂】照旧能点，
      // 让服务端在那一次点击上说话。
      state = null;
      app = null;
      paintNote();
      return reply;
    }
    state = coachAppState(reply);
    app = reply.app ?? null;
    paintNote();
    return reply;
  }

  function open() {
    if (!player()) {
      openAccount('signin');
      showToast('先登录再申请 —— 教练资格是记在账号上的。');
      return;
    }
    fillDialog();
    el.dialog.showModal();
    if (state === null) {
      // 还没问到这一态：先把框打开，取回来再重摆一次
      load().then(() => {
        if (el.dialog.open) fillDialog();
      });
    }
    (state === 'approved' ? el.closeBtn : el.intro)?.focus();
  }

  async function save() {
    if (busy || state === 'approved') return;
    const checked = validateCoachIntro(el.intro.value);
    if (!checked.ok) {
      showError(checked.text);
      el.intro.focus();
      return;
    }
    busy = true;
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = '提交中…';
    showError('');

    const reply = await call('chess_coach_app_save.php', { body: checked.payload });
    if (reply.ok) {
      state = coachAppState(reply);
      app = reply.app ?? null;
      paintNote();
      fillDialog();
      el.dialog.close();
      showToast('交上去了，管理员看过就能开课堂。');
    } else if (reply.code === 'already_teacher') {
      // 他其实已经批过了（多半是另一个标签里刚批的）：别让人对着 409 猜
      await load();
      fillDialog();
      showError('这份申请已经通过了，不用再交一遍。现在就能开课堂。');
      el.closeBtn.focus();
    } else {
      showError(reply.message || '没能交上去，请再试一次。');
    }

    busy = false;
    el.saveBtn.disabled = false;
    el.saveBtn.textContent = '提交申请';
  }

  el.applyBtn.addEventListener('click', open);
  el.saveBtn.addEventListener('click', save);
  el.closeBtn.addEventListener('click', () => el.dialog.close());
  el.intro.addEventListener('input', () => {
    paintCounter();
    showError('');
  });

  return {
    /**
     * 重新问一次这一态。没登录就别问：把上一个账号留下的那一态丢掉，
     * 否则退出登录后【开课堂】还按别人的资格亮着。
     */
    refresh: () => {
      if (player()) return load();
      state = null;
      app = null;
      paintNote();
      return Promise.resolve(null);
    },
    open,
    state: () => state,
    /** 服务端在【开课堂】那一步回了 teacher_only：把人送去申请，而不是让他读一句 403。 */
    noteBlocked() {
      if (state === null || state === 'approved') state = 'none';
      paintNote();
      open();
    },
  };
}
