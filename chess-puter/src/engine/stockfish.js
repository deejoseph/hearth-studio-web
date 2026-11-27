/**
 * Stockfish 19 (lite, single-threaded) as an analysis engine.
 *
 * The engine itself is the vendored GPL build in public/engine/, driven over UCI
 * inside a Worker so a search never blocks painting the board. This module turns
 * that line protocol into promises: `analyze({fen})` resolves with the lines the
 * engine reported plus its chosen move, and a request made while a search is
 * running stops that search and waits its turn — which is what lets the review
 * controls re-evaluate on every ply change without piling work up.
 *
 * Nothing here loads the engine until `createStockfish` is called, because the
 * wasm is 1,845,971 bytes and takes 10-20 seconds on this site's connection.
 * A rejected `ready` means "no analysis available", and the caller keeps the
 * built-in engine; it is never a message to show the player.
 *
 * The build is npm `stockfish@19.0.1` (nmrugg/stockfish.js, GPLv3), vendored
 * byte-for-byte as loader sha256 ccb130d7… and module sha256 ee4f115b…; the
 * license text and the upstream source URL travel in public/engine/ next to
 * them. Their names carry the version, so upgrading means renaming, which is
 * what makes the year-long cache in public/.htaccess safe.
 */

const BASE = import.meta.env?.BASE_URL ?? './';
export const ENGINE_SCRIPT = `${BASE}engine/stockfish-19-lite-single.js`;

// Asking for this bare string is a handshake rather than a UCI command: the
// engine's own message handler intercepts it and answers with
// "info WillOutputEngineDownloadProgress". Appending " value true" sends it to
// the UCI parser instead, which knows no such option.
const PROGRESS_HANDSHAKE = 'setoption name CanOutputEngineDownloadProgress';

// The lite single-threaded build caps Threads at 1 (min 1, max 1) so there is
// nothing to choose there; the hash is the only option worth setting.
const DEFAULT_HASH_MB = 32;
// Bounded by time, not depth: depth 16 with three lines took 607ms on this
// machine, too slow to repeat on every keystroke of a review, while a fixed
// slice reaches a useful depth on ordinary positions and stays responsive.
const DEFAULT_MOVETIME_MS = 300;
const DEFAULT_MULTIPV = 3;
const BOOT_TIMEOUT_MS = 120000;

const UCIMOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

function intAfter(line, key, fallback = 0) {
  const m = new RegExp(`(?:^|\\s)${key} (-?\\d+)(?:\\s|$)`).exec(line);
  return m ? Number(m[1]) : fallback;
}

/**
 * One depth report from a search, or null for anything else — which covers the
 * `info string` chatter, `info currmove` progress, and the download-progress
 * acknowledgement, none of which carry a score to plot.
 */
export function parseInfo(line) {
  if (!line.startsWith('info depth ')) return null;
  const score = / score (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?/.exec(line);
  const pv = / pv (.+)$/.exec(line);
  return {
    depth: intAfter(line, 'depth'),
    seldepth: intAfter(line, 'seldepth'),
    // Absent means a single line, which is what Stockfish prints by default.
    multipv: intAfter(line, 'multipv', 1),
    score: score ? { type: score[1], value: Number(score[2]), bound: score[3] ?? null } : null,
    nodes: intAfter(line, 'nodes'),
    nps: intAfter(line, 'nps'),
    hashfull: intAfter(line, 'hashfull'),
    timeMs: intAfter(line, 'time'),
    pv: pv ? pv[1].trim().split(/\s+/).filter((token) => UCIMOVE.test(token)) : [],
  };
}

/** The line that ends a search, or null if this is not one. */
export function parseBestmove(line) {
  const m = /^bestmove (\S+)(?: ponder (\S+))?$/.exec(line);
  if (!m) return null;
  return {
    move: m[1] === '(none)' ? null : m[1],
    ponder: m[2] && m[2] !== '(none)' ? m[2] : null,
  };
}

/** `e7e8q` -> the shape game.move() takes. Only promotions run to five tokens. */
export function uciToMove(uci) {
  if (typeof uci !== 'string' || !UCIMOVE.test(uci)) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? null };
}

/**
 * centipawns from White's point of view, for an evaluation bar.
 *
 * UCI scores are already negated for the side to move, so a "cp 20" printed where
 * Black is to play means Black is better. Reading it as White's score would flip
 * the bar on every alternate ply. A mate score saturates, because the bar answers
 * "who is winning" and four moves from mate is already past its end — and it
 * saturates at the value below, ten pawns, which is the same unit as everything
 * else this function returns. The app counts centipawns throughout: so does the
 * engine, and so does `evaluate()` in ai.js.
 */
export function scoreToCentipawns(score, turn, mateValue = 1000) {
  if (!score || score.value === null || score.value === undefined) return null;
  const sign = turn === 'w' ? 1 : -1;
  // "mate 0" is the mover delivering mate with its next move, so it counts for
  // that side rather than as an even position.
  return sign * (score.type === 'mate' ? (score.value >= 0 ? mateValue : -mateValue) : score.value);
}

/**
 * Start the engine and hand back a controller. The returned promise settles only
 * after `uciok` and `readyok`, so the first analysis cannot race the boot.
 *
 * `onProgress` receives `{loaded, total, percent}` while the wasm downloads. It
 * is a courtesy, not a guarantee: the engine needs the MessagePort before it
 * opens the request, so a caller that arrives late simply shows an indeterminate
 * spinner instead of a percentage.
 */
export function createStockfish({ onProgress, onError, hashMb = DEFAULT_HASH_MB } = {}) {
  if (typeof Worker === 'undefined') {
    return Promise.reject(Object.assign(new Error('Workers are unavailable'), { reason: 'no-worker' }));
  }

  let worker;
  try {
    worker = new Worker(ENGINE_SCRIPT);
  } catch (e) {
    return Promise.reject(Object.assign(e, { reason: 'worker-blocked' }));
  }

  let disposed = false;
  let booted = false;
  let searching = false;
  let activeMultipv = null;
  // The search the engine is answering: last report per line, kept so the
  // result is the deepest reading of each even when the caller stopped early.
  let current = null;
  const waiting = [];
  let bootReject = null;
  let bootTimer = null;

  const rejectAll = (error) => {
    const pending = current;
    current = null;
    searching = false;
    const rest = waiting.splice(0);
    clearTimeout(bootTimer);
    const rejectBoot = bootReject;
    bootReject = null;
    if (rejectBoot) rejectBoot(error);
    if (pending) pending.reject(error);
    for (const item of rest) item.reject(error);
  };

  worker.onmessage = (event) => {
    const line = typeof event.data === 'string' ? event.data.trim() : '';
    if (!booted) return;

    if (line.startsWith('info depth ')) {
      const info = parseInfo(line);
      if (!info || !current) return;
      current.lines.set(info.multipv, info);
      if (current.onInfo) current.onInfo(info);
      return;
    }

    const best = parseBestmove(line);
    if (!best || !current) return;
    const done = current;
    current = null;
    searching = false;
    done.resolve({
      fen: done.fen,
      multipv: done.multipv,
      bestmove: best.move,
      ponder: best.ponder,
      lines: [...done.lines.values()].sort((a, b) => a.multipv - b.multipv),
    });
    if (waiting.length) start(waiting.shift());
  };

  worker.onerror = (event) => {
    // A Worker refused by content security, a missing file, and a wasm response
    // with the wrong MIME type all surface here instead of as a protocol stall.
    const error = event?.error ?? new Error(event?.message ?? 'engine worker failed');
    if (!error.reason) error.reason = 'worker-error';
    rejectAll(error);
  };

  const send = (cmd) => {
    if (!disposed) worker.postMessage(cmd);
  };

  function start(request) {
    current = request;
    searching = true;
    if (request.multipv !== activeMultipv) {
      send(`setoption name MultiPV value ${request.multipv}`);
      activeMultipv = request.multipv;
    }
    send(`position fen ${request.fen}`);
    send(request.movetime ? `go movetime ${request.movetime}` : `go depth ${request.depth}`);
  }

  const ready = new Promise((resolve, reject) => {
    bootReject = reject;
    const timer = setTimeout(() => {
      const error = Object.assign(new Error('engine did not answer'), { reason: 'boot-timeout' });
      rejectAll(error);
    }, BOOT_TIMEOUT_MS);
    bootTimer = timer;

    const unboot = worker.onmessage;
    worker.onmessage = (event) => {
      const line = typeof event.data === 'string' ? event.data.trim() : '';
      if (line === 'uciok') {
        send(`setoption name Hash value ${hashMb}`);
        send('isready');
      } else if (line === 'readyok') {
        booted = true;
        clearTimeout(timer);
        bootReject = null;
        worker.onmessage = unboot;
        resolve();
      }
    };

    if (onProgress) {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => onProgress(event.data);
      worker.postMessage({ progressPort: channel.port2 }, [channel.port2]);
      send(PROGRESS_HANDSHAKE);
    }
    send('uci');
  });

  return ready.then(() => ({
    /**
     * Analyze one position. `onInfo` sees each depth report as it arrives so the
     * bar can move while the search deepens; the promise settles with the deepest
     * report per line and the move the engine chose.
     */
    analyze({ fen, depth, movetime = depth ? null : DEFAULT_MOVETIME_MS, multipv = DEFAULT_MULTIPV, onInfo }) {
      if (disposed) {
        return Promise.reject(Object.assign(new Error('engine closed'), { reason: 'disposed' }));
      }
      const request = { fen, depth, movetime, multipv, onInfo, lines: new Map() };
      return new Promise((resolve, reject) => {
        request.resolve = resolve;
        request.reject = reject;
        if (!searching) {
          start(request);
          return;
        }
        // Only one search can be in flight, since the engine answers about the
        // position it was last told about. Anything still queued is a position
        // the player has already stepped past, so it is dropped rather than run:
        // holding down an arrow key would otherwise leave the engine working
        // through stale plies and falling further behind the board.
        for (const stale of waiting.splice(0)) {
          stale.reject(Object.assign(new Error('superseded'), { reason: 'superseded' }));
        }
        waiting.push(request);
        send('stop');
      });
    },

    /** End the running search early; its result is delivered, not thrown away. */
    stop() {
      if (searching) send('stop');
    },

    dispose() {
      disposed = true;
      rejectAll(Object.assign(new Error('engine closed'), { reason: 'disposed' }));
      worker.terminate();
    },
  })).catch((error) => {
    // Nothing is left running once the caller is told the engine is unavailable.
    disposed = true;
    worker.terminate();
    if (onError) onError(error);
    throw error;
  });
}
