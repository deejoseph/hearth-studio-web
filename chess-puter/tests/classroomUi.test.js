import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const classCallSource = source.match(/async function classCall\(what\) \{[\s\S]*?\n\}/)?.[0];
const clearAnnotationToolSource = source.match(/function clearAnnotationTool\(\) \{[\s\S]*?\n\}/)?.[0];
const approveStudentSource = source.match(/async function approveStudent\(playerId, approve\) \{[\s\S]*?\n\}/)?.[0];
const rebuildClassSource = source.match(/function rebuildClass\(cls\) \{[\s\S]*?\n\}/)?.[0];
const setToolSource = readFileSync(new URL('../src/ui/annotations.js', import.meta.url), 'utf8')
  .match(/  setTool\(tool\) \{[\s\S]*?\n  \}/)?.[0];
if (!classCallSource || !clearAnnotationToolSource || !approveStudentSource || !rebuildClassSource || !setToolSource) {
  throw new Error('main.js 或 annotations.js 里找不到课堂回归测试所需函数');
}

function makeHarness() {
  const busyDuringRepaint = [];
  const { classCall, updateModeUi } = new Function(
    'busyDuringRepaint',
    `let classRequestOut = false;
     const updateModeUi = () => busyDuringRepaint.push(classRequestOut);
     ${classCallSource}
     return { classCall, updateModeUi };`,
  )(busyDuringRepaint);
  return { classCall, updateModeUi, busyDuringRepaint };
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
      await answer.promise;
      harness.updateModeUi();
      return 'ok';
    });
    expect(harness.busyDuringRepaint).toEqual([true]);
    answer.resolve('ok');
    await expect(call).resolves.toBe('ok');
    expect(harness.busyDuringRepaint).toEqual([true, true, false]);
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
