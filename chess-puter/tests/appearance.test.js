import { afterAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { squareToIndex } from '../src/engine/chess.js';

vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
const {
  BOARD_STYLES,
  PIECE_STYLES,
  currentPieceStyle,
  normalizeBoardStyle,
  normalizePieceStyle,
  pieceUrl,
  setPieceStyle,
} = await import('../src/game/appearance.js');
const { BoardView } = await import('../src/ui/boardView.js');

afterAll(() => {
  setPieceStyle('classic');
  vi.unstubAllGlobals();
});

describe('棋盘与棋子外观', () => {
  it('提供三套棋盘和三套棋子样式，未知存档值回退到经典样式', () => {
    expect(BOARD_STYLES.map((style) => style.id)).toEqual(['classic', 'walnut', 'green']);
    expect(PIECE_STYLES.map((style) => style.id)).toEqual(['classic', 'forest', 'ocean']);
    expect(normalizeBoardStyle('walnut')).toBe('walnut');
    expect(normalizeBoardStyle('missing')).toBe('classic');
    expect(normalizePieceStyle('ocean')).toBe('ocean');
    expect(normalizePieceStyle('missing')).toBe('classic');
  });

  it('经典棋子路径保持不变，新套装使用独立目录且资源齐全', () => {
    expect(pieceUrl('N', 'classic')).toMatch(/pieces\/wN\.svg$/);
    expect(pieceUrl('k', 'classic')).toMatch(/pieces\/bK\.svg$/);
    expect(pieceUrl('wN', 'classic')).toMatch(/pieces\/wN\.svg$/);
    expect(pieceUrl('bk', 'classic')).toMatch(/pieces\/bK\.svg$/);
    for (const style of PIECE_STYLES) {
      for (const color of ['w', 'b']) {
        for (const piece of ['K', 'Q', 'R', 'B', 'N', 'P']) {
          const folder = style.id === 'classic' ? '' : `${style.id}/`;
          const asset = new URL(`../public/pieces/${folder}${color}${piece}.svg`, import.meta.url);
          const symbol = color === 'w' ? piece : piece.toLowerCase();
          expect(existsSync(asset), `${style.id}/${color}${piece}`).toBe(true);
          expect(pieceUrl(symbol, style.id)).toContain(`pieces/${folder}${color}${piece}.svg`);
        }
      }
    }
  });

  it('同一个棋子在切换套装后立即换图', () => {
    const image = {
      dataset: {},
      src: '',
      alt: '',
      style: {},
      classList: { toggle: vi.fn() },
    };
    const square = {
      querySelector: vi.fn(() => image),
      classList: { remove: vi.fn(), toggle: vi.fn() },
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };
    const board = Array(64).fill(null);
    board[squareToIndex('e2')] = 'P';
    const view = { squareEls: new Map([['e2', square]]), _drag: null };
    const state = { board, selected: null, targets: new Map(), lastMove: null, checkSquare: null };

    setPieceStyle('classic');
    BoardView.prototype.render.call(view, state);
    expect(image.src).toMatch(/pieces\/wP\.svg$/);
    expect(image.dataset.pieceStyle).toBe('classic');

    setPieceStyle('forest');
    BoardView.prototype.render.call(view, state);
    expect(currentPieceStyle()).toBe('forest');
    expect(image.src).toMatch(/pieces\/forest\/wP\.svg$/);
    expect(image.dataset.pieceStyle).toBe('forest');
  });
});
