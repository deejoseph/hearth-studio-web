import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const css = read('../src/style.css');
const main = read('../src/main.js');

describe('首页体验契约', () => {
  it('页面标题、分享标题和品牌标题统一', () => {
    expect(html).toMatch(/<title>国际象棋免费自学平台<\/title>/);
    expect(html).toMatch(/<meta property="og:title" content="国际象棋免费自学平台"/);
    expect(html).toMatch(/<meta name="twitter:title" content="国际象棋免费自学平台"/);
    expect(html).toContain('"name": "国际象棋免费自学平台"');
    expect(html).toContain('<h1 class="brand-name">国际象棋免费自学平台</h1>');
  });

  it('平台亮点默认选中，教程标签仍具备完整 ARIA 状态', () => {
    const learnTab = html.match(/<button[^>]*id="learn-tab"[^>]*>/)?.[0];
    const promoTab = html.match(/<button[^>]*id="promo-tab"[^>]*>/)?.[0];
    const learnPanel = html.match(/<div[^>]*id="learn-panel"[^>]*>/)?.[0];
    const promoPanel = html.match(/<div[^>]*id="platform-promo-panel"[^>]*>/)?.[0];
    expect(learnTab).toContain('aria-selected="false"');
    expect(learnTab).toContain('tabindex="-1"');
    expect(promoTab).toContain('aria-selected="true"');
    expect(promoTab).toContain('tabindex="0"');
    expect(learnPanel).toContain('hidden');
    expect(promoPanel).not.toContain('hidden');
  });

  it('教程与亮点卡片使用金色渐变，并保留暗色主题样式', () => {
    const card = css.match(/^\.learn-panes \{[\s\S]*?^\}/m)?.[0];
    expect(card).toContain('border: 1px solid #e3bb57');
    expect(card).toContain('linear-gradient(135deg, #fff8e6');
    expect(css).toContain(":root[data-theme='dark'] .learn-panes");
  });

  it('人数标注为展示数据并接入定时更新', () => {
    expect(html).toContain('aria-label="社区人数（展示数据）"');
    expect(html).toContain('展示数据 · 自动更新');
    expect(main).toContain('mountCommunityPresence();');
  });

  it('画笔栏提供三套棋盘、三套棋子和音效开关', () => {
    const boardSelect = html.match(/<select id="board-style-select"[\s\S]*?<\/select>/)?.[0];
    const pieceSelect = html.match(/<select id="piece-style-select"[\s\S]*?<\/select>/)?.[0];
    expect(boardSelect?.match(/<option /g)).toHaveLength(3);
    expect(pieceSelect?.match(/<option /g)).toHaveLength(3);
    expect(html).toContain('id="sound-btn"');
    expect(html).toContain('aria-pressed="true"');
  });

  it('外观与音效设置持久化，控件事件已接线', () => {
    expect(main).toContain('boardStyle,');
    expect(main).toContain('pieceStyle,');
    expect(main).toContain('sound: soundEnabled,');
    expect(main).toContain("els.boardStyleSelect.addEventListener('change'");
    expect(main).toContain("els.pieceStyleSelect.addEventListener('change'");
    expect(main).toContain("els.soundBtn.addEventListener('click'");
    expect(main).toContain("window.addEventListener('pointerdown', unlockMoveAudio");
  });

  it('同一局面重复渲染不重复播音，导入棋谱不误播最后一手', () => {
    expect(main).toContain('if (plies === announcedPlies) return;');
    expect(main).toContain('playMoveSound(moveSoundKind(lastMove, end || status));');
    expect(main).toContain('announcedPlies = 0;');
    expect(main).toContain('announcedPlies = game.history().length;');
  });
});
