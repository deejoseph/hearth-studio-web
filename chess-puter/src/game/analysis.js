/**
 * The reading the analysis panel shows: how far the engine's score leans, and
 * what it plans to do about it.
 *
 * All of it is pure, because the two conventions that bite here are invisible
 * in a browser — an engine reports its score from the side to move's point of
 * view, and it speaks squares (`e2e4`) where a player reading a review needs
 * moves (`Nf3`) — and both are testable against captured engine output.
 */

import { scoreToCentipawns } from '../engine/stockfish.js';

/**
 * A game this far out — ten pawns, which is also what `scoreToCentipawns`
 * saturates a mate at — is decided: the bar is full and stops moving.
 */
const FULL_BAR_CP = 1000;

/**
 * White's share of the eval bar, for a score in centipawns from White's point
 * of view. The Elo expectation curve: a pawn is a visible lean (64%), four
 * pawns nearly all the way across (91%), and nothing ever sits pinned at 100%
 * while the engine is still counting.
 */
export function evalPercent(centipawns) {
  if (centipawns === null || centipawns === undefined) return 50;
  if (Math.abs(centipawns) >= FULL_BAR_CP) return centipawns > 0 ? 100 : 0;
  return 100 / (1 + 10 ** (-centipawns / 400));
}

/**
 * One score, written short. Numbers are always from White's side of the board
 * — "+0.45" means White is better, whichever side the engine was thinking
 * for — so the text and the bar can never disagree with each other.
 */
export function formatScore(score, turn) {
  if (!score || score.value === null) return '';
  if (score.type === 'mate') {
    // The same test scoreToCentipawns uses, so the number and the bar cannot
    // disagree about which side a mate belongs to.
    const byWhite = (score.value >= 0) === (turn === 'w');
    return `${byWhite ? '白' : '黑'}方${Math.abs(score.value)}步杀`;
  }
  const cp = scoreToCentipawns(score, turn);
  return `${cp >= 0 ? '+' : '-'}${(Math.abs(cp) / 100).toFixed(2)}`;
}

/**
 * The engine's principal variation in the form the move list uses. The only
 * way to turn squares into SAN is to replay the line, so `replay` must be a
 * Chess instance sitting on the position that was analysed; it is consumed
 * here, which is why callers hand over a throwaway.
 *
 * Stops at the first move the position does not contain. A line is reported
 * while the search is still running, so it can be cut off mid-varation, and
 * an unfinished line is still worth showing rather than dropping.
 */
export function pvToSan(replay, tokens) {
  const sans = [];
  for (const token of tokens) {
    const move = replay.move({
      from: token.slice(0, 2),
      to: token.slice(2, 4),
      promotion: token.length > 4 ? token.slice(4, 5) : undefined,
    });
    if (!move) break;
    sans.push(move.san);
  }
  return sans;
}

/**
 * The line pairs a reviewer reads: "12. e4 e5 13. Nf3", or "12… d5 13. e4"
 * when Black answers first. `ply` is how many half-moves the analysed
 * position has seen, which is the only thing that decides whether the first
 * move of the line is White's or Black's, and what number it carries.
 */
export function formatLine(sans, ply) {
  const parts = [];
  let index = 0;
  if (ply % 2 === 1 && sans.length > 0) {
    parts.push(`${Math.ceil(ply / 2)}… ${sans[0]}`);
    index = 1;
  }
  for (; index < sans.length; index += 2) {
    const number = Math.floor((ply + index) / 2) + 1;
    const pair = sans.slice(index, index + 2).join(' ');
    parts.push(`${number}. ${pair}`);
  }
  return parts.join(' ');
}

/**
 * Whether the engine may look at the position on the board at all.
 *
 * A live online game is the only case that is closed: someone is waiting for
 * their move in it, and a hint read off their position is not practice. Once
 * that game has ended the room is a record like any other, and going through
 * it with an engine is the whole point of keeping it.
 */
export function canAnalyze({ mode, onlineUiState }) {
  return !(mode === 'online' && onlineUiState === 'playing');
}
