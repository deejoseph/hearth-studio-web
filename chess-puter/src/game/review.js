/**
 * 复盘核心：批量分析一整盘棋，给每手棋分类。
 *
 * 和单局面分析（analysis.js）的区别：
 * - 单局面分析是"现在这个局面引擎怎么看"
 * - 复盘是"整盘棋哪里走得好、哪里走得差"
 *
 * 走法分类按评估损失（eval loss）：
 * - 错着（blunder）：损失 > 200cp
 * - 漏着（mistake）：损失 100-200cp
 * - 不精确（inaccuracy）：损失 50-100cp
 * - 好棋（good）：损失 < 50cp 但不是最佳
 * - 最佳（best）：和引擎第一选一致
 *
 * 评估损失按行棋方算：白方走棋时评估下降是损失，黑方走棋时评估上升是损失。
 * 这样"损失"永远是"这手棋让走棋方变差了多少"。
 */

import { scoreToCentipawns, uciToMove } from '../engine/stockfish.js';
import { Chess } from '../engine/chess.js';

/** 分类阈值（centipawns）。好棋要求跟引擎首选差距 ≤ 20 厘兵（约 1/5 子）。 */
export const CLASSIFY_THRESHOLDS = {
  blunder: 200,
  mistake: 100,
  inaccuracy: 20,
};

/**
 * 每一类走法的标注：书写符号 + PGN 的 NAG 码，成对写在一行里。
 *
 * NAG 的标准表是 $1="!"、$2="?"、$3="!?"、$4="?!"、$5="!!"、$6="??"。两处分开
 * 维护迟早对不上，导出到别的软件就会显示成另一个符号。
 *
 * "!!" 不在表里：一整盘的最佳手都盖 "!!" 等于没盖，那是别的软件里的妙手专用符号，
 * 只有下面 annotationFor 认定的那几手才配得上。
 */
const ANNOTATIONS = {
  best: { mark: '!', nag: '$1' },
  good: { mark: '!', nag: '$1' },
  inaccuracy: { mark: '?!', nag: '$4' },
  mistake: { mark: '?', nag: '$2' },
  blunder: { mark: '??', nag: '$6' },
};

/** "!!" 只留给真正的妙手，见 annotationFor。 */
const BRILLIANT = { mark: '!!', nag: '$5' };

/** 最佳手把这盘棋抬高至少一兵，才从 "!" 升成 "!!"。 */
const BRILLIANT_GAIN = 100;

/**
 * 这手棋给走棋方带来多少评估提升。evalBefore/evalAfter 都是白方正的单位，所以黑方
 * 要反过来减。缺数字就返回 0，让调用方按"没有提升"处理。
 */
export function moverGain(result) {
  const before = result?.evalBefore;
  const after = result?.evalAfter;
  if (!Number.isFinite(before) || !Number.isFinite(after)) return 0;
  return String(result.fen || '').split(/\s+/)[1] === 'b' ? before - after : after - before;
}

/**
 * 一手棋的标注：符号 + NAG。
 *
 * @param {{ classification?: string, fen?: string, evalBefore?: number, evalAfter?: number }} result
 * @returns {{ mark: string, nag: string }|null} 没有分类就没有标注
 */
export function annotationFor(result) {
  const base = ANNOTATIONS[result?.classification];
  if (!base) return null;
  if (result.classification === 'best' && moverGain(result) >= BRILLIANT_GAIN) {
    return BRILLIANT;
  }
  return base;
}

/** SAN 后面要跟的那个符号，没有就返回空串。 */
export function markFor(result) {
  return annotationFor(result)?.mark ?? '';
}

/** 导出棋谱时要写的 NAG，没有就返回 null。 */
export function nagFor(result) {
  return annotationFor(result)?.nag ?? null;
}

/** 分类的中文标签。 */
export const CLASSIFY_LABEL = {
  blunder: '错着',
  mistake: '漏着',
  inaccuracy: '不精确',
  good: '好棋',
  best: '最佳',
};

/**
 * 分类 → 配色用的 CSS 类名（`.annot-*` 在 style.css 里按主题变量上色）。
 * 界面层只加类名，别再往元素上写颜色字面量：写死的十六进制只有一套房能看，
 * 浅色主题下灰底白字直接读不出来（2026-11-25 复盘面板就是这样）。
 */
export const CLASSIFY_ANNOT = {
  blunder: 'annot-blunder',
  mistake: 'annot-mistake',
  inaccuracy: 'annot-inaccuracy',
  good: 'annot-good',
  best: 'annot-best',
};

/**
 * 根据评估变化分类一手棋。
 *
 * @param {number} evalBefore - 走棋前的评估（centipawns，白方正）
 * @param {number} evalAfter - 走棋后的评估（centipawns，白方正）
 * @param {string} turn - 走棋方 'w' 或 'b'
 * @param {string} playedMove - 实际走的棋（UCI 格式如 'e2e4'）
 * @param {string} bestMove - 引擎最佳（UCI 格式）
 * @returns {{ classification: string, loss: number }}
 */
export function classifyMove(evalBefore, evalAfter, turn, playedMove, bestMove) {
  // 计算评估损失：走棋方视角
  // 白方走棋：评估下降 = 损失（evalBefore - evalAfter > 0 是损失）
  // 黑方走棋：评估上升 = 损失（evalAfter - evalBefore > 0 是损失）
  const loss = turn === 'w'
    ? evalBefore - evalAfter
    : evalAfter - evalBefore;

  // 和引擎最佳一致 = 最佳
  if (playedMove && bestMove && playedMove === bestMove) {
    return { classification: 'best', loss: Math.max(0, loss) };
  }

  // 按损失大小分类
  if (loss > CLASSIFY_THRESHOLDS.blunder) {
    return { classification: 'blunder', loss };
  }
  if (loss > CLASSIFY_THRESHOLDS.mistake) {
    return { classification: 'mistake', loss };
  }
  if (loss > CLASSIFY_THRESHOLDS.inaccuracy) {
    return { classification: 'inaccuracy', loss };
  }
  return { classification: 'good', loss: Math.max(0, loss) };
}

/**
 * 批量分析一整盘棋。
 *
 * @param {object} controller - Stockfish 控制器（createStockfish 返回的）
 * @param {string[]} fens - 每个局面的 FEN（从起始局面开始，长度 = 手数 + 1）
 * @param {string[]} moves - 每手棋的 UCI 格式（长度 = 手数）
 * @param {object} options - { depth, movetime, onProgress }
 * @returns {Promise<AnalysisResult[]>}
 */
export async function analyzeGame(controller, fens, moves, options = {}) {
  const { depth, movetime = 500, onProgress } = options;
  const results = [];
  const total = moves.length;

  // 逐局面分析
  for (let ply = 0; ply < total; ply++) {
    const fen = fens[ply];
    const turn = fen.split(' ')[1];

    if (onProgress) {
      onProgress({ current: ply, total, fen });
    }

    // 分析当前局面
    const analysis = await controller.analyze({ fen, depth, movetime, multipv: 1 });
    const topLine = analysis.lines[0];
    const evalBefore = topLine?.score
      ? scoreToCentipawns(topLine.score, turn)
      : 0;

    results.push({
      ply,
      fen,
      fenBefore: fen,
      move: moves[ply],
      evalBefore,
      bestMove: analysis.bestmove,
      topLine: topLine?.pv?.[0] ?? null,
    });
  }

  // 分析最终局面（用于计算最后一手的 evalAfter）
  if (onProgress) {
    onProgress({ current: total, total, fen: fens[total] });
  }
  const finalFen = fens[total];
  const finalTurn = finalFen.split(' ')[1];
  // 终局不听引擎的：已经将死的局面它给的是"走棋方 mate 0"这一类分数，按行棋方翻过
  // 符号之后，会把将杀那一手记成丢了二十个兵。谁被将死，规则引擎说了算。
  const finished = new Chess(finalFen);
  let finalEval;
  if (finished.isCheckmate()) {
    finalEval = scoreToCentipawns({ type: 'mate', value: 1 }, finalTurn === 'w' ? 'b' : 'w');
  } else if (finished.isDraw()) {
    finalEval = 0;
  } else {
    const finalAnalysis = await controller.analyze({ fen: finalFen, depth, movetime: 200, multipv: 1 });
    finalEval = finalAnalysis.lines[0]?.score
      ? scoreToCentipawns(finalAnalysis.lines[0].score, finalTurn)
      : 0;
  }

  // 回填 evalAfter 并分类
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const nextResult = results[i + 1];
    result.evalAfter = nextResult ? nextResult.evalBefore : finalEval;

    const turn = result.fen.split(' ')[1];
    const classification = classifyMove(
      result.evalBefore,
      result.evalAfter,
      turn,
      result.move,
      result.bestMove
    );
    result.classification = classification.classification;
    result.loss = classification.loss;
  }

  return results;
}

/**
 * 找关键转折点：评估变化最大的前 N 手。
 *
 * @param {AnalysisResult[]} results - analyzeGame 的返回值
 * @param {number} count - 返回几个转折点
 * @returns {{ ply: number, swing: number }[]}
 */
export function findCriticalMoments(results, count = 5) {
  const swings = results
    .filter((r) => r.loss !== undefined)
    .map((r) => ({ ply: r.ply, swing: r.loss }))
    .sort((a, b) => b.swing - a.swing);
  return swings.slice(0, count);
}

/**
 * 计算准确率：基于评估损失的加权平均。
 *
 * 公式：每手棋的准确率 = max(0, 100 - loss/2)，然后按手数平均。
 * 这个公式来自 Lichess 的近似：损失 0cp = 100%，损失 100cp = 50%，损失 200cp+ = 0%。
 *
 * @param {AnalysisResult[]} results
 * @returns {{ white: number, black: number, overall: number }}
 */
export function computeAccuracy(results) {
  const whiteScores = [];
  const blackScores = [];

  for (const r of results) {
    if (r.loss === undefined) continue;
    const score = Math.max(0, 100 - r.loss / 2);
    const turn = r.fen.split(' ')[1];
    if (turn === 'w') {
      whiteScores.push(score);
    } else {
      blackScores.push(score);
    }
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 100);
  return {
    white: avg(whiteScores),
    black: avg(blackScores),
    overall: avg([...whiteScores, ...blackScores]),
  };
}

/**
 * 统计各分类的数量。
 *
 * @param {AnalysisResult[]} results
 * @returns {{ blunder: number, mistake: number, inaccuracy: number, good: number, best: number }}
 */
export function countClassifications(results) {
  const counts = { blunder: 0, mistake: 0, inaccuracy: 0, good: 0, best: 0 };
  for (const r of results) {
    if (r.classification && counts[r.classification] !== undefined) {
      counts[r.classification]++;
    }
  }
  return counts;
}
