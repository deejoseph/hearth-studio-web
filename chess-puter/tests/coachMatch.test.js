import { describe, expect, it } from 'vitest';
import { matchCoach, matchReasons, rankCoaches } from '../src/game/coachMatch.js';

/**
 * 名录排序那层（src/game/coachMatch.js）。
 *
 * 两件事必须一直成立，所以都写成断言：
 * 1. 分数只是顺序 —— 一位教练哪怕一样都对不上，也照样出现在名录里（这里没有门禁）；
 * 2. 同分不换序 —— 同一份数据刷新两次，卡片不该自己换位。
 *
 * 权重那几个数字本身不重要（改大改小都不算坏），重要的是"能接收这一档"排在
 * "时区一样"前面。所以用例比的是相对顺序，不是总分。
 */

const coachRow = (profile = {}, over = {}) => ({
  player_id: over.player_id ?? 1,
  nickname: over.nickname ?? '教练',
  rating: over.rating ?? null,
  has_profile: over.has_profile ?? Object.values(profile).some((v) => v !== '' && v !== null),
  profile: {
    title: '',
    elo: null,
    years: null,
    tagline: '',
    honors: '',
    language: '',
    timezone: '',
    levels: [],
    goals: [],
    formats: [],
    slots: [],
    photos: [],
    ...profile,
  },
});

const pref = (over = {}) => ({
  level: 'play',
  goals: ['tactics'],
  formats: ['one'],
  slots: ['wkend_am'],
  timezone: 'Asia/Shanghai',
  language: 'zh',
  note: '',
  ...over,
});

describe('一位教练对一份偏好值几分', () => {
  it('没填偏好时不算分，界面改按资料全不全排', () => {
    expect(matchCoach(null, coachRow({ title: 'gm' }))).toEqual({
      score: null, reasons: [], matched: false,
    });
  });

  it('全对上：每一样都留一句理由', () => {
    const match = matchCoach(pref(), coachRow({
      levels: ['amateur5', 'master'], goals: ['tactics', 'opening'], formats: ['one'],
      slots: ['wkend_am'], timezone: 'Asia/Shanghai', language: 'zh',
    }));
    expect(match.matched).toBe(true);
    expect(match.reasons).toEqual([
      '可接收「业余五级以下」',
      '补战术',
      '一对一',
      '在周末上午有空的',
      '和你同一个时区',
      '用中文上课',
    ]);
  });

  it('一样都没对上：0 分，但不是"消失"', () => {
    const match = matchCoach(pref(), coachRow({ goals: ['endgame'], language: 'en' }));
    expect(match.score).toBe(0);
    expect(match.reasons).toEqual([]);
    expect(match.matched).toBe(false);
  });

  it('能接收的水平比时区值钱', () => {
    const byLevel = matchCoach(pref(), coachRow({ levels: ['amateur5'] })).score;
    const byZone = matchCoach(pref(), coachRow({ timezone: 'Asia/Shanghai' })).score;
    expect(byLevel).toBeGreaterThan(byZone);
  });

  it.each([
    ['zero', 'zero', '零基础'],
    ['moves', 'amateur5', '业余五级以下'],
    ['play', 'amateur5', '业余五级以下'],
    ['rated', 'master', '业余大师以上'],
  ])('学员当前水平 %s 对应教练接收档位 %s', (level, accepted, label) => {
    const match = matchCoach(pref({ level }), coachRow({ levels: [accepted] }));
    expect(match.reasons[0]).toBe(`可接收「${label}」`);
  });

  it('接收档位是上限，不会把高水平学员推荐给只收零基础的教练', () => {
    expect(matchCoach(pref({ level: 'rated' }), coachRow({ levels: ['zero'] })).matched).toBe(false);
  });

  it('擅长方向对上几项就算几项，时段同理', () => {
    const two = matchCoach(pref({ goals: ['tactics', 'opening', 'endgame'] }),
      coachRow({ goals: ['tactics', 'opening'] })).score;
    const one = matchCoach(pref({ goals: ['tactics', 'opening', 'endgame'] }),
      coachRow({ goals: ['tactics'] })).score;
    expect(two).toBe(one * 2);
  });

  it('教练那边空着不报错，只是 0 分', () => {
    expect(matchCoach(pref(), coachRow({}))).toMatchObject({ score: 0, matched: false });
    expect(matchCoach(pref(), {})).toMatchObject({ score: 0 });
    expect(matchCoach(pref(), null)).toMatchObject({ score: 0 });
  });

  it('多选值存成逗号串也认（库里就是这一列的形状）', () => {
    expect(matchCoach(pref(), coachRow({ levels: 'amateur5,amateur1' })).matched).toBe(true);
  });
});

describe('授课语言那条：zh_en 在两边含义不同', () => {
  it('教练"中英都行"接得住要中文或英文的学员，算满分', () => {
    expect(matchCoach(pref({ language: 'zh' }), coachRow({ language: 'zh_en' })).score)
      .toBe(matchCoach(pref({ language: 'zh' }), coachRow({ language: 'zh' })).score);
    expect(matchCoach(pref({ language: 'en' }), coachRow({ language: 'zh_en' })).reasons)
      .toContain('中文英文都行');
  });

  it('学员"中英都行"时教练只教一种，给一半 —— 不如完全对上值得吹', () => {
    const half = matchCoach(pref({ language: 'zh_en' }), coachRow({ language: 'en' })).score;
    const full = matchCoach(pref({ language: 'en' }), coachRow({ language: 'en' })).score;
    expect(half).toBe(full / 2);
  });

  it('中 vs 英是 0 分；任何一边空着也是 0 分', () => {
    expect(matchCoach(pref({ language: 'zh' }), coachRow({ language: 'en' })).score).toBe(0);
    expect(matchCoach(pref({ language: 'zh' }), coachRow({ language: '' })).score).toBe(0);
    expect(matchCoach(pref({ language: '' }), coachRow({ language: 'zh' })).score).toBe(0);
  });
});

describe('整页顺序', () => {
  const mine = pref();

  it('分数高的在前', () => {
    const list = rankCoaches([
      coachRow({ goals: ['endgame'] }, { player_id: 1 }),
      coachRow({ levels: ['amateur5'], goals: ['tactics'] }, { player_id: 2 }),
    ], mine);
    expect(list.map((item) => item.coach.player_id)).toEqual([2, 1]);
  });

  it('没填偏好时按资料全不全：填过的在前，然后称号，最后才看等级分', () => {
    const list = rankCoaches([
      coachRow({}, { player_id: 1, has_profile: false }),
      coachRow({ elo: 2500 }, { player_id: 2, has_profile: true }),
      coachRow({ title: 'gm', elo: 2200 }, { player_id: 3, has_profile: true }),
      coachRow({ title: 'cm', elo: 2100 }, { player_id: 4, has_profile: true }),
    ], null);
    expect(list.map((item) => item.coach.player_id)).toEqual([3, 4, 2, 1]);
  });

  it('教练没登记 elo 时不拿账号 rating 比较，保持服务端原序', () => {
    const list = rankCoaches([
      coachRow({}, { player_id: 1, rating: 1800, has_profile: true }),
      coachRow({}, { player_id: 2, rating: 2300, has_profile: true }),
    ], null);
    expect(list.map((item) => item.coach.player_id)).toEqual([1, 2]);
  });

  it('一个都不占时保持服务端给的原序：同一份数据刷两次不能看到卡片自己换位', () => {
    const flat = [1, 2, 3].map((id) => coachRow({}, { player_id: id }));
    expect(rankCoaches(flat, mine).map((i) => i.coach.player_id)).toEqual([1, 2, 3]);
    expect(rankCoaches(flat, null).map((i) => i.coach.player_id)).toEqual([1, 2, 3]);
  });

  it('🔴 排序不是门禁：一样都没对上也照样出现在名录里，一个都不删', () => {
    const list = rankCoaches([
      coachRow({ goals: ['endgame'] }, { player_id: 1 }),
      coachRow({}, { player_id: 2 }),
      coachRow({ language: 'en' }, { player_id: 3 }),
    ], mine);
    expect(list).toHaveLength(3);
    expect(list.map((i) => i.match.score).every((score) => typeof score === 'number')).toBe(true);
  });

  it('空名录、缺参数都不炸', () => {
    expect(rankCoaches([], mine)).toEqual([]);
    expect(rankCoaches(undefined, mine)).toEqual([]);
    expect(rankCoaches([coachRow({})], undefined)).toHaveLength(1);
  });
});

describe('卡片上那句"为什么排在这儿"', () => {
  it('最多三条，前几条本来就是分最高的', () => {
    const reasons = matchReasons(matchCoach(pref(), coachRow({
      levels: ['amateur5'], goals: ['tactics', 'opening'], formats: ['one'],
      slots: ['wkend_am'], timezone: 'Asia/Shanghai', language: 'zh',
    })));
    expect(reasons).toHaveLength(3);
    expect(reasons[0]).toBe('可接收「业余五级以下」');
  });

  it('多个授课形式用列表分隔，英文翻译后不会粘连', () => {
    const match = matchCoach(pref({ formats: ['one', 'review'] }), coachRow({ formats: ['one', 'review'] }));
    expect(match.reasons).toContain('一对一、只批改棋谱');
  });

  it('没理由就是空数组，界面据此换说教练自己标的那两样', () => {
    expect(matchReasons(matchCoach(pref(), coachRow({})))).toEqual([]);
    expect(matchReasons(null)).toEqual([]);
    expect(matchReasons(undefined, 1)).toEqual([]);
  });

  it('一条理由都不编给教练打广告（只出真对上的字段）', () => {
    const reasons = matchReasons(matchCoach(pref(), coachRow({
      honors: '带出过世界冠军', tagline: '全网最低价', levels: ['amateur5'],
    })));
    expect(reasons.join('')).not.toMatch(/冠军|价格/);
  });
});
