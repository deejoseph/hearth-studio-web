/**
 * 题库核心：战术题的数据结构与导入解析。
 *
 * 一道题长这样：
 *   {
 *     id: 't1',
 *     fen: '2q1r1k1/...',         // 局面
 *     solution: ['e5e6', 'e8e7'],  // 正确走法序列（UCI）
 *     difficulty: 1500,            // 等级分（可选）
 *     tags: ['fork', 'medium'],    // 标签（可选）
 *     source: 'manual',            // 来源（可选）
 *   }
 *
 * 导入支持三种形式：
 *   1. PGN 字符串 —— 从变着里提取解法
 *   2. FEN + solution 对象 —— 单题直接构造
 *   3. 文件内容（PGN 文件，可能含多局）
 */

import { Chess, START_FEN } from '../engine/chess.js';

/**
 * 题目身份跟着局面和解法走：同一道题反复导入，收藏和做题记录还能对上。
 * 只取 FEN 前四段 —— 半回合、回合数不同不算另一道题。
 */
function problemId(fen, solution) {
  const key = `${fen.split(' ').slice(0, 4).join(' ')}|${solution.join(' ')}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) >>> 0;
  }
  return `t${hash.toString(36)}`;
}

/**
 * 校验一道题的结构是否合法。
 *
 * @param {object} problem
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateProblem(problem) {
  if (!problem || typeof problem !== 'object') {
    return { valid: false, error: 'not an object' };
  }
  if (typeof problem.fen !== 'string') {
    return { valid: false, error: 'fen must be a string' };
  }
  if (!Array.isArray(problem.solution) || problem.solution.length === 0) {
    return { valid: false, error: 'solution must be a non-empty array' };
  }
  // 验证 FEN 能加载
  try {
    const chess = new Chess(problem.fen);
    // 验证解法走法能执行
    for (const moveStr of problem.solution) {
      // 判断是 UCI 格式 (e2e4) 还是 SAN 格式 (e4)
      const isUci = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveStr);
      let move;
      if (isUci) {
        // UCI 格式：解析为对象
        const from = moveStr.slice(0, 2);
        const to = moveStr.slice(2, 4);
        const promotion = moveStr.length > 4 ? moveStr[4] : undefined;
        move = chess.move({ from, to, promotion });
      } else {
        // SAN 格式
        move = chess.move(moveStr);
      }
      if (!move) {
        return { valid: false, error: `illegal move in solution: ${moveStr}` };
      }
    }
  } catch (e) {
    return { valid: false, error: `invalid fen or solution: ${e.message}` };
  }
  return { valid: true };
}

/**
 * 从 FEN 和解法构造一道题。
 *
 * @param {string} fen
 * @param {string[]} solution - UCI 格式的走法序列
 * @param {object} [options]
 * @returns {object} problem
 */
export function problemFromFen(fen, solution, options = {}) {
  const problem = {
    id: options.id || problemId(fen, solution),
    fen,
    solution,
    ...options,
  };
  const check = validateProblem(problem);
  if (!check.valid) {
    throw new Error(`Cannot create problem: ${check.error}`);
  }
  return problem;
}

/**
 * 简易 PGN 解析器：提取走法序列（含变着）。
 *
 * 这个解析器不追求完整 PGN 规范，只够从战术题 PGN 里提取主变或指定变着。
 * 返回所有找到的走法序列（每个序列是一个 string[]）。
 *
 * @param {string} pgn
 * @returns {string[][]} 每个元素是一条走法线（UCI 或 SAN，取决于输入）
 */
export function extractLinesFromPgn(pgn) {
  const lines = [];

  // 去掉 tag pairs [Key "Value"]
  const withoutTags = pgn.replace(/\[[^\]]*\]/g, '').trim();

  // 去掉结果标记
  const withoutResult = withoutTags.replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '');

  // 提取变着：递归解析括号
  const tokens = tokenizeMovetext(withoutResult);
  const allLines = extractAllVariations(tokens);
  lines.push(...allLines);

  return lines;
}

/**
 * 把 movetext 拆成 token 流，保留括号结构。
 * @param {string} text
 * @returns {string[]}
 */
function tokenizeMovetext(text) {
  // 先去掉注释 {…}
  text = text.replace(/\{[^}]*\}/g, '');
  // 去掉行注释 ;…
  text = text.replace(/;[^\n]*/g, '');
  // 去掉 NAG 代码 $1, $2, $!, $!! 等
  text = text.replace(/\$[0-9!?\+\-=]+/g, '');

  const tokens = [];
  let current = '';

  for (const ch of text) {
    if (ch === '(') {
      if (current.trim()) tokens.push(current.trim());
      tokens.push('(');
      current = '';
    } else if (ch === ')') {
      if (current.trim()) tokens.push(current.trim());
      tokens.push(')');
      current = '';
    } else if (/\s/.test(ch)) {
      if (current.trim()) {
        tokens.push(current.trim());
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current.trim());

  return tokens;
}

/**
 * 从 token 流里提取所有变着线。
 * @param {string[]} tokens
 * @returns {string[][]}
 */
function extractAllVariations(tokens) {
  const lines = [];
  const mainLine = [];
  const stack = [mainLine];

  for (const token of tokens) {
    if (token === '(') {
      // 开始一个变着
      const variation = [];
      stack.push(variation);
    } else if (token === ')') {
      // 结束变着
      const variation = stack.pop();
      if (variation.length > 0) {
        lines.push(variation);
      }
    } else if (/^\d+\.+$/.test(token)) {
      // 走子编号，跳过
      continue;
    } else {
      // 走法
      stack[stack.length - 1].push(token);
    }
  }

  // 主变
  if (mainLine.length > 0) {
    lines.unshift(mainLine);
  }

  return lines;
}

/**
 * 把 SAN 走法序列转成 UCI。
 *
 * @param {string} fen - 起始局面
 * @param {string[]} sans - SAN 格式的走法
 * @returns {string[]} UCI 格式的走法
 */
export function sanToUci(fen, sans) {
  const chess = new Chess(fen);
  const ucis = [];
  for (const san of sans) {
    let move = chess.move(san);
    if (!move) {
      // 教练手写解法时常把将杀写成 +、或者不写后缀；只差结尾 +/# 的按实际走法收下。
      const base = san.replace(/[+#]$/, '');
      for (const variant of [`${base}+`, `${base}#`]) {
        move = chess.move(variant);
        if (move) break;
      }
    }
    if (!move) {
      throw new Error(`Cannot parse SAN move: ${san} from FEN ${fen}`);
    }
    ucis.push(move.from + move.to + (move.promotion || ''));
  }
  return ucis;
}

/**
 * 从 PGN 字符串导入题目。
 *
 * 每局棋（或每个变着）被视为一道题，走法序列就是解法。
 *
 * @param {string} pgn
 * @param {object} [options]
 * @returns {object[]} problems
 */
export function importFromPgn(pgn, options = {}) {
  const problems = [];

  // 按空行分割多局
  const games = splitPgnGames(pgn);

  for (const game of games) {
    const tags = parsePgnTags(game);
    const lines = extractLinesFromPgn(game);

    // 每条变着线作为一道题
    for (const line of lines) {
      // 判断是 SAN 还是 UCI
      const isUci = line.every(m => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
      let solution;
      let fen;

      if (tags.FEN) {
        fen = tags.FEN;
      } else {
        fen = START_FEN;
      }

      try {
        if (isUci) {
          solution = line;
        } else {
          solution = sanToUci(fen, line);
        }

        const problem = {
          id: problemId(fen, solution),
          fen,
          solution,
          difficulty: tags.Difficulty ? parseInt(tags.Difficulty, 10) : undefined,
          tags: parsePgnTagsToTacticsTags(tags),
          source: 'pgn',
        };

        const check = validateProblem(problem);
        if (check.valid) {
          problems.push(problem);
        } else {
          console.warn(`Skipping invalid problem: ${check.error}`);
        }
      } catch (e) {
        console.warn(`Failed to parse line: ${e.message}`);
      }
    }
  }

  return problems;
}

/**
 * 分割 PGN 文本为多个局。
 * @param {string} pgn
 * @returns {string[]}
 */
function splitPgnGames(pgn) {
  const games = [];
  const lines = pgn.split('\n');
  let current = [];
  let seenMovetext = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // 空行：如果已经看到过走法文本，可能是局分隔
    if (trimmed === '') {
      if (seenMovetext && current.length > 0) {
        games.push(current.join('\n'));
        current = [];
        seenMovetext = false;
      }
      continue;
    }

    // Tag pair 开始
    if (trimmed.startsWith('[')) {
      // 如果已经看到走法文本，新的 tag 意味着新一局
      if (seenMovetext && current.length > 0) {
        games.push(current.join('\n'));
        current = [];
        seenMovetext = false;
      }
      current.push(line);
    } else {
      // 走法文本
      current.push(line);
      seenMovetext = true;
    }
  }

  // 最后一局
  if (current.length > 0) {
    games.push(current.join('\n'));
  }

  return games;
}

/**
 * 解析 PGN 的 tag pairs。
 * @param {string} pgn
 * @returns {object}
 */
function parsePgnTags(pgn) {
  const tags = {};
  const regex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  while ((match = regex.exec(pgn)) !== null) {
    tags[match[1]] = match[2];
  }
  return tags;
}

/**
 * 把 PGN tags 转成题库用的 tags。
 * @param {object} pgnTags
 * @returns {string[]}
 */
function parsePgnTagsToTacticsTags(pgnTags) {
  const tags = [];
  if (pgnTags.Event) tags.push(pgnTags.Event);
  if (pgnTags.Site) tags.push(pgnTags.Site);
  // 可以加更多映射
  return tags;
}

/**
 * 从文件内容导入（支持 PGN 文件）。
 *
 * @param {string} content - 文件文本内容
 * @param {string} [format='pgn'] - 文件格式：'pgn' 或 'fen'
 * @returns {object[]} problems
 */
export function importFromFile(content, format = 'pgn') {
  if (format === 'pgn') {
    return importFromPgn(content);
  } else if (format === 'fen') {
    // FEN 文件：每行一个 FEN，但没有解法信息，无法构造题目
    // 需要额外格式，暂时不支持
    throw new Error('FEN file import requires solution information');
  } else {
    throw new Error(`Unknown format: ${format}`);
  }
}

/**
 * 批量导入，自动检测格式。
 *
 * @param {string} content
 * @returns {object[]} problems
 */
export function importAuto(content) {
  content = content.trim();

  // 检测是否是 PGN（有 tag pairs 或走子编号）
  if (content.startsWith('[') || /^\d+\./.test(content)) {
    return importFromPgn(content);
  }

  // 检测是否是单个 FEN
  if (/^[rnbqkpRNBQKP1-8\/]+\s+[wb]\s+/.test(content)) {
    // 单个 FEN，但没有解法信息
    throw new Error('Single FEN import requires solution information. Use problemFromFen() instead.');
  }

  // 无法识别
  throw new Error('Cannot auto-detect format. Content should be PGN or FEN.');
}

/**
 * 教练手写的单题格式：一段一题，题与题之间空一行。
 *
 *   fen: r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4
 *   solution: Qxf7#
 *   difficulty: 900
 *
 * solution 写 SAN（Qxf7#）或 UCI（f3f7）都行；difficulty 可选，100–3000 之间。
 * 写坏的一段跳过、不拖垮整批 —— 教练一次贴十道题，错一道不该十道都进不来。
 *
 * @param {string} text
 * @returns {object[]} problems
 */
export function importFenSolutionFormat(text) {
  const problems = [];
  const blocks = String(text).split(/\n\s*\n/);

  for (const block of blocks) {
    let fen = null;
    let solution = null;
    let difficulty;

    for (const rawLine of block.trim().split('\n')) {
      const line = rawLine.trim();
      if (line.startsWith('fen:')) {
        fen = line.slice(4).trim();
      } else if (line.startsWith('solution:')) {
        solution = line.slice(9).trim().split(/[\s,]+/).filter(Boolean);
      } else if (line.startsWith('difficulty:')) {
        const parsed = parseInt(line.slice(11).trim(), 10);
        if (!isNaN(parsed) && parsed >= 100 && parsed <= 3000) {
          difficulty = parsed;
        }
      }
    }

    if (!fen || !solution || solution.length === 0) continue;

    try {
      const isUci = solution.every((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move));
      const options = difficulty === undefined ? {} : { difficulty };
      problems.push(problemFromFen(fen, isUci ? solution : sanToUci(fen, solution), options));
    } catch (e) {
      console.warn(`Skipping invalid problem: ${e.message}`);
    }
  }

  return problems;
}
