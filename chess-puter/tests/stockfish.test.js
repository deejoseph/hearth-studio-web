import { afterEach, describe, expect, it } from 'vitest';
import { Chess } from '../src/engine/chess.js';
import { evaluate } from '../src/engine/ai.js';
import {
  createStockfish,
  parseBestmove,
  parseInfo,
  scoreToCentipawns,
  uciToMove,
} from '../src/engine/stockfish.js';

// Every protocol line here is verbatim output from the vendored engine (a scripted
// run of public/engine/stockfish-19-lite-single.js), not a reconstruction, so a
// change in how it phrases a report fails these tests rather than a player's session.
const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 4';

const DEPTH_1_MPV_1 = 'info depth 1 seldepth 6 multipv 1 score cp 39 nodes 201 nps 33500 hashfull 0 time 6 pv g8f6';
const DEPTH_16_MPV_1 = 'info depth 16 seldepth 23 multipv 1 score cp 14 nodes 750170 nps 568310 hashfull 125 time 1320 pv g8f6 g1e2 c6a5 d2d3 d7d6 b1c3 f8e7 a2a4 c8g4 f3e3';
const DEPTH_16_MPV_2 = 'info depth 16 seldepth 22 multipv 2 score cp 9 nodes 750170 nps 568310 hashfull 125 time 1320 pv d8f6 c2c3 d7d6 d2d3 f6g6 h2h4 h7h5 g1h3 f8e7 h3g5 e7g5 h4g5 g8e7 b1a3';
const DEPTH_16_MPV_3 = 'info depth 16 seldepth 26 multipv 3 score cp 0 nodes 750170 nps 568310 hashfull 125 time 1320 pv f7f5 g1e2 g8f6 b1c3 c6a5 c4d3 d7d5 c3d5 f6d5 e4d5 e5e4 d3e4 f5e4 f3h5 e8d7 h5g4 d7e7 g4h5';
const BESTMOVE = 'bestmove g8f6 ponder g1e2';
const NETWORK_CHATTER = 'info string Network replica 1: Local memory. Shared memory not supported by the OS. Local allocation fallback.';
// The same "mate 1" printed from either side of a back-rank position: White to move
// plays Ra8#, Black to move plays Ra1#. A UCI score always speaks for the mover.
const MATE_1_WHITE = 'info depth 1 seldepth 2 multipv 1 score mate 1 nodes 20 nps 2857 hashfull 0 time 7 pv a1a8';
const MATE_1_BLACK = 'info depth 1 seldepth 2 multipv 1 score mate 1 nodes 20 nps 20000 hashfull 0 time 1 pv a8a1';

describe('parseInfo', () => {
  it('reads a real depth report', () => {
    expect(parseInfo(DEPTH_16_MPV_1)).toEqual({
      depth: 16,
      seldepth: 23,
      multipv: 1,
      score: { type: 'cp', value: 14, bound: null },
      nodes: 750170,
      nps: 568310,
      hashfull: 125,
      timeMs: 1320,
      pv: ['g8f6', 'g1e2', 'c6a5', 'd2d3', 'd7d6', 'b1c3', 'f8e7', 'a2a4', 'c8g4', 'f3e3'],
    });
  });

  it('keeps the three principal variations apart', () => {
    const lines = [DEPTH_16_MPV_1, DEPTH_16_MPV_2, DEPTH_16_MPV_3].map(parseInfo);
    expect(lines.map((l) => l.multipv)).toEqual([1, 2, 3]);
    expect(lines.map((l) => l.score.value)).toEqual([14, 9, 0]);
    expect(lines.map((l) => l.pv[0])).toEqual(['g8f6', 'd8f6', 'f7f5']);
  });

  it('defaults the principal-variation number to one when it is absent', () => {
    // Not this build, which always prints it, but the field is optional in UCI.
    expect(parseInfo(DEPTH_16_MPV_1.replace('multipv 1 ', '')).multipv).toBe(1);
  });

  it('reads a mate score', () => {
    expect(parseInfo(MATE_1_WHITE).score).toEqual({ type: 'mate', value: 1, bound: null });
  });

  it('keeps a bound marker without losing the score', () => {
    const line = DEPTH_16_MPV_1.replace('nodes 750170', 'upperbound nodes 750170');
    const info = parseInfo(line);
    expect(info.score).toEqual({ type: 'cp', value: 14, bound: 'upperbound' });
    expect(info.nodes).toBe(750170);
    expect(info.pv).toHaveLength(10);
  });

  it('returns null for lines that carry no score to plot', () => {
    expect(parseInfo(NETWORK_CHATTER)).toBe(null);
    expect(parseInfo('info currmove g8f6 currmovenumber 1')).toBe(null);
    expect(parseInfo(BESTMOVE)).toBe(null);
    expect(parseInfo('readyok')).toBe(null);
    // A depth report with no score yet has nothing to put on the bar.
    expect(parseInfo('info depth 5 seldepth 9 nodes 10 nps 1000 hashfull 0 time 1 pv e2e4').score).toBe(null);
  });
});

describe('parseBestmove', () => {
  it('reads the move and the expected reply', () => {
    expect(parseBestmove(BESTMOVE)).toEqual({ move: 'g8f6', ponder: 'g1e2' });
  });

  it('reads a search with nothing to ponder on', () => {
    expect(parseBestmove('bestmove a1a8')).toEqual({ move: 'a1a8', ponder: null });
  });

  it('treats the engine playing nothing as no move', () => {
    expect(parseBestmove('bestmove (none)')).toEqual({ move: null, ponder: null });
    expect(parseBestmove('bestmove (none) ponder (none)')).toEqual({ move: null, ponder: null });
  });

  it('returns null for the other protocol lines', () => {
    expect(parseBestmove(DEPTH_16_MPV_1)).toBe(null);
    expect(parseBestmove('bestmove')).toBe(null);
  });
});

describe('uciToMove', () => {
  it('splits a quiet move into the shape game.move() takes', () => {
    expect(uciToMove('g8f6')).toEqual({ from: 'g8', to: 'f6', promotion: null });
  });

  it('keeps the promotion piece', () => {
    expect(uciToMove('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(uciToMove('a7a8n')).toEqual({ from: 'a7', to: 'a8', promotion: 'n' });
  });

  it('rejects anything that is not a coordinate pair', () => {
    for (const bad of ['e2e9', '0000', 'e2e4x', 'e2-e4', 'resign', '', null, 42]) {
      expect(uciToMove(bad)).toBe(null);
    }
  });
});

describe('scoreToCentipawns', () => {
  it('reads a centipawn score for the side to move, not for White', () => {
    const score = parseInfo(DEPTH_16_MPV_1).score;
    // Black is to move here and is better by 14, so White is worse by 14.
    expect(scoreToCentipawns(score, 'b')).toBe(-14);
    expect(scoreToCentipawns(score, 'w')).toBe(14);
  });

  it('saturates a mate, at whichever end of the bar it belongs to', () => {
    // The bar answers "who is winning", and two moves from mate is past its
    // end — so a mate arrives as ten pawns, the unit everything else here is
    // counted in.
    expect(scoreToCentipawns(parseInfo(MATE_1_WHITE).score, 'w')).toBe(1000);
    expect(scoreToCentipawns(parseInfo(MATE_1_BLACK).score, 'b')).toBe(-1000);
  });

  it('counts mate 0 as a win for the mover', () => {
    expect(scoreToCentipawns({ type: 'mate', value: 0 }, 'w')).toBe(1000);
    expect(scoreToCentipawns({ type: 'mate', value: 0 }, 'b')).toBe(-1000);
    expect(scoreToCentipawns({ type: 'mate', value: -3 }, 'b')).toBe(1000);
  });

  it('has no opinion without a score', () => {
    expect(scoreToCentipawns(null, 'w')).toBe(null);
  });

  it('agrees with the built-in evaluation about who stands better', () => {
    // Both engines count centipawns for White, so on a position this lopsided
    // they must not disagree about the direction — which is exactly where a
    // sign convention goes wrong.
    const game = new Chess(ITALIAN);
    expect(game.turn()).toBe('b');
    expect(evaluate(game)).toBeLessThan(0);
    expect(scoreToCentipawns(parseInfo(DEPTH_16_MPV_1).score, game.turn())).toBeLessThan(0);
  });
});

/**
 * The engine's twin. Answers the boot handshake on its own and leaves search
 * output for the test to feed, because what is under test is the order the
 * adapter puts commands in and how it matches answers back to requests.
 */
function installFakeEngine({ autoReady = true } = {}) {
  const instances = [];
  const channels = [];

  class FakeWorker {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.transferred = [];
      this.onmessage = null;
      this.onerror = null;
      this.terminated = false;
      this.port = null;
      instances.push(this);
    }

    postMessage(message, transfer) {
      this.sent.push(message);
      if (transfer) this.transferred.push(transfer);
      if (message && message.progressPort) {
        this.port = message.progressPort;
      } else if (message === 'uci') {
        this.emit('Stockfish 19 Lite WASM by the Stockfish developers (see AUTHORS file)');
        this.emit('option name Threads type spin default 1 min 1 max 1');
        this.emit(NETWORK_CHATTER);
        this.emit('uciok');
      } else if (message === 'isready' && autoReady) {
        this.emit('readyok');
      }
    }

    emit(line) {
      this.onmessage?.({ data: line });
    }

    /** Commands only, so the progress port does not clutter every assertion. */
    get commands() {
      return this.sent.filter((m) => typeof m === 'string');
    }

    terminate() {
      this.terminated = true;
    }
  }

  class FakeMessageChannel {
    constructor() {
      this.port1 = { onmessage: null };
      this.port2 = { fake: true };
      channels.push(this);
    }
  }

  globalThis.Worker = FakeWorker;
  globalThis.MessageChannel = FakeMessageChannel;
  return { instances, channels, restore() { delete globalThis.Worker; delete globalThis.MessageChannel; } };
}

describe('createStockfish', () => {
  let fake = null;

  afterEach(() => {
    fake?.restore();
    fake = null;
  });

  /** Boot a controller and hand back `{api, worker}` with the handshake done. */
  async function booted(options = {}) {
    fake = fake ?? installFakeEngine();
    const promise = createStockfish(options);
    const api = await promise;
    return { api, worker: fake.instances[fake.instances.length - 1] };
  }

  it('negotiates the download-progress port before it asks the engine anything', async () => {
    fake = installFakeEngine();
    const seen = [];
    const { worker } = await booted({ onProgress: (p) => seen.push(p) });
    // The port has to be in the engine's hands before it opens the wasm request,
    // which is the only reason a percentage is available at all.
    expect(worker.sent[0]).toEqual({ progressPort: worker.port });
    expect(worker.transferred[0]).toEqual([worker.port]);
    expect(worker.commands[0]).toBe('setoption name CanOutputEngineDownloadProgress');
    expect(worker.commands[1]).toBe('uci');
    expect(fake.channels).toHaveLength(1);
    // The engine reports on the port rather than the worker channel.
    fake.channels[0].port1.onmessage({ data: { loaded: 922880, total: 1845971, percent: 0.5 } });
    expect(seen).toEqual([{ loaded: 922880, total: 1845971, percent: 0.5 }]);
  });

  it('holds the boot open until uciok and readyok have both arrived', async () => {
    fake = installFakeEngine({ autoReady: false });
    let usable = false;
    const promise = createStockfish().then(() => {
      usable = true;
    });
    const worker = fake.instances[0];
    // No progress callback, so no handshake: the player only ever waits on UCI.
    expect(worker.commands).toEqual(['uci', 'setoption name Hash value 32', 'isready']);
    await Promise.resolve();
    expect(usable).toBe(false);
    worker.emit('readyok');
    await promise;
    expect(usable).toBe(true);
  });

  it('resolves a search with the deepest report for each principal variation', async () => {
    const { api, worker } = await booted();
    const streamed = [];
    const promise = api.analyze({
      fen: ITALIAN,
      movetime: 300,
      multipv: 3,
      onInfo: (info) => streamed.push(info.depth),
    });

    expect(worker.commands.slice(-3)).toEqual([
      'setoption name MultiPV value 3',
      `position fen ${ITALIAN}`,
      'go movetime 300',
    ]);
    worker.emit(DEPTH_1_MPV_1);
    worker.emit(DEPTH_16_MPV_1);
    worker.emit(DEPTH_16_MPV_2);
    worker.emit(DEPTH_16_MPV_3);
    worker.emit(NETWORK_CHATTER);
    worker.emit(BESTMOVE);

    const result = await promise;
    expect(result.fen).toBe(ITALIAN);
    expect(result.bestmove).toBe('g8f6');
    expect(result.ponder).toBe('g1e2');
    expect(result.lines.map((l) => [l.multipv, l.depth])).toEqual([[1, 16], [2, 16], [3, 16]]);
    // Chatter has no depth, so the bar is never fed a blank report.
    expect(streamed).toEqual([1, 16, 16, 16]);
  });

  it('asks for a depth-bounded search when the caller names a depth', async () => {
    const { api, worker } = await booted();
    const promise = api.analyze({ fen: ITALIAN, depth: 20 });
    expect(worker.commands.slice(-1)).toEqual(['go depth 20']);
    worker.emit(BESTMOVE);
    await promise;
  });

  it('sets the principal-variation count only when it changes', async () => {
    const { api, worker } = await booted();
    const first = api.analyze({ fen: ITALIAN, movetime: 300, multipv: 3 });
    worker.emit(BESTMOVE);
    await first;

    const before = worker.commands.length;
    const second = api.analyze({ fen: ITALIAN, movetime: 300, multipv: 3 });
    expect(worker.commands.slice(before)).toEqual([`position fen ${ITALIAN}`, 'go movetime 300']);
    worker.emit(BESTMOVE);
    await second;
  });

  it('interrupts a running search and starts the new position once it answers', async () => {
    const { api, worker } = await booted();
    const first = api.analyze({ fen: ITALIAN, movetime: 3000 });
    worker.emit(DEPTH_1_MPV_1);
    const second = api.analyze({ fen: 'other-fen', movetime: 300 });
    expect(worker.commands.slice(-1)).toEqual(['stop']);

    // The engine still has to finish answering the position it was given.
    worker.emit('bestmove g8f6');
    const firstResult = await first;
    expect(firstResult.lines.map((l) => l.depth)).toEqual([1]);
    expect(firstResult.bestmove).toBe('g8f6');

    expect(worker.commands.slice(-2)).toEqual(['position fen other-fen', 'go movetime 300']);
    worker.emit(BESTMOVE);
    expect((await second).fen).toBe('other-fen');
  });

  it('drops a position the player has already stepped past', async () => {
    const { api, worker } = await booted();
    const running = api.analyze({ fen: 'a', movetime: 3000 });
    const stale = api.analyze({ fen: 'b', movetime: 300 });
    const newest = api.analyze({ fen: 'c', movetime: 300 });
    // Only one search may run at a time, so without this the engine would work
    // through every ply skipped while an arrow key was held down, falling further
    // behind the board with each one.
    await expect(stale).rejects.toMatchObject({ reason: 'superseded' });
    worker.emit(BESTMOVE);
    await running;
    expect(worker.commands).not.toContain('position fen b');
    expect(worker.commands).toContain('position fen c');
    worker.emit(BESTMOVE);
    expect((await newest).fen).toBe('c');
  });

  it('leaves a search pending until the engine answers', async () => {
    const { api, worker } = await booted();
    let done = false;
    const promise = api.analyze({ fen: ITALIAN, movetime: 300 }).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    worker.emit(BESTMOVE);
    await promise;
    expect(done).toBe(true);
  });

  it('closes down without leaving the caller waiting', async () => {
    const { api, worker } = await booted();
    const running = api.analyze({ fen: ITALIAN, movetime: 3000 });
    const queued = api.analyze({ fen: ITALIAN, movetime: 300 });
    api.dispose();
    await expect(running).rejects.toMatchObject({ reason: 'disposed' });
    await expect(queued).rejects.toMatchObject({ reason: 'disposed' });
    expect(worker.terminated).toBe(true);
    await expect(api.analyze({ fen: ITALIAN })).rejects.toMatchObject({ reason: 'disposed' });
  });

  it('fails the boot when the worker is refused, and closes the worker it made', async () => {
    // Held open so the error genuinely arrives during the boot, as it does in a
    // browser, rather than after the engine has already reported itself usable.
    fake = installFakeEngine({ autoReady: false });
    const promise = createStockfish();
    const worker = fake.instances[0];
    // A Worker blocked by content security, a missing engine file, and a wasm
    // response with the wrong MIME type all report themselves this way.
    worker.onerror({ message: "Incorrect response MIME type. Expected 'application/wasm'" });
    await expect(promise).rejects.toMatchObject({ reason: 'worker-error' });
    expect(worker.terminated).toBe(true);
  });

  it('routes the failure to onError so the caller can fall back without a message', async () => {
    fake = installFakeEngine({ autoReady: false });
    let reported = null;
    const promise = createStockfish({ onError: (e) => (reported = e) });
    fake.instances[0].onerror({ message: 'denied' });
    await expect(promise).rejects.toMatchObject({ reason: 'worker-error' });
    expect(reported).toMatchObject({ reason: 'worker-error' });
  });
});
