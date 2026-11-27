import { describe, it, expect } from 'vitest';
import { Chess, START_FEN } from '../src/engine/chess.js';
import { fenCore, positionAt, replayFens } from '../src/game/position.js';

/**
 * 一盘从残局开走的棋：黑方先走（[FEN] 棋谱与课堂摆开的局面都是这样）。
 * SAN 由引擎自己走出来，抄在这里当固定夹具。
 */
const ENDGAME = '8/6pk/8/7p/4K2P/5P2/8/8 b - - 3 61';
const ENDGAME_SAN = ['g6', 'Kf4', 'g5+', 'Kg3', 'g4', 'f4', 'Kh6', 'f5'];

/** 从某个开局把一串 SAN 走完，走不通就说明夹具本身坏了。 */
function play(fen, sans) {
  const game = new Chess(fen);
  for (const san of sans) {
    if (!game.move(san)) throw new Error(`测试数据走不通: ${san}`);
  }
  return game;
}

describe('fenCore', () => {
  it('只看棋盘、行棋方、易位权与吃过路兵，忽略步数与钟', () => {
    expect(fenCore('8/8/8/4k3/8/8/8/4K3 w - - 0 1')).toBe(
      fenCore('8/8/8/4k3/8/8/8/4K3 w - - 42 99'),
    );
    expect(fenCore('8/8/8/4k3/8/8/8/4K3 w - - 0 1')).not.toBe(
      fenCore('8/8/8/4k3/8/8/8/4K3 b - - 0 1'),
    );
  });

  it('缺值时按空字符串处理而不抛错', () => {
    expect(fenCore(undefined)).toBe('');
    expect(fenCore(null)).toBe('');
    expect(fenCore('')).toBe('');
  });
});

describe('replayFens', () => {
  it('标准开局重放出每一手之后的局面', () => {
    const game = play(START_FEN, ['e4', 'e5', 'Nf3', 'Nc6']);
    const { fens, error } = replayFens(START_FEN, game.history(), game.fen());
    expect(error).toBeNull();
    expect(fens).toHaveLength(5);
    expect(fens[0]).toBe(START_FEN);
    expect(fens[1].split(' ')[0]).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR');
    expect(fens[4]).toBe(game.fen());
  });

  it('按棋谱声明的残局开局重放，起点就是那个残局', () => {
    const game = play(ENDGAME, ENDGAME_SAN);
    const { fens, error } = replayFens(ENDGAME, game.history(), game.fen());
    expect(error).toBeNull();
    expect(fenCore(fens[0])).toBe(fenCore(ENDGAME));
    expect(fens).toHaveLength(ENDGAME_SAN.length + 1);
    expect(fenCore(fens[fens.length - 1])).toBe(fenCore(game.fen()));
  });

  it('把残局着法按标准开局重放时报错，而不是凑出一串局面', () => {
    // 这就是修复前的行为：开局记成标准局，于是每一手的分数都算在别的局面上。
    const game = play(ENDGAME, ENDGAME_SAN);
    const { fens, error } = replayFens(START_FEN, game.history(), game.fen());
    expect(fens).toBeNull();
    expect(error).toContain('走不通');
  });

  it('走法在开局里走不通时指出是第几手', () => {
    const game = play(START_FEN, ['e4', 'e5']);
    const history = [...game.history(), { from: 'a1', to: 'h8' }];
    const { error } = replayFens(START_FEN, history);
    expect(error).toContain('第 3 手');
  });

  it('重放结果与棋盘当前局面不一致时拒绝', () => {
    const game = play(START_FEN, ['e4', 'e5', 'Nf3']);
    const history = game.history().slice(0, 2); // 记录少一手，末局面就不等于棋盘
    const { fens, error } = replayFens(START_FEN, history, game.fen());
    expect(fens).toBeNull();
    expect(error).toContain('不一致');
  });

  it('非法开局 FEN 直接报错', () => {
    const { error } = replayFens('8/8/8/4k3/8/8/8/4K3 q - - 0 1', []);
    expect(error).toContain('合法 FEN');
  });

  it('只写四段的 FEN 也能重放', () => {
    const fourField = ENDGAME.split(' ').slice(0, 4).join(' ');
    const game = play(fourField, ENDGAME_SAN);
    const { fens, error } = replayFens(fourField, game.history(), game.fen());
    expect(error).toBeNull();
    expect(fenCore(fens[0])).toBe(fenCore(fourField));
  });
});

describe('positionAt', () => {
  it('plies 为 0 时给出开局位置', () => {
    const game = play(ENDGAME, ENDGAME_SAN);
    expect(fenCore(positionAt(ENDGAME, game.history(), 0).fen())).toBe(fenCore(ENDGAME));
  });

  it('plies 为总手数时给出当前局面', () => {
    const game = play(ENDGAME, ENDGAME_SAN);
    const shown = positionAt(ENDGAME, game.history(), game.history().length);
    expect(shown.fen()).toBe(game.fen());
  });

  it('ply 超出能重放的范围时返回 null', () => {
    const game = play(ENDGAME, ENDGAME_SAN);
    expect(positionAt(ENDGAME, game.history(), 2)).not.toBeNull();
    expect(positionAt(ENDGAME, game.history(), game.history().length + 3)).toBeNull();
  });
});
