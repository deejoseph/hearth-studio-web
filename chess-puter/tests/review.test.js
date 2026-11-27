import { describe, it, expect } from 'vitest';
import {
  analyzeGame,
  classifyMove,
  computeAccuracy,
  countClassifications,
  findCriticalMoments,
  CLASSIFY_THRESHOLDS,
  annotationFor,
  markFor,
  nagFor,
  CLASSIFY_LABEL,
} from '../src/game/review.js';
import { Chess } from '../src/engine/chess.js';

describe('classifyMove', () => {
  it('returns "best" when the played move matches the engine best move', () => {
    const result = classifyMove(0, 50, 'w', 'e2e4', 'e2e4');
    expect(result.classification).toBe('best');
    expect(result.loss).toBe(0);
  });

  it('returns "best" even when eval goes slightly against the player', () => {
    // White plays the best move but eval drops a tiny bit (noise)
    const result = classifyMove(50, 45, 'w', 'e2e4', 'e2e4');
    expect(result.classification).toBe('best');
  });

  it('classifies a blunder when eval loss exceeds threshold', () => {
    // White plays e4, eval drops from +100 to -150 (loss of 250cp > 200)
    const result = classifyMove(100, -150, 'w', 'e2e4', 'd2d4');
    expect(result.classification).toBe('blunder');
    expect(result.loss).toBe(250);
  });

  it('classifies a mistake when eval loss is in the mistake range', () => {
    // White loses 150cp (between 100 and 200)
    const result = classifyMove(100, -50, 'w', 'e2e4', 'd2d4');
    expect(result.classification).toBe('mistake');
    expect(result.loss).toBe(150);
  });

  it('classifies an inaccuracy when eval loss is in the inaccuracy range', () => {
    // White loses 75cp (between 50 and 100)
    const result = classifyMove(100, 25, 'w', 'e2e4', 'd2d4');
    expect(result.classification).toBe('inaccuracy');
    expect(result.loss).toBe(75);
  });

  it('classifies a good move when eval loss is below inaccuracy threshold', () => {
    // White loses 15cp (below 20)
    const result = classifyMove(100, 85, 'w', 'e2e4', 'd2d4');
    expect(result.classification).toBe('good');
    expect(result.loss).toBe(15);
  });

  it('handles Black moves correctly (eval increase is loss for Black)', () => {
    // Black plays, eval goes from -50 to +100 (loss of 150cp for Black)
    const result = classifyMove(-50, 100, 'b', 'e7e5', 'd7d5');
    expect(result.classification).toBe('mistake');
    expect(result.loss).toBe(150);
  });

  it('handles Black playing the best move', () => {
    // Black plays the engine's choice, eval stays the same
    const result = classifyMove(-50, -50, 'b', 'e7e5', 'e7e5');
    expect(result.classification).toBe('best');
  });

  it('clamps loss to 0 when eval improves', () => {
    // White's eval improves from 50 to 100 (negative loss)
    const result = classifyMove(50, 100, 'w', 'e2e4', 'd2d4');
    expect(result.classification).toBe('good');
    expect(result.loss).toBe(0);
  });

  it('handles missing moves gracefully', () => {
    const result = classifyMove(0, 100, 'w', null, null);
    expect(result.classification).toBe('good');
  });
});

describe('thresholds', () => {
  it('exports the classification thresholds', () => {
    expect(CLASSIFY_THRESHOLDS.blunder).toBe(200);
    expect(CLASSIFY_THRESHOLDS.mistake).toBe(100);
    expect(CLASSIFY_THRESHOLDS.inaccuracy).toBe(20);
  });

  it('marks each classification with its written glyph and NAG', () => {
    // PGN 的标准表：$1="!" $2="?" $3="!?" $4="?!" $5="!!" $6="??"
    const white = '4r3/8/8/8/8/8/8/R3K3 w Q - 10 21';
    const black = '4r3/8/8/8/8/8/8/R3K3 b Q - 10 21';
    expect(markFor({ classification: 'best', fen: white, evalBefore: 0, evalAfter: 0 })).toBe('!');
    expect(nagFor({ classification: 'good', fen: white, evalBefore: 0, evalAfter: 0 })).toBe('$1');
    expect(markFor({ classification: 'inaccuracy', fen: black })).toBe('?!');
    expect(nagFor({ classification: 'inaccuracy', fen: black })).toBe('$4');
    expect(markFor({ classification: 'mistake', fen: white })).toBe('?');
    expect(nagFor({ classification: 'mistake', fen: white })).toBe('$2');
    expect(markFor({ classification: 'blunder', fen: black })).toBe('??');
    expect(nagFor({ classification: 'blunder', fen: black })).toBe('$6');
  });

  it('has no annotation for a move the engine never scored', () => {
    // 只有分类没有数字（比如导入的旧棋谱）也要给符号，反过来两者都没有就不能瞎标
    expect(annotationFor({})).toBeNull();
    expect(markFor({ classification: 'nonsense' })).toBe('');
    expect(nagFor(null)).toBeNull();
  });

  it('reserves "!!" for the best move that gains a pawn or more', () => {
    const white = '4r3/8/8/8/8/8/8/R3K3 w Q - 10 21';
    const black = '4r3/8/8/8/8/8/8/R3K3 b Q - 10 21';
    const plain = { classification: 'best', fen: white, evalBefore: 0, evalAfter: 50 };
    expect(markFor(plain)).toBe('!');
    expect(markFor({ ...plain, evalAfter: 100 })).toBe('!!');
    expect(nagFor({ ...plain, evalAfter: 100 })).toBe('$5');
    // 黑方那手同样要反过来减：评估往下走才是黑方在涨
    expect(markFor({ classification: 'best', fen: black, evalBefore: 0, evalAfter: -120 })).toBe('!!');
    expect(markFor({ classification: 'best', fen: black, evalBefore: 0, evalAfter: 120 })).toBe('!');
    // 失误永远不会因为局面变好而升成 "!!"
    expect(markFor({ classification: 'blunder', fen: white, evalBefore: 0, evalAfter: 400 })).toBe('??');
  });

  it('exports Chinese labels for UI display', () => {
    expect(CLASSIFY_LABEL.blunder).toBe('错着');
    expect(CLASSIFY_LABEL.mistake).toBe('漏着');
    expect(CLASSIFY_LABEL.inaccuracy).toBe('不精确');
    expect(CLASSIFY_LABEL.good).toBe('好棋');
    expect(CLASSIFY_LABEL.best).toBe('最佳');
  });
});

describe('computeAccuracy', () => {
  it('returns 100% when all moves are best', () => {
    const results = [
      { fen: 'start w', classification: 'best', loss: 0 },
      { fen: 'start b', classification: 'best', loss: 0 },
      { fen: 'mid w', classification: 'best', loss: 0 },
    ];
    const accuracy = computeAccuracy(results);
    expect(accuracy.white).toBe(100);
    expect(accuracy.black).toBe(100);
    expect(accuracy.overall).toBe(100);
  });

  it('returns 0% when all moves are blunders (loss >= 200)', () => {
    const results = [
      { fen: 'start w', classification: 'blunder', loss: 200 },
      { fen: 'start b', classification: 'blunder', loss: 200 },
    ];
    const accuracy = computeAccuracy(results);
    expect(accuracy.white).toBe(0);
    expect(accuracy.black).toBe(0);
  });

  it('calculates accuracy per side correctly', () => {
    // FEN format: position turn ... (turn is the second space-separated field)
    const results = [
      { fen: 'position w ...', classification: 'best', loss: 0 },     // White: score = 100
      { fen: 'position b ...', classification: 'mistake', loss: 100 }, // Black: score = 50
      { fen: 'position w ...', classification: 'good', loss: 25 },     // White: score = 87.5
    ];
    const accuracy = computeAccuracy(results);
    // White: (100 + 87.5) / 2 = 93.75
    expect(accuracy.white).toBeCloseTo(93.75);
    // Black: 50 / 1 = 50
    expect(accuracy.black).toBeCloseTo(50);
  });

  it('handles empty results', () => {
    const accuracy = computeAccuracy([]);
    expect(accuracy.white).toBe(100);
    expect(accuracy.black).toBe(100);
    expect(accuracy.overall).toBe(100);
  });

  it('handles results without classification', () => {
    const results = [
      { fen: 'start w' },
      { fen: 'start b' },
    ];
    const accuracy = computeAccuracy(results);
    expect(accuracy.overall).toBe(100);
  });
});

describe('countClassifications', () => {
  it('counts each classification correctly', () => {
    const results = [
      { classification: 'best' },
      { classification: 'best' },
      { classification: 'good' },
      { classification: 'inaccuracy' },
      { classification: 'mistake' },
      { classification: 'blunder' },
      { classification: 'blunder' },
    ];
    const counts = countClassifications(results);
    expect(counts.best).toBe(2);
    expect(counts.good).toBe(1);
    expect(counts.inaccuracy).toBe(1);
    expect(counts.mistake).toBe(1);
    expect(counts.blunder).toBe(2);
  });

  it('returns zeros for empty results', () => {
    const counts = countClassifications([]);
    expect(counts.best).toBe(0);
    expect(counts.blunder).toBe(0);
  });

  it('ignores unknown classifications', () => {
    const results = [
      { classification: 'best' },
      { classification: 'unknown' },
      { classification: undefined },
    ];
    const counts = countClassifications(results);
    expect(counts.best).toBe(1);
    // Unknown and undefined must not pollute the counts object
    expect(counts.unknown).toBeUndefined();
    expect(Object.keys(counts)).not.toContain('undefined');
  });

  it('keeps all counts as valid numbers when filtering', () => {
    const results = [
      { classification: 'best' },
      { classification: undefined },
      { classification: null },
      {},
    ];
    const counts = countClassifications(results);
    // Every count must be a finite number, not NaN
    for (const key of Object.keys(counts)) {
      expect(Number.isFinite(counts[key])).toBe(true);
    }
    expect(counts.best).toBe(1);
  });
});

describe('findCriticalMoments', () => {
  it('returns the moves with the largest eval swings', () => {
    const results = [
      { ply: 0, loss: 10 },
      { ply: 1, loss: 250 },
      { ply: 2, loss: 50 },
      { ply: 3, loss: 180 },
      { ply: 4, loss: 300 },
    ];
    const moments = findCriticalMoments(results, 3);
    expect(moments).toHaveLength(3);
    expect(moments[0].ply).toBe(4); // 300cp swing
    expect(moments[1].ply).toBe(1); // 250cp swing
    expect(moments[2].ply).toBe(3); // 180cp swing
  });

  it('defaults to 5 moments', () => {
    const results = Array.from({ length: 20 }, (_, i) => ({ ply: i, loss: i * 10 }));
    const moments = findCriticalMoments(results);
    expect(moments).toHaveLength(5);
  });

  it('returns fewer if not enough moments exist', () => {
    const results = [
      { ply: 0, loss: 100 },
      { ply: 1, loss: 50 },
    ];
    const moments = findCriticalMoments(results, 5);
    expect(moments).toHaveLength(2);
  });

  it('filters out results without loss', () => {
    const results = [
      { ply: 0, loss: 100 },
      { ply: 1 }, // no loss
      { ply: 2, loss: 200 },
    ];
    const moments = findCriticalMoments(results, 5);
    expect(moments).toHaveLength(2);
    expect(moments[0].ply).toBe(2);
    expect(moments[1].ply).toBe(0);
  });

  it('returns empty array for empty results', () => {
    expect(findCriticalMoments([])).toEqual([]);
  });
});


/**
 * The board hands `analyzeGame` a FEN per position, replayed from the start.
 * This is the contract that broke when the log entries were assumed to carry
 * their own "after" FEN: every ply but the first arrived undefined, so the
 * analysis died on the second position and the panel stayed on "analysing"
 * forever. Replaying here is what the review timeline does too.
 */
describe('analyzeGame over a replayed game', () => {
  const game = new Chess();
  for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']) game.move(san);

  const fens = [];
  for (let ply = 0; ply <= game.history().length; ply++) {
    const replay = new Chess();
    const history = game.history();
    for (let i = 0; i < ply; i++) {
      replay.move({ from: history[i].from, to: history[i].to, promotion: history[i].promotion || 'q' });
    }
    fens.push(replay.fen());
  }
  const moves = game.history().map((m) => m.from + m.to + (m.promotion || ''));

  const controller = {
    calls: [],
    async analyze({ fen }) {
      this.calls.push(fen);
      return {
        bestmove: fen === fens[0] ? 'e2e4' : 'd2d4',
        lines: [{ depth: 12, score: { type: 'cp', value: 0 }, pv: ['d2d4', 'd7d5'] }],
      };
    },
  };

  it('analyzes every position the game passed through', async () => {
    const results = await analyzeGame(controller, fens, moves, { movetime: 1 });

    expect(results).toHaveLength(moves.length);
    expect(results[0].fen).toBe(fens[0]);
    expect(results[results.length - 1].fen).toBe(fens[fens.length - 2]);
    // The final position is searched once more so the last ply gets an evalAfter.
    expect(controller.calls[controller.calls.length - 1]).toBe(fens[fens.length - 1]);
  });

  it('classifies every ply from the searched pair', async () => {
    const results = await analyzeGame(controller, fens, moves, { movetime: 1 });

    expect(results.every((r) => r.evalBefore === 0)).toBe(true);
    expect(results.map((r) => r.classification)).toEqual(['best', ...moves.slice(1).map(() => 'good')]);
    expect(results.every((r) => r.loss === 0)).toBe(true);
  });
});

/**
 * 终局的那一手：引擎在已经将死/和掉的局面里给的分不可信（将死的局面它报"走棋方
 * mate 0"，按行棋方翻符号正好反了），所以要由规则引擎接管。
 */
describe('a game that ends on the board', () => {
  const STALEMATE = '7k/5Q2/8/8/8/8/8/K7 b - - 0 1';

  function replay(sans) {
    const game = new Chess();
    const fens = [game.fen()];
    for (const san of sans) {
      game.move(san);
      fens.push(game.fen());
    }
    return { fens, moves: game.history().map((m) => m.from + m.to + (m.promotion || '')) };
  }

  /** 每个局面都回 "mate 0"，好看出 analyzeGame 有没有去问终局那一步。 */
  function stubbornController() {
    return {
      calls: [],
      async analyze({ fen }) {
        this.calls.push(fen);
        return { bestmove: 'd2d4', lines: [{ depth: 12, score: { type: 'mate', value: 0 }, pv: [] }] };
      },
    };
  }

  it('calls the mated side by the rules, not by the engine sign', async () => {
    const { fens, moves } = replay(['f3', 'e5', 'g4', 'Qh4#']);
    const controller = stubbornController();
    const results = await analyzeGame(controller, fens, moves, { movetime: 1 });
    const mate = results[results.length - 1];

    // 白方被将死：白方正、黑方负，所以是 -1000
    expect(mate.evalAfter).toBe(-1000);
    // 将杀那一手不能记成亏了两千兵
    expect(mate.loss).toBe(0);
    // 死掉的局面不值得再问一遍引擎
    expect(controller.calls).not.toContain(fens[fens.length - 1]);
  });

  it('scores a stalemate as dead equal whatever the engine says', async () => {
    const controller = stubbornController();
    const results = await analyzeGame(controller, ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', STALEMATE], ['e2e4'], { movetime: 1 });

    expect(results[results.length - 1].evalAfter).toBe(0);
  });
});
