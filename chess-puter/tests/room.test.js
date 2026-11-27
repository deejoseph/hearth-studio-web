import { describe, expect, it, vi } from 'vitest';
import { API_BASE } from '../src/net/auth.js';
import {
  POLL_MS,
  ROOM_MAX_TIME_MS,
  RoomGame,
  makeRoomApi,
  normalizeCode,
} from '../src/net/room.js';

/** A room as chess_room_public.php sends it, minus nothing the board reads. */
function room(over = {}) {
  return {
    code: 'ABCDEF',
    status: 'active',
    result: null,
    result_text: null,
    winner: null,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    turn: 'w',
    you: 'w',
    seq: 0,
    time_ms: 600000,
    clock: { w: 600000, b: 600000 },
    flagged: false,
    server_now_ms: 1763888400000,
    players: { w: { id: 7, nickname: 'Joe' }, b: { id: 8, nickname: 'Ann' } },
    ...over,
  };
}

/** One recorded move, as chess_room_events returns it: `played_by` is the
 *  player’s id and `played_at` the row’s DATETIME, neither of which the board
 *  reads — it plays from the SAN and checks the FEN. */
function played(seq, san, over = {}) {
  return {
    seq,
    san,
    fen_after: 'fen',
    played_by: 7,
    played_at: '2026-11-23 09:00:00',
    ...over,
  };
}

/** An api that answers from a queue per endpoint and records what it was asked.
 *  The last scripted reply repeats, so a test only lists what it cares about. */
function scriptedApi(replies = {}) {
  const calls = [];
  const ask = (name) => async (...args) => {
    calls.push({ name, args });
    const queue = replies[name] ?? [];
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next === undefined) throw new Error(`nothing scripted for ${name}`);
    return typeof next === 'function' ? next(...args) : next;
  };
  const api = { calls };
  for (const name of [
    'create',
    'join',
    'move',
    'poll',
    'resign',
    'offerDraw',
    'answerDraw',
    'settle',
  ]) {
    api[name] = ask(name);
  }
  return api;
}

/** What the board was told, in order. */
function watcher() {
  const seen = { snapshots: [], problems: [], order: [] };
  return {
    ...seen,
    onSnapshot: (snap, fresh) => {
      seen.order.push('snapshot');
      seen.snapshots.push({ snap, fresh });
    },
    onError: (reply) => {
      seen.order.push('error');
      seen.problems.push(reply);
    },
  };
}

/** A fetch that answers with fixed JSON and records what it was asked for. */
function recordingFetch(reply = { ok: true }, status = 200) {
  const calls = [];
  const fn = vi.fn(async (url, init) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 400,
      status,
      json: async () => reply,
    };
  });
  return { fn, calls };
}

describe('what a room code is', () => {
  it('takes a code however it was typed', () => {
    expect(normalizeCode('ABCDEF')).toBe('ABCDEF');
    expect(normalizeCode('hytlvp')).toBe('HYTLVP');
    expect(normalizeCode('  ab cd ef  ')).toBe('ABCDEF');
    expect(normalizeCode('A\tB\nCDEF')).toBe('ABCDEF');
  });

  it('finds the code inside the invite link we hand out', () => {
    expect(normalizeCode('#g=QWERTY')).toBe('QWERTY');
    expect(normalizeCode('https://www.ichessgeek.com/chess/#g=QWERTY')).toBe('QWERTY');
    expect(normalizeCode('here you go #g=QWERTY join when free')).toBe('QWERTY');
    expect(normalizeCode('#g=qwerty&from=chat')).toBe('QWERTY');
    expect(normalizeCode('#g=%51%57%45%52%54%59')).toBe('QWERTY');
  });

  it('refuses anything that is not six characters', () => {
    for (const raw of ['ABC', 'ABCDEFG', ' ', '', null, undefined, '#g=AB']) {
      expect(normalizeCode(raw)).toBe('');
    }
  });

  it('takes a stray percent sign as a wrong code rather than a crash', () => {
    // The join box is free text, and decodeURIComponent throws on '%ZZ'. A
    // throw here would eat the form's reply and leave the player staring at
    // a button that does nothing. Which characters a code may use is the
    // server's rule; this only has to hand over six of them without dying.
    expect(() => normalizeCode('#g=50%off')).not.toThrow();
    expect(() => normalizeCode('#g=%')).not.toThrow();
    expect(normalizeCode('#g=%')).toBe('');
  });
});

describe('what each call asks the server for', () => {
  it('sends the seat and the clock when there is a clock', async () => {
    const { fn, calls } = recordingFetch({ ok: true, room: room() });
    await makeRoomApi({ fetchImpl: fn }).create({ color: 'b', timeMs: 300000 });
    expect(calls[0].url).toBe(`${API_BASE}chess_room_create.php`);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.credentials).toBe('same-origin');
    expect(JSON.parse(calls[0].init.body)).toEqual({ color: 'b', time_ms: 300000 });
  });

  it('sends no clock for a pick the server has no equivalent for', async () => {
    const { fn, calls } = recordingFetch({ ok: true, room: room() });
    await makeRoomApi({ fetchImpl: fn }).create({ color: 'random', timeMs: null });
    // 0 would be read as a game that ends before the first move; leaving the
    // field out is what asks for the referee's own default.
    expect(JSON.parse(calls[0].init.body)).toEqual({ color: 'random' });
  });

  it('reads what happened with a GET and everything in the query', async () => {
    const { fn, calls } = recordingFetch({ ok: true, room: room(), events: [] });
    await makeRoomApi({ fetchImpl: fn }).poll('ABCDEF', 12);
    expect(calls[0].url).toBe(
      `${API_BASE}chess_room_poll.php?code=ABCDEF&since=12`,
    );
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
    expect(calls[0].init.headers).toBeUndefined();
  });

  it('posts the code with the three calls that only need it', async () => {
    const { fn, calls } = recordingFetch({ ok: true, room: room() });
    const api = makeRoomApi({ fetchImpl: fn });
    await api.join('ABCDEF');
    await api.resign('ABCDEF');
    await api.settle('ABCDEF');
    expect(calls.map((c) => c.url)).toEqual([
      `${API_BASE}chess_room_join.php`,
      `${API_BASE}chess_room_resign.php`,
      `${API_BASE}chess_room_close.php`,
    ]);
    for (const c of calls) {
      expect(c.init.method).toBe('POST');
      expect(JSON.parse(c.init.body)).toEqual({ code: 'ABCDEF' });
    }
  });

  it('sends a move as the SAN the referee asked for', async () => {
    const { fn, calls } = recordingFetch({ ok: true, room: room() });
    await makeRoomApi({ fetchImpl: fn }).move('ABCDEF', 'Nf3');
    expect(JSON.parse(calls[0].init.body)).toEqual({ code: 'ABCDEF', san: 'Nf3' });
  });

  it('offers a draw with only the code and answers it with a real boolean', async () => {
    const { fn, calls } = recordingFetch({ ok: true, room: room() });
    const api = makeRoomApi({ fetchImpl: fn });
    await api.offerDraw('ABCDEF');
    await api.answerDraw('ABCDEF', true);
    await api.answerDraw('ABCDEF', false);
    expect(calls.map((c) => c.url)).toEqual([
      `${API_BASE}chess_room_draw_offer.php`,
      `${API_BASE}chess_room_draw_answer.php`,
      `${API_BASE}chess_room_draw_answer.php`,
    ]);
    expect(JSON.parse(calls[0].init.body)).toEqual({ code: 'ABCDEF' });
    // The endpoint reads accept as a JSON boolean and refuses strings rather
    // than guess, because the answer settles the game.
    expect(JSON.parse(calls[1].init.body)).toEqual({ code: 'ABCDEF', accept: true });
    expect(JSON.parse(calls[2].init.body)).toEqual({ code: 'ABCDEF', accept: false });
  });
});

describe('the cursor over the server’s event list', () => {
  it('asks each time for what it has not seen yet', async () => {
    const api = scriptedApi({
      join: [{ ok: true, room: room({ seq: 2 }), events: [played(1, 'e4'), played(2, 'e5')] }],
      poll: [{ ok: true, room: room({ seq: 3 }), events: [played(3, 'Nf3')] }],
    });
    const game = new RoomGame({ api });
    await game.join('ABCDEF');
    expect(game.seqSeen()).toBe(2);
    await game.poll();
    expect(api.calls[1].args).toEqual(['ABCDEF', 2]);
    expect(game.seqSeen()).toBe(3);
    // and it is the cursor, not a caller-supplied number, that the next poll uses
    await game.poll();
    expect(api.calls[2].args).toEqual(['ABCDEF', 3]);
  });

  it('hands over only the moves that are new', async () => {
    const api = scriptedApi({
      join: [{ ok: true, room: room(), events: [] }],
      poll: [
        { ok: true, room: room({ seq: 2 }), events: [played(1, 'e4'), played(2, 'e5')] },
        { ok: true, room: room({ seq: 3 }), events: [played(2, 'e5'), played(3, 'Nf3')] },
      ],
    });
    const seen = watcher();
    const game = new RoomGame({ api, ...seen });
    await game.join('ABCDEF');
    await game.poll();
    await game.poll();
    expect(seen.snapshots.map((s) => s.fresh.map((e) => e.san))).toEqual([
      [],
      ['e4', 'e5'],
      ['Nf3'],
    ]);
    expect(game.events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('presents the new moves oldest first, as the game has to be replayed', async () => {
    const api = scriptedApi({
      join: [
        {
          ok: true,
          room: room({ seq: 2 }),
          events: [played(2, 'e5'), played(1, 'e4')],
        },
      ],
    });
    const seen = watcher();
    await new RoomGame({ api, ...seen }).join('ABCDEF');
    expect(seen.snapshots[0].fresh.map((e) => e.san)).toEqual(['e4', 'e5']);
  });

  it('takes the one move out of a reply that carries it', async () => {
    const api = scriptedApi({
      join: [{ ok: true, room: room(), events: [] }],
      move: [
        { ok: true, room: room({ seq: 1, turn: 'b' }), event: played(1, 'e4') },
      ],
    });
    const seen = watcher();
    const game = new RoomGame({ api, ...seen });
    await game.join('ABCDEF');
    await game.move('e4');
    expect(game.seqSeen()).toBe(1);
    expect(seen.snapshots[1].fresh.map((e) => e.san)).toEqual(['e4']);
  });

  it('asks nothing once the room is forgotten', async () => {
    const api = scriptedApi({
      join: [{ ok: true, room: room(), events: [] }],
      poll: [{ ok: true, room: room(), events: [] }],
    });
    const game = new RoomGame({ api });
    await game.join('ABCDEF');
    game.reset();
    expect(game.code).toBe(null);
    expect(await game.poll()).toBe(null);
    expect(api.calls.map((c) => c.name)).toEqual(['join']);
  });

  it('drops the answer of a poll that was still out when the room was left', async () => {
    // 【离开】 stops the asking and forgets the code, but a request already on
    // its way still comes back. Adopting it would hand the board a room row and
    // sit the player down at the game they just left — which is what makes the
    // first 离开 look like it did nothing.
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const answered = { ok: true, room: room({ seq: 1 }), events: [played(1, 'e4')] };
    const api = scriptedApi({
      join: [{ ok: true, room: room(), events: [] }],
      poll: [gate.then(() => answered)],
    });
    const seen = watcher();
    const game = new RoomGame({ api, ...seen });
    await game.join('ABCDEF');
    const polling = game.poll();
    game.reset();
    release(answered);
    await polling;
    expect(seen.snapshots).toHaveLength(1); // only the join ever reached the board
    expect(game.room).toBe(null);
    expect(game.code).toBe(null);
  });

  it('drops the answer of a move that came back after the room was left', async () => {
    // Same race on the other call, and worse if it is a refusal: the board would
    // be told its move failed in a game it is no longer playing.
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const api = scriptedApi({
      join: [{ ok: true, room: room(), events: [] }],
      move: [gate.then(() => ({ ok: false, code: 'not_room_member', message: '你不在这个房间里' }))],
    });
    const seen = watcher();
    const game = new RoomGame({ api, ...seen });
    await game.join('ABCDEF');
    const sending = game.move('e4');
    game.reset();
    release({ ok: false, code: 'not_room_member', message: '你不在这个房间里' });
    const reply = await sending;
    expect(seen.order).toEqual(['snapshot']);
    expect(reply.ok).toBe(false); // the caller still gets the reply it asked for
  });

  it('starts a fresh event list at the next room', async () => {
    const api = scriptedApi({
      create: [
        {
          ok: true,
          room: room({ code: 'ZZZZZZ', seq: 2 }),
          events: [played(1, 'e4'), played(2, 'e5')],
        },
      ],
      join: [{ ok: true, room: room({ seq: 1 }), events: [played(1, 'd5')] }],
    });
    const game = new RoomGame({ api });
    await game.create({ color: 'w', timeMs: 600000 });
    expect(game.code).toBe('ZZZZZZ');
    expect(game.seqSeen()).toBe(2);
    await game.join('ABCDEF');
    // Another room numbers its moves from 1 again, so carrying the old cursor
    // over would ask for the wrong half of the new game.
    expect(game.code).toBe('ABCDEF');
    expect(game.events.map((e) => e.san)).toEqual(['d5']);
  });
});

describe('a reply that says no', () => {
  it('corrects the board before anyone is told the move did not land', async () => {
    // chess_room_move answers a flagged clock or a stale seq with the room as
    // it now stands — the answer to "why not" is "look". The board has to see
    // that room first, or it rewinds its guess against the wrong position.
    const wrong = room({ seq: 4, turn: 'b', flagged: true });
    const api = scriptedApi({
      join: [{ ok: true, room: room(), events: [] }],
      move: [{ ok: false, code: 'flagged', message: '钟走完了', room: wrong }],
    });
    const seen = watcher();
    const game = new RoomGame({ api, ...seen });
    await game.join('ABCDEF');
    const reply = await game.move('e5');
    expect(seen.order).toEqual(['snapshot', 'snapshot', 'error']);
    expect(seen.snapshots[1].snap).toBe(wrong);
    expect(game.room.seq).toBe(4);
    expect(reply.ok).toBe(false);
    expect(reply.code).toBe('flagged'); // the caller branches on this, not on the sentence
  });

  it('leaves the position alone when the refusal had nothing to show', async () => {
    const api = scriptedApi({
      join: [{ ok: true, room: room({ seq: 2 }), events: [played(1, 'e4'), played(2, 'e5')] }],
      move: [{ ok: false, code: 'not_your_turn', message: '不是你的回合' }],
    });
    const seen = watcher();
    const game = new RoomGame({ api, ...seen });
    await game.join('ABCDEF');
    await game.move('Nf3');
    expect(seen.order).toEqual(['snapshot', 'error']);
    expect(seen.problems[0].code).toBe('not_your_turn');
    expect(game.seqSeen()).toBe(2);
  });

  it('reports a poll that was refused without touching the board', async () => {
    const api = scriptedApi({
      join: [{ ok: true, room: room({ seq: 1 }), events: [played(1, 'e4')] }],
      poll: [{ ok: false, code: 'not_room_member', message: '你不在这个房间里' }],
    });
    const seen = watcher();
    const game = new RoomGame({ api, ...seen });
    await game.join('ABCDEF');
    await game.poll();
    expect(seen.problems.map((p) => p.code)).toEqual(['not_room_member']);
    expect(game.seqSeen()).toBe(1);
  });
});

describe('catching up', () => {
  it('reads the whole game again from move one', async () => {
    const api = scriptedApi({
      join: [
        { ok: true, room: room({ seq: 1 }), events: [played(1, 'e4')] },
      ],
      poll: [
        {
          ok: true,
          room: room({ seq: 3 }),
          events: [played(1, 'e4'), played(2, 'e5'), played(3, 'Nf3')],
        },
      ],
    });
    const seen = watcher();
    const game = new RoomGame({ api, ...seen });
    await game.join('ABCDEF');
    await game.reread();
    expect(api.calls[1].args).toEqual(['ABCDEF', 0]);
    expect(game.events.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(seen.snapshots[1].fresh.map((e) => e.san)).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('follows the cursor rather than handing over half a game', async () => {
    // 200 rows is what one call may return. A board that took the page and
    // stopped would show a position the server disagrees with.
    const first = Array.from({ length: 200 }, (_, i) => played(i + 1, `m${i + 1}`));
    const rest = Array.from({ length: 30 }, (_, i) => played(201 + i, `m${201 + i}`));
    const api = scriptedApi({
      join: [{ ok: true, room: room({ seq: 230 }), events: first }],
      poll: [{ ok: true, room: room({ seq: 230 }), events: rest }],
    });
    const game = new RoomGame({ api });
    await game.join('ABCDEF');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.calls.map((c) => c.args[1])).toEqual([undefined, 200]);
    expect(game.seqSeen()).toBe(230);
    expect(game.events).toHaveLength(230);
  });
});

describe('a clock that ran out', () => {
  it('files the result, because a poll is not allowed to write', async () => {
    const api = scriptedApi({
      join: [{ ok: true, room: room(), events: [] }],
      poll: [{ ok: true, room: room({ flagged: true }), events: [] }],
      settle: [
        {
          ok: true,
          room: room({ status: 'over', result: 'timeout-black', winner: 'w', flagged: true }),
          event: null,
        },
      ],
    });
    const game = new RoomGame({ api });
    await game.join('ABCDEF');
    await game.poll();
    expect(api.calls.map((c) => c.name)).toEqual(['join', 'poll', 'settle']);
    expect(game.over).toBe(true);
    expect(game.room.result).toBe('timeout-black');
  });

  it('does not file a game the referee already closed', async () => {
    const api = scriptedApi({
      join: [{ ok: true, room: room(), events: [] }],
      poll: [
        {
          ok: true,
          room: room({ status: 'over', result: 'checkmate', flagged: true }),
          events: [],
        },
      ],
    });
    const game = new RoomGame({ api });
    await game.join('ABCDEF');
    await game.poll();
    expect(api.calls.map((c) => c.name)).toEqual(['join', 'poll']);
  });

  it('sends one filing while the first is still on its way', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const api = scriptedApi({
      join: [{ ok: true, room: room(), events: [] }],
      settle: [gate.then(() => ({ ok: true, room: room({ status: 'over' }) }))],
    });
    const game = new RoomGame({ api });
    await game.join('ABCDEF');
    const first = game.settle();
    expect(await game.settle()).toBe(null);
    release({ ok: true, room: room({ status: 'over' }) });
    await first;
    expect(api.calls.filter((c) => c.name === 'settle')).toHaveLength(1);
  });
});

describe('what the board is told about the seats', () => {
  it('names the other player once both seats are filled', async () => {
    const api = scriptedApi({
      join: [{ ok: true, room: room(), events: [] }],
    });
    const game = new RoomGame({ api });
    await game.join('ABCDEF');
    expect(game.you).toBe('w');
    expect(game.playing).toBe(true);
    expect(game.opponentName()).toBe('Ann');
  });

  it('has no opponent while the room is still waiting', async () => {
    const api = scriptedApi({
      create: [
        {
          ok: true,
          room: room({ status: 'waiting', you: 'b', players: { w: null, b: { id: 7, nickname: 'Joe' } } }),
          events: [],
        },
      ],
    });
    const game = new RoomGame({ api });
    await game.create({ color: 'b', timeMs: null });
    expect(game.waiting).toBe(true);
    expect(game.playing).toBe(false);
    expect(game.opponentName()).toBe(null);
  });
});

describe('the two numbers the board plans around', () => {
  it('polls often enough to feel live and rarely enough to be free', () => {
    // Both players are on a 2.5s leash: a move has to show up before the
    // opponent notices nothing happened.
    expect(POLL_MS).toBeGreaterThan(0);
    expect(POLL_MS).toBeLessThanOrEqual(3000);
  });

  it('caps the clock at what the referee accepts', () => {
    // CHESS_ROOM_TIME_MAX_MS in chess_room_core.php. Above it, create answers
    // bad_room_time, so the longest pick on the board is brought down here.
    expect(ROOM_MAX_TIME_MS).toBe(3600000);
  });
});
