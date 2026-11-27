#!/usr/bin/env node
/**
 * Export the JS engine's own move legality as data, so the PHP engine that will
 * adjudicate online games can be checked against it move for move.
 *
 *   node tools/export-legality-fixture.mjs
 *
 * Three files land in tests/fixtures/:
 *
 *   legal.jsonl  one position per line: {fen, uci[], san[], check}
 *                -> does PHP generate exactly the same legal moves, and write
 *                   the same SAN (disambiguation, +/#, O-O, =Q)?
 *   games.jsonl  one ply per line: {fen, san, next}
 *                -> does PHP's SAN parser return that same move, and update
 *                   castling rights / en passant / move counters identically?
 *   perft.json   node counts per depth for the seed positions
 *                -> pins the generator to numbers published outside this repo
 *                   (tests/perft.test.js), for trees too big to store.
 *
 * This deliberately calls the engine's private _legalMoves()/_moveToSan(): the
 * fixture has to be what the board itself believes, not what a wrapper reports.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Chess, WHITE, indexToSquare } from '../src/engine/chess.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'tests', 'fixtures');

/**
 * Positions whose whole perft tree we sample, with the depth and how thin to
 * sample. The first five are the published perft positions, so the generator is
 * pinned to numbers from outside this repo; the rest are hand-picked for the
 * rules that only show up in awkward places.
 */
const SEEDS = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 100],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 250],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 900],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 500],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', 3, 500],
  ['4k3/8/8/3Pp3/8/8/8/4K3 w - e6 0 1', 3, 1],
  ['4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1', 3, 1],
  // En passant that delivers check: the pawn arrives attacking the king.
  ['8/5k2/8/4pPP1/8/8/8/4K3 w - e6 0 1', 3, 1],
  // En passant that would empty the file between the enemy rook and your own
  // king, so it is not a legal move at all. Both colours, because the pawn
  // direction is where engines get this wrong.
  ['4r1k1/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 3, 1],
  ['4R3/8/8/8/3Pp3/8/8/4k1K1 b - d3 0 1', 3, 1],
  ['4k3/8/8/8/8/8/3n4/4K3 w - - 0 1', 3, 1],
  ['4k3/8/8/8/8/8/1R6/4K3 b - - 0 1', 3, 1],
  // Knights on c5 and g5 both reach e4 (disambiguation by file), and the b7 pawn
  // promotes with and without a capture.
  ['r3k3/1P6/8/2N3N1/8/8/8/4K3 w - - 0 1', 3, 1],
  // Three knights that can all reach e4: one shares a file with a rival and
  // another shares a rank, so its SAN has to spell the whole square (`Nd2e4`).
  // Without this the third branch of the disambiguation rule is untested.
  ['6k1/8/3N4/8/8/8/3N1N2/4K3 w - - 0 1', 3, 1],
  ['3k4/r6r/8/8/8/8/R6R/3K4 w - - 0 1', 3, 1],
  ['8/8/8/8/8/1k6/1p6/1K6 b - - 0 1', 3, 1],
  // Stalemate, both colours: no legal moves and not in check. A deep tree
  // almost never reaches one, and "zero moves" is a rule worth naming.
  ['7k/5Q2/6K1/8/8/8/8/8 b - - 0 1', 1, 1],
  ['8/8/8/8/8/5k2/5p2/5K2 w - - 0 1', 1, 1],
];

/**
 * Games pinned ply by ply. Every line here was checked against the engine — a
 * hand-written SAN that turns out to be illegal is the failure mode to avoid,
 * because the exporter would then blame PHP. Between them they cover castling
 * on both wings, piece and pawn captures, capture-checks, a discovered check,
 * a mate, promotion (with and without capture), and knight disambiguation by
 * file and by rank.
 */
const CURATED = [
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'd4', 'exd4', 'e5', 'd5',
    'Be2', 'Ne4', 'Nxd4', 'Nxd4', 'Qxd4', 'O-O'],
  ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'b6',
    'Bd3', 'Bb7', 'O-O', 'Nbd7', 'e4', 'dxe4', 'Nxe4', 'Nxe4', 'Bxe7', 'Qxe7'],
  ['e4', 'd5', 'exd5', 'Nf6', 'Nc3', 'Bf5', 'd4', 'Bxc2', 'Qxc2', 'c6', 'dxc6', 'bxc6',
    'Qb3', 'Qd6', 'Nb5', 'cxb5', 'Bxb5+', 'Nbd7', 'Bf4', 'Qb4+', 'Qxb4'],
  ['f3', 'e5', 'g4', 'Qh4#'],
  ['d4', 'h5', 'Qd3', 'Rh6', 'Qg6', 'Rxg6', 'h4', 'Rg4', 'f3', 'c6', 'fxg4', 'Qa5+',
    'Kf2', 'd5', 'g5', 'Qa6', 'Nc3', 'Qb5', 'Nb1', 'Na6'],
  ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5', 'Ng3', 'Bg6', 'h4', 'h6',
    'Nf3', 'Nd7', 'h5', 'Bh7', 'Bd3', 'Bxd3', 'Qxd3', 'f6', 'Bd2', 'a6', 'O-O-O'],
  ['e4', 'd5', 'exd5', 'c6', 'd4', 'Nf6', 'dxc6', 'e5', 'c7', 'Bb4+', 'c3', 'O-O',
    'cxb8=Q', 'Qxd4', 'Qxb7', 'Qxf2+', 'Kxf2', 'Bxb7', 'cxb4', 'Ne4+', 'Kf3', 'Nd2+',
    'Ke2', 'Nxb1', 'Rxb1'],
];

/** Every FEN literal in the test suite, so the rules tests join the corpus. */
function scrapedFens() {
  const pattern =
    /[1-8pnbrqkPNBRQK]{1,8}(?:\/[1-8pnbrqkPNBRQK]{1,8}){7}\s[wb]\s(?:[KQkq]{1,4}|-)\s(?:[a-h][36]|-)\s\d{1,4}\s\d{1,5}/g;
  const found = new Set();
  for (const file of readdirSync(join(HERE, '..', 'tests')).filter((f) => f.endsWith('.test.js'))) {
    for (const fen of readFileSync(join(HERE, '..', 'tests', file), 'utf8').match(pattern) ?? []) {
      try {
        new Chess(fen);
        found.add(fen);
      } catch {
        /* a literal that only looks like a position */
      }
    }
  }
  return [...found];
}

const uciOf = (m) => `${indexToSquare(m.from)}${indexToSquare(m.to)}${m.promotion ?? ''}`;

/**
 * Refuse to walk a root where the side not to move is in check. The engine only
 * filters moves that expose its own king, so from such a root it will capture
 * the enemy king and keep going; the fixture then holds a position with no king
 * on the board, which PHP correctly refuses to parse and the audit would blame
 * on PHP. A legal root cannot reach that state.
 */
function assertWalkable(game, fen) {
  const enemyKing = game._turn === WHITE ? game._kb : game._kw;
  if (game._attacked(enemyKing, game._turn)) {
    throw new Error(`seed leaves the side not to move in check, so it is not reachable: ${fen}`);
  }
}

/** What we store for one position: its legal moves, both ways of writing them. */
function record(game) {
  const legal = game._legalMoves();
  return {
    fen: game.fen(),
    uci: legal.map(uciOf).sort(),
    san: legal.map((m) => game._moveToSan(m, legal)).sort(),
    check: game.inCheck(),
  };
}

/**
 * Walk a whole perft tree, keeping one position in `stride`. Walking deep is the
 * point: pins and discovered checks only appear a few moves in. Checkmates and
 * stalemates are always kept — an empty move list is the thing being tested.
 * Positions with an en-passant square are kept one in sixteen, denser than the
 * tree but far sparser than "all of them": about a fifth of the nodes in a deep
 * tree have an ep square set, and keeping every one drowns every other rule.
 */
function sampleFrom(game, depth, stride, sink) {
  let visited = 0;
  const step = (remaining) => {
    visited += 1;
    const ep = game.fen().split(' ')[3] !== '-';
    const kept = visited % stride === 0 || (ep && visited % 16 === 0);
    if (kept) sink.push(record(game));
    const legal = game._legalMoves();
    if (legal.length === 0) {
      if (!kept) sink.push(record(game));
      return;
    }
    if (remaining === 0) return;
    for (const m of legal) {
      game._makeMove(m);
      step(remaining - 1);
      game._undoMove();
    }
  };
  step(depth);
  return visited;
}

function countTo(game, depth) {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of game._legalMoves()) {
    game._makeMove(m);
    n += depth === 1 ? 1 : countTo(game, depth - 1);
    game._undoMove();
  }
  return n;
}

/** Record a ply: the position, the SAN the engine writes for it, the position after. */
function ply(game, move, sink) {
  const legal = game._legalMoves();
  const san = game._moveToSan(move, legal);
  const before = game.fen();
  const done = game.move({
    from: indexToSquare(move.from),
    to: indexToSquare(move.to),
    promotion: move.promotion ?? 'q',
  });
  if (!done || done.san !== san) {
    throw new Error(`engine disagrees with itself: ${before} ${san} vs ${done?.san}`);
  }
  sink.push({ fen: before, san, next: game.fen() });
}

function playGame(sans, sink) {
  const game = new Chess();
  for (const san of sans) {
    const legal = game._legalMoves();
    const hit = legal.find((m) => game._moveToSan(m, legal) === san);
    if (!hit) throw new Error(`curated SAN not produced by the engine: ${san} @ ${game.fen()}`);
    ply(game, hit, sink);
  }
}

/** Random games from a seeded generator: the cheap way to reach odd positions. */
function randomGames(count, sink) {
  let seed = 0x2f6e2b1;
  const rnd = () => {
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 0x100000000;
  };
  for (let g = 0; g < count; g += 1) {
    const game = new Chess();
    for (let plyNo = 0; plyNo < 90; plyNo += 1) {
      const legal = game._legalMoves();
      if (legal.length === 0) break;
      const promos = legal.filter((m) => m.promotion);
      // Promotions are rare in random play and rich in notation, so lean on them.
      const pool = promos.length > 0 && rnd() < 0.5 ? promos : legal;
      ply(game, pool[Math.floor(rnd() * pool.length) % pool.length], sink);
    }
  }
}

const positions = [];
let walked = 0;
for (const [fen, depth, stride] of SEEDS) {
  const game = new Chess(fen);
  assertWalkable(game, fen);
  walked += sampleFrom(game, depth, stride, positions);
}
// A test suite keeps awkward FENs on purpose (pawns on the back rank, two
// queens) to check the parser. Move generation cannot be run on those, and PHP
// will not be either, so they are reported rather than fed in.
const skipped = [];
const scraped = scrapedFens();
for (const fen of scraped) {
  try {
    positions.push(record(new Chess(fen)));
  } catch {
    skipped.push(fen);
  }
}

const plies = [];
for (const sans of CURATED) playGame(sans, plies);
randomGames(40, plies);

/** The same FEN can be reached from several seeds; twice says nothing new. */
const byFen = [...new Map(positions.map((p) => [p.fen, p])).values()].sort((a, b) =>
  a.fen < b.fen ? -1 : 1,
);

/**
 * Perft counts published outside this repo (chessprogramming.org), as asserted
 * by tests/perft.test.js. `null` marks a depth the reference does not publish.
 * Checking the JS engine against these before we blame PHP for a difference is
 * the whole point of pinning it to an outside number.
 */
const PUBLISHED = new Map([
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, null, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, null, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
]);

const perftRows = SEEDS.filter(([fen]) => PUBLISHED.has(fen)).map(([fen, depth]) => {
  const nodes = Array.from({ length: depth }, (_, i) => countTo(new Chess(fen), i + 1));
  const reference = PUBLISHED.get(fen);
  reference.forEach((want, i) => {
    if (want !== null && want !== nodes[i]) {
      throw new Error(`JS engine disagrees with the published perft for ${fen}: depth ${i + 1} ${want} vs ${nodes[i]}`);
    }
  });
  return { fen, depths: nodes.map((n, i) => ({ depth: i + 1, nodes: n, reference: reference[i] })) };
});

mkdirSync(OUT, { recursive: true });
const jsonl = (rows) => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`;
writeFileSync(join(OUT, 'legal.jsonl'), jsonl(byFen));
writeFileSync(join(OUT, 'games.jsonl'), jsonl(plies));
writeFileSync(join(OUT, 'perft.json'), `${JSON.stringify(perftRows, null, 2)}\n`);

const SAN_SHAPE = /^([KQRBN])([a-h1-8]{0,2})(x?)([a-h][1-8])([+#]?)$/;
/** A SAN carries a disambiguator when the run between piece letter and
 *  capture mark is not empty — `Nf3` no, `Nbd2` yes, `Nxe4` no. */
const disambiguated = (san) => {
  const m = SAN_SHAPE.exec(san);
  return Boolean(m && m[2].length > 0);
};
/** Three rivals reaching one square force the full origin square (`Nd2e4`), the
 *  branch that only shows up in engineered positions — so it gets its own count. */
const fullSquareDisambiguated = (san) => {
  const m = SAN_SHAPE.exec(san);
  return Boolean(m && /^[a-h][1-8]$/.test(m[2]));
};
const tally = {
  castlingKing: 0, castlingQueen: 0, epSquare: 0, epCapture: 0, promotion: 0,
  promotionCapture: 0, check: 0, mate: 0, stalemate: 0, disambiguated: 0,
  fullSquareDisambiguated: 0,
  pawnCapture: 0,
};
let moves = 0;
for (const p of byFen) {
  moves += p.uci.length;
  const fields = p.fen.split(' ');
  if (p.san.some((s) => s === 'O-O' || s === 'O-O+')) tally.castlingKing += 1;
  if (p.san.some((s) => s.startsWith('O-O-O'))) tally.castlingQueen += 1;
  if (fields[3] !== '-') tally.epSquare += 1;
  // uci is 5 characters only when a piece is promoted to something.
  if (p.uci.some((u) => u.length === 5)) tally.promotion += 1;
  if (p.san.some((s) => s.includes('=') && s.includes('x'))) tally.promotionCapture += 1;
  if (p.check) tally.check += 1;
  if (p.uci.length === 0) (p.check ? (tally.mate += 1) : (tally.stalemate += 1));
  if (p.san.some(disambiguated)) tally.disambiguated += 1;
  if (p.san.some(fullSquareDisambiguated)) tally.fullSquareDisambiguated += 1;
  // A pawn capture whose SAN names no destination piece letter: `exd5`.
  if (p.san.some((s) => /^[a-h]x[a-h][1-8]/.test(s))) tally.pawnCapture += 1;
  // The en-passant square is always empty, so a pawn capture landing on it can
  // only be the en-passant capture.
  if (fields[3] !== '-' && p.san.some((s) => new RegExp(`^[a-h]x${fields[3]}[+#]?$`).test(s))) {
    tally.epCapture += 1;
  }
}

console.log(
  JSON.stringify(
    {
      treeNodesWalked: walked,
      positions: byFen.length,
      moves: byFen.reduce((n, p) => n + p.uci.length, 0),
      plies: plies.length,
      bytesLegal: readFileSync(join(OUT, 'legal.jsonl')).length,
      bytesGames: readFileSync(join(OUT, 'games.jsonl')).length,
      scrapedFromTests: scrapedFens().length,
      unplayableFensSkipped: skipped.length,
      ...tally,
    },
    null,
    2,
  ),
);
