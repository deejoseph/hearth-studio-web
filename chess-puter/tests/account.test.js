import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountAccount } from '../src/ui/account.js';

/**
 * The panel's state machine. These tests run without a DOM, so the chrome is
 * the handful of properties and methods src/ui/account.js touches — and the
 * element map is built from the ids index.html actually has, which is what
 * catches a rename on one side only.
 */
const MARKUP = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const HTML_IDS = new Set(
  [...MARKUP.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
);

const ACCOUNT_SOURCE = readFileSync(
  new URL('../src/ui/account.js', import.meta.url),
  'utf8',
);

function fakeNode(id = '') {
  const classes = new Set();
  const listeners = new Map();
  const attributes = new Map();
  return {
    id,
    hidden: false,
    disabled: false,
    textContent: '',
    value: '',
    dataset: {},
    open: false,
    focused: 0,
    tabs: [],
    classList: {
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: (name) => attributes.get(name) ?? null,
    removeAttribute: (name) => attributes.delete(name),
    addEventListener: (type, fn) => {
      listeners.set(type, fn);
    },
    emit(type, event = {}) {
      listeners.get(type)?.(event);
    },
    focus() {},
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    querySelectorAll() {
      return this.tabs;
    },
  };
}

/** A tab button: the two-way switch is the only child the panel looks for. */
function fakeTabButton(pane) {
  const node = fakeNode(`tab-${pane}`);
  node.dataset = { pane };
  return node;
}

let nodes;
let tabs;
let fetchImpl;
let toasts;
let replaceState;

function mount({ search = '' } = {}) {
  nodes = new Map();
  tabs = [fakeTabButton('signin'), fakeTabButton('signup')];
  const tabStrip = fakeNode('account-tabs');
  tabStrip.tabs = tabs;

  const get = (id) => {
    if (!HTML_IDS.has(id)) {
      throw new Error(`index.html has no id="${id}"`);
    }
    if (!nodes.has(id)) nodes.set(id, id === 'account-tabs' ? tabStrip : fakeNode(id));
    return nodes.get(id);
  };

  vi.stubGlobal('document', {
    hidden: false,
    getElementById: get,
    addEventListener: vi.fn(),
    createElement: () => fakeNode(),
    createTextNode: (text) => ({ textContent: text }),
    createDocumentFragment: () => ({
      textContent: '',
      append(...children) {
        this.textContent += children.map((child) => child.textContent ?? '').join('');
      },
    }),
  });
  vi.stubGlobal('window', { location: { search, pathname: '/chess/' } });
  replaceState = vi.fn();
  vi.stubGlobal('history', { replaceState });
  toasts = [];
  vi.stubGlobal('fetch', fetchImpl ?? vi.fn());

  mountAccount({ showToast: (text) => toasts.push(text) });
}

/** Everything the panel has promised to do by now has run. */
async function settled() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function jsonReply(body, status = 200) {
  return { ok: status >= 200 && status < 400, status, json: async () => body };
}

beforeEach(() => {
  fetchImpl = undefined;
  vi.unstubAllGlobals();
});

describe('the markup and the panel agree', () => {
  it('every element the panel reaches for is in index.html', () => {
    const wanted = [...ACCOUNT_SOURCE.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
    expect(wanted.length).toBeGreaterThan(20);
    for (const id of wanted) expect(HTML_IDS.has(id), `id="${id}"`).toBe(true);
  });

  it('no id is used twice in the page', () => {
    const all = [...MARKUP.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('on load', () => {
  it('asks the server who this is and starts out signed out', async () => {
    fetchImpl = vi.fn(async () => jsonReply({ ok: true, signed_in: false }));
    mount();
    await settled();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/chess_me.php');
    expect(nodes.get('account-chip-label').textContent).toBe('登录');
    expect(nodes.get('account-flag').hidden).toBe(true);
    expect(nodes.get('verify-card').classList.contains('hidden')).toBe(true);
  });

  it('says nothing when the server is not there', async () => {
    fetchImpl = vi.fn(async () => {
      throw new Error('off line');
    });
    mount();
    await settled();
    // The board still works; a dead API must not look like a broken game.
    expect(toasts).toEqual([]);
    expect(nodes.get('account-chip-label').textContent).toBe('登录');
  });
});

describe('the chip opens the right pane', () => {
  it('offers the two ways in when nobody is signed in', async () => {
    fetchImpl = vi.fn(async () => jsonReply({ ok: true, signed_in: false }));
    mount();
    await settled();
    const dialog = nodes.get('account-dialog');
    nodes.get('account-chip').emit('click');
    expect(dialog.open).toBe(true);
    expect(nodes.get('account-title').textContent).toBe('登录');
    expect(nodes.get('signin-pane').classList.contains('hidden')).toBe(false);
    expect(nodes.get('signup-pane').classList.contains('hidden')).toBe(true);
    expect(nodes.get('account-pane').classList.contains('hidden')).toBe(true);
  });

  it('shows the account itself once signed in, tabs and all', async () => {
    fetchImpl = vi.fn(async () =>
      jsonReply({
        ok: true,
        signed_in: true,
        verified: true,
        player: { nickname: 'Joe', email: 'joe@example.com', verified: true },
      }),
    );
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    expect(nodes.get('account-title').textContent).toBe('我的账号');
    expect(nodes.get('account-tabs').classList.contains('hidden')).toBe(true);
    expect(nodes.get('account-name').textContent).toBe('Joe');
    expect(nodes.get('account-state').textContent).toBe('邮箱已确认。');
  });

  it('switches panes without leaving the other pane’s error on screen', async () => {
    fetchImpl = vi.fn(async () => jsonReply({ ok: true, signed_in: false }));
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    const error = nodes.get('signin-error');
    error.textContent = '邮箱或密码不对。';
    error.hidden = false;
    tabs[1].emit('click');
    expect(nodes.get('signup-pane').classList.contains('hidden')).toBe(false);
    expect(error.hidden).toBe(true);
    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    expect(tabs[0].getAttribute('aria-pressed')).toBe('false');
  });
});

describe('signing in', () => {
  function signInReply(reply, status = 200) {
    fetchImpl = vi.fn(async (url) =>
      url.endsWith('chess_me.php')
        ? jsonReply({ ok: true, signed_in: false })
        : jsonReply(reply, status),
    );
  }

  it('puts the answer in the panel and keeps the dialog up on a miss', async () => {
    signInReply({ ok: false, code: 'bad_credentials' }, 401);
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    nodes.get('signin-email').value = ' joe@example.com ';
    nodes.get('signin-password').value = 'Knight2026!';
    nodes.get('signin-pane').emit('submit', { preventDefault: vi.fn() });
    await settled();

    expect(JSON.parse(fetchImpl.mock.calls.at(-1)[1].body)).toEqual({
      email: 'joe@example.com',
      password: 'Knight2026!',
    });
    expect(nodes.get('signin-error').textContent).toBe('邮箱或密码不对。');
    expect(nodes.get('signin-error').hidden).toBe(false);
    expect(nodes.get('account-dialog').open).toBe(true);
  });

  it('signs in, clears the password field and tells the board', async () => {
    signInReply({
      ok: true,
      signed_in: true,
      verified: true,
      player: { nickname: 'Joe', email: 'joe@example.com', verified: true },
    });
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    nodes.get('signin-email').value = 'joe@example.com';
    nodes.get('signin-password').value = 'Knight2026!';
    nodes.get('signin-pane').emit('submit', { preventDefault: vi.fn() });
    await settled();

    expect(nodes.get('signin-password').value).toBe('');
    expect(nodes.get('account-dialog').open).toBe(false);
    expect(nodes.get('account-chip-label').textContent).toBe('Joe');
    expect(toasts.map((toast) => toast.textContent ?? toast)).toEqual(['已登录为 Joe。']);
  });

  it('locks the buttons while the request is out, and says what it is doing', async () => {
    let release;
    fetchImpl = vi.fn((url) =>
      url.endsWith('chess_me.php')
        ? Promise.resolve(jsonReply({ ok: true, signed_in: false }))
        : new Promise((resolve) => {
            release = resolve;
          }),
    );
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    nodes.get('signin-btn').textContent = '登录';
    nodes.get('signin-pane').emit('submit', { preventDefault: vi.fn() });
    expect(nodes.get('signin-btn').disabled).toBe(true);
    expect(nodes.get('signin-btn').textContent).toBe('正在登录…');
    release(jsonReply({ ok: true, signed_in: false }));
    await settled();
    expect(nodes.get('signin-btn').disabled).toBe(false);
    expect(nodes.get('signin-btn').textContent).toBe('登录');
  });

  it('leaves a dialog reopened after the wait alone when the reply finally lands', async () => {
    let release;
    fetchImpl = vi.fn((url) =>
      url.endsWith('chess_me.php')
        ? Promise.resolve(jsonReply({ ok: true, signed_in: false }))
        : new Promise((resolve) => {
            release = resolve;
          }),
    );
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    tabs[1].emit('click');
    nodes.get('signup-pane').emit('submit', { preventDefault: vi.fn() });

    // The player gives up, closes the window and opens it again to try the
    // password they already have. The answer to the first try must not close
    // this new window from under them.
    nodes.get('account-dialog').close();
    nodes.get('account-chip').emit('click');
    release(
      jsonReply({
        ok: true,
        status: 'created',
        signed_in: true,
        verified: false,
        mail_sent: true,
        player: { nickname: '乔', email: 'joe@example.com', verified: false },
      }),
    );
    await settled();

    expect(nodes.get('account-dialog').open).toBe(true);
    expect(nodes.get('account-chip-label').textContent).toBe('乔');
    // The reopened window now says who they are instead of demanding a form.
    expect(nodes.get('account-pane').classList.contains('hidden')).toBe(false);
    expect(nodes.get('signin-pane').classList.contains('hidden')).toBe(true);
  });

  it('switches to the account instead of closing on someone who moved to the other form', async () => {
    let release;
    fetchImpl = vi.fn((url) =>
      url.endsWith('chess_me.php')
        ? Promise.resolve(jsonReply({ ok: true, signed_in: false }))
        : new Promise((resolve) => {
            release = resolve;
          }),
    );
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    nodes.get('signin-pane').emit('submit', { preventDefault: vi.fn() });

    // The wait was long enough that the player decided to register instead and
    // is now typing a password in that form. The late answer must not make the
    // window vanish; it should show the identity it just established.
    tabs[1].emit('click');
    release(
      jsonReply({
        ok: true,
        signed_in: true,
        verified: true,
        player: { nickname: 'Joe', email: 'joe@example.com', verified: true },
      }),
    );
    await settled();

    expect(nodes.get('account-dialog').open).toBe(true);
    expect(nodes.get('account-pane').classList.contains('hidden')).toBe(false);
    expect(nodes.get('signup-pane').classList.contains('hidden')).toBe(true);
    expect(nodes.get('account-name').textContent).toBe('Joe');
    expect(toasts.map((toast) => toast.textContent ?? toast)).toEqual(['已登录为 Joe。']);
  });
});

describe('creating an account', () => {
  it('lands on the nag card when the email is not confirmed', async () => {
    fetchImpl = vi.fn(async (url) =>
      url.endsWith('chess_me.php')
        ? jsonReply({ ok: true, signed_in: false })
        : jsonReply({
            ok: true,
            status: 'created',
            signed_in: true,
            verified: false,
            mail_sent: true,
            player: { nickname: '乔', email: 'joe@example.com', verified: false },
          }),
    );
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    tabs[1].emit('click');
    nodes.get('signup-nickname').value = '乔';
    nodes.get('signup-email').value = 'joe@example.com';
    nodes.get('signup-password').value = 'Knight2026!';
    nodes.get('signup-pane').emit('submit', { preventDefault: vi.fn() });
    await settled();

    expect(nodes.get('account-chip-label').textContent).toBe('乔');
    expect(nodes.get('account-flag').hidden).toBe(false);
    expect(nodes.get('verify-card').classList.contains('hidden')).toBe(false);
    expect(nodes.get('verify-email').textContent).toBe('joe@example.com');
    expect(nodes.get('account-dialog').open).toBe(false);
  });

  it('says the email did not go out rather than leaving the player waiting', async () => {
    fetchImpl = vi.fn(async (url) =>
      url.endsWith('chess_me.php')
        ? jsonReply({ ok: true, signed_in: false })
        : jsonReply({
            ok: true,
            status: 'created',
            signed_in: true,
            verified: false,
            mail_sent: false,
            player: { nickname: '乔', email: 'joe@example.com', verified: false },
          }),
    );
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    tabs[1].emit('click');
    nodes.get('signup-pane').emit('submit', { preventDefault: vi.fn() });
    await settled();
    expect(nodes.get('verify-error').textContent).toBe(
      '确认邮件没能发出去。请按「重发邮件」。',
    );
    expect(nodes.get('verify-error').hidden).toBe(false);
  });

  it('says it is registering while the confirmation mail goes out', async () => {
    let release;
    fetchImpl = vi.fn((url) =>
      url.endsWith('chess_me.php')
        ? Promise.resolve(jsonReply({ ok: true, signed_in: false }))
        : new Promise((resolve) => {
            release = resolve;
          }),
    );
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    tabs[1].emit('click');
    nodes.get('signup-btn').textContent = '注册';
    nodes.get('signup-pane').emit('submit', { preventDefault: vi.fn() });
    // 注册要等服务器发信，回复常常迟到十几秒；按钮上得写着在做什么。
    expect(nodes.get('signup-btn').textContent).toBe('正在注册…');
    expect(nodes.get('signup-btn').disabled).toBe(true);
    release(jsonReply({ ok: false, code: 'weak_password' }, 400));
    await settled();
    expect(nodes.get('signup-btn').textContent).toBe('注册');
  });

  it('keeps the form open and explains the two possibilities for a known address', async () => {
    fetchImpl = vi.fn(async (url) =>
      url.endsWith('chess_me.php')
        ? jsonReply({ ok: true, signed_in: false })
        : jsonReply({ ok: true, status: 'submitted', signed_in: false, mail_sent: false }),
    );
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    tabs[1].emit('click');
    nodes.get('signup-pane').emit('submit', { preventDefault: vi.fn() });
    await settled();

    // The window no longer vanishes on this answer: it stays on the form and
    // says what may or may not have happened, in neutral words.
    expect(nodes.get('account-dialog').open).toBe(true);
    expect(nodes.get('signup-note').hidden).toBe(false);
    expect(nodes.get('signup-note').textContent).toContain('已经注册过的邮箱不会重复发信');
    expect(toasts).toEqual([]);
    // Nobody is signed in, and nothing says whether the address was known.
    expect(nodes.get('account-chip-label').textContent).toBe('登录');
    expect(nodes.get('verify-card').classList.contains('hidden')).toBe(true);

    // Moving to the other pane clears the explanation with the form.
    tabs[0].emit('click');
    expect(nodes.get('signup-note').hidden).toBe(true);
  });

  it('shows a weak password in the form, not in a toast', async () => {
    fetchImpl = vi.fn(async (url) =>
      url.endsWith('chess_me.php')
        ? jsonReply({ ok: true, signed_in: false })
        : jsonReply({ ok: false, code: 'weak_password' }, 400),
    );
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    tabs[1].emit('click');
    nodes.get('signup-pane').emit('submit', { preventDefault: vi.fn() });
    await settled();
    expect(nodes.get('signup-error').textContent).toBe(
      '这个密码太容易被猜到，换一个。',
    );
    expect(nodes.get('account-dialog').open).toBe(true);
  });
});

describe('signing out', () => {
  it('goes back to the two ways in', async () => {
    fetchImpl = vi.fn(async (url) =>
      url.endsWith('chess_logout.php')
        ? jsonReply({ ok: true, signed_in: false })
        : url.endsWith('chess_me.php')
          ? jsonReply({
              ok: true,
              signed_in: true,
              verified: true,
              player: { nickname: 'Joe', email: 'joe@example.com', verified: true },
            })
          : jsonReply({ ok: true, signed_in: false }),
    );
    mount();
    await settled();
    nodes.get('account-chip').emit('click');
    nodes.get('account-signout-btn').emit('click');
    await settled();
    expect(nodes.get('account-chip-label').textContent).toBe('登录');
    expect(nodes.get('account-dialog').open).toBe(false);
    expect(nodes.get('account-title').textContent).toBe('登录');
    expect(toasts.at(-1)).toBe('已退出登录。');
  });
});

describe('the confirmation email', () => {
  it('resends and says so', async () => {
    fetchImpl = vi.fn(async (url) =>
      url.endsWith('chess_resend.php')
        ? jsonReply({ ok: true, verified: false })
        : jsonReply({
            ok: true,
            signed_in: true,
            verified: false,
            player: { nickname: 'Joe', email: 'joe@example.com', verified: false },
          }),
    );
    mount();
    await settled();
    nodes.get('resend-btn').emit('click');
    await settled();
    expect(toasts.at(-1)).toBe('确认邮件已发出 —— 垃圾箱也看一眼。');
    expect(nodes.get('verify-error').hidden).toBe(true);
  });

  it('keeps a send failure on the card', async () => {
    fetchImpl = vi.fn(async (url) =>
      url.endsWith('chess_resend.php')
        ? jsonReply({ ok: false, code: 'mail_failed' }, 502)
        : jsonReply({
            ok: true,
            signed_in: true,
            verified: false,
            player: { nickname: 'Joe', email: 'joe@example.com', verified: false },
          }),
    );
    mount();
    await settled();
    nodes.get('resend-btn').emit('click');
    await settled();
    expect(nodes.get('verify-error').textContent).toBe(
      '邮件发不出去，请联系 admin@ichessgeek.com。',
    );
  });

  it('takes the verification news off the address bar and says what happened', async () => {
    fetchImpl = vi.fn(async () => jsonReply({ ok: true, signed_in: false }));
    mount({ search: '?verify=ok' });
    await settled();
    expect(toasts).toEqual(['邮箱已经确认好了。这个标签页可以关了。']);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/chess/');
  });

  it('leaves a plain visit alone', async () => {
    fetchImpl = vi.fn(async () => jsonReply({ ok: true, signed_in: false }));
    mount({ search: '' });
    await settled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });
});
