import { Chess, START_FEN } from '../engine/chess.js';
import OPENINGS from '../data/openings.js';

const CHINESE_NAMES = {
  "King's Pawn Game": '王兵开局',
  "Queen's Pawn Game": '后兵开局',
  'Italian Game': '意大利开局',
  'Ruy Lopez': '西班牙开局',
  'Sicilian Defense': '西西里防御',
  'French Defense': '法兰西防御',
  'Caro-Kann Defense': '卡罗-康防御',
  'Scandinavian Defense': '斯堪的纳维亚防御',
  "Petroff's Defense": '彼得罗夫防御',
  "Philidor's Defense": '菲利多尔防御',
  'Four Knights Game': '四马开局',
  'Scotch Game': '苏格兰开局',
  'Vienna Game': '维也纳开局',
  "King's Gambit": '王翼弃兵',
  "Queen's Gambit": '后翼弃兵',
  "Queen's Gambit Accepted": '后翼弃兵接受',
  "Queen's Gambit Declined": '后翼弃兵拒绝',
  'English Opening': '英国式开局',
  'Reti Opening': '雷蒂开局',
  "King's Indian Attack": '王翼印度攻击',
  "King's Indian Defense": '王翼印度防御',
  "Queen's Indian Defense": '后翼印度防御',
  'Nimzo-Indian Defense': '尼姆佐印度防御',
  'Grünfeld Defense': '格林菲尔德防御',
  'Slav Defense': '斯拉夫防御',
  'Dutch Defense': '荷兰防御',
  'Benoni Defense': '贝诺尼防御',
  'Pirc Defense': '皮尔茨防御',
  'Modern Defense': '现代防御',
  'London System': '伦敦体系',
  'Colle System': '科勒体系',
  'Torre Attack': '托雷攻击',
  "Bird's Opening": '伯德开局',
  "Barnes Opening": '巴恩斯开局',
  "Larsen's Opening": '拉尔森开局',
  "Grob Opening": '格罗布开局',
  'Polish Opening': '波兰开局',
  'Budapest Gambit': '布达佩斯弃兵',
  'Evans Gambit': '埃文斯弃兵',
  'Danish Gambit': '丹麦弃兵',
};

const CHINESE_PREFIXES = Object.entries(CHINESE_NAMES)
  .sort(([a], [b]) => b.length - a.length);

let cachedKey = null;
let cachedResult = null;

function normalizedFen(fen) {
  return String(fen ?? '').trim().split(/\s+/).join(' ');
}

function positionKey(fen) {
  // En-passant squares are not needed to distinguish named opening positions.
  return fen.split(/\s+/).slice(0, 3).join(' ');
}

function moveKey(move) {
  if (typeof move === 'string') return move;
  if (!move?.from || !move?.to) return null;
  return `${move.from}${move.to}${move.promotion || ''}`;
}

export function openingDisplayName(name) {
  for (const [english, chinese] of CHINESE_PREFIXES) {
    if (name === english || name.startsWith(`${english}:`) || name.startsWith(`${english},`)) {
      const rest = name.slice(english.length).replace(/^[:,]\s*/, '');
      return rest ? `${chinese} · ${rest}` : chinese;
    }
  }
  return name;
}

export function identifyOpening(originFen = START_FEN, history = []) {
  if (normalizedFen(originFen) !== normalizedFen(START_FEN)) return null;
  if (!Array.isArray(history)) return null;
  const keys = history.map(moveKey);
  if (keys.some((key) => key === null)) return null;
  const cacheKey = keys.join(' ');
  if (cacheKey === cachedKey) return cachedResult;

  let replay;
  try {
    replay = new Chess(START_FEN);
  } catch {
    return null;
  }
  let match = history.length === 0
    ? { eco: '', name: '标准开局', officialName: '标准开局' }
    : null;
  for (const move of history) {
    const made = typeof move === 'string'
      ? replay.move(move)
      : replay.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    if (!made) {
      cachedKey = cacheKey;
      cachedResult = null;
      return null;
    }
    const entry = OPENINGS[positionKey(replay.fen())];
    if (entry) {
      match = {
        eco: entry[0],
        name: openingDisplayName(entry[1]),
        officialName: entry[1],
      };
    }
  }
  cachedKey = cacheKey;
  cachedResult = match;
  return match;
}
