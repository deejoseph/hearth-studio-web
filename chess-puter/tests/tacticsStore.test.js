import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAll,
  deleteProblemSet,
  getProblemSetNames,
  getMistakeQueue,
  getProgress,
  getUserRating,
  isFavorite,
  loadProblemSet,
  recordAttempt,
  saveProblemSet,
  setUserRating,
  toggleFavorite,
  updateRating,
} from '../src/game/tacticsStore.js';

beforeEach(() => {
  const data = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  });
});

describe('公开做题进度', () => {
  it('收藏与尝试次数写入本地，答错不会抹掉已解决状态', () => {
    expect(toggleFavorite('basic-setup-e2-e4')).toBe(true);
    expect(isFavorite('basic-setup-e2-e4')).toBe(true);
    recordAttempt('basic-setup-e2-e4', false);
    recordAttempt('basic-setup-e2-e4', true);
    recordAttempt('basic-setup-e2-e4', false);
    expect(getProgress('basic-setup-e2-e4')).toMatchObject({ attempts: 3, solved: true });
  });

  it('错题队列按答错次数降序，并排除已经解决的题', () => {
    const problems = [{ id: 'low' }, { id: 'high' }, { id: 'done' }];
    recordAttempt('low', false);
    recordAttempt('high', false);
    recordAttempt('high', false);
    recordAttempt('done', true);
    recordAttempt('done', false);

    expect(getMistakeQueue(problems).map((problem) => problem.id)).toEqual(['high', 'low']);
    expect(getProgress('done')).toMatchObject({ attempts: 2, solved: true });
  });

  it('评级按题目难度更新，并限制在有效范围', () => {
    setUserRating(1000);
    expect(updateRating(1400, true).newRating).toBeGreaterThan(1000);
    const before = getUserRating();
    expect(updateRating(600, false).newRating).toBeLessThan(before);
    setUserRating(1);
    expect(getUserRating()).toBe(100);
    setUserRating(9999);
    expect(getUserRating()).toBe(3000);
  });
});

describe('教练题目集存储', () => {
  it('保存、加载和删除题单不改动其他进度', () => {
    const problems = [{ id: 'p1', fen: 'fen', solution: ['e2e4'] }];
    recordAttempt('p1', true);
    saveProblemSet('基础训练', problems);
    expect(getProblemSetNames()).toEqual(['基础训练']);
    expect(loadProblemSet('基础训练')).toEqual(problems);
    deleteProblemSet('基础训练');
    expect(loadProblemSet('基础训练')).toBeNull();
    expect(getProgress('p1')?.solved).toBe(true);
    clearAll();
    expect(getProgress('p1')).toBeNull();
  });
});
