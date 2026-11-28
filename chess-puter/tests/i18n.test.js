import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectLanguage,
  fillText,
  getLanguage,
  setLanguage,
  setUserText,
  translateText,
  translateUserText,
  userText,
} from '../src/i18n.js';
import { BASIC_PROBLEMS } from '../src/game/basicProblems.js';
import core from '../src/i18n/dict-core.json';
import learnTactics from '../src/i18n/dict-learn-tactics.json';
import accountReview from '../src/i18n/dict-account-review.json';
import coach from '../src/i18n/dict-coach.json';
import misc from '../src/i18n/dict-misc.json';

afterEach(() => {
  vi.unstubAllGlobals();
  setLanguage('zh', { persist: false });
});

describe('interface language', () => {
  it('keeps every dictionary entry usable', () => {
    for (const dictionary of [core, learnTactics, accountReview, coach, misc]) {
      for (const [source, target] of Object.entries(dictionary)) {
        expect(source.trim(), 'dictionary source').not.toBe('');
        expect(typeof target, source).toBe('string');
        expect(target.trim(), source).not.toBe('');
      }
    }
  });

  it('translates static labels and keeps the Chinese original', () => {
    setLanguage('en', { persist: false });
    expect(translateText('登录')).toMatch(/sign in|log in/i);
    expect(translateText('登录')).not.toMatch(/[\u3400-\u9fff]/);
    setLanguage('zh', { persist: false });
    expect(translateText('登录')).toBe('登录');
  });

  it('translates every built-in puzzle title, prompt and tag', () => {
    setLanguage('en', { persist: false });
    for (const problem of BASIC_PROBLEMS) {
      for (const text of [problem.title, problem.prompt, ...problem.tags]) {
        expect(translateText(text), text).not.toMatch(/[\u3400-\u9fff]/);
      }
    }
  });

  it('translates common dynamic sentence patterns', () => {
    setLanguage('en', { persist: false });
    expect(translateText('第 1 / 7 节')).toBe('Lesson 1 / 7');
    expect(translateText('练习 2/6')).toBe('Practice 2 / 6');
    expect(translateText('第 12 回合')).toBe('Move 12');
    expect(translateText('第 3 题')).toBe('Puzzle 3');
    expect(translateText('剩 2 道')).toBe('2 remaining');
    expect(translateText('已换成白方视角。')).toBe('Switched to the White view.');
    expect(translateText('执黑方')).toBe('Playing Black');
    expect(translateText('确定删除题目集「我的题目」？')).toBe('Delete the puzzle set “我的题目”?');
    expect(translateText('  登录  ')).toBe('  Log In  ');
    expect(translateText('邮箱\n  和密码都要填。')).toBe('Please enter both your email address and password.');
    expect(translateText('可接收「业余五级以下」')).toBe('Accepts "Below amateur level 5"');
    expect(translateText('删除时段')).toBe('Remove time slot');
    expect(translateText('一对一、只批改棋谱')).toBe('One-on-one, Game reviews only');
    expect(translateText('第 1 / 1 题')).toBe('Puzzle 1 / 1');
    expect(translateText('当前 1 题 · 已解决 1 · 错题 0 · 收藏 1 · 评级 1000'))
      .toBe('Current: 1 problem · solved 1 · mistakes 0 · favorites 1 · rating 1000');
    expect(translateText('成功导入 1 道题，打开练习即可开始解题。'))
      .toBe('Successfully imported 1 problem. Open Practice to start solving.');
    expect(translateText('共 1 条记录。')).toBe('Total 1 record.');
    expect(translateText('共 2 条记录。')).toBe('Total 2 records.');
    expect(translateText('10分钟。')).toBe('10 minutes.');
    expect(translateText('白方的时间快用完了 —— 还剩00:10。'))
      .toBe('White is almost out of time — 00:10 remaining.');
    expect(translateText('白方走了 e4。')).toBe('White played e4.');
  });

  it('prefers the saved language, then falls back to the browser language', () => {
    const saved = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
    });
    vi.stubGlobal('navigator', { language: 'en-US' });
    expect(detectLanguage()).toBe('en');
    saved.set('chess-language', 'zh');
    expect(detectLanguage()).toBe('zh');
    saved.set('chess-language', 'invalid');
    expect(detectLanguage()).toBe('en');
    vi.stubGlobal('navigator', { language: 'zh-CN' });
    expect(detectLanguage()).toBe('zh');
  });

  it('leaves technical chess notation untouched', () => {
    setLanguage('en', { persist: false });
    expect(translateText('1. e4 e5 2. Nf3 Nc6')).toBe('1. e4 e5 2. Nf3 Nc6');
    expect(translateText('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).toContain('RNBQKBNR');
  });

  it('normalizes unsupported language choices to Chinese', () => {
    expect(setLanguage('fr', { persist: false })).toBe('zh');
    expect(getLanguage()).toBe('zh');
  });

  it('translates UI around user content without changing the user content', () => {
    setLanguage('en', { persist: false });
    const nickname = '棋友小明';
    const summary = `已记下：初级 · ${nickname} · 预算 100–200 / 60 分钟`;
    expect(translateUserText(summary, [nickname])).toContain('棋友小明');
    expect(translateUserText(summary, [nickname])).toMatch(/Saved/);
    expect(translateUserText(`确定删除题目集「${nickname}」？`, [nickname]))
      .toBe(`Delete the puzzle set “${nickname}”?`);
    setLanguage('zh', { persist: false });
    expect(translateUserText(summary, [nickname])).toBe(summary);
  });

  it('translates the coach summary around a long user schedule note', () => {
    setLanguage('en', { persist: false });
    const note = '柏林时间周二和周四晚上七点之后可以上课，遇到考试周需要提前一天调整。';
    const token = '\uE100';
    const summary = `已记下：能完整下棋，想提高 · 补战术 · 一对一 · 时间 工作日晚间、${token}（2026-11-28 填的）`;
    const translated = translateUserText(summary, [token]);
    expect(translated).toBe(
      `Saved: I can play a full game and want to improve · Improve tactics · One-on-one · Time: Weekday evenings, ${token} (2026-11-28 filled in)`,
    );
    expect(translated.split(token).join(note)).toContain(note);
  });

  it('marks user content as excluded from translation', () => {
    const attributes = new Map();
    const element = {
      textContent: '',
      setAttribute: (name, value) => attributes.set(name, value),
    };
    expect(setUserText(element, '我的名字')).toBe(element);
    expect(element.textContent).toBe('我的名字');
    expect(attributes.get('data-i18n-skip')).toBe('');
    expect(fillText(element, null).textContent).toBe('');
  });

  it('creates protected spans for mixed UI and user text', () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        textContent: '',
        setAttribute(name, value) {
          this[name] = value;
        },
      }),
    });
    const span = userText('玩家甲');
    expect(span.textContent).toBe('玩家甲');
    expect(span['data-i18n-skip']).toBe('');
  });
});
