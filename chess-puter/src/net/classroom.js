/**
 * Classroom multiplayer client.
 *
 * A teacher creates a class (4-digit code), students join to spectate.
 * The teacher controls the board and annotation tools; students can raise
 * hands to request a one-move turn. All state syncs via short polling,
 * same transport as the 1v1 room system.
 *
 * Events are typed: 'move', 'annotation', 'hand', 'approve', 'branch', 'undo', 'reset'.
 * The poll payload carries the full class state + new events since cursor.
 */

import { call } from './auth.js';

export const CLASS_POLL_MS = 2000;

export function normalizeClassCode(raw) {
  const text = String(raw ?? '').trim().replace(/\s+/g, '');
  return /^\d{4}$/.test(text) ? text : '';
}

export function makeClassApi({ fetchImpl } = {}) {
  return {
    create: () => call('chess_class_create.php', { body: {}, fetchImpl }),
    join: (code) => call('chess_class_join.php', { body: { code }, fetchImpl }),
    leave: (code) => call('chess_class_leave.php', { body: { code }, fetchImpl }),
    move: (code, san) => call('chess_class_move.php', { body: { code, san }, fetchImpl }),
    annotate: (code, annotations) =>
      call('chess_class_annotate.php', { body: { code, annotations }, fetchImpl }),
    hand: (code, action) =>
      call('chess_class_hand.php', { body: { code, action }, fetchImpl }),
    approve: (code, playerId, approve) =>
      call('chess_class_approve.php', { body: { code, player_id: playerId, approve }, fetchImpl }),
    control: (code, action, data = {}) =>
      call('chess_class_control.php', {
        body: { code, action, data }, fetchImpl, timeoutMs: 15000,
      }),
    poll: (code, since) =>
      call(
        `chess_class_poll.php?code=${encodeURIComponent(code)}&since=${encodeURIComponent(since)}`,
        { method: 'GET', fetchImpl },
      ),
  };
}

export class ClassSession {
  constructor({ api = makeClassApi(), onSnapshot = () => {}, onError = () => {} } = {}) {
    this.api = api;
    this.onSnapshot = onSnapshot;
    this.onError = onError;
    this.code = null;
    this.cls = null;
    this.events = [];
    this.epoch = 0;
  }

  get you() {
    return this.cls?.you ?? null;
  }

  get isTeacher() {
    return this.you?.role === 'teacher';
  }

  get isStudent() {
    return this.you?.role === 'student';
  }

  get canMove() {
    return this.you?.can_move ?? false;
  }

  get handStatus() {
    return this.you?.hand ?? 'none';
  }

  get members() {
    return this.cls?.members ?? [];
  }

  get raisedHands() {
    return this.members.filter((m) => m.hand === 'raised');
  }

  get open() {
    return this.cls?.status === 'open';
  }

  reset() {
    this.epoch++;
    this.code = null;
    this.cls = null;
    this.events = [];
  }

  async create() {
    this.reset();
    return this._ask(() => this.api.create());
  }

  async join(code) {
    this.reset();
    return this._ask(() => this.api.join(code));
  }

  async leave() {
    if (!this.code) return null;
    const reply = await this.api.leave(this.code);
    this.reset();
    return reply;
  }

  async move(san) {
    return this._ask(() => this.api.move(this.code, san));
  }

  async annotate(annotations) {
    return this._ask(() => this.api.annotate(this.code, annotations));
  }

  async raiseHand() {
    return this._ask(() => this.api.hand(this.code, 'raise'));
  }

  async lowerHand() {
    return this._ask(() => this.api.hand(this.code, 'lower'));
  }

  async approveMove(playerId, approve) {
    return this._ask(() => this.api.approve(this.code, playerId, approve));
  }

  async control(action, data = {}) {
    return this._ask(() => this.api.control(this.code, action, data));
  }

  async poll(since = this.seqSeen()) {
    if (!this.code) return null;
    const epoch = this.epoch;
    const reply = await this.api.poll(this.code, since);
    if (epoch !== this.epoch) return reply;
    if (!reply?.ok) {
      this.onError(reply);
      return reply;
    }
    this._adopt(reply);
    return reply;
  }

  seqSeen() {
    return this.events.length ? this.events[this.events.length - 1].seq : 0;
  }

  async _ask(what) {
    const epoch = this.epoch;
    const reply = await what();
    if (epoch !== this.epoch) return reply;
    this._adopt(reply);
    if (!reply?.ok) this.onError(reply);
    return reply;
  }

  _adopt(reply) {
    if (!reply?.class) return reply;
    this.cls = reply.class;
    this.code = reply.class.code;
    const fresh = [];
    for (const event of reply.events ?? (reply.event ? [reply.event] : [])) {
      if (!this.events.some((seen) => seen.seq === event.seq)) fresh.push(event);
    }
    for (const event of fresh.sort((a, b) => a.seq - b.seq)) this.events.push(event);
    this.onSnapshot(this.cls, fresh);
    return reply;
  }
}
