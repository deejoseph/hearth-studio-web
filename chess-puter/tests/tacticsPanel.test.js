import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASIC_PROBLEMS } from '../src/game/basicProblems.js';
import { getProgress, recordAttempt, saveProblemSet } from '../src/game/tacticsStore.js';
import { mountTacticsPanel } from '../src/ui/tacticsPanel.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function fakeNode(name = '', text = '') {
  const classes = new Set();
  const listeners = new Map();
  const node = {
    name,
    children: [],
    className: '',
    dataset: {},
    hidden: false,
    open: false,
    disabled: false,
    checked: false,
    value: '',
    _text: text,
    classList: {
      add: (value) => classes.add(value),
      toggle: (value, on) => (on ? classes.add(value) : classes.delete(value)),
      contains: (value) => classes.has(value),
    },
    setAttribute() {},
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    emit(type, event = {}) {
      listeners.get(type)?.(event);
    },
    append(...kids) {
      node.children.push(...kids);
    },
    appendChild(kid) {
      node.children.push(kid);
      return kid;
    },
    replaceChildren(...kids) {
      node.children.length = 0;
      node.children.push(...kids);
    },
    focus() {},
    remove() {
      node.removed = true;
    },
  };
  Object.defineProperty(node, 'textContent', {
    get: () => node._text,
    set: (value) => { node._text = String(value); },
  });
  Object.defineProperty(node, 'innerHTML', {
    get: () => '',
    set: (value) => {
      if (value === '') node.children.length = 0;
    },
  });
  Object.defineProperty(node, 'firstChild', {
    get: () => node.children[0] ?? null,
  });
  return node;
}

function findAll(node, predicate) {
  return [node, ...node.children.flatMap((child) => findAll(child, predicate))]
    .filter(predicate);
}

function visibleProblemIds(container) {
  return findAll(container, (node) => Boolean(node.dataset?.problemId))
    .map((node) => node.dataset.problemId);
}

function enableMistakesFilter(container) {
  const boxes = findAll(container, (node) => node.name === 'input' && node.type === 'checkbox');
  const mistakes = boxes[2];
  mistakes.checked = true;
  mistakes.emit('change');
  return mistakes;
}

function mount({ canManage = false, problems = BASIC_PROBLEMS, onProgress = () => {} } = {}) {
  const container = fakeNode('div');
  const positions = [];
  vi.stubGlobal('document', {
    createElement: (name) => fakeNode(name),
    createTextNode: (text) => fakeNode('#text', text),
  });
  const panel = mountTacticsPanel(container, {
    canManage,
    problems,
    onProgress,
    setFen: (fen) => positions.push(fen),
    getFen: () => START_FEN,
  });
  return { container, panel, positions };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  const data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  });
});

describe('公开解题与教练管理', () => {
  it('公众可做题，导入和题目集管理默认隐藏', () => {
    const { container, panel } = mount();
    const importSection = container.children[3];
    const manage = findAll(container, (node) => node.className === 'tactics-more tactics-manage')[0];
    expect(panel.getState()).toMatchObject({ canManage: false, status: 'solving' });
    expect(panel.getState().problems).toHaveLength(BASIC_PROBLEMS.length);
    expect(importSection.hidden).toBe(true);
    expect(manage.hidden).toBe(true);
    expect(panel.checkMove('e2e4')).toBe(true);
    expect(panel.getState().status).toBe('correct');
  });

  it('资格变化只切换管理 UI，不重置当前题目', () => {
    const { container, panel } = mount();
    panel.selectProblemById('basic-tactics-fork');
    panel.setCanManage(true);
    expect(container.children[3].hidden).toBe(false);
    expect(container.children[3].open).toBe(true);
    expect(panel.getState()).toMatchObject({ canManage: true, currentProblemId: 'basic-tactics-fork' });
    panel.setCanManage(false);
    expect(container.children[3].hidden).toBe(true);
    expect(panel.getState().currentProblemId).toBe('basic-tactics-fork');
  });

  it('管理按钮被程序触发也不能越过当前权限', () => {
    saveProblemSet('不该加载', [{ id: 'other', fen: START_FEN, solution: ['d2d4'] }]);
    const { container, panel } = mount();
    const load = findAll(container, (node) => node.name === 'button' && node.textContent === '加载')[0];
    load.emit('click');
    expect(panel.getState().currentProblemId).toBe(BASIC_PROBLEMS[0].id);
  });
});

describe('教程推荐选题', () => {
  it('推荐题清除筛选并按 ID 选中', () => {
    const { container, panel } = mount();
    const search = findAll(container, (node) => node.className === 'tactics-search')[0];
    search.value = '不会命中';
    search.emit('input');
    expect(panel.selectProblemById('basic-pieces-knight')).toBe(true);
    expect(search.value).toBe('');
    expect(panel.getState().currentProblemId).toBe('basic-pieces-knight');
    expect(findAll(container, (node) => node.dataset.problemId === 'basic-pieces-knight')).toHaveLength(1);
  });

  it('教练导入自定义题后，教程推荐仍能把基础题合并回来', () => {
    const custom = { id: 'custom', title: '自定义', fen: START_FEN, solution: ['d2d4'], difficulty: 1000 };
    const { panel } = mount({ canManage: true, problems: [custom] });
    expect(panel.selectProblemById('basic-rules-castle')).toBe(true);
    expect(panel.getState().currentProblemId).toBe('basic-rules-castle');
    expect(panel.getState().problems.some((problem) => problem.id === 'custom')).toBe(true);
  });
});

describe('错题本', () => {
  it('只显示答错且尚未解决的题，并更新错题计数', () => {
    const wrong = BASIC_PROBLEMS[0];
    const solved = BASIC_PROBLEMS[1];
    recordAttempt(wrong.id, false);
    recordAttempt(solved.id, true);
    const { container } = mount();

    enableMistakesFilter(container);

    expect(visibleProblemIds(container)).toEqual([wrong.id]);
    const stats = findAll(container, (node) => node.className === 'tactics-stats-line')[0];
    expect(stats.textContent).toContain('错题 1');
  });

  it('错题解决后立即移出错题本，空列表给出说明', () => {
    const wrong = BASIC_PROBLEMS[0];
    recordAttempt(wrong.id, false);
    const { container, panel } = mount();
    enableMistakesFilter(container);

    expect(panel.checkMove('e2e4')).toBe(true);

    expect(visibleProblemIds(container)).toEqual([]);
    expect(getProgress(wrong.id)).toMatchObject({ attempts: 2, solved: true });
    expect(findAll(container, (node) =>
      node.textContent === '错题本是空的——答错且还没解决的题会出现在这里。')).toHaveLength(1);
  });

  it('教程推荐选题会清除错题本筛选', () => {
    const { container, panel } = mount();
    const mistakes = enableMistakesFilter(container);

    expect(panel.selectProblemById('basic-pieces-knight')).toBe(true);
    expect(mistakes.checked).toBe(false);
    expect(visibleProblemIds(container)).toHaveLength(BASIC_PROBLEMS.length);
  });
});

describe('逐手判题', () => {
  it('错着不推进解法，随后可直接重试正确走法', () => {
    const { panel } = mount();
    expect(panel.checkMove('d2d4')).toBe(false);
    expect(panel.getState()).toMatchObject({ status: 'incorrect', currentMoveIndex: 0 });
    expect(panel.checkMove('e2e4')).toBe(true);
    expect(panel.getState().status).toBe('correct');
  });

  it('进度回调只在答错或整题解答完成后触发', () => {
    const problem = {
      id: 'multi-progress',
      title: '连续走子',
      fen: START_FEN,
      solution: ['e2e4', 'e7e5', 'g1f3'],
      difficulty: 1000,
    };
    const onProgress = vi.fn();
    const { panel } = mount({ problems: [problem], onProgress });
    expect(panel.checkMove('e2e4')).toBe(true);
    expect(onProgress).not.toHaveBeenCalled();
    expect(panel.checkMove('d2d4')).toBe(false);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(panel.checkMove('e7e5')).toBe(true);
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(panel.checkMove('g1f3')).toBe(true);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('多手解法由做题者走完双方回合，最后才记为解决', () => {
    const problem = {
      id: 'multi',
      title: '连续走子',
      fen: START_FEN,
      solution: ['e2e4', 'e7e5', 'g1f3'],
      difficulty: 1000,
    };
    const { panel } = mount({ problems: [problem] });
    expect(panel.checkMove('e2e4')).toBe(true);
    expect(panel.getState()).toMatchObject({ status: 'solving', currentMoveIndex: 1 });
    expect(panel.checkMove('e7e5')).toBe(true);
    expect(panel.getState()).toMatchObject({ status: 'solving', currentMoveIndex: 2 });
    expect(panel.checkMove('g1f3')).toBe(true);
    expect(panel.getState()).toMatchObject({ status: 'correct', currentMoveIndex: 3 });
    expect(getProgress('multi')).toMatchObject({ attempts: 1, solved: true });
  });
});
