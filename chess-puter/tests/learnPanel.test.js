import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEARN_TOPICS, learnTopicProgress } from '../src/game/learnContent.js';
import { getProgress, getReadTopics, markTopicRead, recordAttempt } from '../src/game/tacticsStore.js';
import { indexToSquare } from '../src/engine/chess.js';
import { SETUP_QUIZ_ID, standardSetupBoard } from '../src/ui/setupQuiz.js';
import { COORDINATE_QUIZ_ID, squareColor } from '../src/ui/coordinateQuiz.js';
import { PIECE_RANGE_ROUNDS, pieceRangeSquares } from '../src/ui/pieceRangeQuiz.js';
import { mountLearnPanel } from '../src/ui/learnPanel.js';

function fakeNode() {
  const classes = new Set();
  const listeners = new Map();
  const attributes = new Map();
  const node = {
    children: [],
    className: '',
    dataset: {},
    open: false,
    hidden: false,
    tabIndex: 0,
    scrollTop: 0,
    classList: {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      toggle: (value, on) => (on ? classes.add(value) : classes.delete(value)),
      contains: (value) => classes.has(value),
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    addEventListener(type, fn) { listeners.set(type, fn); },
    emit(type, event) { listeners.get(type)?.(event); },
    focus() { node.focused = true; },
    append(...children) { node.children.push(...children); },
    appendChild(child) { node.children.push(child); return child; },
    replaceChildren(...children) { node.children = children; },
    querySelectorAll(selector) {
      const attribute = selector.match(/^\[data-([\w-]+)\]$/)?.[1];
      return descendants(node).filter((child) => attribute && child.dataset[attribute] !== undefined);
    },
    showModal() { node.open = true; },
    close() { node.open = false; },
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
  if (node.text === undefined && node.children && node.children.length) {
    return node.children.map(text).join('');
  }
  return node.text ?? node._text ?? '';
}

function mount({ stored = null, onPractice = () => {} } = {}) {
  const ids = [
    'learn-tab', 'promo-tab', 'learn-panel', 'platform-promo-panel',
    'learn-card', 'learn-dialog', 'learn-dialog-step', 'learn-dialog-title',
    'learn-dialog-body', 'learn-prev-btn', 'learn-next-btn', 'learn-close-btn',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, fakeNode()]));
  const topics = LEARN_TOPICS.map((topic) => {
    const button = fakeNode();
    button.dataset.learnTopic = topic.id;
    return button;
  });
  elements['learn-card'].querySelectorAll = () => topics;
  vi.stubGlobal('document', {
    getElementById: (id) => elements[id],
    createElement: () => fakeNode(),
    createTextNode: (value) => ({ textContent: String(value) }),
  });
  const data = new Map();
  if (stored !== null) data.set('chess-tactics-store', JSON.stringify(stored));
  vi.stubGlobal('localStorage', {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  });
  const body = elements['learn-dialog-body'];
  return {
    panel: mountLearnPanel({ onPractice }), topics, body, elements,
  };
}

function findText(node, value) {
  return descendants(node).filter((child) => text(child) === value).at(-1);
}

beforeEach(() => vi.unstubAllGlobals());

describe('教程与平台标签', () => {
  it('默认显示平台亮点，点击后只切换对应面板', () => {
    const { elements } = mount();
    const { 'learn-tab': learn, 'promo-tab': promo } = elements;
    const learnPanel = elements['learn-panel'];
    const promoPanel = elements['platform-promo-panel'];
    expect(learn.getAttribute('aria-selected')).toBe('false');
    expect(promo.getAttribute('aria-selected')).toBe('true');
    expect(learnPanel.hidden).toBe(true);
    expect(promoPanel.hidden).toBe(false);

    learn.emit('click');
    expect(learn.getAttribute('aria-selected')).toBe('true');
    expect(promo.getAttribute('aria-selected')).toBe('false');
    expect(learnPanel.hidden).toBe(false);
    expect(promoPanel.hidden).toBe(true);
    expect(learn.tabIndex).toBe(0);
    expect(promo.tabIndex).toBe(-1);
  });

  it('左右方向键循环切换标签并移动焦点', () => {
    const { elements } = mount();
    const learn = elements['learn-tab'];
    const promo = elements['promo-tab'];
    let prevented = false;
    promo.emit('keydown', {
      key: 'ArrowLeft',
      preventDefault() { prevented = true; },
    });
    expect(prevented).toBe(true);
    expect(learn.focused).toBe(true);
    expect(elements['learn-panel'].hidden).toBe(false);

    learn.emit('keydown', {
      key: 'ArrowLeft',
      preventDefault() {},
    });
    expect(promo.focused).toBe(true);
    expect(elements['platform-promo-panel'].hidden).toBe(false);
  });
});

describe('教程练习进度', () => {
  it('缺少进度字段的旧存档按零进度显示，阅读课单独标注', () => {
    const { topics } = mount({ stored: { favorites: [], problemSets: {} } });
    for (const topic of topics) {
      const config = LEARN_TOPICS.find((item) => item.id === topic.dataset.learnTopic);
      const expected = config.practiceIds?.length || config.quizzes?.length ? '练习 0/' : '阅读课';
      expect(text(topic)).toContain(expected);
      expect(topic.getAttribute('aria-label')).toContain(expected);
    }
  });

  it('多题课程按已解决题数显示部分进度', () => {
    const { topics } = mount({
      stored: {
        favorites: [], problemSets: {}, userRating: 1000,
        progress: { 'basic-rules-castle': { attempts: 1, solved: true, lastAttempt: 1 } },
      },
    });
    expect(text(topics[2])).toContain('练习 1/4');
    expect(topics[2].classList.contains('is-complete')).toBe(false);
  });

  it('答题后刷新卡片和已打开弹窗，全部完成后允许再练', () => {
    const { panel, topics, body } = mount();
    panel.open('rules');
    body.scrollTop = 120;

    recordAttempt('basic-rules-castle', true);
    panel.refresh();
    expect(text(topics[2])).toContain('练习 1/4');
    expect(findText(body, '本节练习 1/4')).toBeTruthy();
    expect(body.scrollTop).toBe(120);

    for (const id of LEARN_TOPICS.find((topic) => topic.id === 'rules').practiceIds) {
      recordAttempt(id, true);
    }
    panel.refresh();
    expect(text(topics[2])).toContain('已完成');
    expect(topics[2].classList.contains('is-complete')).toBe(true);
    expect(findText(body, '本节已完成')).toBeTruthy();
    expect(findText(body, '再练一次：特殊规则')).toBeTruthy();
  });

  it('练一练打开独立练习弹窗，教程弹窗保持打开', () => {
    const opened = [];
    const { panel, topics, body, elements } = mount({ onPractice: (id) => opened.push(id) });
    panel.open('pieces');
    findText(body, '练一练：棋子怎么走').emit('click');
    expect(opened).toEqual(['pieces']);
    expect(elements['learn-dialog'].open).toBe(true);
    topics[1].emit('click');
    expect(elements['learn-dialog'].open).toBe(true);
  });

  it('阅读课可以打开和翻页，但不会显示找不到题的练一练入口', () => {
    const { panel, topics, body, elements } = mount();
    panel.open('etiquette');
    expect(text(body)).toContain('触摸走子');
    expect(findText(body, '本节阅读课')).toBeTruthy();
    expect(text(body)).not.toContain('练一练');
    expect(text(topics[5])).toContain('阅读课');

    elements['learn-next-btn'].emit('click');
    expect(elements['learn-dialog-step'].textContent).toContain('第 7 / 7 节');
    expect(text(body)).toContain('AlphaGo');
    expect(text(body)).toContain('蒙特卡洛树搜索');
    expect(findText(body, '本节阅读课')).toBeTruthy();
    expect(text(body)).not.toContain('练一练');
    expect(text(topics[6])).toContain('阅读课');
  });

  it('阅读课标记已读后立即完成，重新挂载仍保留完成状态', () => {
    const { panel, topics, body } = mount();
    panel.open('etiquette');
    findText(body, '我已读完，标记完成').emit('click');

    expect(getReadTopics()).toEqual(['etiquette']);
    expect(text(topics[5])).toContain('已完成');
    expect(topics[5].classList.contains('is-complete')).toBe(true);
    expect(findText(body, '本节已完成')).toBeTruthy();
    expect(findText(body, '已完成').disabled).toBe(true);

    const stored = JSON.parse(localStorage.getItem('chess-tactics-store'));
    const remounted = mount({ stored });
    expect(text(remounted.topics[5])).toContain('已完成');
    remounted.panel.open('etiquette');
    expect(findText(remounted.body, '本节已完成')).toBeTruthy();
  });

  it('阅读课标记幂等，不影响练习课完成规则', () => {
    mount();
    markTopicRead('etiquette');
    markTopicRead('etiquette');
    expect(getReadTopics()).toEqual(['etiquette']);
    expect(learnTopicProgress(LEARN_TOPICS.find((topic) => topic.id === 'pieces'), {}, ['etiquette']).complete).toBe(false);
  });

  it('新增规则、开局、战术与价值内容都能在教程中读到', () => {
    const { panel, body } = mount();
    panel.open('pieces');
    expect(text(body)).toContain('双象、双马、一马一象');
    expect(text(body)).toContain('王在普通对局里“无价”');

    panel.open('rules');
    expect(text(body)).toContain('应将有三种基本办法');
    expect(text(body)).toContain('逼和');
    expect(text(body)).toContain('为什么要有和棋设计');

    panel.open('opening');
    expect(text(body)).toContain('轻子和重子');
    expect(text(body)).toContain('短易位是王向 h 侧走两格到 g1');

    panel.open('tactics');
    expect(text(body)).toContain('马头书');
    expect(text(body)).toContain('Lichess Puzzle Database');
  });

  it('没有推荐题的课程不会误报完成', () => {
    expect(learnTopicProgress({ practiceIds: [] }, {})).toEqual({
      solved: 0, total: 0, complete: false,
    });
  });

  it('摆棋与认坐标测验分别写入进度，全部完成后完成本节', () => {
    const { panel, topics, body, elements } = mount();
    panel.open('setup');

    expect(text(body)).toContain('白方左下角 a1 是黑格');
    expect(text(body)).toContain('白后在白格，黑后在黑格');
    expect(text(body)).toContain('两个单数或两个双数是黑格');
    expect(findText(body, '本节练习 0/3')).toBeTruthy();

    findText(body, '开始摆放测验：摆好棋盘').emit('click');
    expect(text(body)).toContain('已放 0 / 32 个棋子');
    expect(elements['learn-prev-btn'].classList.contains('hidden')).toBe(true);
    expect(elements['learn-next-btn'].classList.contains('hidden')).toBe(true);

    standardSetupBoard().forEach((piece, index) => {
      if (!piece) return;
      descendants(body).find((node) => node.dataset?.piece === piece).emit('click');
      descendants(body).find((node) => node.dataset?.square === indexToSquare(index)).emit('click');
    });
    findText(body, '检查摆法').emit('click');

    expect(text(body)).toContain('摆对了！标准开局已经完成。');
    expect(getProgress(SETUP_QUIZ_ID)).toMatchObject({ attempts: 1, solved: true });
    expect(text(topics[0])).toContain('练习 1/3');
    expect(topics[0].classList.contains('is-complete')).toBe(false);

    findText(body, '← 返回教程').emit('click');
    expect(findText(body, '本节练习 1/3')).toBeTruthy();
    expect(findText(body, '再测一次：摆放测验')).toBeTruthy();
    expect(elements['learn-prev-btn'].classList.contains('hidden')).toBe(false);
    expect(elements['learn-next-btn'].classList.contains('hidden')).toBe(false);

    findText(body, '开始认坐标测验：摆好棋盘').emit('click');
    for (let index = 0; index < 5; index += 1) {
      const target = text(body).match(/请点选：([a-h][1-8])/)?.[1];
      expect(target).toBeTruthy();
      descendants(body).find((node) => node.dataset?.square === target).emit('click');
      findText(body, squareColor(target) === 'dark' ? '黑格' : '白格').emit('click');
      if (index < 4) findText(body, '下一题').emit('click');
    }
    expect(text(body)).toContain('连续 5 题全部答对');
    expect(getProgress(COORDINATE_QUIZ_ID)).toMatchObject({ attempts: 1, solved: true });
    expect(text(topics[0])).toContain('练习 2/3');

    findText(body, '← 返回教程').emit('click');
    recordAttempt('basic-setup-e2-e4', true);
    panel.refresh();
    expect(text(topics[0])).toContain('已完成');
    expect(topics[0].classList.contains('is-complete')).toBe(true);
  });

  it('棋子课讲解攻击范围，并能完成六轮范围测验', () => {
    const { panel, topics, body } = mount();
    panel.open('pieces');
    expect(text(body)).toContain('棋子能合法走到哪里，就能控制、威胁到哪里');
    expect(text(body)).toContain('吃过路兵');
    expect(findText(body, '本节练习 0/7')).toBeTruthy();

    findText(body, '开始攻击范围测验：棋子怎么走').emit('click');
    for (let index = 0; index < PIECE_RANGE_ROUNDS.length; index += 1) {
      const round = PIECE_RANGE_ROUNDS[index];
      for (const square of pieceRangeSquares(round.piece, round.square)) {
        descendants(body).find((node) => node.dataset?.square === square).emit('click');
      }
      findText(body, '检查').emit('click');
      if (index < PIECE_RANGE_ROUNDS.length - 1) findText(body, '下一题').emit('click');
    }
    expect(text(body)).toContain('六种棋子的攻击范围全部答对');
    expect(text(topics[1])).toContain('练习 1/7');
  });
});
