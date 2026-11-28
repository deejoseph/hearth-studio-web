import { describe, expect, it } from 'vitest';
import { Chess, START_FEN } from '../src/engine/chess.js';
import { identifyOpening, openingDisplayName } from '../src/game/opening.js';
import OPENINGS, { OPENING_DATA_METADATA } from '../src/data/openings.js';

const line = (pgn) => pgn.split(' ');
const verbose = (pgn) => {
  const game = new Chess(START_FEN);
  for (const san of line(pgn)) game.move(san);
  return game.history();
};

describe('开局自动识别', () => {
  it('使用固定版本的离线开局库', () => {
    expect(OPENING_DATA_METADATA).toEqual({
      source: 'lichess-org/chess-openings',
      version: '2026.10.28',
      license: 'CC0-1.0',
    });
    expect(Object.keys(OPENINGS).length).toBeGreaterThan(3800);
    for (const entry of Object.values(OPENINGS)) {
      expect(entry[0]).toMatch(/^[A-E]\d\d$/);
      expect(entry[1].length).toBeGreaterThan(0);
    }
  });

  it('标准初始局面显示标准开局', () => {
    expect(identifyOpening(START_FEN, [])).toEqual({
      eco: '',
      name: '标准开局',
      officialName: '标准开局',
    });
  });

  it.each([
    ['e4 e5 Nf3 Nc6 Bc4', 'C50', '意大利开局', 'Italian Game'],
    ['e4 e5 Nf3 Nc6 Bb5', 'C60', '西班牙开局', 'Ruy Lopez'],
    ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6', 'B90', '西西里防御 · Najdorf Variation', 'Sicilian Defense: Najdorf Variation'],
    ['d4 d5 c4 e6', 'D30', '后翼弃兵拒绝', "Queen's Gambit Declined"],
    ['f3 e5 g4 Qh4#', 'A00', '巴恩斯开局 · Fool\'s Mate', "Barnes Opening: Fool's Mate"],
  ])('识别线路 %#', (pgn, eco, name, officialName) => {
    expect(identifyOpening(START_FEN, line(pgn))).toEqual({ eco, name, officialName });
  });

  it('转置到同一局面时识别结果一致', () => {
    const first = identifyOpening(START_FEN, line('e4 e5 Nf3 Nc6 Bc4 Bc5'));
    const transposed = identifyOpening(START_FEN, line('e4 e5 Bc4 Nc6 Nf3 Bc5'));
    expect(transposed).toEqual(first);
    expect(first.eco).toBe('C50');
  });

  it('离开开局理论后仍保留最近识别出的开局', () => {
    const opening = identifyOpening(START_FEN, line('e4 e5 Nf3 Nc6 Bc4 Bc5'));
    const later = identifyOpening(START_FEN, line('e4 e5 Nf3 Nc6 Bc4 Bc5 a3 a6 a4 a5'));
    expect(later).toEqual(opening);
  });

  it('接受棋盘使用的 verbose 走法记录', () => {
    const pgn = 'e4 e5 Nf3 Nc6 Bb5';
    expect(identifyOpening(START_FEN, verbose(pgn)))
      .toEqual(identifyOpening(START_FEN, line(pgn)));
  });

  it('自定义起始局面不会误报标准开局', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    expect(identifyOpening(fen, [])).toBeNull();
    expect(identifyOpening(fen, verbose('Bb5'))).toBeNull();
  });

  it('非法走法或非法输入不抛异常', () => {
    expect(identifyOpening('not a fen', [])).toBeNull();
    expect(identifyOpening(START_FEN, null)).toBeNull();
    expect(identifyOpening(START_FEN, ['e5'])).toBeNull();
    expect(identifyOpening(START_FEN, [{}])).toBeNull();
  });

  it('常用开局优先显示中文，变例保留官方英文', () => {
    expect(openingDisplayName("Queen's Gambit Declined: Exchange Variation"))
      .toBe('后翼弃兵拒绝 · Exchange Variation');
    expect(openingDisplayName('Unmapped Opening')).toBe('Unmapped Opening');
  });
});
