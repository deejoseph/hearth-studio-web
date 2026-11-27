import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/net/auth.js', () => ({ API_BASE: '', call: vi.fn(), upload: vi.fn() }));
vi.mock('../src/net/coachImage.js', () => ({ prepareCoachImage: vi.fn() }));

import { call, upload } from '../src/net/auth.js';
import { prepareCoachImage } from '../src/net/coachImage.js';
import { mountCoachPref } from '../src/ui/coachPref.js';
import { mountCoachApp } from '../src/ui/coachApp.js';
import { mountCoachComplaint } from '../src/ui/coachComplaint.js';
import { mountCoachProfile } from '../src/ui/coachProfile.js';

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.className = '';
    this._text = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.readOnly = false;
    this.open = false;
    this.hidden = false;
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
      toggle: (name, force) => {
        const on = force ?? !this.classes.has(name);
        if (on) this.classes.add(name);
        else this.classes.delete(name);
        return on;
      },
    };
    this.classes = new Set();
  }

  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }

  dispatch(type) {
    for (const fn of this.listeners.get(type) ?? []) fn({ preventDefault() {} });
  }

  click() { this.dispatch('click'); }
  get textContent() { return this._text + this.children.map((node) => node.textContent ?? '').join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  focus() { document.activeElement = this; }
  scrollIntoView() {}
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  showModal() { this.open = true; }
  close() {
    if (!this.open) return;
    this.open = false;
    this.dispatch('close');
  }
  querySelector(selector) {
    if (selector.startsWith('.')) {
      const name = selector.slice(1);
      const found = this.children.find((node) => node.className === name);
      if (found) return found;
      const created = Object.assign(new Element(), { className: name });
      this.children.push(created);
      return created;
    }
    return this.children[0] ?? null;
  }
}

function installDocument() {
  const ids = new Map();
  const created = [];
  globalThis.document = {
    activeElement: null,
    getElementById: (id) => {
      if (!ids.has(id)) ids.set(id, new Element());
      return ids.get(id);
    },
    createElement: (tag) => {
      const node = new Element(tag);
      created.push(node);
      return node;
    },
    createTextNode: (text) => ({ textContent: text }),
    querySelectorAll: (selector) => {
      const match = /^input\[name="([^"]+)"\](:checked)?$/.exec(selector);
      if (!match) return [];
      return created.filter((node) => node.tagName === 'INPUT'
        && node.name === match[1] && (!match[2] || node.checked));
    },
  };
  return { ids, created };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const pref = (note) => ({
  level: 'play', goals: ['tactics'], formats: ['one'], slots: [], timezone: 'Asia/Shanghai',
  language: 'zh', note, contact_ok: true, budget_min_cny: null, budget_max_cny: null, schedule_note: '',
});

const profile = (tagline) => ({
  title: '', elo: null, years: null, tagline, honors: '', enrollment_notes: '', hourly_rate_cny: null,
  tuition_text: '', schedule_text: '', language: '', timezone: '', levels: [], goals: [], formats: [], slots: [],
  avatar: '', photos: [], certificates: [],
});

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  vi.resetAllMocks();
  installDocument();
});

describe('教练界面的跨账号异步响应', () => {
  it('偏好读取的旧响应不能覆盖新账号', async () => {
    let who = { id: 1 };
    const first = deferred();
    const second = deferred();
    call.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const changed = vi.fn();
    const ui = mountCoachPref({ showToast: vi.fn(), player: () => who, openAccount: vi.fn(), onPrefChange: changed });

    const oldLoad = ui.refresh();
    who = { id: 2 };
    const newLoad = ui.refresh();
    second.resolve({ ok: true, pref: { ...pref('新账号偏好'), schedule_note: '新账号时间' } });
    await newLoad;
    first.resolve({ ok: true, pref: { ...pref('旧账号偏好'), schedule_note: '旧账号时间' } });
    await oldLoad;

    expect(ui.value().note).toBe('新账号偏好');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(document.getElementById('coach-pref-state').textContent).toContain('新账号时间');
    expect(document.getElementById('coach-pref-state').textContent).not.toContain('旧账号时间');
  });

  it('偏好保存的旧响应不能关闭新账号对话框或显示成功', async () => {
    let who = { id: 1 };
    call.mockResolvedValueOnce({ ok: true, pref: pref('原偏好') });
    const ui = mountCoachPref({ showToast: vi.fn(), player: () => who, openAccount: vi.fn(), onPrefChange: vi.fn() });
    await ui.refresh();
    call.mockResolvedValueOnce({ ok: true, pref: null });
    ui.open();
    await Promise.resolve();
    await Promise.resolve();

    for (const [name, value] of [['pref-level', 'play'], ['pref-goals', 'tactics'], ['pref-formats', 'one'], ['pref-language', 'zh']]) {
      const input = document.querySelectorAll(`input[name="${name}"]`)[0];
      input.value = value;
      input.checked = true;
    }
    document.getElementById('pref-timezone').value = 'Asia/Shanghai';
    document.getElementById('pref-note').value = '这是旧账号正在保存的一份学习偏好说明。';
    document.getElementById('pref-contact').checked = true;

    const save = deferred();
    call.mockReturnValueOnce(save.promise);
    document.getElementById('coach-pref-save-btn').click();
    who = { id: 2 };
    const refresh = deferred();
    call.mockReturnValueOnce(refresh.promise);
    const newLoad = ui.refresh();
    refresh.resolve({ ok: true, pref: pref('新账号已经保存的偏好') });
    await newLoad;
    save.resolve({ ok: true, pref: pref('旧账号迟到响应') });
    await Promise.resolve();
    await Promise.resolve();

    expect(ui.value().note).toBe('新账号已经保存的偏好');
    expect(document.getElementById('coach-pref-dialog').open).toBe(false);
  });

  it('教练申请读取的旧响应不能改写新账号资格', async () => {
    let who = { id: 1 };
    const first = deferred();
    const second = deferred();
    call.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ui = mountCoachApp({ showToast: vi.fn(), player: () => who, openAccount: vi.fn(), onStateChange: vi.fn() });

    const oldLoad = ui.refresh();
    who = { id: 2 };
    const newLoad = ui.refresh();
    second.resolve({ ok: true, can_teach: true, was_teacher: true, app: { status: 'approved' } });
    await newLoad;
    first.resolve({ ok: true, can_teach: false, was_teacher: false, app: { status: 'pending' } });
    await oldLoad;

    expect(ui.state()).toBe('approved');
    expect(ui.identity().canTeach).toBe(true);
  });

  it('角色切换后的投诉读取不能把旧学生的记录带回教练历史', async () => {
    const who = { id: 7, verified: true };
    let teacher = false;
    const first = deferred();
    const second = deferred();
    call.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ui = mountCoachComplaint({
      showToast: vi.fn(), player: () => who, openAccount: vi.fn(), wasTeacher: () => teacher, onChanged: vi.fn(),
    });

    document.getElementById('coach-complaints-btn').click();
    teacher = true;
    ui.syncGate();
    expect(document.getElementById('coach-complaints-dialog').open).toBe(false);
    document.getElementById('coach-complaints-btn').click();
    second.resolve({ ok: true, complaints: [{
      id: 2, relation: 'received', status: 'pending', text: '匿名申诉正文', severity: 'normal', created_at: '2026-11-27 10:00:00',
    }] });
    await Promise.resolve();
    await Promise.resolve();
    first.resolve({ ok: true, complaints: [{
      id: 1, relation: 'submitted', status: 'rejected', text: '旧学生提交的正文', severity: 'normal', created_at: '2026-11-26 10:00:00',
    }] });
    await Promise.resolve();
    await Promise.resolve();

    const history = document.getElementById('coach-complaints-history-list').textContent;
    expect(history).toContain('匿名申诉正文');
    expect(history).not.toContain('旧学生提交的正文');
  });
});

describe('教练资料的跨账号异步响应', () => {
  it('旧账号读取不能覆盖新账号资料', async () => {
    let who = { id: 1 };
    const first = deferred();
    const second = deferred();
    call.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ui = mountCoachProfile({
      showToast: vi.fn(), player: () => who, openAccount: vi.fn(), canTeach: () => true,
      onChanged: vi.fn(), openImage: vi.fn(),
    });

    const oldLoad = ui.refresh();
    who = { id: 2 };
    const newLoad = ui.refresh();
    second.resolve({ ok: true, filled: true, profile: profile('新账号资料') });
    await newLoad;
    first.resolve({ ok: true, filled: true, profile: profile('旧账号资料') });
    await oldLoad;

    expect(ui.value().tagline).toBe('新账号资料');
    expect(document.getElementById('coach-profile-btn').querySelector('.coach-profile-btn-label').textContent)
      .toBe('改我的教练资料');
  });

  it('旧账号保存不能覆盖新账号资料或显示成功', async () => {
    let who = { id: 1 };
    const showToast = vi.fn();
    call.mockResolvedValueOnce({ ok: true, filled: true, profile: profile('旧账号原资料') });
    const ui = mountCoachProfile({
      showToast, player: () => who, openAccount: vi.fn(), canTeach: () => true,
      onChanged: vi.fn(), openImage: vi.fn(),
    });
    await ui.refresh();
    document.getElementById('cp-tagline').value = '旧账号正在保存';
    const save = deferred();
    call.mockReturnValueOnce(save.promise);
    document.getElementById('coach-profile-save-btn').click();

    who = { id: 2 };
    call.mockResolvedValueOnce({ ok: true, filled: true, profile: profile('新账号资料') });
    await ui.refresh();
    save.resolve({ ok: true, filled: true, profile: profile('旧账号迟到资料') });
    await flush();

    expect(ui.value().tagline).toBe('新账号资料');
    expect(showToast).not.toHaveBeenCalledWith('资料存好了，名录上就是这些。');
  });

  it('旧账号图片压缩完成后不能上传到新账号', async () => {
    let who = { id: 1 };
    call.mockResolvedValueOnce({ ok: true, filled: false, profile: profile('') });
    const ui = mountCoachProfile({
      showToast: vi.fn(), player: () => who, openAccount: vi.fn(), canTeach: () => true,
      onChanged: vi.fn(), openImage: vi.fn(),
    });
    await ui.refresh();
    const prepared = deferred();
    prepareCoachImage.mockReturnValueOnce(prepared.promise);
    const input = document.getElementById('cp-avatar-file');
    input.files = [{}];
    input.dispatch('change');

    who = { id: 2 };
    call.mockResolvedValueOnce({ ok: true, filled: true, profile: profile('新账号资料') });
    await ui.refresh();
    prepared.resolve({ ok: true, compressed: false, file: { size: 10 } });
    await flush();

    expect(upload).not.toHaveBeenCalled();
    expect(ui.value().tagline).toBe('新账号资料');
  });
});
