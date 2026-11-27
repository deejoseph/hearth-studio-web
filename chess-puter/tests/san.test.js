import { describe, it, expect } from 'vitest';
import { Chess } from '../src/engine/chess.js';

describe('SAN notation', () => {
  it('writes pawn moves and captures', () => {
    const game = new Chess();
    expect(game.move({ from: 'e2', to: 'e4' }).san).toBe('e4');
    expect(game.move({ from: 'd7', to: 'd5' }).san).toBe('d5');
    expect(game.move({ from: 'e4', to: 'd5' }).san).toBe('exd5');
  });

  it('writes piece moves and captures', () => {
    const game = new Chess();
    game.move({ from: 'e2', to: 'e4' });
    game.move({ from: 'd7', to: 'd5' });
    expect(game.move({ from: 'g1', to: 'f3' }).san).toBe('Nf3');
    expect(game.move({ from: 'd5', to: 'e4' }).san).toBe('dxe4');
    expect(game.move({ from: 'f3', to: 'g5' }).san).toBe('Ng5');
  });

  it('writes castling', () => {
    const game = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(game.move({ from: 'e1', to: 'g1' }).san).toBe('O-O');
    expect(game.move({ from: 'e8', to: 'c8' }).san).toBe('O-O-O');
  });

  it('disambiguates by file', () => {
    // Knights on b1 and f3 can both reach d2.
    const game = new Chess('k7/8/8/8/8/5N2/8/1N2K3 w - - 0 1');
    expect(game.move({ from: 'b1', to: 'd2' }).san).toBe('Nbd2');
  });

  it('disambiguates by rank', () => {
    // Rooks on a1 and a5 can both reach a3.
    const game = new Chess('7k/8/8/R7/8/8/8/R3K3 w - - 0 1');
    expect(game.move({ from: 'a1', to: 'a3' }).san).toBe('R1a3');
  });

  it('marks checks and mates', () => {
    const check = new Chess('k7/8/8/8/8/8/1R6/K7 w - - 0 1');
    expect(check.move({ from: 'b2', to: 'b8' }).san).toBe('Rb8+');

    const mate = new Chess('7k/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    expect(mate.move({ from: 'a1', to: 'a8' }).san).toBe('Ra8#');
  });

  it('writes promotions with checks', () => {
    const game = new Chess('3r3k/4P3/8/8/8/8/8/4K3 w - - 0 1');
    expect(game.move({ from: 'e7', to: 'd8', promotion: 'q' }).san).toBe('exd8=Q+');
  });

  it('records history in order', () => {
    const game = new Chess();
    game.move({ from: 'e2', to: 'e4' });
    game.move({ from: 'e7', to: 'e5' });
    game.move({ from: 'g1', to: 'f3' });
    expect(game.history().map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
  });
});

describe('playing a move written down elsewhere', () => {
  // The string form is how a room's event list reaches the board (net/room.js):
  // the server has the move in SAN and nothing else.
  it('plays plain SAN, and hands back the verbose move', () => {
    const game = new Chess();
    const played = game.move('e4');
    expect(played).toMatchObject({ from: 'e2', to: 'e4', san: 'e4' });
    expect(game.get('e2')).toBe(null);
    expect(game.get('e4')).toBe('P');
    expect(game.turn()).toBe('b');
  });

  it('plays the awkward ones: a capture, a castle, a promotion, a mate', () => {
    const game = new Chess();
    for (const san of ['e4', 'd5', 'exd5', 'Nf6', 'Nc3', 'Nxd5', 'Nxd5', 'Qxd5']) {
      expect(game.move(san), san).not.toBe(null);
    }
    const castles = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(castles.move('O-O').flags).toBe('k');
    expect(castles.move('O-O-O').flags).toBe('q');

    const promotes = new Chess('3r3k/4P3/8/8/8/8/8/4K3 w - - 0 1');
    expect(promotes.move('exd8=Q+').promotion).toBe('q');

    const mate = new Chess('7k/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    expect(mate.move('Ra8#').san).toBe('Ra8#');
  });

  it('refuses the string it would not itself have written', () => {
    // The check mark is part of the notation, not decoration: the same move
    // without it is a different string, and one side's engine never sends the
    // other a choice of spellings.
    const game = new Chess('k7/8/8/8/8/8/1R6/K7 w - - 0 1');
    expect(game.move('Rb8')).toBe(null);
    expect(game.move('Rb8+')).not.toBe(null);
    expect(game.turn()).toBe('b');
  });

  it('refuses what was never a move at all', () => {
    const game = new Chess();
    expect(game.move('rb8+')).toBe(null); // case carries the piece
    expect(game.move('e5')).toBe(null); // not legal from here
    expect(game.move('')).toBe(null);
    expect(game.move('nonsense')).toBe(null);
    expect(game.history()).toEqual([]);
  });

  it('replays a whole game the way a poll returns one', () => {
    const sans = ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'cxd5', 'exd5', 'Bg5', 'Be7'];
    const game = new Chess();
    for (const san of sans) expect(game.move(san), san).not.toBe(null);
    expect(game.history().map((m) => m.san)).toEqual(sans);
  });
});
