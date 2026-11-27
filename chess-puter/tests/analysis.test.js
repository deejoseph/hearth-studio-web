import { describe, expect, it } from 'vitest';
import { Chess } from '../src/engine/chess.js';
import { parseInfo, scoreToCentipawns } from '../src/engine/stockfish.js';
import { canAnalyze, evalPercent, formatLine, formatScore, pvToSan } from '../src/game/analysis.js';

// The protocol lines are the vendored engine's own output, captured from a
// scripted run, so these tests walk the whole path a player's eval bar takes:
// engine text -> parsed score -> what the panel prints.
const ITALIAN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 3 4';
const DEPTH_1_MPV_1 = 'info depth 1 seldepth 6 multipv 1 score cp 39 nodes 201 nps 33500 hashfull 0 time 6 pv g8f6';
const DEPTH_16_MPV_1 = 'info depth 16 seldepth 23 multipv 1 score cp 14 nodes 750170 nps 568310 hashfull 125 time 1320 pv g8f6 g1e2 c6a5 d2d3 d7d6 b1c3 f8e7 a2a4 c8g4 f3e3';

describe('evalPercent', () => {
  it('sits in the middle when there is nothing to show', () => {
    expect(evalPercent(null)).toBe(50);
    expect(evalPercent(0)).toBe(50);
  });

  it('leans with the score and mirrors across the axis', () => {
    const one = evalPercent(100);
    expect(one).toBeGreaterThan(50);
    expect(one).toBeCloseTo(64, 0);
    expect(evalPercent(-100)).toBeCloseTo(100 - one, 6);
  });

  it('keeps growing without ever pinning a finite score to the end', () => {
    expect(evalPercent(100)).toBeLessThan(evalPercent(200));
    expect(evalPercent(200)).toBeLessThan(evalPercent(400));
    expect(evalPercent(990)).toBeLessThan(100);
  });

  it('fills the bar for a mate', () => {
    expect(evalPercent(scoreToCentipawns({ type: 'mate', value: 2, bound: null }, 'w'))).toBe(100);
    expect(evalPercent(scoreToCentipawns({ type: 'mate', value: 2, bound: null }, 'b'))).toBe(0);
  });
});

describe('formatScore', () => {
  it('speaks for White whichever side the engine was thinking about', () => {
    const score = { type: 'cp', value: 39, bound: null };
    expect(formatScore(score, 'w')).toBe('+0.39');
    expect(formatScore(score, 'b')).toBe('-0.39');
  });

  it('shows two decimals of a pawn', () => {
    expect(formatScore({ type: 'cp', value: 14, bound: null }, 'w')).toBe('+0.14');
    expect(formatScore({ type: 'cp', value: -250, bound: null }, 'w')).toBe('-2.50');
    expect(formatScore({ type: 'cp', value: 0, bound: null }, 'b')).toBe('+0.00');
  });

  it('names the side that delivers the mate', () => {
    // A UCI mate score always counts for the mover: the same "mate 1" printed
    // on White's turn is White mating, on Black's turn it is Black mating.
    expect(formatScore({ type: 'mate', value: 1, bound: null }, 'w')).toBe('白方1步杀');
    expect(formatScore({ type: 'mate', value: 1, bound: null }, 'b')).toBe('黑方1步杀');
    expect(formatScore({ type: 'mate', value: -3, bound: null }, 'w')).toBe('黑方3步杀');
    expect(formatScore({ type: 'mate', value: -3, bound: null }, 'b')).toBe('白方3步杀');
  });

  it('has nothing to say about a line that carries no score', () => {
    expect(formatScore(null, 'w')).toBe('');
    expect(formatScore({ type: 'cp', value: null, bound: null }, 'w')).toBe('');
  });

  it('agrees with the bar printed next to it', () => {
    const line = parseInfo(DEPTH_16_MPV_1);
    // +14cp for the side to move, which here is Black: the text reads
    // negative and the bar has to sit under half full, or the panel
    // contradicts itself.
    const cp = scoreToCentipawns(line.score, 'b');
    expect(formatScore(line.score, 'b')).toBe('-0.14');
    expect(evalPercent(cp)).toBeLessThan(50);
    expect(evalPercent(cp)).toBeGreaterThan(40);
  });
});

describe('pvToSan', () => {
  it('replays a captured line into the moves a player reads', () => {
    const info = parseInfo(DEPTH_16_MPV_1);
    expect(pvToSan(new Chess(ITALIAN), info.pv)).toEqual([
      'Nf6', 'Ne2', 'Na5', 'd3', 'd6', 'Nbc3', 'Be7', 'a4', 'Bg4', 'Qe3',
    ]);
  });

  it('stops where the position stops agreeing with the line', () => {
    // Depth reports arrive while the search is running, and the engine's
    // reply to its own move is only a guess: e4d5 is a White pawn move on
    // Black's turn.
    expect(pvToSan(new Chess(ITALIAN), ['g8f6', 'e4d5', 'd2d4'])).toEqual(['Nf6']);
  });

  it('keeps the promotion piece the engine chose', () => {
    const race = '8/P7/6k1/8/8/8/8/6K1 w - - 0 1';
    expect(pvToSan(new Chess(race), ['a7a8q'])).toEqual(['a8=Q']);
    expect(pvToSan(new Chess(race), ['a7a8r'])).toEqual(['a8=R']);
  });

  it('reads the first move of a real search the way the board shows it', () => {
    const info = parseInfo(DEPTH_1_MPV_1);
    expect(pvToSan(new Chess(ITALIAN), info.pv)).toEqual(['Nf6']);
  });
});

describe('formatLine', () => {
  it('starts with White and numbers from the position', () => {
    expect(formatLine(['e4', 'e5', 'Nf3'], 0)).toBe('1. e4 e5 2. Nf3');
  });

  it('gives Black the ellipsis and the right number when it answers first', () => {
    // The Italian position has seen 1.e4 e5 2.Bc4 Nc6 3.Qf3 — five plies, so
    // Black's Nf6 is still the third move of the game.
    const sans = pvToSan(new Chess(ITALIAN), parseInfo(DEPTH_16_MPV_1).pv);
    expect(formatLine(sans, 5)).toBe(
      '3… Nf6 4. Ne2 Na5 5. d3 d6 6. Nbc3 Be7 7. a4 Bg4 8. Qe3',
    );
  });

  it('leaves nothing to show for an unfinished line', () => {
    expect(formatLine(['Nf6'], 5)).toBe('3… Nf6');
    expect(formatLine([], 5)).toBe('');
    expect(formatLine([], 0)).toBe('');
  });
});

describe('canAnalyze', () => {
  it('is open everywhere a player is only playing themselves', () => {
    for (const mode of ['computer', 'local']) {
      expect(canAnalyze({ mode, onlineUiState: 'idle' })).toBe(true);
    }
    // The room states before a seat is taken hold no live opponent.
    for (const onlineUiState of ['idle', 'creating', 'hosting', 'joining']) {
      expect(canAnalyze({ mode: 'online', onlineUiState })).toBe(true);
    }
  });

  it('is closed while someone is waiting for their move in a live room', () => {
    expect(canAnalyze({ mode: 'online', onlineUiState: 'playing' })).toBe(false);
  });

  it('reopens once that room is over, which is when reviewing it matters', () => {
    expect(canAnalyze({ mode: 'online', onlineUiState: 'ended' })).toBe(true);
  });
});
