/**
 * 复盘小结：把已经算出来的数字写成几句话。
 *
 * 这里没有模型，只有规则——每一句都能追回 analyzeGame 的某个字段，所以不会
 * 出现"看着像教练说的、其实是编的"。宁可短，也不要瞎猜。
 *
 * 记法按局面自己的回合号（FEN 的第 6 段），所以从残局摆开的棋也说得对。
 */

import { annotationFor, computeAccuracy, countClassifications, moverGain } from './review.js';
import { moveLabels } from './position.js';

const SIDE_NAME = { w: '白方', b: '黑方' };
const SIDE_SHORT = { w: '白', b: '黑' };
/** computeAccuracy 的键按颜色名，不是按 'w'/'b'。 */
const SIDE_ACC = { w: 'white', b: 'black' };

/** 总体准确率落到哪句评语。 */
const TIERS = [
  [90, '整体很稳'],
  [80, '整体不错，细看有几手能更好'],
  [70, '有起伏，几手关键棋决定了结果'],
  [60, '失误偏多'],
  [0, '这盘值得从头再摆一遍'],
];

function sideOf(result) {
  return String(result.fen || '').split(/\s+/)[1] === 'b' ? 'b' : 'w';
}

/** 怎么称呼某一手："第 61 回合黑方 g5??"。 */
function refer(result, sans, ply, labels) {
  const side = SIDE_NAME[sideOf(result)];
  const san = String(sans?.[ply] || result.move || '…').replace(/[!?]+$/, '');
  // 优先用 labels（从开局位置重放算出来的回合号），否则从 result.fen 读
  const lbl = labels?.[ply] ?? {
    number: Number(String(result.fen || '').split(/\s+/)[5]) || Math.floor(ply / 2) + 1,
    white: ply % 2 === 0,
  };
  return `第 ${lbl.number} 回合${side} ${san}${annotationFor(result)?.mark ?? ''}`;
}

/** centipawns 说成"多少兵"，保留两位。 */
function pawns(cp) {
  return (Math.abs(cp) / 100).toFixed(2);
}

/** UCI 的 'd4e4' 写成 'd4→e4'；缺字段就返回 null。 */
function arrow(uci) {
  const m = /^(?<from>[a-h][1-8])(?<to>[a-h][1-8])(?:[qrbn])?$/.exec(String(uci || ''));
  return m ? `${m.groups.from}→${m.groups.to}` : null;
}

/** 评估的说法：白方正、黑方负。杀棋分（±1000 封顶）直接说谁被将死，比 +10.00 好读。 */
function evalPhrase(cp) {
  if (!Number.isFinite(cp)) return '看不清';
  if (cp >= 1000) return '黑方被将死';
  if (cp <= -1000) return '白方被将死';
  return `${cp >= 0 ? '+' : '-'}${pawns(cp)}`;
}

/**
 * 按评估损失从大到小挑几手，带上手号。看棋的人已知时，先排他自己亏的手——
 * 这是他的复盘报告，对手的漏着排在后面。两次排序都稳定，所以亏损次序不会被打乱。
 */
function worst(results, limit, viewer) {
  const scored = results
    .map((r, ply) => ({ ...r, ply: Number.isFinite(r.ply) ? r.ply : ply }))
    .filter((r) => r.loss > 0)
    .sort((a, b) => b.loss - a.loss);
  if (viewer) {
    scored.sort((a, b) => Number(sideOf(b) === viewer) - Number(sideOf(a) === viewer));
  }
  return scored.slice(0, limit);
}

/** 评估往走棋方好处变得最多的一手。 */
function bestFind(results) {
  let best = null;
  results.forEach((r, index) => {
    const ply = Number.isFinite(r.ply) ? r.ply : index;
    if (r.loss > 0) return;
    const gain = moverGain(r);
    if (gain > 0 && (!best || gain > best.swing)) best = { result: r, ply, swing: gain };
  });
  return best;
}

/**
 * 失误集中在哪一段。至少要两笔、且三分之二落在同一段才敢说，否则宁可不说。
 */
function clustering(results) {
  const errors = results
    .map((r, ply) => ({ classification: r.classification, ply: Number.isFinite(r.ply) ? r.ply : ply }))
    .filter((r) => ['inaccuracy', 'mistake', 'blunder'].includes(r.classification));
  if (errors.length < 2) return null;
  const total = results.length;
  const inThird = (third) => errors.filter((r) => Math.floor((r.ply / total) * 3) === third).length;
  const names = ['开局', '中局', '收官'];
  for (const third of [0, 1, 2]) {
    if (inThird(third) / errors.length >= 2 / 3) return names[third];
  }
  return null;
}

/**
 * 生成小结。
 *
 * @param {object[]} results - analyzeGame 的返回值
 * @param {string[]} sans - 每手的 SAN，下标和 results 对齐
 * @param {{ viewerColor?: 'w'|'b'|null }} [options] - 看棋的人执哪方；不知道就别传
 * @returns {string[]} 每句一段，没有内容可说时返回空数组
 */
export function buildReviewSummary(results, sans, options = {}) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const viewer = options.viewerColor === 'w' || options.viewerColor === 'b' ? options.viewerColor : null;
  const foe = viewer === 'w' ? 'b' : viewer === 'b' ? 'w' : null;
  const gameOrigin = options.gameOrigin || null;
  const accuracy = computeAccuracy(results);
  const counts = countClassifications(results);
  const lines = [];
  // 回合号从开局位置读，不再按 ply/2 硬算
  const labels = gameOrigin ? moveLabels(gameOrigin, sans) : [];
  const tier = TIERS.find(([min]) => accuracy.overall >= min)[1];
  const pct = (value) => `${value.toFixed(1)}%`;
  if (viewer) {
    lines.push(
      `你执${SIDE_SHORT[viewer]}，准确率 ${pct(accuracy[SIDE_ACC[viewer]])}，` +
        `对手 ${pct(accuracy[SIDE_ACC[foe]])}。` +
        `这盘整体 ${pct(accuracy.overall)}，${tier}。`,
    );
  } else {
    lines.push(
      `总体准确率 ${pct(accuracy.overall)}，${tier}。白方 ${pct(accuracy.white)}、黑方 ${pct(accuracy.black)}。`,
    );
  }

  const mistakes = counts.blunder + counts.mistake + counts.inaccuracy;
  if (mistakes === 0) {
    lines.push('每一手都在引擎的接受范围里，没有丢子也没有送兵。');
  } else {
    const parts = [];
    if (counts.blunder) parts.push(`错着 ${counts.blunder} 手`);
    if (counts.mistake) parts.push(`漏着 ${counts.mistake} 手`);
    if (counts.inaccuracy) parts.push(`不精确 ${counts.inaccuracy} 手`);
    const bySide = { w: 0, b: 0 };
    for (const r of results) {
      if (['inaccuracy', 'mistake', 'blunder'].includes(r.classification)) bySide[sideOf(r)]++;
    }
    const only = bySide.w === 0 || bySide.b === 0 ? (bySide.w ? 'w' : 'b') : null;
    let who;
    if (!viewer) {
      who = only ? `全部出在${SIDE_NAME[only]}。` : `白方 ${bySide.w} 手、黑方 ${bySide.b} 手。`;
    } else if (only === viewer) {
      who = `全部出在你这边（${bySide[viewer]} 手）。`;
    } else if (only) {
      who = `全部出在对方（${bySide[foe]} 手）。`;
    } else {
      who = `你 ${bySide[viewer]} 手、对方 ${bySide[foe]} 手。`;
    }
    lines.push(`这一盘有${parts.join('、')}。${who}`);
  }

  const worstMoves = worst(results, 3, viewer).filter((r) => r.loss >= 50);
  for (const r of worstMoves) {
    const suggestion = arrow(r.bestMove);
    lines.push(
      `${refer(r, sans, r.ply, labels)} 亏了 ${pawns(r.loss)}，` +
        `局面从 ${evalPhrase(r.evalBefore)} 变成 ${evalPhrase(r.evalAfter)}` +
        (suggestion ? `；引擎要的是 ${suggestion}` : '') +
        '。',
    );
  }

  const highlight = bestFind(results);
  if (highlight && highlight.swing >= 50) {
    lines.push(
      `${refer(highlight.result, sans, highlight.ply, labels)} 是这盘最亮的一手，` +
        `为自己挣了 ${pawns(highlight.swing)} 的评估。`,
    );
  }

  const where = clustering(results);
  if (where && mistakes > 0) {
    lines.push(`失误多半落在${where}，那一段值得再走一遍。`);
  }

  if (worstMoves.length > 0) {
    lines.push('在走法详情里点上面这几手，棋盘就回到当时的局面，再按 ← 或 → 一手一手看过去。');
  }

  return lines;
}
