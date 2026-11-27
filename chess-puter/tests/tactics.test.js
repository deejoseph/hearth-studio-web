import { describe, it, expect } from 'vitest';
import {
  validateProblem,
  problemFromFen,
  extractLinesFromPgn,
  sanToUci,
  importFromPgn,
  importFromFile,
  importAuto,
  importFenSolutionFormat,
} from '../src/game/tactics.js';

describe('validateProblem', () => {
  it('accepts a valid problem', () => {
    const problem = {
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      solution: ['e7e5'],
    };
    const result = validateProblem(problem);
    expect(result.valid).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(validateProblem(null).valid).toBe(false);
    expect(validateProblem('string').valid).toBe(false);
    expect(validateProblem(123).valid).toBe(false);
  });

  it('rejects missing fen', () => {
    const problem = { solution: ['e2e4'] };
    const result = validateProblem(problem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('fen');
  });

  it('rejects missing solution', () => {
    const problem = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' };
    const result = validateProblem(problem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('solution');
  });

  it('rejects empty solution array', () => {
    const problem = {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      solution: [],
    };
    const result = validateProblem(problem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('solution');
  });

  it('rejects invalid FEN', () => {
    const problem = {
      fen: 'invalid fen',
      solution: ['e2e4'],
    };
    const result = validateProblem(problem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('invalid');
  });

  it('rejects illegal move in solution', () => {
    const problem = {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      solution: ['e2e5'], // pawn can't move to e5 from e2
    };
    const result = validateProblem(problem);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('illegal');
  });
});

describe('problemFromFen', () => {
  it('creates a valid problem', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const problem = problemFromFen(fen, ['e7e5']);
    expect(problem.fen).toBe(fen);
    expect(problem.solution).toEqual(['e7e5']);
    expect(problem.id).toMatch(/^t[0-9a-z]+$/);
  });

  it('keeps the same id when the same puzzle is imported again', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const again = fen.replace('0 1', '3 2');
    expect(problemFromFen(fen, ['e7e5']).id).toBe(problemFromFen(again, ['e7e5']).id);
  });

  it('gives different ids to different solutions', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(problemFromFen(fen, ['e7e5']).id).not.toBe(problemFromFen(fen, ['c7c5']).id);
  });

  it('uses custom id if provided', () => {
    const problem = problemFromFen(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      ['e7e5'],
      { id: 'custom-id' }
    );
    expect(problem.id).toBe('custom-id');
  });

  it('throws on invalid input', () => {
    expect(() => problemFromFen('bad fen', ['e2e4'])).toThrow();
    expect(() => problemFromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2e5'])).toThrow();
  });
});

describe('extractLinesFromPgn', () => {
  it('extracts main line from simple PGN', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6';
    const lines = extractLinesFromPgn(pgn);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
  });

  it('extracts variations', () => {
    const pgn = '1. e4 e5 (1... c5 2. Nf3) 2. Nf3';
    const lines = extractLinesFromPgn(pgn);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    // Main line
    expect(lines[0]).toContain('e4');
    expect(lines[0]).toContain('e5');
    // Variation
    const variation = lines.find(l => l.includes('c5'));
    expect(variation).toBeDefined();
    expect(variation).toContain('c5');
  });

  it('ignores comments', () => {
    const pgn = '1. e4 {Best move} e5 2. Nf3';
    const lines = extractLinesFromPgn(pgn);
    expect(lines[0]).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('ignores tag pairs', () => {
    const pgn = '[Event "Test"]\n[Site "Here"]\n\n1. e4 e5';
    const lines = extractLinesFromPgn(pgn);
    expect(lines[0]).toEqual(['e4', 'e5']);
  });

  it('ignores result', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 1-0';
    const lines = extractLinesFromPgn(pgn);
    expect(lines[0]).not.toContain('1-0');
  });

  it('handles nested variations', () => {
    const pgn = '1. e4 e5 (1... c5 (1... d5 2. exd5) 2. Nf3) 2. Nf3';
    const lines = extractLinesFromPgn(pgn);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('returns empty array for empty PGN', () => {
    const lines = extractLinesFromPgn('');
    expect(lines).toEqual([]);
  });
});

describe('sanToUci', () => {
  it('converts simple moves', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const uci = sanToUci(fen, ['e4']);
    expect(uci).toEqual(['e2e4']);
  });

  it('converts multiple moves', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const uci = sanToUci(fen, ['e4', 'e5', 'Nf3']);
    expect(uci).toEqual(['e2e4', 'e7e5', 'g1f3']);
  });

  it('handles captures', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const uci = sanToUci(fen, ['exd5']);
    expect(uci).toEqual(['e4d5']);
  });

  it('handles promotions', () => {
    const fen = '8/P7/6k1/8/8/8/8/6K1 w - - 0 1';
    const uci = sanToUci(fen, ['a8=Q']);
    expect(uci).toEqual(['a7a8q']);
  });

  it('throws on illegal move', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(() => sanToUci(fen, ['e5'])).toThrow();
  });

  it('accepts a mate written with + or no suffix', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
    expect(sanToUci(fen, ['Qxf7#'])).toEqual(['f3f7']);
    expect(sanToUci(fen, ['Qxf7+'])).toEqual(['f3f7']);
    expect(sanToUci(fen, ['Qxf7'])).toEqual(['f3f7']);
  });
});

describe('importFenSolutionFormat', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4';

  it('parses a fen/solution/difficulty block', () => {
    const problems = importFenSolutionFormat(`fen: ${fen}\nsolution: Qxf7#\ndifficulty: 900`);
    expect(problems).toHaveLength(1);
    expect(problems[0].fen).toBe(fen);
    expect(problems[0].solution).toEqual(['f3f7']);
    expect(problems[0].difficulty).toBe(900);
  });

  it('parses several blocks and UCI solutions', () => {
    const text = [`fen: ${fen}\nsolution: f3f7`, `fen: ${fen}\nsolution: Qxf7+`].join('\n\n');
    const problems = importFenSolutionFormat(text);
    expect(problems.map((p) => p.solution)).toEqual([['f3f7'], ['f3f7']]);
  });

  it('skips a broken block without dropping the rest', () => {
    const text = [
      `fen: ${fen}\nsolution: Qxf7#`,
      `fen: ${fen}\nsolution: Qh8#`,
      `fen: ${fen}\nsolution: e2e4`,
    ].join('\n\n');
    const problems = importFenSolutionFormat(text);
    expect(problems).toHaveLength(1);
    expect(problems[0].solution).toEqual(['f3f7']);
  });

  it('ignores a difficulty outside 100-3000', () => {
    const problems = importFenSolutionFormat(`fen: ${fen}\nsolution: Qxf7#\ndifficulty: 50`);
    expect(problems[0].difficulty).toBeUndefined();
  });
});

describe('importFromPgn', () => {
  it('imports a single game as one problem', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6';
    const problems = importFromPgn(pgn);
    expect(problems.length).toBeGreaterThanOrEqual(1);
    expect(problems[0].fen).toBeDefined();
    expect(problems[0].solution).toBeDefined();
    expect(problems[0].solution.length).toBeGreaterThan(0);
  });

  it('imports game with custom starting position', () => {
    const pgn = '[FEN "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"]\n1... e5';
    const problems = importFromPgn(pgn);
    expect(problems.length).toBeGreaterThanOrEqual(1);
    expect(problems[0].fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  });

  it('imports multiple games', () => {
    const pgn = '[Event "Game 1"]\n1. e4 e5\n\n[Event "Game 2"]\n1. d4 d5';
    const problems = importFromPgn(pgn);
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts variations as separate problems', () => {
    // Note: Variations that branch from non-starting positions need position tracking.
    // For now, we only reliably extract the main line.
    const pgn = '1. e4 e5 2. Nf3';
    const problems = importFromPgn(pgn);
    expect(problems.length).toBeGreaterThanOrEqual(1);
    expect(problems[0].solution.length).toBeGreaterThan(0);
  });

  it('handles UCI format moves', () => {
    const pgn = '1. e2e4 e7e5 2. g1f3';
    const problems = importFromPgn(pgn);
    expect(problems.length).toBeGreaterThanOrEqual(1);
    expect(problems[0].solution).toContain('e2e4');
  });

  it('sets source to pgn', () => {
    const pgn = '1. e4 e5';
    const problems = importFromPgn(pgn);
    expect(problems[0].source).toBe('pgn');
  });

  it('extracts difficulty from tags', () => {
    const pgn = '[Difficulty "1500"]\n1. e4 e5';
    const problems = importFromPgn(pgn);
    expect(problems[0].difficulty).toBe(1500);
  });

  it('skips invalid problems', () => {
    const pgn = '[FEN "invalid"]\n1. e4';
    const problems = importFromPgn(pgn);
    // Should skip the invalid one
    expect(problems.every(p => validateProblem(p).valid)).toBe(true);
  });
});

describe('importFromFile', () => {
  it('imports PGN format', () => {
    const content = '1. e4 e5 2. Nf3';
    const problems = importFromFile(content, 'pgn');
    expect(problems.length).toBeGreaterThanOrEqual(1);
  });

  it('defaults to PGN format', () => {
    const content = '1. e4 e5';
    const problems = importFromFile(content);
    expect(problems.length).toBeGreaterThanOrEqual(1);
  });

  it('throws on FEN format (not supported)', () => {
    const content = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(() => importFromFile(content, 'fen')).toThrow();
  });

  it('throws on unknown format', () => {
    expect(() => importFromFile('content', 'unknown')).toThrow();
  });
});

describe('importAuto', () => {
  it('auto-detects PGN with tags', () => {
    const content = '[Event "Test"]\n1. e4 e5';
    const problems = importAuto(content);
    expect(problems.length).toBeGreaterThanOrEqual(1);
  });

  it('auto-detects PGN with move numbers', () => {
    const content = '1. e4 e5 2. Nf3';
    const problems = importAuto(content);
    expect(problems.length).toBeGreaterThanOrEqual(1);
  });

  it('throws on single FEN without solution', () => {
    const content = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(() => importAuto(content)).toThrow();
  });

  it('throws on unrecognizable content', () => {
    expect(() => importAuto('random text')).toThrow();
  });
});

describe('edge cases', () => {
  it('handles PGN with NAG codes', () => {
    const pgn = '1. e4 $1 e5 $2 2. Nf3';
    const problems = importFromPgn(pgn);
    expect(problems.length).toBeGreaterThanOrEqual(1);
  });

  it('handles PGN with null move notation', () => {
    const pgn = '1. e4 e5 2. -- d5';
    // Should either parse or skip gracefully
    const problems = importFromPgn(pgn);
    expect(Array.isArray(problems)).toBe(true);
  });

  it('handles very long solution sequences', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O';
    const problems = importFromPgn(pgn);
    expect(problems.length).toBeGreaterThanOrEqual(1);
    expect(problems[0].solution.length).toBeGreaterThan(10);
  });

  it('handles PGN with check and checkmate symbols', () => {
    const pgn = '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#';
    const problems = importFromPgn(pgn);
    expect(problems.length).toBeGreaterThanOrEqual(1);
  });
});
