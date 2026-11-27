import { describe, it, expect } from 'vitest';
import { buildReviewSummary } from '../src/game/summary.js';
import { classifyMove } from '../src/game/review.js';

/**
 * 小结只读 FEN 的第 2、6 段（行棋方、回合号），棋盘摆什么它不管，所以这里的 FEN
 * 保持合法但不必真走得动。评估一律白方正、黑方负：白方走坏是数字往下掉，黑方走坏
 * 是往上掉 —— 和 analyzeGame 回填的方向一致。
 */
function fenFor(side, number) {
  return `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR ${side} KQkq - 0 ${number}`;
}

/** 一手亏了的棋：played 与 best 不同，分类和亏损由 classifyMove 算出来。 */
function err({ side = 'w', number = 1, before, after, played, best }) {
  const { classification, loss } = classifyMove(before, after, side, played, best);
  return {
    fen: fenFor(side, number),
    move: played,
    bestMove: best,
    evalBefore: before,
    evalAfter: after,
    classification,
    loss,
  };
}

/** 一手引擎第一选、没丢东西的棋。 */
function ok({ side = 'w', number = 1, at = 0, played = 'e2e4' }) {
  return err({ side, number, before: at, after: at, played, best: played });
}

const text = (lines) => lines.join('\n');
const quoted = (lines) => lines.filter((line) => line.includes('亏了'));

describe('a game with nothing to report', () => {
  it('says nothing when there is no analysis', () => {
    expect(buildReviewSummary([], [])).toEqual([]);
    expect(buildReviewSummary(null, [])).toEqual([]);
    expect(buildReviewSummary(undefined, undefined)).toEqual([]);
  });

  it('praises a clean game and does not send the reader hunting', () => {
    const results = [
      ok({ played: 'e2e4' }),
      ok({ side: 'b', played: 'e7e5' }),
      ok({ number: 2, played: 'g1f3' }),
      ok({ side: 'b', number: 2, played: 'b8c6' }),
    ];
    const lines = buildReviewSummary(results, ['e4', 'e5', 'Nf3', 'Nc6']);
    expect(text(lines)).toContain('每一手都在引擎的接受范围里');
    expect(text(lines)).toContain('整体很稳');
    expect(quoted(lines)).toHaveLength(0);
    expect(text(lines)).not.toContain('走法详情');
  });
});

describe('the opening line', () => {
  const results = [ok({ played: 'e2e4' }), ok({ side: 'b', played: 'e7e5' })];

  it('names both sides when it does not know who is reading', () => {
    const line = buildReviewSummary(results, ['e4', 'e5'])[0];
    expect(line).toContain('总体准确率');
    expect(line).toContain('白方 100.0%');
    expect(line).toContain('黑方 100.0%');
    expect(line).not.toContain('你');
  });

  it('speaks to the player when it does', () => {
    const line = buildReviewSummary(results, ['e4', 'e5'], { viewerColor: 'b' })[0];
    expect(line).toContain('你执黑');
    expect(line).toContain('对手');
    expect(line).not.toContain('白方');
  });

  it('falls back to both colours for a value it cannot read', () => {
    expect(buildReviewSummary(results, ['e4', 'e5'], { viewerColor: 'x' })[0])
      .toContain('总体准确率');
  });
});

describe('where the errors came from', () => {
  const mineOnly = [
    err({ played: 'a1b1', best: 'a1a8', before: 0, after: -300 }),
    ok({ side: 'b', at: -300, played: 'h8g8' }),
    err({ number: 2, played: 'b1c1', best: 'b1a1', before: -300, after: -600 }),
  ];
  const both = [
    err({ played: 'a1b1', best: 'a1a8', before: 0, after: -300 }),
    err({ side: 'b', played: 'h8g8', best: 'g8h8', before: -300, after: 0 }),
  ];
  const sans = ['Rab1', 'Rg8', 'Rfc1'];

  it('says the mistakes were all mine', () => {
    expect(text(buildReviewSummary(mineOnly, sans, { viewerColor: 'w' })))
      .toContain('全部出在你这边（2 手）');
  });

  it('says the mistakes were all the opponent', () => {
    expect(text(buildReviewSummary(mineOnly, sans, { viewerColor: 'b' })))
      .toContain('全部出在对方（2 手）');
  });

  it('counts both sides when nobody is at the board', () => {
    expect(text(buildReviewSummary(both, ['Rab1', 'Rg8']))).toContain('白方 1 手、黑方 1 手');
  });

  it('says 你/对方 once it knows who is reading', () => {
    expect(text(buildReviewSummary(both, ['Rab1', 'Rg8'], { viewerColor: 'w' })))
      .toContain('你 1 手、对方 1 手');
  });
});

describe('the moves worth looking at', () => {
  const results = [
    err({ number: 61, played: 'a1b1', best: 'a1a8', before: 0, after: -250 }),
    err({ side: 'b', number: 61, played: 'h8g8', best: 'a8a1', before: -250, after: 0 }),
  ];
  const review = (opts) => buildReviewSummary(results, ['Rb1', 'Rg8'], opts);

  it('quotes the loss, the swing and what the engine wanted', () => {
    const shown = text(review({ viewerColor: 'w' }));
    expect(shown).toContain('第 61 回合白方 Rb1?? 亏了 2.50');
    expect(shown).toContain('局面从 +0.00 变成 -2.50');
    expect(shown).toContain('引擎要的是 a1→a8');
  });

  it('numbers moves from the position, not from ply zero', () => {
    const shown = text(review());
    expect(shown).toContain('第 61 回合');
    expect(shown).not.toContain('第 1 回合');
  });

  it('does not double up the glyphs when the SAN already carried one', () => {
    const annotated = buildReviewSummary(results, ['Rb1??', 'Rg8'], { viewerColor: 'w' });
    expect(text(annotated)).toContain('Rb1??');
    expect(text(annotated)).not.toContain('Rb1???');
  });

  it('names a mate score by who gets mated', () => {
    const mated = buildReviewSummary(
      [err({ played: 'g1h1', best: 'g1f1', before: 0, after: -1000 }), ok({ side: 'b', at: -1000, played: 'h8g8' })],
      ['Kh1', 'Rg8'],
    );
    expect(text(mated)).toContain('变成 白方被将死');
    expect(text(mated)).not.toContain('-10.00');
  });

  it('shows at most three, and mine before the opponent', () => {
    const many = [
      err({ played: 'a1b1', best: 'a1a8', before: 0, after: -300 }),
      err({ side: 'b', played: 'h8g8', best: 'g8h8', before: -300, after: 0 }),
      err({ number: 2, played: 'b1c1', best: 'b1a1', before: 0, after: -400 }),
      err({ side: 'b', number: 2, played: 'g8h8', best: 'h8g8', before: -400, after: 0 }),
      err({ number: 3, played: 'c1d1', best: 'c1b1', before: 0, after: -260 }),
    ];
    const sans = ['Rab1', 'Rg8', 'Rfc1', 'Rh8', 'Rad1'];
    const shown = quoted(buildReviewSummary(many, sans, { viewerColor: 'w' }));
    expect(shown).toHaveLength(3);
    expect(shown.every((line) => line.includes('白方'))).toBe(true);
    expect(shown[0]).toContain('第 2 回合白方 Rfc1??');
  });

  it('ends with how to go and look at them', () => {
    expect(text(review({ viewerColor: 'w' }))).toContain('在走法详情里点上面这几手');
  });
});

describe('the brightest move', () => {
  it('calls out the biggest gain for the player who made it', () => {
    const results = [
      err({ played: 'd4e4', best: 'd4e4', before: -200, after: 0 }),
      ok({ side: 'b', at: 0, played: 'd5e5' }),
    ];
    expect(text(buildReviewSummary(results, ['d4', 'd5']))).toContain('第 1 回合白方 d4!! 是这盘最亮的一手');
    expect(text(buildReviewSummary(results, ['d4', 'd5']))).toContain('为自己挣了 2.00 的评估');
  });

  it('stays quiet when nothing improved by much', () => {
    const results = [
      err({ played: 'd4e4', best: 'd4e4', before: 0, after: 20 }),
      err({ side: 'b', played: 'd5e5', best: 'd5e5', before: 20, after: 0 }),
    ];
    expect(text(buildReviewSummary(results, ['d4', 'd5']))).not.toContain('最亮的一手');
  });
});

describe('a stretch of the game worth replaying', () => {
  const cleanTail = [
    ok({ side: 'b', number: 2, at: -300, played: 'h8g8' }),
    ok({ number: 2, at: -300, played: 'a1b1' }),
    ok({ side: 'b', number: 3, at: -300, played: 'g8h8' }),
    ok({ number: 3, at: -300, played: 'b1c1' }),
    ok({ side: 'b', number: 4, at: -300, played: 'h8g8' }),
    ok({ number: 4, at: -300, played: 'c1d1' }),
  ];

  it('names the part of the game the mistakes pile up in', () => {
    const results = [
      err({ played: 'a1b1', best: 'a1a8', before: 0, after: -300 }),
      err({ side: 'b', played: 'h8g8', best: 'g8h8', before: -300, after: 0 }),
      err({ number: 2, played: 'b1c1', best: 'b1a1', before: 0, after: -300 }),
      ...cleanTail,
    ];
    expect(text(buildReviewSummary(results, results.map((_, i) => `m${i}`))))
      .toContain('失误多半落在开局');
  });

  it('waits for a second mistake before naming a stretch', () => {
    const results = [
      err({ played: 'a1b1', best: 'a1a8', before: 0, after: -300 }),
      ...cleanTail,
    ];
    expect(text(buildReviewSummary(results, results.map((_, i) => `m${i}`))))
      .not.toContain('失误多半落在');
  });

  it('does not claim a pattern when the mistakes are spread out', () => {
    const results = [
      err({ played: 'a1b1', best: 'a1a8', before: 0, after: -300 }),
      ok({ side: 'b', at: -300, played: 'h8g8' }),
      ok({ number: 2, at: -300, played: 'a1b1' }),
      err({ side: 'b', number: 2, played: 'g8h8', best: 'h8g8', before: -300, after: 0 }),
      ok({ number: 3, at: 0, played: 'b1c1' }),
      ok({ side: 'b', number: 3, at: 0, played: 'h8g8' }),
      err({ number: 4, played: 'c1d1', best: 'd1c1', before: 0, after: -300 }),
      ok({ side: 'b', number: 4, at: -300, played: 'g8h8' }),
    ];
    expect(text(buildReviewSummary(results, results.map((_, i) => `m${i}`))))
      .not.toContain('失误多半落在');
  });
});
