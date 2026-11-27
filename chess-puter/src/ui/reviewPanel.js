/**
 * 复盘报告面板：显示整盘棋的分析结果。
 *
 * 包含：
 * - 小结（规则模板写的几句话）
 * - 准确率统计（白方/黑方/总体）
 * - 各分类计数（错着/漏着/不精确/好棋/最佳）
 * - 关键转折点列表
 * - 走法列表（带颜色标记）
 */

import {
  CLASSIFY_LABEL,
  CLASSIFY_ANNOT,
  CLASSIFY_THRESHOLDS,
  computeAccuracy,
  countClassifications,
  findCriticalMoments,
  markFor,
} from '../game/review.js';
import { buildReviewSummary } from '../game/summary.js';
import { moveLabels } from '../game/position.js';
import { mountEvalGraph } from './evalGraph.js';

/**
 * 挂载复盘面板。
 *
 * @param {HTMLElement} container - 挂载点
 * @param {object} options
 * @param {object[]} options.results - analyzeGame 的返回值
 * @param {string[]} options.sans - 每手棋的 SAN 格式
 * @param {string} options.gameOrigin - 开局 FEN，用于算回合号
 * @param {function} options.onPlyClick - 点击走法时的回调 (ply) => void
 * @param {'w'|'b'|null} [options.viewerColor] - 看棋的人执哪方，小结用它说"你/对方"
 * @returns {{ update: function, destroy: function }}
 */
export function mountReviewPanel(container, { results, sans, gameOrigin, onPlyClick, viewerColor = null }) {
  container.innerHTML = '';
  container.classList.add('review-panel');

  // 小结放在最前面：教练先在纸上手写的那几句，扫一眼就知道该看哪几手
  const summaryLines = buildReviewSummary(results, sans, { viewerColor, gameOrigin });
  if (summaryLines.length > 0) {
    const summarySection = createSection('小结');
    summarySection.appendChild(createSummaryList(summaryLines));
    container.appendChild(summarySection);
  }

  // 准确率
  const accuracy = computeAccuracy(results);
  const accuracySection = createSection('准确率');
  accuracySection.appendChild(createAccuracyDisplay(accuracy));
  container.appendChild(accuracySection);

  // 分类统计
  const counts = countClassifications(results);
  const statsSection = createSection('走法统计');
  statsSection.appendChild(createStatsDisplay(counts, results.length));
  container.appendChild(statsSection);

  // 阈值说明
  const legendSection = createSection('标注说明');
  legendSection.appendChild(createThresholdLegend());
  container.appendChild(legendSection);

  // 评估曲线
  const graphSection = createSection('评估曲线');
  const graphContainer = document.createElement('div');
  graphContainer.className = 'eval-graph-container';
  graphSection.appendChild(graphContainer);
  container.appendChild(graphSection);

  const graph = mountEvalGraph(graphContainer, results, sans, gameOrigin, onPlyClick);

  // 关键转折点
  const moments = findCriticalMoments(results, 5);
  if (moments.length > 0) {
    const momentsSection = createSection('关键转折');
    momentsSection.appendChild(createMomentsList(moments, results, sans, gameOrigin, onPlyClick));
    container.appendChild(momentsSection);
  }

  // 走法列表
  const movesSection = createSection('走法详情');
  movesSection.appendChild(createMovesList(results, sans, gameOrigin, onPlyClick));
  container.appendChild(movesSection);

  return {
    setCurrentPly(ply) {
      graph.setCurrentPly(ply);
      // 高亮当前走法
      const items = movesSection.querySelectorAll('.review-move-item');
      items.forEach((item) => {
        if (Number(item.dataset.ply) === ply) {
          item.classList.add('current');
        } else {
          item.classList.remove('current');
        }
      });
    },

    destroy() {
      graph.destroy();
      container.innerHTML = '';
    },
  };
}

function createSection(title) {
  const section = document.createElement('div');
  section.className = 'review-section';
  const heading = document.createElement('h3');
  heading.className = 'review-section-title';
  heading.textContent = title;
  section.appendChild(heading);
  return section;
}

function createAccuracyDisplay(accuracy) {
  const div = document.createElement('div');
  div.className = 'review-accuracy';

  // 三个数字都用主题变量上色（见 style.css 的 .review-accuracy-value）。
  // 这里曾经写死 #fff/#888：浅色主题下灰底白字，"白方 24.8%" 根本看不见。
  const items = [
    { label: '白方', value: accuracy.white, cls: 'acc-plain' },
    { label: '黑方', value: accuracy.black, cls: 'acc-plain' },
    { label: '总体', value: accuracy.overall, cls: 'acc-overall' },
  ];

  for (const { label, value, cls } of items) {
    const item = document.createElement('div');
    item.className = 'review-accuracy-item';

    const labelEl = document.createElement('span');
    labelEl.className = 'review-accuracy-label';
    labelEl.textContent = label;
    item.appendChild(labelEl);

    const valueEl = document.createElement('span');
    valueEl.className = `review-accuracy-value ${cls}`;
    valueEl.textContent = `${value.toFixed(1)}%`;
    item.appendChild(valueEl);

    div.appendChild(item);
  }

  return div;
}

function createStatsDisplay(counts, total) {
  const div = document.createElement('div');
  div.className = 'review-stats';

  const categories = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'];
  for (const cat of categories) {
    const item = document.createElement('div');
    item.className = 'review-stat-item';

    const dot = document.createElement('span');
    dot.className = `review-stat-dot ${CLASSIFY_ANNOT[cat]}`;
    item.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'review-stat-label';
    label.textContent = CLASSIFY_LABEL[cat];
    item.appendChild(label);

    const count = document.createElement('span');
    count.className = 'review-stat-count';
    count.textContent = counts[cat] || 0;
    item.appendChild(count);

    const pct = total > 0 ? ((counts[cat] || 0) / total * 100).toFixed(0) : 0;
    const pctEl = document.createElement('span');
    pctEl.className = 'review-stat-pct';
    pctEl.textContent = `(${pct}%)`;
    item.appendChild(pctEl);

    div.appendChild(item);
  }

  return div;
}

function createMomentsList(moments, results, sans, gameOrigin, onPlyClick) {
  const list = document.createElement('div');
  list.className = 'review-moments-list';
  // 回合号从开局位置读，不再按 ply/2 硬算
  const labels = moveLabels(gameOrigin, sans);

  for (const moment of moments) {
    const result = results[moment.ply];
    if (!result) continue;

    const item = document.createElement('div');
    item.className = 'review-moment-item';
    item.style.cursor = 'pointer';
    item.dataset.ply = moment.ply;

    const lbl = labels[moment.ply] ?? { number: Math.floor(moment.ply / 2) + 1, white: moment.ply % 2 === 0 };
    const san = sans[moment.ply] || '...';

    const moveEl = document.createElement('span');
    moveEl.className = `review-moment-move ${CLASSIFY_ANNOT[result.classification] || ''}`;
    moveEl.textContent = `${lbl.number}.${lbl.white ? '' : '..'} ${san}`;
    const mark = markSpan(result);
    if (mark) moveEl.appendChild(mark);
    item.appendChild(moveEl);

    const lossEl = document.createElement('span');
    lossEl.className = `review-moment-loss ${CLASSIFY_ANNOT[result.classification] || ''}`;
    lossEl.textContent = `-${(moment.swing / 100).toFixed(2)}`;
    item.appendChild(lossEl);

    item.addEventListener('click', () => onPlyClick?.(moment.ply));
    list.appendChild(item);
  }

  return list;
}

function createMovesList(results, sans, gameOrigin, onPlyClick) {
  const list = document.createElement('div');
  list.className = 'review-moves-list';
  // 回合号从开局位置读，不再按 ply/2 硬算
  const labels = moveLabels(gameOrigin, sans);

  // 按回合分组（每回合两手棋）
  for (let i = 0; i < results.length; i += 2) {
    const row = document.createElement('div');
    row.className = 'review-moves-row';

    // 回合号
    const numEl = document.createElement('span');
    numEl.className = 'review-moves-num';
    const lbl = labels[i] ?? { number: Math.floor(i / 2) + 1, white: true };
    numEl.textContent = `${lbl.number}.`;
    row.appendChild(numEl);

    // 白方走法
    if (i < results.length) {
      row.appendChild(createMoveItem(results[i], sans[i], i, onPlyClick));
    }

    // 黑方走法
    if (i + 1 < results.length) {
      row.appendChild(createMoveItem(results[i + 1], sans[i + 1], i + 1, onPlyClick));
    }

    list.appendChild(row);
  }

  return list;
}

function createMoveItem(result, san, ply, onPlyClick) {
  const item = document.createElement('span');
  item.className = 'review-move-item';
  item.dataset.ply = ply;
  item.style.cursor = 'pointer';

  if (result.classification) {
    item.classList.add(CLASSIFY_ANNOT[result.classification]);
  }

  item.textContent = san || '...';
  const mark = markSpan(result);
  if (mark) item.appendChild(mark);

  // 悬停提示
  if (result.loss !== undefined && result.loss > 0) {
    item.title = `${CLASSIFY_LABEL[result.classification]} (-${(result.loss / 100).toFixed(2)})`;
  }

  item.addEventListener('click', () => onPlyClick?.(ply));
  return item;
}

/** SAN 后面的标注符号。颜色由外层 `.annot-*` 决定，这里只管加粗。 */
function markSpan(result) {
  const mark = markFor(result);
  if (!mark) return null;
  const span = document.createElement('span');
  span.className = 'review-mark';
  span.textContent = mark;
  return span;
}

/** 小结：一句一段，段末留一点行距，方便教练逐句扫。 */
function createSummaryList(lines) {
  const box = document.createElement('div');
  box.className = 'review-summary';
  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'review-summary-line';
    p.textContent = line;
    box.appendChild(p);
  }
  return box;
}

/**
 * 创建复盘进度条。
 *
 * @param {HTMLElement} container
 * @returns {{ update: function(current, total), destroy: function }}
 */
export function mountReviewProgress(container) {
  container.innerHTML = '';
  container.classList.add('review-progress');

  const bar = document.createElement('div');
  bar.className = 'review-progress-bar';
  container.appendChild(bar);

  const fill = document.createElement('div');
  fill.className = 'review-progress-fill';
  bar.appendChild(fill);

  const text = document.createElement('span');
  text.className = 'review-progress-text';
  text.textContent = '正在分析...';
  container.appendChild(text);

  return {
    update(current, total) {
      const pct = total > 0 ? (current / total) * 100 : 0;
      fill.style.width = `${pct}%`;
      text.textContent = `分析中 ${current}/${total}...`;
    },

    setText(value) {
      text.textContent = value;
    },

    destroy() {
      container.innerHTML = '';
    },
  };
}

/** 标注说明：列出每个分类的符号、名称和阈值。 */
function createThresholdLegend() {
  const legend = document.createElement('div');
  legend.className = 'review-threshold-legend';

  const items = [
    { annot: 'best', label: '最佳', desc: '和引擎首选一致' },
    { annot: 'good', label: '好棋', desc: `亏损 ≤ ${CLASSIFY_THRESHOLDS.inaccuracy} 厘兵` },
    { annot: 'inaccuracy', label: '不精确', desc: `亏损 ${CLASSIFY_THRESHOLDS.inaccuracy}–${CLASSIFY_THRESHOLDS.mistake} 厘兵` },
    { annot: 'mistake', label: '错着', desc: `亏损 ${CLASSIFY_THRESHOLDS.mistake}–${CLASSIFY_THRESHOLDS.blunder} 厘兵` },
    { annot: 'blunder', label: '漏着', desc: `亏损 > ${CLASSIFY_THRESHOLDS.blunder} 厘兵` },
  ];

  for (const { annot, label, desc } of items) {
    const row = document.createElement('div');
    row.className = 'review-threshold-row';

    const mark = document.createElement('span');
    mark.className = `review-threshold-mark ${CLASSIFY_ANNOT[annot] || ''}`;
    mark.textContent = CLASSIFY_LABEL[annot] || '';
    row.appendChild(mark);

    const name = document.createElement('span');
    name.className = 'review-threshold-name';
    name.textContent = label;
    row.appendChild(name);

    const description = document.createElement('span');
    description.className = 'review-threshold-desc';
    description.textContent = desc;
    row.appendChild(description);

    legend.appendChild(row);
  }

  return legend;
}
