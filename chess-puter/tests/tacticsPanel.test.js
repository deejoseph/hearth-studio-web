import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BASIC_PROBLEMS } from '../src/game/basicProblems.js';
import { getProgress, recordAttempt, saveProblemSet } from '../src/game/tacticsStore.js';
import { mountTacticsPanel } from '../src/ui/tacticsPanel.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function fakeNode(name = '', text = '') {
  const classes = new Set();
  const listeners = new Map();
  const attributes = new Map();
  const node = {
    name,
    children: [],
    className: '',
    dataset: {},
    attributes,
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
    setAttribute: (name, value) => attributes.set(name, String(value)),
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

function reviewButton(container) {
  return findAll(container, (node) => node.className === 'btn btn-primary btn-sm tactics-review-btn')[0];
}

function mount({ canManage = false, importContainer = null, problems = BASIC_PROBLEMS, onProgress = () => {} } = {}) {
  const container = fakeNode('div');
  const importRoot = importContainer ?? fakeNode('div');
  const positions = [];
  vi.stubGlobal('document', {
    createElement: (name) => fakeNode(name),
    createTextNode: (text) => fakeNode('#text', text),
  });
  const panel = mountTacticsPanel(container, {
    canManage,
    importContainer: importRoot,
    problems,
    onProgress,
    setFen: (fen) => positions.push(fen),
    getFen: () => START_FEN,
  });
  return { container, importContainer: importRoot, panel, positions };
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
    const { container, importContainer, panel } = mount();
    const importSection = importContainer.children[0];
    const manage = findAll(container, (node) => node.className === 'tactics-more tactics-manage')[0];
    expect(panel.getState()).toMatchObject({ canManage: false, status: 'solving' });
    expect(panel.getState().problems).toHaveLength(BASIC_PROBLEMS.length);
    expect(importSection.hidden).toBe(true);
    expect(manage.hidden).toBe(true);
    expect(panel.checkMove('e2e4')).toBe(true);
    expect(panel.getState().status).toBe('correct');
  });

  it('导入区可挂到教练课件页签，并随教练资格隐藏', () => {
    const importContainer = fakeNode('div');
    const { container, panel } = mount({ canManage: true, importContainer });
    const importSection = importContainer.children[0];
    expect(container.children).toHaveLength(3);
    expect(importSection.className).toBe('tactics-more tactics-import');
    expect(importSection.hidden).toBe(false);
    expect(importSection.open).toBe(true);
    panel.setCanManage(false);
    expect(importSection.hidden).toBe(true);
    expect(importSection.open).toBe(false);
  });

  it('教练课件里导入题目后先选中题目，不谎称已摆上棋盘', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    const { importContainer, panel, positions } = mount({ canManage: true, problems: [] });
    const textarea = findAll(importContainer, (node) => node.className === 'tactics-textarea')[0];
    const button = findAll(importContainer, (node) => node.textContent === '导入')[0];
    textarea.value = `fen: ${fen}\nsolution: Qxf7#\ndifficulty: 900`;
    button.emit('click');

    expect(panel.getState()).toMatchObject({ canManage: true, status: 'solving' });
    expect(panel.getState().problems).toHaveLength(1);
    expect(positions).toEqual([fen]);
    const result = findAll(importContainer, (node) => node.className.startsWith('tactics-import-result'))[0];
    expect(result.textContent).toBe('成功导入 1 道题，打开练习即可开始解题。');
  });

  it('资格变化只切换管理 UI，不重置当前题目', () => {
    const { container, importContainer, panel } = mount();
    panel.selectProblemById('basic-tactics-fork');
    panel.setCanManage(true);
    expect(importContainer.children[0].hidden).toBe(false);
    expect(importContainer.children[0].open).toBe(true);
    expect(panel.getState()).toMatchObject({ canManage: true, currentProblemId: 'basic-tactics-fork' });
    panel.setCanManage(false);
    expect(importContainer.children[0].hidden).toBe(true);
    expect(panel.getState().currentProblemId).toBe('basic-tactics-fork');
  });

  it('管理按钮被程序触发也不能越过当前权限', () => {
    saveProblemSet('不该加载', [{ id: 'other', fen: START_FEN, solution: ['d2d4'] }]);
    const { container, panel } = mount();
    const load = findAll(container, (node) => node.name === 'button' && node.textContent === '加载')[0];
    load.emit('click');
    expect(panel.getState().currentProblemId).toBe(BASIC_PROBLEMS[0].id);
  });

  it('内置题目参与翻译，用户导入题目保留原文', () => {
    const contentSelectors = ['tactics-hint', 'problem-id', 'problem-tags'];
    const contentChildren = (container) => contentSelectors.flatMap((className) =>
      findAll(container, (node) => node.className === className).flatMap((node) => node.children));

    const builtin = contentChildren(mount({ problems: [BASIC_PROBLEMS[0]] }).container);
    expect(builtin).toHaveLength(5);
    for (const child of builtin) {
      expect(child.name).toBe('#text');
      expect(child.attributes.has('data-i18n-skip')).toBe(false);
    }

    const imported = {
      id: 'imported',
      source: 'manual',
      title: '我的题目',
      prompt: '请找到最佳走法。',
      tags: ['我的标签'],
      fen: START_FEN,
      solution: ['e2e4'],
    };
    const custom = contentChildren(mount({ problems: [imported] }).container)
      .filter((child) => child.name === 'span');
    expect(custom).toHaveLength(4);
    for (const child of custom) {
      expect(child.attributes.get('data-i18n-skip')).toBe('');
    }
    expect(new Set(custom.map((child) => child.textContent)))
      .toEqual(new Set(['我的题目', '请找到最佳走法。', '我的标签']));
  });
});

describe('教程推荐选题', () => {
  it('章节练习按推荐顺序切换，最后一题不会跳到其他章节', () => {
    const { container, panel } = mount();
    const ids = [
      'basic-pieces-pawn', 'basic-pieces-knight', 'basic-pieces-bishop',
      'basic-pieces-rook', 'basic-pieces-queen', 'basic-pieces-king',
    ];
    expect(panel.selectLesson(ids)).toBe(true);
    expect(panel.getState().problems.map((problem) => problem.id)).toEqual(ids);
    const next = findAll(container, (node) => node.name === 'button' && node.textContent === '下一题 →')[0];
    for (const id of ids.slice(1)) {
      next.emit('click');
      expect(panel.getState().currentProblemId).toBe(id);
    }
    expect(next.disabled).toBe(true);
  });

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

  it('错题本按答错次数降序，并显示每题错了几次', () => {
    const low = BASIC_PROBLEMS[0];
    const high = BASIC_PROBLEMS[1];
    recordAttempt(low.id, false);
    recordAttempt(high.id, false);
    recordAttempt(high.id, false);
    const { container } = mount();

    enableMistakesFilter(container);

    expect(visibleProblemIds(container)).toEqual([high.id, low.id]);
    const meta = findAll(container, (node) => node.className === 'problem-meta');
    expect(meta.some((node) => node.textContent.includes('错 2 次'))).toBe(true);
    expect(meta.some((node) => node.textContent.includes('错 1 次'))).toBe(true);
  });

  it('复习队列按错次进入，答对后移出并显示完成状态', () => {
    const problems = [
      { id: 'review-low', title: '低错次', fen: START_FEN, solution: ['e2e4'], difficulty: 1000 },
      { id: 'review-high', title: '高错次', fen: START_FEN, solution: ['d2d4'], difficulty: 1000 },
      { id: 'review-done', title: '已解决', fen: START_FEN, solution: ['g1f3'], difficulty: 1000 },
    ];
    recordAttempt('review-low', false);
    recordAttempt('review-high', false);
    recordAttempt('review-high', false);
    recordAttempt('review-done', true);
    const { container, panel } = mount({ problems });
    const start = reviewButton(container);

    expect(start.textContent).toBe('复习错题 (2)');
    start.emit('click');

    expect(panel.getState()).toMatchObject({
      reviewMode: true,
      currentProblemId: 'review-high',
      problems: [problems[1], problems[0]],
    });
    expect(findAll(container, (node) => node.className === 'tactics-counter')[0].textContent)
      .toContain('复习 1 / 2 · 剩 2 题');
    expect(panel.checkMove('d2d4')).toBe(true);
    expect(visibleProblemIds(container)).toEqual(['review-low']);

    const next = findAll(container, (node) => node.name === 'button' && node.textContent === '下一题 →')[0];
    next.emit('click');
    expect(panel.checkMove('e2e4')).toBe(true);
    expect(visibleProblemIds(container)).toEqual([]);
    expect(findAll(container, (node) => node.textContent === '复习完成，错题本已清空。')).toHaveLength(1);
    expect(start.textContent).toBe('退出复习');

    start.emit('click');
    expect(panel.getState().reviewMode).toBe(false);
    expect(panel.getState().currentProblemId).toBe('review-low');
  });

  it('复习中再次答错会按最新错次重新排序', () => {
    localStorage.setItem('chess-tactics-store', JSON.stringify({
      favorites: [],
      progress: {
        low: { attempts: 1, solved: false, lastAttempt: 1 },
        high: { attempts: 2, solved: false, lastAttempt: 2 },
      },
      problemSets: {},
      userRating: 1000,
      readTopics: [],
    }));
    const problems = [
      { id: 'low', fen: START_FEN, solution: ['e2e4'], difficulty: 1000 },
      { id: 'high', fen: START_FEN, solution: ['d2d4'], difficulty: 1000 },
    ];
    const { container, panel } = mount({ problems });
    reviewButton(container).emit('click');
    const next = findAll(container, (node) => node.name === 'button' && node.textContent === '下一题 →')[0];
    next.emit('click');

    expect(panel.checkMove('d2d4')).toBe(false);

    expect(panel.getState().problems.map((problem) => problem.id)).toEqual(['low', 'high']);
    expect(panel.getState().currentProblemId).toBe('low');
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
