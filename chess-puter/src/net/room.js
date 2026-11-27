/**
 * Online play over the room API: /api/v1/chess_room_*.php, same origin as this
 * board (see net/auth.js for the account calls beside these).
 *
 * Transport is HTTP short polling. The site lives on a shared host running
 * LiteSpeed + PHP, which cannot hold a WebSocket, and SSE would park a PHP
 * process for the length of a game and run into its execution-time cap; a move
 * is seconds apart anyway, so a poll every couple of seconds is invisible.
 *
 * Nothing in this module decides anything about chess. The server holds the
 * position, judges each move against its own engine, and keeps the clocks —
 * it is the referee the JS engine was cross-checked against move by move. What
 * follows is a cursor over the server's event list and a place to put the
 * replies.
 */

import { call } from './auth.js';

/** How often the board asks the server what it has missed. */
export const POLL_MS = 2500;

/** The server's own ceiling (CHESS_ROOM_TIME_MAX_MS). */
export const ROOM_MAX_TIME_MS = 3600000;

/** Rows one poll can return (the server's cap). Past it the cursor is followed
 *  up rather than rebuilding the game from an incomplete list. */
const EVENT_PAGE = 200;

/**
 * Room codes come off a phone screen or out of a chat, so spaces and lowercase
 * are the player's business, not the server's. Six characters is all this
 * checks: which characters are allowed is the server's rule to change, and a
 * client that guessed wrong would refuse codes that work.
 */
export function normalizeCode(raw) {
  const text = String(raw ?? '').trim();
  const pasted = /#g=([^&\s]+)/.exec(text);
  const code = (pasted ? percentOut(pasted[1]) : text).replace(/\s+/g, '');
  return code.length === 6 ? code.toUpperCase() : '';
}

/** A link pasted out of a chat app may arrive percent-written. Text that is
 *  not escapes at all — `#g=50%off` — is simply not a code, and throwing here
 *  would take the join form down with it. */
function percentOut(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

export function makeRoomApi({ fetchImpl } = {}) {
  return {
    // The clock picker offers "No limit", which has no server equivalent: a
    // game nobody can lose on time would hold its room open forever. Omitting
    // the field is what asks for the referee's own default — sending it as 0
    // would be read as a game that ends before the first move.
    create: ({ color, timeMs }) =>
      call('chess_room_create.php', {
        body: timeMs ? { color, time_ms: timeMs } : { color },
        fetchImpl,
      }),
    join: (code) => call('chess_room_join.php', { body: { code }, fetchImpl }),
    move: (code, san) => call('chess_room_move.php', { body: { code, san }, fetchImpl }),
    // GET takes its arguments in the query and writes nothing, so a retry after
    // a dropped response is always safe — unlike the four calls below it.
    poll: (code, since) =>
      call(
        `chess_room_poll.php?code=${encodeURIComponent(code)}&since=${encodeURIComponent(since)}`,
        { method: 'GET', fetchImpl },
      ),
    resign: (code) => call('chess_room_resign.php', { body: { code }, fetchImpl }),
    offerDraw: (code) => call('chess_room_draw_offer.php', { body: { code }, fetchImpl }),
    // accept is a real boolean: the endpoint refuses "yes"/1 rather than guess,
    // because an answer settles the game.
    answerDraw: (code, accept) => call('chess_room_draw_answer.php', {
      body: { code, accept: accept === true },
      fetchImpl,
    }),
    settle: (code) => call('chess_room_close.php', { body: { code }, fetchImpl }),
  };
}

/**
 * One room, one cursor. `onSnapshot(room, fresh)` is called with the server's
 * authoritative state and only the events this client had not seen, which is
 * everything the board needs to stay in step; `onError` hears about replies that
 * came back refused or unreachable, and is given the reply so it can look at
 * `code` rather than a sentence.
 */
export class RoomGame {
  constructor({ api = makeRoomApi(), onSnapshot = () => {}, onError = () => {} } = {}) {
    this.api = api;
    this.onSnapshot = onSnapshot;
    this.onError = onError;
    this.code = null;
    this.room = null;
    /** Every event this client has been told about, oldest first. */
    this.events = [];
    /** Which room the calls in flight belong to. See _ask. */
    this.epoch = 0;
    this._settling = false;
  }

  get you() {
    return this.room?.you ?? null;
  }

  get playing() {
    return this.room?.status === 'active';
  }

  get waiting() {
    return this.room?.status === 'waiting';
  }

  get over() {
    return this.room?.status === 'over';
  }

  /** The other seat's nickname, or null while it is still empty. */
  opponentName() {
    const other = this.room?.players?.[this.you === 'w' ? 'b' : 'w'];
    return other?.nickname ?? null;
  }

  /** Forget the room: the next create/join starts a fresh event list, and any
   *  reply still on its way here belongs to the room being walked away from. */
  reset() {
    this.epoch++;
    this.code = null;
    this.room = null;
    this.events = [];
    this._settling = false;
  }

  async create({ color, timeMs }) {
    this.reset();
    return this._ask(() => this.api.create({ color, timeMs }));
  }

  async join(code) {
    this.reset();
    return this._ask(() => this.api.join(code));
  }

  async move(san) {
    return this._ask(() => this.api.move(this.code, san));
  }

  async resign() {
    return this._ask(() => this.api.resign(this.code));
  }

  async offerDraw() {
    return this._ask(() => this.api.offerDraw(this.code));
  }

  async answerDraw(accept) {
    return this._ask(() => this.api.answerDraw(this.code, accept));
  }

  /**
   * Ask something of the room, and take the answer only if it is still this
   * room. Every call here is a round trip the player can walk away from mid
   * flight, and a room row is indistinguishable from one they are in — adopt it
   * and the board sits them back down at the game they just left.
   */
  async _ask(what) {
    const epoch = this.epoch;
    const reply = await what();
    return epoch === this.epoch ? this._reply(reply) : reply;
  }

  /**
   * Ask for the next page of events. A poll that finds the clock already spent
   * also files the result, because settling a game on time is a write and the
   * poll itself must never write — see the note on GET in the header.
   */
  async poll(since = this.seqSeen()) {
    if (!this.code) return null;
    const epoch = this.epoch;
    const reply = await this.api.poll(this.code, since);
    if (epoch !== this.epoch) return reply; // the room was left while this was out
    if (!reply?.ok) {
      this.onError(reply);
      return reply;
    }
    this._adopt(reply);
    if (this.playing && this.room.flagged) await this.settle();
    return reply;
  }

  /**
   * Read the game again from move 1, replacing the event list. For a board that
   * can no longer trust the position it is showing — a rejoin at a game that
   * went on while it was away, or a page of events it never got.
   */
  async reread() {
    this.events = [];
    return this.poll(0);
  }

  /** Tell the server the clock ended this game. Idempotent, and only ever sent
   *  from one side at a time (see _settling). */
  async settle() {
    if (this._settling) return null;
    this._settling = true;
    try {
      return await this._ask(() => this.api.settle(this.code));
    } finally {
      this._settling = false;
    }
  }

  /** The highest event seq taken so far — the cursor the next poll asks from. */
  seqSeen() {
    return this.events.length ? this.events[this.events.length - 1].seq : 0;
  }

  /**
   * Take a reply, then say what is wrong about it. The order is the point: a
   * referee that refuses a move usually sends the room as it now stands (its
   * answer to "why not" is "look"), so the board is corrected before anyone is
   * told the move did not land.
   */
  _reply(reply) {
    this._adopt(reply);
    if (!reply?.ok) this.onError(reply);
    return reply;
  }

  /**
   * Take the server's word for where the game is. The events in a reply are the
   * ones after the cursor, and a room whose seq is ahead of the last event it
   * sent has more to give, so the cursor is followed rather than trusting one
   * page — the same way a board behind by a hundred moves catches up.
   */
  _adopt(reply) {
    if (!reply?.room) return reply;
    this.room = reply.room;
    this.code = reply.room.code;
    const fresh = [];
    for (const event of reply.events ?? (reply.event ? [reply.event] : [])) {
      if (!this.events.some((seen) => seen.seq === event.seq)) fresh.push(event);
    }
    for (const event of fresh.sort((a, b) => a.seq - b.seq)) this.events.push(event);
    this.onSnapshot(this.room, fresh);
    if (fresh.length >= EVENT_PAGE && this.seqSeen() < this.room.seq) {
      // A full page with more behind it: follow the cursor rather than hand the
      // board a position it cannot rebuild from an incomplete list. Rare, but
      // it is the difference between catching up and freezing.
      this.poll().catch(() => {});
    }
    return reply;
  }
}
