/**
 * 评估曲线图：SVG 绘制整盘棋的胜负起伏。
 *
 * 横轴是步数（ply），纵轴是 centipawns。白方正朝上，黑方正朝下。
 * 杀棋距离饱和到 ±1000cp（和评估条一致）。
 *
 * 图上不写颜色：每个图元只带一个类名，配色全在 style.css 里按主题变量给，
 * 否则浅色主题会拿到一套深色主题的底色（这块以前就是黑框 + 灰字）。
 *
 * 支持点击曲线跳转到对应局面。
 */

import { CLASSIFY_ANNOT } from '../game/review.js';
import { moveLabels } from '../game/position.js';

const WIDTH = 640;
const HEIGHT = 160;
const PADDING = { top: 12, right: 12, bottom: 22, left: 40 };
const MAX_CP = 1000;

/**
 * 绘制评估曲线。
 *
 * @param {HTMLElement} container - 挂载点
 * @param {object[]} results - analyzeGame 的返回值
 * @param {string[]} sans - 每手棋的 SAN 格式
 * @param {string} gameOrigin - 开局 FEN，用于算回合号
 * @param {function} onPlyClick - 点击曲线时的回调 (ply) => void
 * @returns {{ update: function, destroy: function }}
 */
export function mountEvalGraph(container, results, sans, gameOrigin, onPlyClick) {
  container.innerHTML = '';
  container.classList.add('eval-graph');

  // 回合号从开局位置读，不再按 ply/2 硬算
  const moveLabels_list = moveLabels(gameOrigin, sans);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  container.appendChild(svg);

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const midY = PADDING.top + plotHeight / 2;

  // 坐标转换
  const xScale = (ply) => PADDING.left + (ply / Math.max(1, results.length - 1)) * plotWidth;
  const yScale = (cp) => {
    const clamped = Math.max(-MAX_CP, Math.min(MAX_CP, cp));
    return midY - (clamped / MAX_CP) * (plotHeight / 2);
  };

  // 绘制背景区域
  const bg = createSvgElement('rect', {
    x: PADDING.left,
    y: PADDING.top,
    width: plotWidth,
    height: plotHeight,
    rx: 4,
    class: 'eval-bg',
  });
  svg.appendChild(bg);

  // 绘制零线（均势）
  const zeroLine = createSvgElement('line', {
    x1: PADDING.left,
    y1: midY,
    x2: PADDING.left + plotWidth,
    y2: midY,
    'stroke-width': 1,
    'stroke-dasharray': '4,4',
    class: 'eval-zero',
  });
  svg.appendChild(zeroLine);

  // 绘制 Y 轴标签
  const labels = [
    { cp: MAX_CP, text: '+10' },
    { cp: 0, text: '0' },
    { cp: -MAX_CP, text: '-10' },
  ];
  for (const { cp, text } of labels) {
    const label = createSvgElement('text', {
      x: PADDING.left - 8,
      y: yScale(cp) + 4,
      'text-anchor': 'end',
      'font-size': 10,
      class: 'eval-label',
    });
    label.textContent = text;
    svg.appendChild(label);
  }

  // 绘制评估区域（填充）
  if (results.length > 1) {
    // 白色优势区域（评估 > 0）
    const whitePath = buildAreaPath(results, xScale, yScale, midY, 'positive');
    if (whitePath) {
      const whiteArea = createSvgElement('path', {
        d: whitePath,
        class: 'eval-area eval-area-white',
      });
      svg.appendChild(whiteArea);
    }

    // 黑色优势区域（评估 < 0）
    const blackPath = buildAreaPath(results, xScale, yScale, midY, 'negative');
    if (blackPath) {
      const blackArea = createSvgElement('path', {
        d: blackPath,
        class: 'eval-area eval-area-black',
      });
      svg.appendChild(blackArea);
    }
  }

  // 绘制评估曲线
  if (results.length > 1) {
    const linePath = buildLinePath(results, xScale, yScale);
    const line = createSvgElement('path', {
      d: linePath,
      'stroke-width': 2,
      class: 'eval-curve',
    });
    svg.appendChild(line);
  }

  // 绘制每手棋的点（带分类颜色）
  const dots = [];
  for (const result of results) {
    if (result.evalAfter === undefined) continue;
    const x = xScale(result.ply + 1);
    const y = yScale(result.evalAfter);
    const annot = CLASSIFY_ANNOT[result.classification] || '';

    const dot = createSvgElement('circle', {
      cx: x,
      cy: y,
      r: 4,
      'stroke-width': 1,
      class: `eval-dot ${annot}`,
      'data-ply': result.ply,
    });
    svg.appendChild(dot);
    dots.push(dot);

    // 点击跳转
    dot.addEventListener('click', () => onPlyClick?.(result.ply));
  }

  // 绘制 X 轴标签（每 10 步一个）
  const step = Math.max(1, Math.floor(results.length / 10));
  for (let i = 0; i < results.length; i += step) {
    const lbl = moveLabels_list[i] ?? { number: Math.floor(i / 2) + 1, white: i % 2 === 0 };
    const label = createSvgElement('text', {
      x: xScale(i),
      y: HEIGHT - 4,
      'text-anchor': 'middle',
      'font-size': 11,
      class: 'eval-label',
    });
    label.textContent = lbl.number;
    svg.appendChild(label);
  }

  // 当前局面指示线
  const cursor = createSvgElement('line', {
    x1: PADDING.left,
    y1: PADDING.top,
    x2: PADDING.left,
    y2: PADDING.top + plotHeight,
    'stroke-width': 2,
    opacity: 0,
    class: 'eval-cursor',
  });
  svg.appendChild(cursor);

  // 悬停提示
  const tooltip = document.createElement('div');
  tooltip.className = 'eval-tooltip';
  tooltip.style.display = 'none';
  container.appendChild(tooltip);

  // 鼠标悬停显示评估
  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const ply = Math.round(((x - PADDING.left) / plotWidth) * (results.length - 1));
    if (ply >= 0 && ply < results.length) {
      const result = results[ply];
      const evalText = formatEval(result.evalBefore);
      const lbl = moveLabels_list[ply] ?? { number: Math.floor(ply / 2) + 1, white: ply % 2 === 0 };
      tooltip.textContent = `${lbl.number}${lbl.white ? '.' : '...'} ${evalText}`;
      tooltip.style.display = 'block';
      tooltip.style.left = `${(e.clientX - rect.left)}px`;
      tooltip.style.top = `${(e.clientY - rect.top) - 30}px`;
    }
  });

  svg.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });

  return {
    /** 更新当前局面指示线位置。 */
    setCurrentPly(ply) {
      if (ply < 0 || ply >= results.length) {
        cursor.setAttribute('opacity', 0);
        return;
      }
      const x = xScale(ply);
      cursor.setAttribute('x1', x);
      cursor.setAttribute('x2', x);
      cursor.setAttribute('opacity', 1);
    },

    /** 高亮某手棋（用于显示分类详情）。 */
    highlightPly(ply) {
      for (const dot of dots) {
        if (Number(dot.getAttribute('data-ply')) === ply) {
          dot.setAttribute('r', 6);
          dot.setAttribute('stroke-width', 2);
        } else {
          dot.setAttribute('r', 4);
          dot.setAttribute('stroke-width', 1);
        }
      }
    },

    destroy() {
      container.innerHTML = '';
    },
  };
}

function createSvgElement(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

function buildLinePath(results, xScale, yScale) {
  const points = [];
  // 起始局面
  points.push(`${xScale(0)},${yScale(results[0].evalBefore)}`);
  // 每手棋后的评估
  for (let i = 0; i < results.length; i++) {
    if (results[i].evalAfter !== undefined) {
      points.push(`${xScale(i + 1)},${yScale(results[i].evalAfter)}`);
    }
  }
  return `M ${points.join(' L ')}`;
}

function buildAreaPath(results, xScale, yScale, midY, side) {
  const points = [];
  const isPositive = side === 'positive';

  // 起始点
  const startEval = results[0].evalBefore;
  if ((isPositive && startEval >= 0) || (!isPositive && startEval <= 0)) {
    points.push({ x: xScale(0), y: yScale(startEval) });
  } else {
    points.push({ x: xScale(0), y: midY });
  }

  // 中间点
  for (let i = 0; i < results.length; i++) {
    const eval_ = results[i].evalAfter;
    if (eval_ === undefined) continue;
    if ((isPositive && eval_ >= 0) || (!isPositive && eval_ <= 0)) {
      points.push({ x: xScale(i + 1), y: yScale(eval_) });
    } else {
      points.push({ x: xScale(i + 1), y: midY });
    }
  }

  if (points.length < 2) return null;

  // 闭合路径
  const lastX = points[points.length - 1].x;
  const firstX = points[0].x;
  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x},${points[i].y}`;
  }
  path += ` L ${lastX},${midY} L ${firstX},${midY} Z`;
  return path;
}

function formatEval(cp) {
  if (cp === null || cp === undefined) return '0.00';
  const abs = Math.abs(cp);
  if (abs >= 1000) {
    return cp > 0 ? '白方杀' : '黑方杀';
  }
  const sign = cp >= 0 ? '+' : '';
  return `${sign}${(cp / 100).toFixed(2)}`;
}
