import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Chess, START_FEN } from '../src/engine/chess.js';
import { Clock } from '../src/game/clock.js';
import { BASIC_PROBLEMS } from '../src/game/basicProblems.js';
import { learnTopic } from '../src/game/learnContent.js';
import {
  appendToBranch,
  branchAt,
  clearBranches,
  getActiveBranch,
  getBranches,
  restoreBranches,
  setActiveBranch,
} from '../src/game/variations.js';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

function extract(name) {
  const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0];
  if (!match) throw new Error(`main.js 里找不到 ${name}`);
  return match;
}

describe('练习走法隔离', () => {
  it('错着立即撤销，正确着保留且按 UCI 判题', () => {
    const game = new Chess();
    const checked = [];
    const { acceptTacticsMove } = new Function('game', 'tacticsPanel',
      `${extract('acceptTacticsMove')}
       return { acceptTacticsMove };`,
    )(game, { checkMove: (uci) => { checked.push(uci); return uci === 'e2e4'; } });

    game.move({ from: 'd2', to: 'd4' });
    expect(acceptTacticsMove(game.lastMove())).toBe(false);
    expect(game.fen()).toBe(START_FEN);
    expect(game.history()).toHaveLength(0);

    game.move({ from: 'e2', to: 'e4' });
    expect(acceptTacticsMove(game.lastMove())).toBe(true);
    expect(game.history().map((move) => move.san)).toEqual(['e4']);
    expect(checked).toEqual(['d2d4', 'e2e4']);
  });

  it('练习态不写普通对局存档', () => {
    const calls = [];
    const { saveNow } = new Function(
      'tacticsMode', 'mode', 'gameFinished', 'game', 'clearGame',
      'saveGame', 'gameTimeId', 'clock', 'clockStack', 'myColor', 'calls',
      `let hasSave = true;
       ${extract('saveNow')}
       return { saveNow };`,
    )(true, 'local', () => false, new Chess(), () => calls.push('clear'),
      (value) => calls.push(value), () => 'unlimited', new Clock(null), [], 'w', calls);

    saveNow();
    expect(calls).toEqual([]);
  });

  it('练习态电脑不应棋', () => {
    let computerTurns = 0;
    const { afterMove } = new Function(
      'mode', 'tacticsMode', 'game', 'renderAll', 'showEnd', 'describeEnd',
      'analyzing', 'computerTurn',
      `${extract('afterMove')}
       return { afterMove };`,
    )('computer', true, new Chess(), () => {}, () => {}, () => null, false,
      () => { computerTurns++; });

    afterMove();
    expect(computerTurns).toBe(0);
  });
});

describe('终局与历史回看隔离', () => {
  it('原局认输或判和后，题面仍按自身终局判断', () => {
    const manualEnd = { kind: 'resign', title: '你输了' };
    const harness = new Function(
      'game', 'manualEnd',
      `let tacticsMode = true;
       let mode = 'local';
       let onlineEnd = null;
       ${extract('currentEnd')}
       return {
         currentEnd,
         leavePractice() { tacticsMode = false; },
       };`,
    )(new Chess(), manualEnd);

    expect(harness.currentEnd()).toBe(null);
    harness.leavePractice();
    expect(harness.currentEnd()).toBe(manualEnd);
  });

  it('历史回看标记不会锁住练习走法', () => {
    const { movableColorNow } = new Function(
      'game',
      `let tacticsMode = true;
       let reviewIndex = 0;
       let analyzing = false;
       const gameFinished = () => false;
       const reviewing = () => reviewIndex !== null;
       ${extract('movableColorNow')}
       return { movableColorNow };`,
    )(new Chess());

    expect(movableColorNow()).toBe('w');
  });

  it('练习态不能启动逐手复盘', () => {
    const game = new Chess();
    game.move({ from: 'e2', to: 'e4' });
    const { canReview } = new Function(
      'game',
      `let tacticsMode = true;
       let mode = 'local';
       let onlineUiState = 'idle';
       ${extract('canReview')}
       return { canReview };`,
    )(game);

    expect(canReview()).toBe(false);
  });
});

describe('原对局快照', () => {
  it('恢复走法、钟、视角、支线、复盘报告和统计状态', () => {
    const game = new Chess();
    game.move({ from: 'e2', to: 'e4' });
    game.move({ from: 'e7', to: 'e5' });
    const originalFen = game.fen();
    const branch = branchAt([], 0, 'd4');
    appendToBranch(branch, 'd5');
    setActiveBranch(branch, 1);
    const orientations = [];
    const harness = new Function(
      'Chess', 'Clock', 'START_FEN', 'game', 'getActiveBranch', 'getBranches',
      'restoreBranches', 'setActiveBranch', 'clearBranches', 'clearSelection', 'boardView',
      `let gameOrigin = START_FEN;
       let myColor = 'b';
       let viewColor = 'b';
       let analyzing = false;
       let clock = new Clock({ id: '5+0', initial: 300000, increment: 0 });
       let clockStack = [{ w: 300000, b: 300000 }];
       let lowAnnounced = { w: false, b: true };
       let manualEnd = null;
       let reviewData = { results: [{ cls: 'good' }], sans: ['e4', 'e5'], fens: [START_FEN, START_FEN] };
       let reviewOpen = true;
       let reviewMounts = 0;
       let reviewIndex = 1;
       let startTracked = true;
       let endTracked = false;
       let archiveId = 'g-saved';
       let announcedPlies = 2;
       let tacticsReturn = null;
       let tacticsViewColor = 'w';
       const gameTimeId = () => '5+0';
       const bottomColor = () => myColor;
       const clearReview = () => { reviewData = null; reviewOpen = false; };
       const showReviewResults = () => { reviewMounts++; };
       const setReviewReportOpen = (open) => { reviewOpen = open; };
       const loadBoard = (fen) => { game.load(fen); gameOrigin = fen; clearReview(); };
       ${extract('saveTacticsReturn')}
       ${extract('restoreTacticsReturn')}
       return {
         saveTacticsReturn,
         restoreTacticsReturn,
         usePuzzle(saved) {
           tacticsReturn = saved;
           game.load('${BASIC_PROBLEMS[0].fen}');
           clock = new Clock(null);
           clockStack = [];
           clearBranches();
           clearReview();
         },
         state() {
           return {
             fen: game.fen(), origin: gameOrigin, myColor, viewColor,
             clock: clock.snapshot(), clockStack, lowAnnounced, manualEnd, reviewIndex,
             reviewData, reviewOpen, reviewMounts,
             startTracked, endTracked, archiveId, announcedPlies,
             branches: getBranches(), activeBranch: getActiveBranch(), tacticsReturn,
           };
         },
       };`,
    )(Chess, Clock, START_FEN, game, getActiveBranch, getBranches,
      restoreBranches, setActiveBranch, clearBranches, () => {}, { setOrientation: (color) => orientations.push(color) });

    const saved = harness.saveTacticsReturn();
    expect(saved.clock).toEqual({ w: 300000, b: 300000 });
    harness.usePuzzle(saved);
    harness.restoreTacticsReturn();

    expect(harness.state()).toMatchObject({
      fen: originalFen,
      origin: START_FEN,
      myColor: 'b',
      viewColor: 'b',
      clock: { w: 300000, b: 300000 },
      lowAnnounced: { w: false, b: true },
      reviewIndex: 1,
      reviewData: saved.reviewData,
      reviewOpen: true,
      reviewMounts: 1,
      startTracked: true,
      endTracked: false,
      archiveId: 'g-saved',
      announcedPlies: 2,
      activeBranch: { path: [0], ply: 1 },
      tacticsReturn: null,
    });
    expect(harness.state().branches).toEqual(saved.branches);
    expect(game.history().map((move) => move.san)).toEqual(['e4', 'e5']);
    expect(orientations).toEqual(['b']);
  });
});

describe('练习界面', () => {
  it('题库打开和关闭时同步卡片、布局与按钮状态', () => {
    const classes = new Set(['hidden']);
    const pressed = [];
    const { paintTacticsColumn } = new Function(
      'tacticsMode', 'els',
      `${extract('paintTacticsColumn')}
       return { paintTacticsColumn };`,
    )(true, {
      layout: { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } },
      tacticsCard: { classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) } },
      tacticsBtn: { setAttribute: (name, value) => pressed.push([name, value]) },
    });

    paintTacticsColumn();
    expect(classes.has('tactics-open')).toBe(true);
    expect(classes.has('hidden')).toBe(false);
    expect(pressed).toEqual([['aria-pressed', 'true']]);
  });

  it('练习态隐藏钟面，关闭后恢复原局钟', () => {
    const top = { classList: { toggle(name, on) { this.hidden = on; } } };
    const bottom = { classList: { toggle(name, on) { this.hidden = on; } } };
    const { renderClocks } = new Function(
      'clock', 'tacticsMode', 'els',
      `${extract('renderClocks')}
       return { renderClocks };`,
    )({ enabled: true }, true, { clockTop: top, clockBottom: bottom });

    renderClocks();
    expect(top.classList.hidden).toBe(true);
    expect(bottom.classList.hidden).toBe(true);
  });
});

describe('公开入口与会话隔离', () => {
  function makeHarness({
    state = 'none', roomCode = null, classCode = null,
    onlineUiState = 'idle', classUiState = 'idle', reviewAnalyzing = false,
  } = {}) {
    const game = new Chess();
    const mounted = [];
    const toasts = [];
    const harness = new Function(
      'game', 'BASIC_PROBLEMS', 'learnTopic', 'mounted', 'toasts',
      `let tacticsPanel = null;
       let tacticsMode = false;
       let tacticsReturn = null;
       let tacticsViewColor = 'w';
       let aiToken = 0;
       let thinking = false;
       let analyzing = false;
       let reviewPanel = null;
       let reviewIndex = 1;
       let reviewAnalyzing = ${JSON.stringify(reviewAnalyzing)};
       let onlineUiState = ${JSON.stringify(onlineUiState)};
       let classUiState = ${JSON.stringify(classUiState)};
       let selected = null;
       let loads = 0;
       let saves = 0;
       let clearReviews = 0;
       const mode = 'local';
       const roomGame = { code: ${JSON.stringify(roomCode)} };
       const classSession = { code: ${JSON.stringify(classCode)} };
       const account = { player: () => null };
       const coachApp = { state: () => ${JSON.stringify(state)} };
       const saveTacticsReturn = () => { saves++; return { saved: true }; };
       const restoreTacticsReturn = () => {};
       const clearReview = () => { clearReviews++; };
       const loadBoard = (fen) => game.load(fen);
       const renderAll = () => 0;
       const gameFinished = () => false;
       const updateTacticsHighlight = () => {};
       const boardView = { setOrientation: () => {} };
       const chrome = { classList: { toggle() {} }, setAttribute() {} };
       const els = { tacticsPanelContainer: {}, layout: chrome, tacticsCard: chrome, tacticsBtn: chrome };
       const showToast = (text) => toasts.push(text);
       const mountTacticsPanel = (container, options) => {
         mounted.push(options);
         selected = BASIC_PROBLEMS[0].id;
         loads++;
         options.setFen(BASIC_PROBLEMS[0].fen);
         return {
           setCanManage() {},
           getState() { return { currentProblemId: selected }; },
           selectProblemById(id) { selected = id; loads++; return true; },
         };
       };
       ${extract('canManageTactics')}
       ${extract('paintTacticsColumn')}
       ${extract('openTactics')}
       ${extract('openPractice')}
       ${extract('closeTactics')}
       return {
         openTactics,
         openPractice,
         closeTactics,
         isOpen: () => tacticsMode,
         selected: () => selected,
         loads: () => loads,
         saves: () => saves,
         clearReviews: () => clearReviews,
         reviewIndex: () => reviewIndex,
       };`,
    )(game, BASIC_PROBLEMS, learnTopic, mounted, toasts);
    return { ...harness, mounted, toasts };
  }

  it('未登录公众也能从教程直接进入推荐题', () => {
    const harness = makeHarness();
    expect(harness.openPractice('pieces')).toBe(true);
    expect(harness.isOpen()).toBe(true);
    expect(harness.selected()).toBe('basic-pieces-pawn');
    expect(harness.reviewIndex()).toBe(null);
    expect(harness.clearReviews()).toBe(1);
    expect(harness.mounted[0]).toMatchObject({ canManage: false, problems: BASIC_PROBLEMS });
  });

  it('在线对弈或课堂进行中先提示离开，不覆盖题面', () => {
    const cases = [
      ...['creating', 'hosting', 'joining', 'playing'].map((onlineUiState) => ({
        roomCode: 'ROOM1', onlineUiState,
      })),
      ...['creating', 'joining', 'teaching', 'spectating'].map((classUiState) => ({
        classCode: '1234', classUiState,
      })),
    ];
    for (const options of cases) {
      const harness = makeHarness(options);
      harness.openPractice('setup');
      expect(harness.isOpen()).toBe(false);
      expect(harness.mounted).toHaveLength(0);
      expect(harness.saves()).toBe(0);
      expect(harness.toasts[0]).toContain('先离开');
    }
  });

  it('已结束的在线对弈或课堂不再挡住公开练习', () => {
    for (const options of [
      { roomCode: 'ROOM1', onlineUiState: 'ended' },
      { classCode: '1234', classUiState: 'ended' },
    ]) {
      const harness = makeHarness(options);
      expect(harness.openPractice('setup')).toBe(true);
      expect(harness.isOpen()).toBe(true);
      expect(harness.selected()).toBe('basic-setup-e2-e4');
    }
  });

  it('复盘还在计算时先提示，不保存也不覆盖棋盘', () => {
    const harness = makeHarness({ reviewAnalyzing: true });
    harness.openPractice('setup');
    expect(harness.isOpen()).toBe(false);
    expect(harness.mounted).toHaveLength(0);
    expect(harness.saves()).toBe(0);
    expect(harness.toasts[0]).toContain('复盘还在计算');
  });

  it('重开题库会重新载入刚才那道题', () => {
    const harness = makeHarness();
    harness.openPractice('pieces');
    const loads = harness.loads();
    harness.closeTactics();
    harness.openTactics();
    expect(harness.isOpen()).toBe(true);
    expect(harness.selected()).toBe('basic-pieces-pawn');
    expect(harness.loads()).toBe(loads + 1);
  });
});
