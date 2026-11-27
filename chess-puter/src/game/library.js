/**
 * The game library: every game this board saw through to its end, kept on the
 * device so a whole session can be handed to another program in one file
 * instead of exported one game at a time.
 *
 * What is stored is precisely what src/game/pgn.js needs to write the
 * scoresheet back out — the SAN list, the result, the two names, the clock
 * settings — so an export never depends on the board still holding the game.
 * The names stay in their PGN (English) form for the same reason: they are
 * scoresheet notation, not interface text.
 *
 * The list is capped, and what falls off the end is the oldest game. Sixty
 * long games is a few hundred kilobytes, and a player who needs an older one
 * should have exported it while it was on screen.
 *
 * Server sync: when the player is logged in, games are also stored on the
 * server. syncFromServer() pulls the server list and merges it into
 * localStorage; pushToServer() and deleteFromServer() write changes back.
 */

import { call } from '../net/auth.js';

const KEY = 'chess-library';
const FORMAT = 1;

/**
 * How many finished games are kept. index.html states this number to the
 * player in the 棋谱库 note, so change both.
 */
export const MAX_GAMES = 60;
/** The same ceiling a game in progress has (see persistence.js). */
const MAX_PLIES = 1000;

const MODES = ['computer', 'local', 'online'];
const RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];

/** localStorage, or null where it is unavailable (private mode, denied). */
function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    // Reading the property itself throws when storage is blocked by policy.
    return null;
  }
}

function isMs(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** `[initial, increment]` back into the object timeControlTag wants. */
function parseControl(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [initial, increment] = value;
  if (!isMs(initial) || !isMs(increment)) return null;
  return { initial, increment };
}

/**
 * Validate one decoded entry, returning a normalized copy or null for anything
 * unusable — an entry from another version, hand-edited storage, a shape that
 * does not fit. A bad entry is dropped rather than failing the whole list, so
 * one corrupt row cannot take the library away.
 *
 * The SAN strings are not checked against an engine: they were legal when the
 * game ended, and re-deriving them would need the board that made them.
 */
export function parseEntry(data) {
  if (!data || typeof data !== 'object' || data.v !== FORMAT) return null;
  if (typeof data.id !== 'string' || data.id === '' || data.id.length > 40) return null;
  if (!Number.isFinite(data.at) || data.at <= 0) return null;
  if (!MODES.includes(data.mode)) return null;
  if (!RESULTS.includes(data.result)) return null;
  if (typeof data.white !== 'string' || data.white.length > 120) return null;
  if (typeof data.black !== 'string' || data.black.length > 120) return null;
  if (typeof data.termination !== 'string' || data.termination.length > 24) return null;
  if (!Array.isArray(data.sans) || data.sans.length === 0) return null;
  if (data.sans.length > MAX_PLIES) return null;

  for (const san of data.sans) {
    if (typeof san !== 'string' || san === '' || san.length > 12) return null;
  }

  return {
    id: data.id,
    at: Math.round(data.at),
    mode: data.mode,
    // Only a computer game has one, and the label is looked up in LEVELS when
    // the row is drawn, so an unrecognised value is a missing caption rather
    // than a dropped game.
    level: typeof data.level === 'string' && data.level.length <= 12 ? data.level : null,
    sans: data.sans.slice(),
    result: data.result,
    white: data.white,
    black: data.black,
    control: parseControl(data.control),
    termination: data.termination,
  };
}

/**
 * An entry read back by parseEntry, put into the form storage holds: the
 * version tag it does not carry, and the clock as the pair it was read from.
 */
function storedForm(entry) {
  const { control, ...rest } = entry;
  return {
    v: FORMAT,
    ...rest,
    control: control ? [control.initial, control.increment] : null,
  };
}

/** Every kept game, newest first. An empty list when there is none. */
export function loadLibrary() {
  const store = storage();
  if (!store) return [];
  let data;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return [];
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const entries = [];
  for (const item of data) {
    const parsed = parseEntry(item);
    if (parsed) entries.push(parsed);
  }
  // Sorted rather than assumed: an entry is keyed by the moment the game ended,
  // and a tab restored from the background can add one out of order.
  entries.sort((a, b) => b.at - a.at);
  return entries.slice(0, MAX_GAMES);
}

/**
 * Record a finished game. Returns the library as it now stands, whether or not
 * writing it down worked.
 *
 * @param {{id: string, at: number, mode: string, level?: string|null,
 *          sans: string[], result: string, white: string, black: string,
 *          control: {initial: number, increment: number}|null,
 *          termination: string}} entry
 */
export function addEntry(entry) {
  const parsed = parseEntry({ ...entry, v: FORMAT });
  if (!parsed) return loadLibrary();

  const next = [parsed, ...loadLibrary().filter((e) => e.id !== parsed.id)].slice(0, MAX_GAMES);
  const store = storage();
  if (!store) return next;
  try {
    store.setItem(KEY, JSON.stringify(next.map(storedForm)));
  } catch {
    // Full or unavailable storage: the game still happened and is still on the
    // board to export. Never worth interrupting play over.
  }
  return next;
}

/** Drop the library. Used when a player starts over on a shared device. */
export function clearLibrary() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(KEY);
  } catch {
    // Nothing else to try.
  }
}

// --- Server sync ---

/**
 * Pull the server list and merge it into localStorage. Games are merged by
 * game_id: a game already present is updated (server wins), a new game is
 * appended. The merged list is then capped to MAX_GAMES.
 *
 * Returns the merged list, or the current localStorage list if the server
 * call fails (offline, not logged in, etc). Never throws.
 */
export async function syncFromServer() {
  const reply = await call('chess_library_list.php', { method: 'GET' });
  if (!reply.ok || !Array.isArray(reply.games)) {
    return loadLibrary();
  }

  const serverGames = reply.games.map(parseEntry).filter(Boolean);
  const localGames = loadLibrary();

  // Merge: server wins on conflict (same game_id)
  const byId = new Map();
  for (const game of localGames) {
    byId.set(game.id, game);
  }
  for (const game of serverGames) {
    byId.set(game.id, game);
  }

  const merged = Array.from(byId.values())
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_GAMES);

  // Write back to localStorage
  const store = storage();
  if (store) {
    try {
      store.setItem(KEY, JSON.stringify(merged.map(storedForm)));
    } catch {
      // Storage full or unavailable: the merge is still in memory
    }
  }

  return merged;
}

/**
 * Push one game to the server. Called after addEntry() when logged in.
 * Returns true on success, false on failure. Never throws.
 */
export async function pushToServer(entry) {
  const parsed = parseEntry({ ...entry, v: FORMAT });
  if (!parsed) return false;

  const reply = await call('chess_library_save.php', { body: parsed });
  return reply.ok === true;
}

/**
 * Delete one game from the server. Called after removing a game from
 * localStorage. Returns true on success, false on failure. Never throws.
 */
export async function deleteFromServer(gameId) {
  if (typeof gameId !== 'string' || gameId === '') return false;

  const reply = await call('chess_library_delete.php', { body: { id: gameId } });
  return reply.ok === true;
}
