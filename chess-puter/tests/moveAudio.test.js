import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let audio;
let contexts;
let oscillators;

beforeEach(async () => {
  vi.resetModules();
  contexts = [];
  oscillators = [];
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 10;
      this.destination = {};
      this.resume = vi.fn(() => Promise.resolve());
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

  it('首次手势只创建一个音频上下文，重复解锁不重复创建', () => {
    audio.unlockMoveAudio();
    audio.unlockMoveAudio();
    audio.playMoveSound('move');
    expect(contexts).toHaveLength(1);
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].start).toHaveBeenCalledOnce();
    expect(oscillators[0].stop).toHaveBeenCalledOnce();
  });

  it('被浏览器挂起的音频上下文会恢复', () => {
    audio.unlockMoveAudio();
    contexts[0].state = 'suspended';
    audio.unlockMoveAudio();
    expect(contexts).toHaveLength(1);
    expect(contexts[0].resume).toHaveBeenCalledOnce();
  });

  it('静音时不会创建上下文或播放音符', () => {
    audio.setMoveSoundEnabled(false);
    audio.unlockMoveAudio();
    audio.playMoveSound('capture');
    expect(contexts).toHaveLength(0);
    expect(oscillators).toHaveLength(0);

    audio.setMoveSoundEnabled(true);
    audio.playMoveSound('check');
    expect(oscillators).toHaveLength(2);
  });

  it('不支持 Web Audio 时静默降级', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(() => audio.unlockMoveAudio()).not.toThrow();
    expect(() => audio.playMoveSound('move')).not.toThrow();
    expect(oscillators).toHaveLength(0);
  });
});
