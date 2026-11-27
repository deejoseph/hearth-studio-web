import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendToBranch,
  branchAt,
  clearBranches,
  existingMoveAt,
  findBranch,
  getActiveBranch,
  getBranches,
  getNode,
  isViewingBranch,
  navigateActiveBranch,
  pruneBranches,
  restoreBranches,
  setActiveBranch,
} from '../src/game/variations.js';

/**
 * 支线树本身（不含棋盘）：主线就是调用方手里那份 SAN 列表，这里只记「顶掉了父线的
 * 第几手」。#107 要的是能在任意位置试一手并且跳回去看，所以每个函数的落点都得钉住。
 * 主线由调用方（`game`）拿着，这座树永远不改它 —— 试出来的都记成支线。
 */
const MAIN = ['e4', 'e5', 'Nf3', 'Nc6'];

beforeEach(() => {
  clearBranches();
});

describe('挂在哪儿：同级还是往下套一层', () => {
  it('主线上的岔路按分叉点归堆', () => {
    expect(branchAt([], 2, 'd4')).toEqual([0]);
    expect(branchAt([], 2, 'Nc3')).toEqual([1]);
    expect(branchAt([], 1, 'c5')).toEqual([2]);
    expect(getBranches().map((node) => node.branchIndex)).toEqual([2, 2, 1]);
  });

  it('在支线开头改走的是同一位置的岔路，算同级而不是再套一层括号', () => {
    const branch = branchAt([], 1, 'c5');
    const sibling = branchAt(branch, 0, 'e5'); // 从主线看这本来就是主线
    expect(sibling).toEqual([1]);
    expect(getBranches().map((node) => node.branchIndex)).toEqual([1, 1]);
    expect(getNode(branch).children).toEqual([]);
  });

  it('在支线中间改走的往下挂，分叉点相对那条支线数', () => {
    const branch = branchAt([], 1, 'c5');
    appendToBranch(branch, 'Nf3');
    appendToBranch(branch, 'd6');
    const child = branchAt(branch, 1, 'Nc6');
    expect(child).toEqual([0, 0]);
    expect(getNode(child)).toMatchObject({ branchIndex: 1, moves: ['Nc6'] });
  });

  it('续着支线末尾往下走，不长出新支线', () => {
    const branch = branchAt([], 1, 'c5');
    expect(existingMoveAt(branch, 1, MAIN)).toBeNull();
    expect(appendToBranch(branch, 'Nf3')).toBe(2);
    expect(getBranches()).toHaveLength(1);
  });

  it('同一位置同一手只记一条', () => {
    const created = branchAt([], 1, 'c5');
    expect(findBranch([], 1, 'c5')).toEqual(created);
    expect(findBranch([], 1, 'd5')).toBeNull();
    expect(branchAt([], 1, 'd5')).toEqual([1]);
  });

  it('那一手上本来走的是哪一手', () => {
    branchAt([], 1, 'c5');
    expect(existingMoveAt([], 1, MAIN)).toBe('e5');
    expect(existingMoveAt([0], 0, MAIN)).toBe('e5'); // 支线的开头顶掉的还是同一手
    expect(existingMoveAt([0], 1, MAIN)).toBeNull();
    expect(existingMoveAt([7], 1, MAIN)).toBeNull();
  });

  it('父线走不到那么远就不让分出去', () => {
    const branch = branchAt([], 1, 'c5');
    expect(branchAt(branch, 5, 'd4')).toBeNull();
    expect(branchAt([42], 0, 'd4')).toBeNull();
  });
});

describe('看哪条线', () => {
  it('path 为空就是回主线', () => {
    branchAt([], 1, 'c5');
    setActiveBranch([0], 1);
    expect(isViewingBranch()).toBe(true);
    expect(setActiveBranch([], 0)).toBe(true);
    expect(getActiveBranch()).toBeNull();
  });

  it('不存在的支线切不过去，视角不动', () => {
    branchAt([], 1, 'c5');
    setActiveBranch([0], 1);
    expect(setActiveBranch([9], 1)).toBe(false);
    expect(getActiveBranch()).toEqual({ path: [0], ply: 1 });
  });

  it('ply 越过那条支线的长度就收在最后一手', () => {
    const branch = branchAt([], 1, 'c5');
    appendToBranch(branch, 'Nf3');
    setActiveBranch(branch, 9);
    expect(getActiveBranch().ply).toBe(2);
  });

  it('箭头在支线里走，走到底就停住', () => {
    const branch = branchAt([], 1, 'c5');
    appendToBranch(branch, 'Nf3');
    setActiveBranch(branch, 0);
    expect(navigateActiveBranch('next')).toBe(1);
    expect(navigateActiveBranch('next')).toBe(2);
    expect(navigateActiveBranch('next')).toBe(2);
    expect(navigateActiveBranch('prev')).toBe(1);
    expect(navigateActiveBranch('first')).toBe(0);
    expect(navigateActiveBranch('last')).toBe(2);
  });

  it('没在支线里时方向键不动任何东西', () => {
    expect(navigateActiveBranch('next')).toBe(0);
  });
});

describe('主线变短之后', () => {
  it('够不着的支线整条扔掉', () => {
    branchAt([], 1, 'c5');
    branchAt([], 3, 'Be7');
    pruneBranches(2);
    expect(getBranches().map((node) => node.branchIndex)).toEqual([1]);
  });

  it('分叉点正好在主线末尾的那条留着 —— 那是退掉改走的一手之后的旧线', () => {
    branchAt([], 2, 'Bb5');
    pruneBranches(2);
    expect(getBranches().map((node) => node.branchIndex)).toEqual([2]);
  });

  it('只读的一份：主线没有节点，不存在的下标也没有', () => {
    const branch = branchAt([], 1, 'c5');
    expect(getNode([])).toBeNull();
    expect(getNode([9])).toBeNull();
    appendToBranch(branch, 'Nf3');
    expect(getNode(branch)).toEqual({ path: [0], branchIndex: 1, moves: ['c5', 'Nf3'], children: [] });
  });

  it('正在看的那条被剪掉了就退回主线', () => {
    branchAt([], 3, 'Be7');
    setActiveBranch([0], 1);
    pruneBranches(2);
    expect(getActiveBranch()).toBeNull();
  });

  it('清空后从头来过', () => {
    branchAt([], 1, 'c5');
    setActiveBranch([0], 1);
    clearBranches();
    expect(getBranches()).toEqual([]);
    expect(isViewingBranch()).toBe(false);
  });
});

describe('快照恢复', () => {
  it('完整恢复嵌套支线，且不把当前支线视角一起带回来', () => {
    const branch = branchAt([], 1, 'c5');
    appendToBranch(branch, 'Nf3');
    const child = branchAt(branch, 1, 'Nc6');
    appendToBranch(child, 'Bb4');
    branchAt([], 2, 'd4');
    setActiveBranch(child, 1);
    const saved = getBranches();

    clearBranches();
    restoreBranches(saved);

    expect(getBranches()).toEqual(saved);
    expect(getActiveBranch()).toBeNull();
  });
});
