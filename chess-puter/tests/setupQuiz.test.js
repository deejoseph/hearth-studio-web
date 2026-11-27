import { afterEach, describe, expect, it, vi } from 'vitest';
import { indexToSquare } from '../src/engine/chess.js';
import {
  emptySetupBoard,
  isStandardSetup,
  mountSetupQuiz,
  setupBoardErrors,
  standardSetupBoard,
} from '../src/ui/setupQuiz.js';

function fakeNode() {
  const classes = new Set();
  const listeners = new Map();
  const node = {
    children: [],
    className: '',
    dataset: {},
    disabled: false,
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      toggle: (value, on) => (on ? classes.add(value) : classes.delete(value)),
      contains: (value) => classes.has(value),
    },
    setAttribute() {},
    append(...children) { node.children.push(...children); },
    appendChild(child) { node.children.push(child); return child; },
    replaceChildren(...children) { node.children = children; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    emit(type) { listeners.get(type)?.(); },
  };
  Object.defineProperty(node, 'textContent', {
    get: () => text(node),
    set: (value) => { node._text = String(value); node.children = []; },
  });
  return node;
}

function descendants(node) {
  return [node, ...(node.children ?? []).flatMap(descendants)];
}

function text(node) {
  if (node.text === undefined && node.children?.length) {
    return node.children.map(text).join('');
  }
  return node.text ?? node._text ?? '';
}

function findText(root, value) {
  return descendants(root).filter((node) => text(node) === value).at(-1);
}

function control(root, value, key) {
  return descendants(root).filter((node) => node.dataset?.[key] === value || text(node) === value).at(-1);
}

afterEach(() => vi.unstubAllGlobals());

describe('摆棋盘判题', () => {
  it('空盘不等于标准摆法，返回独立的 64 格棋盘', () => {
    const empty = emptySetupBoard();
    const standard = standardSetupBoard();
    expect(empty).toHaveLength(64);
    expect(empty.every((piece) => piece === null)).toBe(true);
    expect(standard.filter(Boolean)).toHaveLength(32);
    expect(isStandardSetup(empty)).toBe(false);
    expect(setupBoardErrors(empty)).toHaveLength(32);
    expect(isStandardSetup(standard)).toBe(true);
    standard[0] = null;
    expect(isStandardSetup(standardSetupBoard())).toBe(true);
  });

  it('错放或漏放都会指出具体格子', () => {
    const board = standardSetupBoard();
    board[board.indexOf('Q')] = null;
    expect(setupBoardErrors(board)).toEqual(['d1']);
  });
});

describe('摆棋盘操作', () => {
  function mount(onComplete = () => {}) {
    vi.stubGlobal('document', { createElement: () => fakeNode() });
    return { quiz: mountSetupQuiz({ onComplete }), onComplete };
  }

  it('选子摆放、橡皮擦除和清空重摆', () => {
    const { quiz } = mount();
    expect(text(quiz)).toContain('已放 0 / 32 个棋子');
    control(quiz, 'Q', 'piece').emit('click');
    control(quiz, 'd1', 'square').emit('click');
    expect(control(quiz, 'd1', 'square').children[0].alt).toBe('白后');
    expect(text(quiz)).toContain('已放 1 / 32 个棋子');

    control(quiz, '橡皮擦').emit('click');
    control(quiz, 'd1', 'square').emit('click');
    expect(control(quiz, 'd1', 'square').children).toHaveLength(0);
    expect(text(quiz)).toContain('已放 0 / 32 个棋子');

    control(quiz, 'P', 'piece').emit('click');
    control(quiz, 'e2', 'square').emit('click');
    control(quiz, '清空重摆').emit('click');
    expect(control(quiz, 'e2', 'square').children).toHaveLength(0);
    expect(text(quiz)).toContain('已放 0 / 32 个棋子');
  });

  it('检查错误时标红缺子格，摆对后只回调一次并锁定', () => {
    const onComplete = vi.fn();
    const { quiz } = mount(onComplete);
    control(quiz, '检查摆法').emit('click');
    expect(text(quiz)).toContain('还有 32 个格子');
    expect(control(quiz, 'd1', 'square').classList.contains('is-wrong')).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();

    standardSetupBoard().forEach((piece, index) => {
      if (!piece) return;
      control(quiz, piece, 'piece').emit('click');
      control(quiz, indexToSquare(index), 'square').emit('click');
    });
    expect(control(quiz, 'd1', 'square').classList.contains('is-wrong')).toBe(false);
    control(quiz, '检查摆法').emit('click');
    control(quiz, '检查摆法').emit('click');

    expect(text(quiz)).toContain('摆对了！标准开局已经完成。');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(control(quiz, '检查摆法').disabled).toBe(true);
    expect(control(quiz, 'a8', 'square').disabled).toBe(true);
    expect(control(quiz, 'K', 'piece').disabled).toBe(true);
  });
});
