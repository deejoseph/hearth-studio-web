import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COACH_COMPLAINT_MAX,
  COACH_COMPLAINT_MIN,
  COACH_INQUIRY_MAX,
  COACH_INQUIRY_MIN,
  normalizeCoachMessage,
  publicComplaints,
  validateComplaint,
  validateInquiry,
} from '../src/game/coachMarketplace.js';

const pad = (n) => '预约留言'.repeat(Math.ceil(n / 4)).slice(0, n);
const STYLE = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const ENROLLMENT = readFileSync(new URL('../src/ui/coachEnrollment.js', import.meta.url), 'utf8');

describe('预约与投诉文字', () => {
  it('换行、全角空格和 nbsp 归成一个空格', () => {
    expect(normalizeCoachMessage(' 我想\u3000补战术\n 和开局 ')).toBe('我想 补战术 和开局');
  });

  it('预约按码点计数，刚好上下限都放行', () => {
    expect(validateInquiry(7, pad(COACH_INQUIRY_MIN), true).ok).toBe(true);
    expect(validateInquiry(7, pad(COACH_INQUIRY_MAX), true).ok).toBe(true);
    expect(validateInquiry(7, pad(COACH_INQUIRY_MIN - 1), true).field).toBe('message');
    expect(validateInquiry(7, pad(COACH_INQUIRY_MAX + 1), true).field).toBe('message');
  });

  it('投诉按码点计数，payload 不携带投诉人身份', () => {
    const result = validateComplaint(9, pad(COACH_COMPLAINT_MIN));
    expect(result).toEqual({ ok: true, payload: { coach_id: 9, text: pad(COACH_COMPLAINT_MIN) } });
    expect(validateComplaint(9, pad(COACH_COMPLAINT_MAX + 1)).field).toBe('text');
  });

  it('只有明确同意联系许可才能发预约', () => {
    for (const value of [undefined, false, 'true', 1]) {
      expect(validateInquiry(7, pad(COACH_INQUIRY_MIN), value).field).toBe('contact_ok');
    }
  });

  it('教练 id 不接受零、负数、数组和超范围数字', () => {
    for (const value of [0, -1, '1e3', [], 2147483648]) {
      expect(validateInquiry(value, pad(COACH_INQUIRY_MIN), true).field).toBe('coach_id');
    }
  });
});

describe('公开投诉白名单', () => {
  it('只展示已发布且有审定文案的记录，并剥掉私有字段', () => {
    const rows = [
      { id: 1, published_at: '2026-11-27 10:00:00', public_text: '已核实并公开。', reporter_email: 'private@example.test' },
      { id: 2, published_at: '', public_text: '尚未发布' },
      { id: 3, published_at: '2026-11-27 10:00:00', public_text: '   ' },
    ];
    expect(publicComplaints({ complaints: rows })).toEqual([{
      id: 1,
      public_text: '已核实并公开。',
      severity: '',
      published_at: '2026-11-27 10:00:00',
    }]);
  });
});

describe('教练图片灯箱', () => {
  it('图片按弹窗宽度缩小并完整显示', () => {
    const rule = STYLE.match(/\.coach-lightbox-image\s*\{([^}]*)\}/)?.[1] || '';
    expect(rule).toContain('max-width: 100%');
    expect(rule).toContain('object-fit: contain');
  });
});

describe('邮件预约幂等', () => {
  it('同一表单重试复用请求标识，改动留言后重新生成', () => {
    expect(ENROLLMENT).toContain('requestId ??= crypto.randomUUID()');
    expect(ENROLLMENT).toContain('request_id: requestId');
    expect(ENROLLMENT).toMatch(/el\.message\.addEventListener\('input',[\s\S]*?requestId = null;/);
  });
});
