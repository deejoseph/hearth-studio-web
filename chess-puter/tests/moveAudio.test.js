import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let audio;
let contexts;
let oscillators;
let initialState;
let resumeRejects;

beforeEach(async () => {
  vi.resetModules();
  contexts = [];
  oscillators = [];
  initialState = 'running';
  resumeRejects = false;
  class FakeAudioContext {
    constructor() {
      this.state = initialState;
      this.currentTime = 10;
      this.destination = {};
      this.resume = vi.fn(async () => {
        if (resumeRejects) throw new Error('autoplay blocked');
        this.state = 'running';
      });
      contexts.push(this);
    }

    createOscillator() {
      const oscillator = {
        type: '',
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    }

    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  audio = await import('../src/game/moveAudio.js');
});

afterEach(() => vi.unstubAllGlobals());

describe('走棋音效', () => {
  it.each([
    [{ from: 'e2', to: 'e4' }, {}, 'move'],
    [{ from: 'e4', to: 'd5', captured: 'p' }, {}, 'capture'],
    [{ from: 'f1', to: 'b5' }, { check: true }, 'check'],
    [{ from: 'e1', to: 'g1', flags: ['k'] }, {}, 'castle'],
    [{ from: 'e1', to: 'c1', flags: ['q'] }, {}, 'castle'],
    [{ from: 'a7', to: 'a8', promotion: 'q' }, {}, 'promote'],
    [{ from: 'a7', to: 'a8', promotion: 'q' }, { over: true }, 'end'],
  ])('按走法和局面选择音效 %#', (move, status, kind) => {
    expect(audio.moveSoundKind(move, status)).toBe(kind);
  });

  it('首次手势只创建一个音频上下文，重复解锁不重复创建', async () => {
    await audio.unlockMoveAudio();
    await audio.unlockMoveAudio();
    await audio.playMoveSound('move');
    expect(contexts).toHaveLength(1);
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].start).toHaveBeenCalledOnce();
    expect(oscillators[0].stop).toHaveBeenCalledOnce();
  });

  it('被浏览器挂起的音频上下文恢复后才播放', async () => {
    initialState = 'suspended';
    expect(await audio.playMoveSound('move')).toBe(true);
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resume).toHaveBeenCalledOnce();
    expect(contexts[0].state).toBe('running');
    expect(oscillators).toHaveLength(1);
  });

  it('Safari 的 interrupted 状态也会恢复', async () => {
    await audio.unlockMoveAudio();
    contexts[0].state = 'interrupted';
    await audio.unlockMoveAudio();
    expect(contexts[0].resume).toHaveBeenCalledOnce();
    expect(contexts[0].state).toBe('running');
  });

  it('已关闭的上下文会重建', async () => {
    await audio.unlockMoveAudio();
    contexts[0].state = 'closed';
    await audio.unlockMoveAudio();
    expect(contexts).toHaveLength(2);
    await audio.playMoveSound('move');
    expect(oscillators).toHaveLength(1);
  });

  it('恢复被拒绝时不调度无声音符，也不抛出异常', async () => {
    initialState = 'suspended';
    resumeRejects = true;
    await expect(audio.playMoveSound('move')).resolves.toBe(false);
    expect(contexts[0].resume).toHaveBeenCalledOnce();
    expect(oscillators).toHaveLength(0);
  });

  it('静音时不会创建上下文或播放音符', async () => {
    audio.setMoveSoundEnabled(false);
    await audio.unlockMoveAudio();
    await audio.playMoveSound('capture');
    expect(contexts).toHaveLength(0);
    expect(oscillators).toHaveLength(0);

    audio.setMoveSoundEnabled(true);
    await audio.playMoveSound('check');
    expect(oscillators).toHaveLength(2);
  });

  it('不支持 Web Audio 时静默降级', async () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    await expect(audio.unlockMoveAudio()).resolves.toBe(false);
    await expect(audio.playMoveSound('move')).resolves.toBe(false);
    expect(oscillators).toHaveLength(0);
  });
});
