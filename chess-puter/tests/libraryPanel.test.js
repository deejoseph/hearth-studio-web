import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEntry, clearLibrary, loadLibrary } from '../src/game/library.js';
import { mountLibrary } from '../src/ui/library.js';

/**
 * The 棋谱库 panel: what a row says, what a tick does, and what comes out of
 * the export button. It runs without a DOM, so the chrome is the handful of
 * properties and methods src/ui/library.js touches — and the element map is
 * built from the ids index.html actually has, which is what catches a rename
 * on one side only.
 *
 * The games are seeded through addEntry rather than by hand, so what the panel
 * reads is what the board writes.
 */
const MARKUP = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const HTML_IDS = new Set(
  [...MARKUP.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
);

const PANEL_SOURCE = readFileSync(
  new URL('../src/ui/library.js', import.meta.url),
  'utf8',
);

const KEY = 'chess-library';

/** @param {{id: string, at: number}} over */
const game = (over = {}) => ({
  id: 'g1',
  at: 1000,
  mode: 'computer',
  level: 'medium',
  sans: ['e4', 'e5', 'Qh5'],
  result: '1-0',
  white: 'Player',
  black: 'Computer (Medium)',
  control: [300000, 3000],
  termination: 'normal',
  ...over,
});

function fakeStore() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    /** Whether a reload would still find the library there. */
    holds: () => data.has(KEY),
  };
}

function fakeNode(name = '') {
  const classes = new Set();
  const listeners = new Map();
  const attributes = new Map();
  const node = {
    name,
    children: [],
    className: '',
    textContent: '',
    dataset: {},
    checked: false,
    disabled: false,
    open: false,
    focusCount: 0,
    classList: {
      toggle: (className, on) => (on ? classes.add(className) : classes.delete(className)),
      contains: (className) => classes.has(className),
    },
    setAttribute: (key, value) => attributes.set(key, String(value)),
    addEventListener: (type, fn) => {
      listeners.set(type, fn);
    },
    emit(type, event = {}) {
      listeners.get(type)?.(event);
    },
    append(...kids) {
      node.children.push(...kids);
    },
    replaceChildren(...kids) {
      node.children.length = 0;
      node.children.push(...kids);
    },
    focus() {
      node.focusCount++;
    },
    showModal() {
      node.open = true;
    },
    close() {
      node.open = false;
    },
  };
  return node;
}

/** Every string in a subtree, in order — enough to read a row back. */
function textOf(node) {
  return [node.textContent, ...node.children.map(textOf)].filter(Boolean).join('');
}

/** The first created element of this tag in a subtree. */
function find(node, name) {
  if (node.name === name) return node;
  for (const kid of node.children) {
    const found = find(kid, name);
    if (found) return found;
  }
  return null;
}

let nodes;
let store;
let toasts;
let downloads;
let confirmations;

function mount() {
  nodes = new Map();
  const get = (id) => {
    if (!HTML_IDS.has(id)) throw new Error(`index.html has no id="${id}"`);
    if (!nodes.has(id)) nodes.set(id, fakeNode(id));
    return nodes.get(id);
  };
  vi.stubGlobal('document', {
    getElementById: get,
    createElement: (name) => fakeNode(name),
    createTextNode: (text) => ({ ...fakeNode(), textContent: text }),
  });

  toasts = [];
  downloads = [];
  confirmations = [];
  mountLibrary({
    showToast: (text) => toasts.push(text),
    askConfirm: (details, onConfirm) => {
      confirmations.push(details);
      confirmations.at(-1).run = onConfirm;
    },
    download: (name, text) => {
      downloads.push({ name, text });
      return true;
    },
  });
  return get;
}

/** Open the panel the way a player does: press the button in the move card. */
function open() {
  nodes.get('library-btn').emit('click');
}

function rows() {
  return nodes.get('library-list').children;
}

/** The game a row stands for, which is what the tick is a tick of. */
function rowBoxId(row) {
  return find(row, 'input').dataset.id;
}

function boxOf(id) {
  return rows()
    .map((row) => find(row, 'input'))
    .find((box) => box.dataset.id === id);
}

function tick(id, checked = true) {
  const box = boxOf(id);
  box.checked = checked;
  nodes.get('library-list').emit('change', { target: box });
}

beforeEach(() => {
  store = fakeStore();
  vi.unstubAllGlobals();
  // Stubbed here rather than in mount(): a test seeds storage through
  // addEntry before the panel is mounted.
  vi.stubGlobal('localStorage', store);
});

describe('the markup and the panel agree', () => {
  it('every element the panel reaches for is in index.html', () => {
    const wanted = [...PANEL_SOURCE.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
    expect(wanted.length).toBeGreaterThan(8);
    for (const id of wanted) expect(HTML_IDS.has(id), `id="${id}"`).toBe(true);
  });
});

describe('the list', () => {
  it('shows one row per stored game, newest first', () => {
    addEntry(game({ id: 'old', at: 1000, white: 'OldGuy' }));
    addEntry(game({ id: 'new', at: 2000, white: 'NewGuy' }));
    mount();
    open();
    expect(rows().map(rowBoxId)).toEqual(['new', 'old']);
    expect(store.holds()).toBe(true);
  });

  it('says the result, and who the game was against', () => {
    addEntry(game({ id: 'a', at: 1000 }));
    addEntry(
      game({ id: 'b', at: 2000, mode: 'local', level: null, white: 'Player 1', black: 'Player 2' }),
    );
    addEntry(
      game({
        id: 'c',
        at: 3000,
        mode: 'online',
        level: null,
        result: '1/2-1/2',
        white: '小李',
        black: '阿明',
      }),
    );
    addEntry(game({ id: 'd', at: 4000, result: '0-1', termination: 'time forfeit' }));
    addEntry(game({ id: 'e', at: 5000, result: '*', control: null }));
    mount();
    open();
    // Newest first, so the five rows come back e, d, c, b, a.
    const lines = rows().map(textOf);
    expect(lines).toHaveLength(5);
    expect(lines[4]).toContain('白胜 · 电脑（中级）');
    expect(lines[3]).toContain('白胜 · 讲解两人');
    expect(lines[2]).toContain('和棋 · 小李 对 阿明');
    expect(lines[1]).toContain('黑胜 · 电脑（中级）');
    expect(lines[0]).toContain('未分胜负');
    // The clock the game was played with, in the minutes the picker offers.
    expect(lines[4]).toContain('5+3');
    expect(lines[0]).toContain('不限时');
  });

  it('offers nothing when no game has finished yet', () => {
    mount();
    open();
    expect(nodes.get('library-list').classList.contains('hidden')).toBe(true);
    expect(nodes.get('library-bar').classList.contains('hidden')).toBe(true);
    expect(nodes.get('library-empty').classList.contains('hidden')).toBe(false);
    expect(nodes.get('library-export-btn').disabled).toBe(true);
    expect(nodes.get('library-picked').textContent).toBe('还没勾选');
  });

  it('counts ticks and enables the export', () => {
    addEntry(game({ id: 'a' }));
    addEntry(game({ id: 'b', at: 2000 }));
    mount();
    open();
    tick('a');
    expect(nodes.get('library-picked').textContent).toBe('已选 1 局');
    expect(nodes.get('library-export-btn').disabled).toBe(false);
    tick('b');
    expect(nodes.get('library-picked').textContent).toBe('已选 2 局');
    // All of them ticked is what makes 全选 show as ticked.
    expect(nodes.get('library-select-all').checked).toBe(true);
    tick('a', false);
    expect(nodes.get('library-select-all').checked).toBe(false);
    expect(nodes.get('library-picked').textContent).toBe('已选 1 局');
  });

  it('全选 ticks every row, and unticking it clears them', () => {
    for (const id of ['a', 'b', 'c']) addEntry(game({ id, at: id.charCodeAt(0) }));
    mount();
    open();
    const all = nodes.get('library-select-all');
    all.checked = true;
    all.emit('change');
    expect(nodes.get('library-picked').textContent).toBe('已选 3 局');
    expect(rows().map((row) => find(row, 'input').checked)).toEqual([true, true, true]);
    all.checked = false;
    all.emit('change');
    expect(nodes.get('library-picked').textContent).toBe('还没勾选');
    expect(nodes.get('library-export-btn').disabled).toBe(true);
  });

  it('does not keep a tick on a game that is no longer stored', () => {
    addEntry(game({ id: 'a' }));
    addEntry(game({ id: 'b', at: 2000 }));
    mount();
    open();
    tick('a');
    clearLibrary();
    const all = nodes.get('library-select-all');
    all.checked = true;
    all.emit('change'); // re-renders from storage, which is now empty
    expect(nodes.get('library-picked').textContent).toBe('还没勾选');
    expect(nodes.get('library-export-btn').disabled).toBe(true);
  });
});

describe('the export', () => {
  it('writes the ticked games as one document, oldest first', () => {
    addEntry(game({ id: 'older', at: 1000, white: 'OldestName' }));
    addEntry(game({ id: 'newer', at: 2000, white: 'NewestName' }));
    addEntry(game({ id: 'left', at: 3000, white: 'UntickedName' }));
    mount();
    open();
    tick('older');
    tick('newer');
    nodes.get('library-export-btn').emit('click');

    expect(downloads).toHaveLength(1);
    const { name, text } = downloads[0];
    expect(name).toMatch(/^chess-\d{8}-\d{4}-2games\.pgn$/);
    expect(text.split('\n\n')).toHaveLength(4); // tag section + movetext, twice
    expect(text.indexOf('OldestName')).toBeLessThan(text.indexOf('NewestName'));
    expect(text).not.toContain('UntickedName');
    expect(toasts.at(-1)).toContain('2 局');
  });

  it('exports the clock and how the game ended', () => {
    addEntry(game({ id: 'a', control: [60000, 0], termination: 'time forfeit' }));
    mount();
    open();
    tick('a');
    nodes.get('library-export-btn').emit('click');
    expect(downloads[0].text).toContain('[TimeControl "60+0"]');
    expect(downloads[0].text).toContain('[Termination "time forfeit"]');
  });

  it('writes nothing when the button is pressed with nothing ticked', () => {
    addEntry(game({ id: 'a' }));
    mount();
    open();
    nodes.get('library-export-btn').emit('click');
    expect(downloads).toEqual([]);
    expect(toasts).toEqual([]);
  });
});

describe('清空', () => {
  it('asks before going, and only clears when the answer is yes', () => {
    addEntry(game({ id: 'a' }));
    mount();
    open();
    nodes.get('library-clear-btn').emit('click');
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0].confirmLabel).toBe('清空');
    // Asked is not yet done: the games are still where they were.
    expect(store.holds()).toBe(true);
    expect(rows()).toHaveLength(1);

    confirmations[0].run();
    expect(store.holds()).toBe(false);
    expect(rows()).toHaveLength(0);
    expect(nodes.get('library-list').classList.contains('hidden')).toBe(true);
    expect(nodes.get('library-empty').classList.contains('hidden')).toBe(false);
    expect(nodes.get('library-export-btn').disabled).toBe(true);
    expect(toasts.at(-1)).toContain('清空');
  });

  it('leaves the library alone when the answer is no', () => {
    addEntry(game({ id: 'a' }));
    mount();
    open();
    nodes.get('library-clear-btn').emit('click');
    // 取消 closes the ask and never runs what was asked for.
    expect(store.holds()).toBe(true);
    expect(loadLibrary()).toHaveLength(1);
  });
});
