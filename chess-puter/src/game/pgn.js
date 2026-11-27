/**
 * PGN export (Portable Game Notation, the format every chess program reads).
 *
 * A tag pair section carrying the mandatory seven-tag roster, then the moves
 * in SAN with the result as the final token. Analysis branches go in as PGN's
 * parenthesised groups, right after the move each one replaces. Nothing here
 * touches the DOM or the engine — the replays that number the moves and check a
 * branch for legality live in position.js — so it takes the SAN list the move
 * log already holds plus whatever the app knows about the players and the end.
 */

import { nagFor } from './review.js';
import { moveLabels, variationLabels } from './position.js';

/** PGN wraps movetext at 80 columns; long lines are legal but discourteous. */
const LINE_WIDTH = 80;

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const pad = (n) => String(n).padStart(2, '0');

/**
 * Tag values are quoted strings in which `"` and `\` must be escaped, and
 * which cannot contain newlines. Opponent names come off the wire, so this
 * also caps the length rather than trusting it.
 */
function tagValue(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 120)
    .replace(/[\\"]/g, (ch) => `\\${ch}`);
}

/** `YYYY.MM.DD` in local time, the PGN date format. */
export function pgnDate(date) {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** PGN's TimeControl tag: seconds+increment, or "-" for an untimed game. */
function timeControlTag(control) {
  if (!control) return '-';
  return `${Math.round(control.initial / 1000)}+${Math.round(control.increment / 1000)}`;
}

/**
 * 一条支线写成一个括号段，段里再分出去的支线往里再套一层括号。
 *
 * `prefix` 是从开局位置走到这层的分叉点要经过的全部走法：主线那段，加上每一层
 * 支线里分叉点之前的那几手。回合号和合法性都靠它 —— replay 不到分叉点的、或支
 * 线里有一手假着的，整条丢掉（`variationLabels` 返回 null）。写进棋谱就是假棋谱，
 * 别的软件读到假着会把整盘停在那里，比少一条支线糟得多。
 *
 * @param {string} originFen
 * @param {string[]} prefix 分叉点之前的走法（从开局位置数下来）
 * @param {{branchIndex: number, moves: string[], children?: unknown[]}} branch
 * @returns {string | null} `(...)` —— 一整个 token，断在中间的半个括号会被当成坏文件
 */
function branchToken(originFen, prefix, branch) {
  const moves = (branch?.moves ?? []).filter((san) => typeof san === 'string' && san);
  if (!moves.length) return null;
  const labels = variationLabels(originFen, prefix, moves);
  if (!labels) return null;

  const groups = childrenByIndex(branch.children, moves.length);
  const parts = [];
  // branchIndex=0 的子支线替代的是本支线的第一个动作。括号本该跟在它替代的那一手
  // 后面，这里没有那一手 —— 只能写在括号最前面。
  parts.push(...childTokens(groups, 0, originFen, prefix, moves));

  let lastNumber = null;
  moves.forEach((san, k) => {
    const lbl = labels[k];
    // 只在回合号变化时写一次：白方先走用 `1.`，黑方先走（白方空着）用 `1...`。
    if (lastNumber !== lbl.number) {
      parts.push(lbl.white ? `${lbl.number}.` : `${lbl.number}...`);
    }
    parts.push(san);
    lastNumber = lbl.number;

    const nested = childTokens(groups, k + 1, originFen, prefix, moves);
    if (nested.length) {
      parts.push(...nested);
      // 括号后面要把回合号重新写一遍：读的人刚看完支线里的行棋方。
      lastNumber = null;
    }
  });
  return `(${parts.join(' ')})`;
}

/**
 * 分叉点 `index` 上的每条子支线，各写成一个括号段。
 * 子支线的分叉点是相对这条支线数下来的，所以先把这一段接在 prefix 后面。
 */
function childTokens(groups, index, originFen, prefix, moves) {
  const out = [];
  for (const child of groups.get(index) ?? []) {
    const token = branchToken(originFen, [...prefix, ...moves.slice(0, index)], child);
    if (token) out.push(token);
  }
  return out;
}

/** 按「顶掉父线第几手」归堆。分叉点在父线末尾的（那一手之后另走的一条线）照留，越界或非整数的整条丢掉。 */
function childrenByIndex(children, lineLen) {
  const groups = new Map();
  for (const child of children ?? []) {
    const index = child?.branchIndex;
    if (!Number.isInteger(index) || index < 0 || index > lineLen) continue;
    if (!groups.has(index)) groups.set(index, []);
    groups.get(index).push(child);
  }
  return groups;
}

/**
 * 棋谱正文的 token：主线逐手，分叉处跟上支线括号段，末尾是结果。
 *
 * `annotate(ply)` 是复盘用的，返回那一手的标注 token（NAG 和 `{ [%eval …] }`），
 * 不传就只出走法。两份导出共用这一份，回合号和支线的写法才不会各写各的。
 */
function movetextTokens({ sans, result, startFen, variations, annotate }) {
  const originFen = startFen || START_FEN;
  const groups = childrenByIndex(variations, sans.length);
  const tokens = [];
  // 替代白方第一手的支线写在正文最前面：那一手之前没有着法可以挂括号。
  tokens.push(...childTokens(groups, 0, originFen, [], sans));

  // 回合号从开局位置读：标准局从 1 开始白方先走，但带 [FEN] 的残局或黑方先走
  // 的局面开局时，硬算 `i/2+1` 会把回合号和行棋方都写错。
  const labels = moveLabels(originFen, sans);
  let lastNumber = null;
  sans.forEach((san, i) => {
    const lbl = labels[i] ?? { number: Math.floor(i / 2) + 1, white: i % 2 === 0 };
    // 只在回合号变化时写一次：白方先走用 `1.`，黑方先走（白方空着）用 `1...`。
    if (lastNumber !== lbl.number) {
      tokens.push(lbl.white ? `${lbl.number}.` : `${lbl.number}...`);
    }
    tokens.push(san);
    lastNumber = lbl.number;

    if (annotate) tokens.push(...annotate(i));

    // 从这一手之后分出去的支线，括号紧跟在它后面：PGN 读作"这手可以不走"。
    const branches = childTokens(groups, i + 1, originFen, [], sans);
    if (branches.length) {
      tokens.push(...branches);
      // 括号后面要把回合号（黑方还有 `...`）重新写一遍：读棋谱的人刚看完支线
      // 里的行棋方，主线这一手光秃秃的会接错边。 ChessBase/Lichess 也这么写。
      lastNumber = null;
    }
  });
  tokens.push(result);
  return tokens;
}

/** Token 流排成 80 列的正文。 */
function wrap(tokens) {
  const lines = [];
  let line = '';
  for (const token of tokens) {
    if (line && line.length + 1 + token.length > LINE_WIDTH) {
      lines.push(line);
      line = token;
    } else {
      line = line ? `${line} ${token}` : token;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

/** `1. e4 e5 2. Nf3` … wrapped at LINE_WIDTH, with the result appended. */
function movetext(sans, result, startFen, variations) {
  return wrap(movetextTokens({ sans, result, startFen, variations }));
}

/**
 * Build a complete PGN game.
 *
 * @param {{
 *   sans: string[],                 moves in standard algebraic notation
 *   result: string,                 "1-0" | "0-1" | "1/2-1/2" | "*"
 *   white: string, black: string,   player names
 *   date: Date,
 *   control?: {initial: number, increment: number}|null,
 *   termination?: string,           PGN Termination, omitted when "normal"
 *   event?: string, site?: string,
 *   startFen?: string|null,         开局不是标准局时写进 SetUp + FEN，省略则不写
 *   variations?: {branchIndex: number, moves: string[], children: []}[]|null  分析里记下的支线树
 * }} game
 */
export function buildPgn({
  sans,
  result,
  white,
  black,
  date,
  control = null,
  termination = 'normal',
  event = 'Casual game',
  site = 'www.ichessgeek.com/chess',
  startFen = null,
  variations = null,
}) {
  const tags = [
    ['Event', event],
    ['Site', site],
    ['Date', pgnDate(date)],
    ['Round', '-'],
    ['White', white],
    ['Black', black],
    ['Result', result],
    ['TimeControl', timeControlTag(control)],
  ];
  // Termination is optional and "normal" is the default reading, so only a
  // game that ended some other way is worth spelling out.
  if (termination && termination !== 'normal') tags.push(['Termination', termination]);
  // A game that did not start from the usual position has to say so, or the
  // file re-imports as a different game than the one it recorded.
  if (startFen) tags.push(['SetUp', '1'], ['FEN', startFen]);

  const header = tags.map(([key, value]) => `[${key} "${tagValue(value)}"]`).join('\n');
  return `${header}\n\n${movetext(sans, result, startFen, variations)}\n`;
}

/** A filesystem-safe name for a downloaded game. */
export function pgnFilename(date) {
  return `chess-${stamp(date)}.pgn`;
}

/** `20261123-1940`, the file-name form of a moment. */
function stamp(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join('');
}

/**
 * Several games as one document.
 *
 * @param {Parameters<typeof buildPgn>[0][]} games each in buildPgn's own shape
 */
export function bundlePgn(games) {
  // buildPgn ends each game with a single newline, and PGN wants a blank line
  // before the next tag section — so joining with one newline is the whole job.
  return games.map((game) => buildPgn(game)).join('\n');
}

/**
 * The name for a bundle. The count is in it because a player exporting twice in
 * a session would otherwise get two files called chess-…-1940.pgn, one of which
 * the browser quietly renames to "(1)".
 */
export function bundleFilename(date, count) {
  return `chess-${stamp(date)}-${count}games.pgn`;
}

/**
 * Build an annotated PGN with review analysis.
 *
 * @param {{
 *   sans: string[],
 *   result: string,
 *   white: string, black: string,
 *   date: Date,
 *   control?: {initial: number, increment: number}|null,
 *   termination?: string,
 *   event?: string, site?: string,
 *   startFen?: string|null,         开局不是标准局时写进 SetUp + FEN
 *   variations?: {branchIndex: number, moves: string[], children: []}[]|null  分析里记下的支线树
 *   review?: {
 *     results: Array<{ classification: string, loss?: number, evalBefore?: number, evalAfter?: number }>,
 *   },
 * }} game
 */
export function buildAnnotatedPgn({
  sans,
  result,
  white,
  black,
  date,
  control = null,
  termination = 'normal',
  event = 'Casual game',
  site = 'www.ichessgeek.com/chess',
  startFen = null,
  variations = null,
  review,
}) {
  const tags = [
    ['Event', event],
    ['Site', site],
    ['Date', pgnDate(date)],
    ['Round', '-'],
    ['White', white],
    ['Black', black],
    ['Result', result],
    ['TimeControl', timeControlTag(control)],
    ['Annotator', 'Stockfish (复盘分析)'],
  ];
  if (termination && termination !== 'normal') tags.push(['Termination', termination]);
  if (startFen) tags.push(['SetUp', '1'], ['FEN', startFen]);

  const header = tags.map(([key, value]) => `[${key} "${tagValue(value)}"]`).join('\n');

  const tokens = movetextTokens({
    sans,
    result,
    startFen,
    variations,
    // 复盘标注只有主线这一份：支线还没跑过引擎（#107 的多变化分析没做），
    // 所以括号段里只有走法，不带 NAG 和评分。
    annotate: (i) => {
      const r = review?.results?.[i];
      if (!r) return [];
      const marks = [];
      const nag = nagFor(r);
      if (nag) marks.push(nag);
      if (r.evalAfter !== undefined) {
        marks.push(`{ [%eval ${formatEvalForPgn(r.evalAfter)}] }`);
      }
      return marks;
    },
  });

  return `${header}\n\n${wrap(tokens)}\n`;
}

/** Format eval for PGN comment: +0.45 or -1.23 */
function formatEvalForPgn(cp) {
  if (Math.abs(cp) >= 1000) {
    return cp > 0 ? '+M' : '-M';
  }
  const sign = cp >= 0 ? '+' : '';
  return `${sign}${(cp / 100).toFixed(2)}`;
}
