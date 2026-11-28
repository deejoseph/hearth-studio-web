import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountCommunityPresence, nextPresence } from '../src/ui/communityPresence.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('社区展示人数', () => {
  it('每次更新都会变化且始终保持在展示范围内', () => {
    let current = { students: 128, coaches: 12 };
    for (let index = 0; index < 500; index += 1) {
      const next = nextPresence(current);
      expect(next.students).not.toBe(current.students);
      expect(next.coaches).not.toBe(current.coaches);
      expect(next.students).toBeGreaterThanOrEqual(118);
      expect(next.students).toBeLessThanOrEqual(138);
      expect(next.coaches).toBeGreaterThanOrEqual(9);
      expect(next.coaches).toBeLessThanOrEqual(15);
      current = next;
    }
  });

  it('到达上下限时不会越界', () => {
    expect(nextPresence({ students: 118, coaches: 9 }, () => 0.5)).toEqual({ students: 119, coaches: 10 });
    expect(nextPresence({ students: 138, coaches: 15 }, () => 0.5)).toEqual({ students: 137, coaches: 14 });
  });

  it('每七秒刷新页面数字，卸载后停止计时器', () => {
    const students = { textContent: '128' };
    const coaches = { textContent: '12' };
    vi.stubGlobal('document', {
      getElementById: (id) => ({ 'presence-students': students, 'presence-coaches': coaches })[id],
    });
    vi.stubGlobal('window', {
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });

    const stop = mountCommunityPresence();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(7000);
    expect(students.textContent).not.toBe('128');
    expect(coaches.textContent).not.toBe('12');

    stop();
    const lastStudents = students.textContent;
    const lastCoaches = coaches.textContent;
    vi.advanceTimersByTime(14000);
    expect(students.textContent).toBe(lastStudents);
    expect(coaches.textContent).toBe(lastCoaches);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('缺少人数节点时不启动计时器', () => {
    vi.stubGlobal('document', { getElementById: () => null });
    vi.stubGlobal('window', {
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
    expect(() => mountCommunityPresence()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
