import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COORDINATE_QUIZ_STREAK,
  mountCoordinateQuiz,
  squareColor,
} from '../src/ui/coordinateQuiz.js';
import {
  PIECE_RANGE_ROUNDS,
  mountPieceRangeQuiz,
  pieceRangeSquares,
} from '../src/ui/pieceRangeQuiz.js';

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
  if (node.text === undefined && node.children?.length) return node.children.map(text).join('');
  return node.text ?? node._text ?? '';
}

function control(root, value, key) {
  return descendants(root).filter((node) => node.dataset?.[key] === value || text(node) === value).at(-1);
}

function coordinateTarget(quiz) {
  return text(quiz).match(/请点选：([a-h][1-8])/)?.[1];
}

function answerCoordinate(quiz, target, correctColor = true) {
  control(quiz, target, 'square').emit('click');
  const color = squareColor(target);
  control(quiz, correctColor ? (color === 'dark' ? '黑格' : '白格') : (color === 'dark' ? '白格' : '黑格')).emit('click');
}

function mountCoordinate(onComplete = () => {}) {
  vi.stubGlobal('document', { createElement: () => fakeNode() });
  return mountCoordinateQuiz({ onComplete, random: () => 0 });
}

function mountRanges(onComplete = () => {}) {
  vi.stubGlobal('document', { createElement: () => fakeNode() });
  return mountPieceRangeQuiz({ onComplete });
}

afterEach(() => vi.unstubAllGlobals());

describe('认坐标测验', () => {
  it('奇偶口诀正确判断黑白格', () => {
    expect(['a1', 'c1', 'a3', 'h8'].map(squareColor)).toEqual(['dark', 'dark', 'dark', 'dark']);
    expect(['b1', 'a2', 'h1', 'a8'].map(squareColor)).toEqual(['light', 'light', 'light', 'light']);
  });

  it('先判断坐标，再判断颜色；任一步答错都会归零', () => {
    const onComplete = vi.fn();
    const quiz = mountCoordinate(onComplete);
    const target = coordinateTarget(quiz);
    expect(target).toBeTruthy();

    control(quiz, target === 'a8' ? 'a7' : 'a8', 'square').emit('click');
    expect(text(quiz)).toContain('连续答对次数已归零');
    expect(control(quiz, target, 'square').classList.contains('is-correct')).toBe(true);
    control(quiz, '下一题').emit('click');

    for (let index = 0; index < COORDINATE_QUIZ_STREAK - 1; index += 1) {
      answerCoordinate(quiz, coordinateTarget(quiz));
      control(quiz, '下一题').emit('click');
    }
    expect(text(quiz)).toContain(`连续答对：${COORDINATE_QUIZ_STREAK - 1} / ${COORDINATE_QUIZ_STREAK}`);

    answerCoordinate(quiz, coordinateTarget(quiz), false);
    expect(text(quiz)).toContain('颜色答错了');
    expect(text(quiz)).toContain('连续答对：0 / 5');
    control(quiz, '下一题').emit('click');

    for (let index = 0; index < COORDINATE_QUIZ_STREAK; index += 1) {
      answerCoordinate(quiz, coordinateTarget(quiz));
      if (index < COORDINATE_QUIZ_STREAK - 1) control(quiz, '下一题').emit('click');
    }
    expect(text(quiz)).toContain('连续 5 题全部答对');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(control(quiz, 'a8', 'square').disabled).toBe(true);
  });
});

describe('攻击范围测验', () => {
  it('按棋子走法计算范围，并体现位置差异', () => {
    expect(pieceRangeSquares('R', 'd4')).toHaveLength(14);
    expect(pieceRangeSquares('B', 'd4')).toHaveLength(13);
    expect(pieceRangeSquares('B', 'a1')).toHaveLength(7);
    expect(pieceRangeSquares('N', 'd4')).toHaveLength(8);
    expect(pieceRangeSquares('N', 'a1')).toHaveLength(2);
    expect(pieceRangeSquares('K', 'd4')).toHaveLength(8);
    expect(pieceRangeSquares('Q', 'd4')).toHaveLength(27);
    expect(pieceRangeSquares('P', 'e4').sort()).toEqual(['d5', 'f5']);
  });

  it('漏选和多选会标出，六轮全部答对才完成', () => {
    const onComplete = vi.fn();
    const quiz = mountRanges(onComplete);

    control(quiz, '检查').emit('click');
    expect(text(quiz)).toContain('漏选 14 格');
    expect(control(quiz, 'd5', 'square').classList.contains('is-missing')).toBe(true);

    pieceRangeSquares('R', 'd4').forEach((square) => control(quiz, square, 'square').emit('click'));
    control(quiz, 'e5', 'square').emit('click');
    control(quiz, '检查').emit('click');
    expect(text(quiz)).toContain('多选 1 格');
    expect(control(quiz, 'e5', 'square').classList.contains('is-extra')).toBe(true);

    control(quiz, 'e5', 'square').emit('click');
    control(quiz, '检查').emit('click');
    expect(text(quiz)).toContain('答对了');

    for (let index = 1; index < PIECE_RANGE_ROUNDS.length; index += 1) {
      control(quiz, '下一题').emit('click');
      const round = PIECE_RANGE_ROUNDS[index];
      pieceRangeSquares(round.piece, round.square).forEach((square) => control(quiz, square, 'square').emit('click'));
      control(quiz, '检查').emit('click');
    }

    expect(text(quiz)).toContain('六种棋子的攻击范围全部答对');
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(control(quiz, 'd5', 'square').disabled).toBe(true);
  });
});
