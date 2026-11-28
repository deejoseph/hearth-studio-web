import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { Chess } from '../src/engine/chess.js';
import {
  appendToBranch,
  branchAt,
  clearBranches,
  existingMoveAt,
  findBranch,
  getActiveBranch,
  getBranches,
  getNode,
  pruneBranches,
  setActiveBranch,
} from '../src/game/variations.js';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const classCallSource = source.match(/async function classCall\(what\) \{[\s\S]*?\n\}/)?.[0];
const clearAnnotationToolSource = source.match(/function clearAnnotationTool\(\) \{[\s\S]*?\n\}/)?.[0];
const approveStudentSource = source.match(/async function approveStudent\(playerId, approve\) \{[\s\S]*?\n\}/)?.[0];
const rebuildClassSource = source.match(/function rebuildClass\(cls\) \{[\s\S]*?\n\}/)?.[0];
const setToolSource = readFileSync(new URL('../src/ui/annotations.js', import.meta.url), 'utf8')
  .match(/  setTool\(tool\) \{[\s\S]*?\n  \}/)?.[0];

function functionSource(name) {
  const match = source.match(new RegExp(`(?:async )?function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  if (!match) throw new Error(`main.js 里找不到回归测试所需函数：${name}`);
  return match[0];
}

const branchingEnabledSource = functionSource('branchingEnabled');
const describeEndSource = functionSource('describeEnd');
const bottomColorSource = functionSource('bottomColor');
const setViewColorSource = functionSource('setViewColor');
const canUndoSource = functionSource('canUndo');
const newGameSource = functionSource('newGame');
const undoTurnSource = functionSource('undoTurn');
const enterBranchSource = functionSource('enterBranch');
const recordBranchMoveSource = functionSource('recordBranchMove');
const applyClassBranchSource = functionSource('applyClassBranch');
const applyClassUndoSource = functionSource('applyClassUndo');
const applyClassResetSource = functionSource('applyClassReset');
const clampReviewSource = functionSource('clampReview');
const attemptMoveSource = functionSource('attemptMove');
const handleClassSnapshotSource = functionSource('handleClassSnapshot');
const sendClassBranchSource = functionSource('sendClassBranch');
const requestClassNewGameSource = functionSource('requestClassNewGame');

if (!classCallSource || !clearAnnotationToolSource || !approveStudentSource || !rebuildClassSource || !setToolSource) {
  throw new Error('main.js 或 annotations.js 里找不到课堂回归测试所需函数');
}

beforeEach(() => clearBranches());

function makeHarness() {
  const busyDuringRepaint = [];
  const undoStates = [];
  const harness = new Function(
    'busyDuringRepaint', 'undoStates',
    `let classRequestOut = false;
     const els = { undoBtn: { disabled: true } };
     const canUndo = () => !classRequestOut;
     const updateModeUi = () => busyDuringRepaint.push(classRequestOut);
     const simulateRepaint = () => {
       els.undoBtn.disabled = !canUndo();
       undoStates.push(els.undoBtn.disabled);
     };
     ${classCallSource}
     return {
       classCall,
       updateModeUi,
       simulateRepaint,
       undoDisabled: () => els.undoBtn.disabled,
     };`,
  )(busyDuringRepaint, undoStates);
  return { ...harness, busyDuringRepaint, undoStates };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('课堂请求结束后的界面刷新', () => {
  it('快照在请求期间禁用按钮，请求结束后立即重新启用', async () => {
    const harness = makeHarness();
    const answer = deferred();
    const call = harness.classCall(async () => {
      harness.updateModeUi();
      harness.simulateRepaint();
      await answer.promise;
      harness.updateModeUi();
      harness.simulateRepaint();
      return 'ok';
    });
    expect(harness.busyDuringRepaint).toEqual([true]);
    expect(harness.undoStates).toEqual([true]);
    answer.resolve('ok');
    await expect(call).resolves.toBe('ok');
    expect(harness.busyDuringRepaint).toEqual([true, true, false]);
    expect(harness.undoStates).toEqual([true, true]);
    expect(harness.undoDisabled()).toBe(false);
  });

  it('请求失败也要刷新，不能把禁用状态留在屏幕上', async () => {
    const harness = makeHarness();
    const answer = deferred();
    const call = harness.classCall(() => answer.promise);
    answer.reject(new Error('network'));
    await expect(call).rejects.toThrow('network');
    expect(harness.busyDuringRepaint.at(-1)).toBe(false);
  });

  it('每次轮询都先禁用、结束后再恢复', async () => {
    const harness = makeHarness();
    for (let i = 0; i < 3; i++) {
      const answer = deferred();
      const call = harness.classCall(() => {
        harness.updateModeUi();
        return answer.promise;
      });
      answer.resolve();
      await call;
    }
    expect(harness.busyDuringRepaint).toEqual([true, false, true, false, true, false]);
  });
});

describe('课堂棋盘操作', () => {
  it('离开或进入课堂时收起画笔，并清除所有画笔按钮的选中态', () => {
    const tools = [];
    const pressed = [];
    const toolbar = {
      querySelectorAll: () => ['arrow', 'erase', 'square'].map((tool) => ({
        setAttribute: (name, value) => pressed.push([tool, name, value]),
      })),
    };
    const { clearAnnotationTool } = new Function(
      'annotationOverlay', 'els',
      `${clearAnnotationToolSource}
       return { clearAnnotationTool };`,
    )({ setTool: (tool) => tools.push(tool) }, { annotationToolbar: toolbar });

    clearAnnotationTool();
    expect(tools).toEqual([null]);
    expect(pressed).toEqual([
      ['arrow', 'aria-pressed', 'false'],
      ['erase', 'aria-pressed', 'false'],
      ['square', 'aria-pressed', 'false'],
    ]);
  });

  it('切换或收起画笔时取消未完成的临时箭头', () => {
    const setTool = new Function(`return function ${setToolSource};`)();
    const overlay = {
      activeTool: 'arrow',
      _arrowStart: 'e2',
      _tempArrow: { remove: () => { overlay.removed = true; } },
    };
    setTool.call(overlay, null);
    expect(overlay).toMatchObject({ activeTool: null, _arrowStart: null, _tempArrow: null, removed: true });
  });

  it('老师批准按钮调用 approveMove，并把批准或收回准确传给课堂会话', async () => {
    const calls = [];
    const { approveStudent } = new Function(
      'calls',
      `let classUiState = 'teaching';
       const classSession = { code: '1993', approveMove: (...args) => calls.push(args) };
       const classCall = (ask) => ask();
       ${approveStudentSource}
       return { approveStudent };`,
    )(calls);

    await approveStudent(2, true);
    await approveStudent(2, false);
    expect(calls).toEqual([[2, true], [2, false]]);
  });

  it('中途加入时按事件发生时的局面恢复标注，跳过举手和批准事件', () => {
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const afterE4Fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    const beforeMove = [{ type: 'square', square: 'e2', color: '#ffeb3b' }];
    const afterMove = [{ type: 'arrow', from: 'e7', to: 'e5', color: '#2196f3' }];
    const events = [
      { seq: 1, type: 'annotation', data: { annotations: beforeMove } },
      { seq: 2, type: 'hand', data: { hand: 'raised' } },
      { seq: 3, type: 'approve', data: { hand: 'approved' } },
      { seq: 4, type: 'move', data: { san: 'e4' } },
      { seq: 5, type: 'annotation', data: { annotations: afterMove } },
    ];
    const applied = [];
    let fen = startFen;
    const harness = new Function(
      'events', 'applied',
      `let classAppliedSeq = 0;
       let classSentSan = 'e4';
       let clamped = 0;
       const fenCore = (value) => value.split(' ')[0];
       const game = {
         fen: () => fen,
         move: (san) => {
           if (san !== 'e4') return null;
           fen = '${afterE4Fen}';
           return {};
         },
       };
       const annotationOverlay = { applyRemote: (at, list) => applied.push([at, list]) };
       const classSession = { events, seqSeen: () => events.length };
       const resetBoard = () => { fen = '${startFen}'; };
       const loadBoard = () => { throw new Error('合法走法不需要直接载入终局'); };
       const clampReview = () => { clamped++; };
       ${rebuildClassSource}
       return {
         rebuildClass,
         getAppliedSeq: () => classAppliedSeq,
         getSentSan: () => classSentSan,
         getClamped: () => clamped,
         getFen: () => fen,
       };`,
    )(events, applied);

    harness.rebuildClass({ fen: afterE4Fen });
    expect(applied).toEqual([[startFen, beforeMove], [afterE4Fen, afterMove]]);
    expect(harness.getFen()).toBe(afterE4Fen);
    expect(harness.getAppliedSeq()).toBe(5);
    expect(harness.getSentSan()).toBeNull();
    expect(harness.getClamped()).toBe(1);
  });
});

function makeClassReplayHarness(moves = ['e4', 'e5', 'Nf3'], events = []) {
  const game = new Chess();
  for (const san of moves) game.move(san);
  const state = { dialogs: 0, renders: 0, toasts: [] };
  const classSession = { events, seqSeen: () => events.at(-1)?.seq ?? 0 };
  return new Function(
    'game', 'classSession', 'state', 'branchAt', 'appendToBranch', 'existingMoveAt',
    'findBranch', 'getActiveBranch', 'getNode', 'setActiveBranch', 'clearBranches',
    `let reviewIndex = null;
     let classEndShown = true;
     let announcedPlies = 9;
     let manualEnd = { kind: 'loss' };
     let classAppliedSeq = 0;
     let classSentSan = null;
     let classSentBranch = null;
     let gameOverTimer = 0;
     let gameOrigin = '';
     const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
     const mode = 'class';
     const clearReview = () => { reviewIndex = null; };
     const resetBoard = () => { game.reset(); gameOrigin = START_FEN; clearReview(); clearBranches(); };
     const loadBoard = (fen) => { game.load(fen); gameOrigin = fen; clearReview(); clearBranches(); };
     const undoPly = () => game.undo();
     const resetTracking = () => {};
     const clearTimeout = () => {};
     const closeDialogs = () => { state.dialogs++; };
     const clearSelection = () => {};
     const renderAll = () => { state.renders++; };
     const announceReview = () => {};
     const showToast = (text) => state.toasts.push(text);
     const boardView = { cancelDrag: () => {} };
     const annotationOverlay = { applyRemote: () => {} };
     const trackGameStart = () => {};
     const clampReview = () => {};
     const fenCore = (fen) => fen.split(' ')[0];
     const mainSans = () => game.history().map((move) => move.san);
     const viewPlies = () => reviewIndex === null ? game.history().length : reviewIndex;
     ${enterBranchSource}
     ${recordBranchMoveSource}
     ${applyClassBranchSource}
     ${applyClassUndoSource}
     ${applyClassResetSource}
     ${rebuildClassSource}
     return {
       applyClassBranch,
       applyClassUndo,
       applyClassReset,
       rebuildClass,
       state,
       getReviewIndex: () => reviewIndex,
       getEndShown: () => classEndShown,
       getAnnounced: () => announcedPlies,
       getManualEnd: () => manualEnd,
       getAppliedSeq: () => classAppliedSeq,
       history: () => game.history().map((move) => move.san),
     };`,
  )(
    game, classSession, state, branchAt, appendToBranch, existingMoveAt,
    findBranch, getActiveBranch, getNode, setActiveBranch, clearBranches,
  );
}

describe('讲解与课堂的支线权限', () => {
  it('讲解和课堂不开分析也能分支，电脑和在线仍受分析开关控制', () => {
    const enabled = new Function(
      'mode', 'tacticsMode', 'analyzing',
      `${branchingEnabledSource}\nreturn branchingEnabled();`,
    );
    expect(enabled('local', false, false)).toBe(true);
    expect(enabled('class', false, false)).toBe(true);
    expect(enabled('computer', false, false)).toBe(false);
    expect(enabled('online', false, false)).toBe(false);
    expect(enabled('computer', false, true)).toBe(true);
    expect(enabled('online', false, true)).toBe(true);
    expect(enabled('local', true, false)).toBe(false);
    expect(enabled('local', true, true)).toBe(true);
  });

  it('课堂换黑白视角只翻棋盘，不改变走棋方', () => {
    const orientations = [];
    const harness = new Function(
      'boardView', 'els',
      `let mode = 'class';
       let viewColor = 'w';
       const tacticsMode = false;
       const tacticsViewColor = 'w';
       const myColor = 'b';
       const renderAll = () => {};
       const colorName = (color) => color === 'w' ? '白方' : '黑方';
       ${bottomColorSource}
       ${setViewColorSource}
       return {
         bottomColor,
         setViewColor,
         getViewColor: () => viewColor,
       };`,
    )(
      { setOrientation: (color) => orientations.push(color) },
      { srStatus: { textContent: '' } },
    );
    expect(harness.bottomColor()).toBe('w');
    harness.setViewColor('b');
    expect(harness.bottomColor()).toBe('b');
    expect(harness.getViewColor()).toBe('b');
    expect(orientations).toEqual(['b']);
  });

  it('课堂悔棋只在老师且主线非空、没有请求在飞时可用', () => {
    const canUndoFor = new Function(
      'isTeacher', 'requestOut', 'historyLength', 'reviewingNow',
      `const mode = 'class';
       const tacticsMode = false;
       const classUiState = 'teaching';
       const classSession = { isTeacher };
       const classRequestOut = requestOut;
       const classSentSan = null;
       const game = { history: () => Array(historyLength) };
       const reviewing = () => reviewingNow;
       ${canUndoSource}
       return canUndo();`,
    );
    expect(canUndoFor(true, false, 2, false)).toBe(true);
    expect(canUndoFor(false, false, 2, false)).toBe(false);
    expect(canUndoFor(true, true, 2, false)).toBe(false);
    expect(canUndoFor(true, false, 0, false)).toBe(false);
    expect(canUndoFor(true, false, 2, true)).toBe(false);
  });

  it('只有老师能向服务端创建课堂支线', async () => {
    const calls = [];
    const harness = new Function(
      'calls',
      `let classRequestOut = false;
       let classSentBranch = null;
       const classSession = {
         isTeacher: false,
         code: '1234',
         cls: null,
         control: (...args) => { calls.push(args); return { ok: true }; },
       };
       const branchKey = (data) => JSON.stringify(data);
       const classCall = (ask) => ask();
       const rebuildClass = () => {};
       const renderAll = () => {};
       ${sendClassBranchSource}
       return {
         sendClassBranch,
         becomeTeacher: () => { classSession.isTeacher = true; },
         getSentBranch: () => classSentBranch,
       };`,
    )(calls);
    const data = { path: [], ply: 1, san: 'Nc3' };
    await harness.sendClassBranch(data);
    expect(calls).toHaveLength(0);
    harness.becomeTeacher();
    await harness.sendClassBranch(data);
    expect(calls).toHaveLength(1);
    expect(harness.getSentBranch()).toBe(JSON.stringify(data));
  });

  it.each([{ ok: false }, new Error('network')])(
    '支线请求失败时撤掉乐观更新：%s',
    async (failure) => {
      let rebuilt = 0;
      const harness = new Function(
        'failure', 'onRebuild',
        `let classRequestOut = false;
         let classSentBranch = null;
         const classSession = {
           isTeacher: true,
           code: '1234',
           cls: {},
           control: () => failure instanceof Error ? (() => { throw failure; })() : failure,
         };
         const branchKey = (data) => JSON.stringify(data);
         const classCall = (ask) => ask();
         const rebuildClass = () => onRebuild();
         const renderAll = () => {};
         ${sendClassBranchSource}
         return { sendClassBranch, getSentBranch: () => classSentBranch };`,
      )(failure, () => rebuilt++);
      await harness.sendClassBranch({ path: [], ply: 1, san: 'Nc3' });
      expect(rebuilt).toBe(1);
      expect(harness.getSentBranch()).toBeNull();
    },
  );
});

describe('课堂悔棋、支线与重放', () => {
  it('重复走已有主线或支线只导航，不生成新的课堂事件', () => {
    const game = new Chess();
    game.move('e4');
    game.move('e5');
    const harness = new Function(
      'game', 'branchAt', 'appendToBranch', 'existingMoveAt', 'findBranch',
      'getActiveBranch', 'getNode', 'setActiveBranch',
      `const mode = 'class';
       let reviewIndex = 1;
       const viewPlies = () => reviewIndex;
       const mainSans = () => game.history().map((move) => move.san);
       const showToast = () => {};
       const boardView = { cancelDrag: () => {} };
       const clearSelection = () => {};
       ${enterBranchSource}
       ${recordBranchMoveSource}
       return {
         recordBranchMove,
         setReview: (ply) => { reviewIndex = ply; },
         rewindBranch: () => setActiveBranch([0], 0),
       };`,
    )(game, branchAt, appendToBranch, existingMoveAt, findBranch,
      getActiveBranch, getNode, setActiveBranch);
    expect(harness.recordBranchMove('e5')).toBe(false);
    expect(getBranches()).toEqual([]);
    harness.setReview(1);
    expect(harness.recordBranchMove('Nc3')).toBe(true);
    harness.rewindBranch();
    expect(harness.recordBranchMove('Nc3')).toBe(false);
    expect(getBranches()).toEqual([
      { path: [0], branchIndex: 1, moves: ['Nc3'], children: [] },
    ]);
  });

  it('主线撤空后仍保持支线视角，续走不会变成主线新局', () => {
    const totalRef = { value: 0 };
    const path = branchAt([], 0, 'e4');
    setActiveBranch(path, 1);
    const harness = new Function(
      'totalRef', 'pruneBranches', 'getActiveBranch', 'getNode',
      `let reviewIndex = null;
       const game = { history: () => Array(totalRef.value) };
       ${clampReviewSource}
       return { clampReview, getReviewIndex: () => reviewIndex };`,
    )(totalRef, pruneBranches, getActiveBranch, getNode);
    harness.clampReview();
    expect(harness.getReviewIndex()).toBe(0);
    totalRef.value = 3;
    harness.clampReview();
    expect(harness.getReviewIndex()).toBe(0);
  });

  it('课堂支线请求在飞或轮询中时不接受新的乐观走子', () => {
    const game = new Chess();
    let moved = 0;
    const harness = new Function(
      'game', 'onMoved',
      `let mode = 'class';
       const classSession = { isTeacher: true };
       let classRequestOut = true;
       let classSentBranch = null;
       let classSentSan = null;
       const branchingEnabled = () => true;
       const reviewing = () => true;
       const shownPosition = () => ({ move: () => { onMoved(); return { san: 'e4' }; } });
       ${attemptMoveSource}
       return { attemptMove, allow: () => { classRequestOut = false; } };`,
    )(game, () => moved++);
    harness.attemptMove('e2', 'e4', { animate: false });
    expect(moved).toBe(0);
  });

  it('悔棋撤掉主线最后一手，并打开可继续的悔棋支线', () => {
    const harness = makeClassReplayHarness();
    expect(harness.applyClassUndo({ san: 'Nf3' })).toBe(true);
    expect(getBranches()).toEqual([
      { path: [0], branchIndex: 2, moves: ['Nf3'], children: [] },
    ]);
    expect(getActiveBranch()).toEqual({ path: [0], ply: 1 });
    expect(harness.getEndShown()).toBe(false);
    expect(harness.state.dialogs).toBe(1);

    expect(harness.applyClassBranch({ path: [0], ply: 1, san: 'Nf6' })).toBe(true);
    expect(getNode([0]).moves).toEqual(['Nf3', 'Nf6']);
    expect(getActiveBranch()).toEqual({ path: [0], ply: 2 });
  });

  it('课堂支线事件不会改写主线', () => {
    const harness = makeClassReplayHarness();
    expect(harness.applyClassBranch({ path: [], ply: 1, san: 'Nc3' })).toBe(true);
    expect(harness.history()).toEqual(['e4', 'e5', 'Nf3']);
    expect(getBranches()).toEqual([
      { path: [0], branchIndex: 1, moves: ['Nc3'], children: [] },
    ]);
    expect(getActiveBranch()).toEqual({ path: [0], ply: 1 });
  });

  it('新局事件清空主线、支线、复盘位置和终局状态', () => {
    const harness = makeClassReplayHarness();
    harness.applyClassUndo({ san: 'Nf3' });
    expect(harness.applyClassReset()).toBe(true);
    expect(getBranches()).toEqual([]);
    expect(getActiveBranch()).toBeNull();
    expect(harness.getReviewIndex()).toBeNull();
    expect(harness.getEndShown()).toBe(false);
    expect(harness.getManualEnd()).toBeNull();
    expect(harness.getAnnounced()).toBe(0);
  });

  it('中途加入按悔棋、支线、新局顺序完整重放', () => {
    const events = [
      { seq: 1, type: 'move', data: { san: 'e4' } },
      { seq: 2, type: 'move', data: { san: 'e5' } },
      { seq: 3, type: 'move', data: { san: 'Nf3' } },
      { seq: 4, type: 'undo', data: { san: 'Nf3' } },
      { seq: 5, type: 'branch', data: { path: [0], ply: 1, san: 'Nf6' } },
      { seq: 6, type: 'reset', data: {} },
      { seq: 7, type: 'move', data: { san: 'd4' } },
    ];
    const harness = makeClassReplayHarness([], events);
    harness.rebuildClass({ fen: new Chess('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 1').fen() });
    expect(harness.getAppliedSeq()).toBe(7);
    expect(getBranches()).toEqual([]);
    expect(getActiveBranch()).toBeNull();
    expect(harness.state.dialogs).toBeGreaterThan(0);
  });

  it('课堂终局弹窗每次终局只出现一次', () => {
    const shown = { value: 0 };
    const harness = new Function(
      'shown',
      `let classEndShown = false;
       const mode = 'class';
       const classUiState = 'teaching';
       const classSession = { isTeacher: true };
       const game = { status: () => ({ over: true }) };
       const applyClassEvents = () => true;
       const classDrifted = () => false;
       const endClass = () => {};
       const announceHand = () => {};
       const updateClassRoster = () => {};
       const updateModeUi = () => {};
       const renderAll = () => {};
       const describeEnd = () => ({ title: '白方获胜' });
       const showEnd = () => { shown.value++; };
       ${handleClassSnapshotSource}
       return { handleClassSnapshot };`,
    )(shown);
    harness.handleClassSnapshot({ status: 'open' }, []);
    harness.handleClassSnapshot({ status: 'open' }, []);
    expect(shown.value).toBe(1);
  });

  it('课堂将死文案说明获胜颜色，不说“你赢了”', () => {
    const describe = new Function(
      'mode', 'myColor', 'colorName', 'otherColor',
      `${describeEndSource}\nreturn describeEnd({ reason: 'checkmate', result: '0-1' });`,
    );
    expect(describe('class', 'w', (c) => c === 'w' ? '白方' : '黑方', (c) => c === 'w' ? 'b' : 'w'))
      .toMatchObject({ title: '黑方获胜', sub: '将死 —— 白方的王无路可走。' });
  });
});

describe('课堂与在线的新局入口', () => {
  it('课堂新局和课堂悔棋分别路由到服务端控制', async () => {
    const calls = [];
    const harness = new Function(
      'calls',
      `let mode = 'class';
       const canUndo = () => true;
       const requestClassNewGame = () => calls.push('new');
       const enterOnlineIdle = () => calls.push('idle');
       const sendClassUndo = () => calls.push('undo');
       ${newGameSource}
       ${undoTurnSource}
       return { newGame, undoTurn };`,
    )(calls);
    harness.newGame();
    harness.undoTurn();
    expect(calls).toEqual(['new', 'undo']);
  });

  it('在线终局的新局按钮回到在线开局，不创建假房间', () => {
    const calls = [];
    const newGameForMode = new Function(
      'mode', 'calls',
      `const requestClassNewGame = () => calls.push('class');
       const enterOnlineIdle = () => calls.push('idle');
       ${newGameSource}
       newGame();`,
    );
    newGameForMode('online', calls);
    expect(calls).toEqual(['idle']);
  });

  it('全班新局先确认，确认后发送 reset', () => {
    const state = { confirmed: null, resets: 0 };
    const harness = new Function(
      'game', 'getBranches', 'state',
      `const classSession = { isTeacher: true, code: '1234' };
       const closeDialogs = () => {};
       const askConfirm = (options, action) => { state.confirmed = { options, action }; };
       const sendClassNewGame = () => { state.resets++; };
       ${requestClassNewGameSource}
       return {
         requestClassNewGame,
         getConfirmed: () => state.confirmed,
         getResets: () => state.resets,
       };`,
    )({ history: () => ['e4'] }, () => [], state);
    harness.requestClassNewGame();
    expect(harness.getConfirmed().options).toMatchObject({
      title: '全班开始新的一局？',
      confirmLabel: '全班新的一局',
      danger: false,
    });
    expect(harness.getResets()).toBe(0);
    harness.getConfirmed().action();
    expect(harness.getResets()).toBe(1);
  });
});
