/**
 * PGN/FEN parser for importing games and positions.
 *
 * Handles the standard PGN format:
 * - Tag pairs: [Event "Name"]
 * - Movetext: 1. e4 e5 2. Nf3
 * - Comments: {comment}
 * - Variations: (variation)
 * - NAGs: $1
 * - Results: 1-0, 0-1, 1/2-1/2, *
 *
 * Also handles FEN strings for direct position import.
 */

const RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];

/**
 * Parse a PGN string into structured data.
 *
 * @param {string} pgn - the PGN text
 * @returns {{ tags: Object<string, string>, moves: string[], comments: string[], result: string }}
 */
export function parsePgn(pgn) {
  const tags = {};
  const moves = [];
  const comments = [];
  let result = '*';

  // Normalize line endings
  const text = pgn.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into tag section and movetext section
  const sections = text.split(/\n\n+/);
  let tagSection = '';
  let moveSection = '';

  for (const section of sections) {
    if (section.trim().startsWith('[')) {
      tagSection += section + '\n';
    } else {
      moveSection += section + '\n';
    }
  }

  // Parse tags
  const tagRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  while ((match = tagRegex.exec(tagSection)) !== null) {
    tags[match[1]] = match[2];
  }

  // Parse movetext
  const tokens = tokenize(moveSection);
  let ply = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Skip line numbers (1. 2. etc) and ellipsis (...)
    if (/^\d+\.$/.test(token) || token === '...') continue;

    // Result marker
    if (RESULTS.includes(token)) {
      result = token;
      continue;
    }

    // Comment
    if (token.startsWith('{') && token.endsWith('}')) {
      if (ply > 0) {
        comments[ply - 1] = token.slice(1, -1).trim();
      }
      continue;
    }

    // NAG (Numeric Annotation Glyph)
    if (token.startsWith('$')) {
      // Store NAG with the previous move
      if (ply > 0) {
        comments[ply - 1] = (comments[ply - 1] || '') + ` ${token}`;
      }
      continue;
    }

    // Variation (nested parentheses): skipped, the main line goes on without it.
    // tokenize() 把配平的一整对括号合成**一个** token（`(1... c5 2. Nf3)`），所以
    // 得先看手上这个自己收没收口，再往外数 —— 只有嵌套时它才被拆成好几段。少了
    // 这一步，跳过会一路吃到下一个 ')' 为止，把主线后半段连同结果一起吞掉。
    if (token.startsWith('(')) {
      let depth = token.endsWith(')') ? 0 : 1;
      while (depth > 0 && i + 1 < tokens.length) {
        i++;
        if (tokens[i].startsWith('(')) depth++;
        if (tokens[i].endsWith(')')) depth--;
      }
      continue;
    }

    // Move (SAN notation)
    if (isValidSan(token)) {
      moves[ply] = token;
      ply++;
    }
  }

  return { tags, moves, comments, result };
}

/**
 * Tokenize movetext into an array of strings.
 * Handles comments, variations, and whitespace.
 */
function tokenize(text) {
  const tokens = [];
  let current = '';
  let inComment = false;
  let inVariation = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '{') {
      if (current.trim()) tokens.push(current.trim());
      current = '{';
      inComment = true;
    } else if (ch === '}' && inComment) {
      current += '}';
      tokens.push(current);
      current = '';
      inComment = false;
    } else if (ch === '(') {
      if (current.trim()) tokens.push(current.trim());
      current = '(';
      inVariation++;
    } else if (ch === ')' && inVariation > 0) {
      current += ')';
      tokens.push(current);
      current = '';
      inVariation--;
    } else if (/\s/.test(ch) && !inComment && inVariation === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

/**
 * Check if a token looks like valid SAN (Standard Algebraic Notation).
 * This is a simplified check — a full validator would verify against the position.
 */
function isValidSan(token) {
  // Basic SAN patterns:
  // - Pawn moves: e4, exd5, e8=Q
  // - Piece moves: Nf3, Bxe5, O-O, O-O-O
  // - With check/mate: e4+, Nf3#
  // - With disambiguation: Nbd2, R1e3
  const sanPattern = /^[PNBRQK]?[a-h]?[1-8]?x?[a-h][1-8](=[PNBRQK])?[+#]?$/;
  const castlingPattern = /^O-O(-O)?[+#]?$/;
  return sanPattern.test(token) || castlingPattern.test(token);
}

/**
 * Parse a FEN string and validate it.
 *
 * @param {string} fen - the FEN string
 * @returns {{ valid: boolean, fen: string }}
 */
export function parseFen(fen) {
  const trimmed = fen.trim();
  const parts = trimmed.split(/\s+/);

  // FEN has 6 fields: position, active color, castling, en passant, halfmove, fullmove
  if (parts.length !== 6) {
    return { valid: false, fen: '' };
  }

  // Basic validation of the position field
  const rows = parts[0].split('/');
  if (rows.length !== 8) {
    return { valid: false, fen: '' };
  }

  // Validate active color
  if (!['w', 'b'].includes(parts[1])) {
    return { valid: false, fen: '' };
  }

  return { valid: true, fen: trimmed };
}

/**
 * 这盘棋的开局位置：[FEN] 标签里那个，没有就用标准开局。
 *
 * 按 PGN 标准，带 [FEN] 就该带 [SetUp "1"]；现实里的导出常常漏掉 SetUp，
 * 而这时候忽略 FEN 会把整盘分析挪到错误的起点上 —— 所以只在明确的
 * [SetUp "0"] 面前才放弃它。
 *
 * @param {Object<string, string>} tags parsePgn 解析出的标签
 * @returns {string | null} 可用的 FEN，否则 null
 */
export function startFenFromTags(tags) {
  if (!tags || tags.SetUp === '0') return null;
  const fen = String(tags.FEN || '').trim();
  const parts = fen.split(/\s+/);
  if (parts.length < 4 || parts.length > 6) return null;
  if (!parts[0].includes('/') || !['w', 'b'].includes(parts[1])) return null;
  return fen;
}

/**
 * Detect whether a string is PGN or FEN.
 *
 * @param {string} text - the input text
 * @returns {'pgn' | 'fen' | 'unknown'}
 */
export function detectFormat(text) {
  const trimmed = text.trim();

  // FEN: 6 fields separated by whitespace, first field contains '/', second is 'w' or 'b'
  const parts = trimmed.split(/\s+/);
  if (parts.length === 6 && parts[0].includes('/') && (parts[1] === 'w' || parts[1] === 'b')) {
    return 'fen';
  }

  // PGN: starts with '[' (tag) or contains move numbers
  if (trimmed.startsWith('[') || /\d+\.\s+[PNBRQK]?[a-h]/.test(trimmed)) {
    return 'pgn';
  }

  return 'unknown';
}
