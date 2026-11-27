/**
 * 一盘棋的局面序列。
 *
 * 复盘、时间轴回看、棋谱导出都靠这里，所以它们说的"第 n 手之后"是同一个意思：
 * 从**这盘棋真正的开局位置**重放。开局不是标准局时（导入带 [FEN] 标签的棋谱、
 * 课堂里从残局摆开），拿标准局重放会得出每一手都错、而且错得很安静的结果。
 */

import { Chess } from '../engine/chess.js';

/** FEN 的前四段：棋盘、行棋方、易位权、吃过路兵。步数与钟不进「同一局面」的判定。 */
export function fenCore(fen) {
  return String(fen ?? '').trim().split(/\s+/).slice(0, 4).join(' ');
}

function apply(replay, move) {
  return replay.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
}

/**
 * 一步走法：SAN 字符串（`'e4'`）或 verbose 对象（`{from, to, promotion}`）都吃。
 * 走不通返回 null —— 引擎对假着就是这么答复，不会抛。
 */
function step(replay, move) {
  if (!move) return null;
  return typeof move === 'string' ? replay.move(move) : apply(replay, move);
}

/**
 * 每个 ply 之前那一步的回合号与行棋方，来自开局位置本身（不是 ply/2 硬算）。
 *
 * 标准开局从 1 开始白方先走，所以 `ply/2 + 1` 看起来对，但导入带 [FEN] 的残局
 * 或从黑方先走的局面开局时，硬算会把回合号和行棋方都写错。这里从棋盘的
 * `moveNumber()` / `turn()` 读，引擎说什么就是什么。
 *
 * @param {string} originFen - 开局 FEN
 * @param {(string|object)[]} history - SAN 字符串或 verbose move 对象
 * @returns {{ number: number, white: boolean }[]}
 */
export function moveLabels(originFen, history) {
  const labels = [];
  let replay;
  try {
    replay = new Chess(originFen);
  } catch {
    return labels;
  }
  for (let i = 0; i < history.length; i++) {
    labels.push({ number: replay.moveNumber(), white: replay.turn() === 'w' });
    // move 可以是 SAN 字符串（'e4'）或 verbose 对象（{from, to, promotion}）
    if (!step(replay, history[i])) break;
  }
  return labels;
}

/**
 * 支线括号段里每一手的回合号与行棋方：先把分叉点之前的走法 `prefix` 走完，
 * 接着走 `moves`（SAN 字符串）。
 *
 * 分叉点之前的走法要按**绝对路径**给（主线那一段 + 上层支线里分叉点之前的几手），
 * 因为支线是可以一层套一层的，而引擎只认"从开局位置一路走过来"。
 *
 * 走不通就返回 null，而且是一整条不写：replay 不到分叉点、或支线里有一手假着，
 * 写进棋谱就别无解释 —— 别的软件读到假着会把整盘停在那里，比少一条支线糟得多。
 *
 * @param {string} originFen - 这盘棋的开局 FEN
 * @param {string[]} prefix - 分叉点之前的全部走法（从开局位置数下来）
 * @param {string[]} moves - 支线走法（SAN）
 * @returns {{ number: number, white: boolean }[] | null}
 */
export function variationLabels(originFen, prefix, moves) {
  let replay;
  try {
    replay = new Chess(originFen);
  } catch {
    return null;
  }
  for (const san of prefix ?? []) {
    if (!step(replay, san)) return null;
  }
  const labels = [];
  for (const san of moves) {
    labels.push({ number: replay.moveNumber(), white: replay.turn() === 'w' });
    if (!step(replay, san)) return null;
  }
  return labels;
}

/**
 * 第 `plies` 手之后的局面（`plies === 0` 就是开局位置）。
 * 走不通时返回 null —— 调用方手里的 history 与开局位置不配套。
 */
export function positionAt(originFen, history, plies) {
  const replay = new Chess(originFen);
  for (let i = 0; i < plies; i++) {
    if (!history[i] || !apply(replay, history[i])) return null;
  }
  return replay;
}

/**
 * 整盘棋每个 ply 之后的 FEN，长度 = history.length + 1。
 *
 * 开局位置若撑不起这些走法，或者走完不是 `currentFen`，返回 error 而不是硬凑一份：
 * 错误的局面喂给引擎会产出看起来很专业的错误结论。
 */
export function replayFens(originFen, history, currentFen = null) {
  let replay;
  try {
    replay = new Chess(originFen);
  } catch {
    return { fens: null, error: '记录的开局位置不是合法 FEN' };
  }
  const fens = [replay.fen()];
  for (let i = 0; i < history.length; i++) {
    if (!history[i] || !apply(replay, history[i])) {
      return { fens: null, error: `第 ${i + 1} 手在记录的开局位置里走不通` };
    }
    fens.push(replay.fen());
  }
  if (currentFen && fenCore(fens[fens.length - 1]) !== fenCore(currentFen)) {
    return { fens: null, error: '走法记录和棋盘当前局面不一致，不能复盘' };
  }
  return { fens, error: null };
}
