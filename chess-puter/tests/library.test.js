import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MAX_GAMES,
  addEntry,
  clearLibrary,
  loadLibrary,
  parseEntry,
} from '../src/game/library.js';

/**
 * The storage layer of 棋谱库: what a finished game has to look like to be
 * kept, and what comes back out. The key is 'chess-library', which is a stored
 * name rather than interface text, so it is spelled out here too.
 */
const KEY = 'chess-library';

/** The shape main.js writes when a game ends. */
const valid = () => ({
  v: 1,
  id: 'g1',
  at: 1766000000000,
  mode: 'computer',
  level: 'medium',
  sans: ['e4', 'e5', 'Qh5'],
  result: '1-0',
  white: 'Player',
  black: 'Computer (Medium)',
  control: [300000, 3000],
  termination: 'normal',
});

const withPatch = (patch) => parseEntry({ ...valid(), ...patch });

function fakeStore(rows = {}) {
  const data = new Map(Object.entries(rows));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    /** What a reload would find under the library's own key. */
    written: () => (data.has(KEY) ? JSON.parse(data.get(KEY)) : null),
  };
}

let store;

beforeEach(() => {
  store = fakeStore();
  vi.stubGlobal('localStorage', store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseEntry', () => {
  it('accepts what the app writes and revives the clock', () => {
    const entry = parseEntry(valid());
    expect(entry).toMatchObject({
      id: 'g1',
      at: 1766000000000,
      mode: 'computer',
      level: 'medium',
      result: '1-0',
      white: 'Player',
      black: 'Computer (Medium)',
      termination: 'normal',
    });
    expect(entry.control).toEqual({ initial: 300000, increment: 3000 });
    expect(entry.sans).toEqual(['e4', 'e5', 'Qh5']);
  });

  it('copies the move list rather than adopting it', () => {
    const source = valid();
    const entry = parseEntry(source);
    entry.sans.push('Bc4');
    expect(source.sans).toHaveLength(3);
  });

  it('rejects another version and anything that is not an object', () => {
    expect(withPatch({ v: 2 })).toBe(null);
    expect(withPatch({ v: undefined })).toBe(null);
    for (const junk of [null, undefined, 0, 'x', [], true]) {
      expect(parseEntry(junk)).toBe(null);
    }
  });

  it('rejects an id that cannot identify a row', () => {
    expect(withPatch({ id: '' })).toBe(null);
    expect(withPatch({ id: 42 })).toBe(null);
    expect(withPatch({ id: 'x'.repeat(41) })).toBe(null);
  });

  it('rejects a moment that is not one', () => {
    expect(withPatch({ at: 0 })).toBe(null);
    expect(withPatch({ at: -1 })).toBe(null);
    expect(withPatch({ at: 'soon' })).toBe(null);
    expect(withPatch({ at: NaN })).toBe(null);
  });

  it('refuses modes and results that the board cannot produce', () => {
    expect(withPatch({ mode: 'nonsense' })).toBe(null);
    expect(withPatch({ mode: null })).toBe(null);
    expect(withPatch({ result: '10-0' })).toBe(null);
    expect(withPatch({ result: 'white' })).toBe(null);
    // The three that are never resumed are still games that happened.
    for (const mode of ['computer', 'local', 'online']) {
      expect(withPatch({ mode })).not.toBe(null);
    }
  });

  it('refuses names or a termination that could not be one', () => {
    expect(withPatch({ white: 'x'.repeat(121) })).toBe(null);
    expect(withPatch({ black: 42 })).toBe(null);
    expect(withPatch({ termination: 'x'.repeat(25) })).toBe(null);
  });

  it('refuses a move list that is not one', () => {
    expect(withPatch({ sans: [] })).toBe(null);
    expect(withPatch({ sans: 'e4' })).toBe(null);
    expect(withPatch({ sans: ['e4', 5] })).toBe(null);
    expect(withPatch({ sans: ['', 'e4'] })).toBe(null);
    expect(withPatch({ sans: ['x'.repeat(13)] })).toBe(null);
    expect(withPatch({ sans: Array.from({ length: 1001 }, () => 'e4') })).toBe(null);
  });

  it('keeps a game whose level or clock is missing or broken', () => {
    // The level only ever captions a row, and an untimed game is a normal
    // thing to have played — neither is a reason to lose the scoresheet.
    expect(withPatch({ level: null }).level).toBe(null);
    expect(withPatch({ level: undefined }).level).toBe(null);
    expect(withPatch({ level: 'x'.repeat(13) }).level).toBe(null);
    expect(withPatch({ control: null }).control).toBe(null);
    expect(withPatch({ control: [300000] }).control).toBe(null);
    expect(withPatch({ control: ['a', 'b'] }).control).toBe(null);
    expect(withPatch({ control: [-1, 0] }).control).toBe(null);
  });
});

describe('loadLibrary', () => {
  it('is empty when nothing is stored, or what is stored is not a list', () => {
    expect(loadLibrary()).toEqual([]);
    store.setItem(KEY, 'not json');
    expect(loadLibrary()).toEqual([]);
    store.setItem(KEY, JSON.stringify({ mode: 'computer' }));
    expect(loadLibrary()).toEqual([]);
  });

  it('drops a bad row without losing the games beside it', () => {
    store.setItem(
      KEY,
      JSON.stringify([valid(), { ...valid(), id: 'g2', result: 'nonsense' }, { ...valid(), id: 'g3' }]),
    );
    expect(loadLibrary().map((entry) => entry.id)).toEqual(['g1', 'g3']);
  });

  it('comes back newest first, whoever wrote them in what order', () => {
    store.setItem(
      KEY,
      JSON.stringify([
        { ...valid(), id: 'old', at: 1000 },
        { ...valid(), id: 'new', at: 3000 },
        { ...valid(), id: 'middle', at: 2000 },
      ]),
    );
    expect(loadLibrary().map((entry) => entry.id)).toEqual(['new', 'middle', 'old']);
  });

  it('caps the list at the documented length', () => {
    store.setItem(
      KEY,
      JSON.stringify(
        Array.from({ length: MAX_GAMES + 10 }, (_, i) => ({ ...valid(), id: `g${i}`, at: i })),
      ),
    );
    const loaded = loadLibrary();
    expect(loaded).toHaveLength(MAX_GAMES);
    // The ones that go are the oldest, not a slice of whatever order arrived.
    expect(loaded[0].id).toBe(`g${MAX_GAMES + 9}`);
    expect(loaded.at(-1).id).toBe('g10');
  });

  it('is empty where storage is denied', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadLibrary()).toEqual([]);
  });
});

describe('addEntry', () => {
  it('puts the new game first and writes it down', () => {
    addEntry({ ...valid(), id: 'old', at: 1000 });
    const list = addEntry({ ...valid(), id: 'new', at: 2000 });
    expect(list.map((entry) => entry.id)).toEqual(['new', 'old']);
    expect(store.written().map((entry) => entry.id)).toEqual(['new', 'old']);
  });

  it('replaces a game that ends a second time', () => {
    // A flag fall undone and played out to mate is one game, and the row must
    // end up holding the moves that were actually played.
    addEntry({ ...valid(), id: 'g1', sans: ['e4', 'e5'], result: '0-1' });
    const list = addEntry({ ...valid(), id: 'g1', sans: ['e4', 'e5', 'Qh5'], result: '1-0' });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ result: '1-0', sans: ['e4', 'e5', 'Qh5'] });
  });

  it('stamps the format version, so what it writes reads back', () => {
    const list = addEntry(valid());
    expect(store.written()[0].v).toBe(1);
    expect(loadLibrary()).toEqual(list);
  });

  it('writes the clock back as the pair it was read from', () => {
    // parseEntry expands [300000, 3000] into the object the PGN writer wants;
    // storing that object again would read back as an untimed game.
    addEntry(valid());
    expect(store.written()[0].control).toEqual([300000, 3000]);
    expect(loadLibrary()[0].control).toEqual({ initial: 300000, increment: 3000 });
  });

  it('refuses to store an entry that is not a game', () => {
    addEntry({ ...valid(), mode: 'nonsense' });
    expect(store.written()).toBe(null);
    expect(loadLibrary()).toEqual([]);
  });

  it('still returns the list when storage refuses to hold it', () => {
    const full = fakeStore();
    full.setItem = () => {
      throw new Error('quota');
    };
    vi.stubGlobal('localStorage', full);
    const list = addEntry(valid());
    expect(list.map((entry) => entry.id)).toEqual(['g1']);
    expect(full.written()).toBe(null);
  });

  it('trims to the cap as games pile up', () => {
    for (let i = 0; i < MAX_GAMES + 5; i++) {
      addEntry({ ...valid(), id: `g${i}`, at: i });
    }
    const loaded = loadLibrary();
    expect(loaded).toHaveLength(MAX_GAMES);
    expect(loaded[0].id).toBe(`g${MAX_GAMES + 4}`);
    expect(loaded.some((entry) => entry.id === 'g0')).toBe(false);
  });
});

describe('clearLibrary', () => {
  it('takes the whole list with it', () => {
    addEntry(valid());
    expect(loadLibrary()).toHaveLength(1);
    clearLibrary();
    expect(loadLibrary()).toEqual([]);
    expect(store.written()).toBe(null);
  });

  it('does nothing where there is no storage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => clearLibrary()).not.toThrow();
  });
});
