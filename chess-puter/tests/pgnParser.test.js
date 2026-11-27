import { describe, it, expect } from 'vitest';
import { parsePgn, parseFen, detectFormat, startFenFromTags } from '../src/game/pgnParser.js';
import { Chess } from '../src/engine/chess.js';

describe('parsePgn', () => {
  it('parses a minimal PGN', () => {
    const pgn = `[Event "Test"]

1. e4 e5 2. Nf3 *`;
    const result = parsePgn(pgn);
    expect(result.tags.Event).toBe('Test');
    expect(result.moves).toEqual(['e4', 'e5', 'Nf3']);
    expect(result.result).toBe('*');
  });

  it('parses tags correctly', () => {
    const pgn = `[Event "World Championship"]
[Site "London"]
[Date "2024.11.23"]
[White "Player1"]
[Black "Player2"]
[Result "1-0"]

1. e4 e5 *`;
    const result = parsePgn(pgn);
    expect(result.tags.Event).toBe('World Championship');
    expect(result.tags.Site).toBe('London');
    expect(result.tags.White).toBe('Player1');
    expect(result.tags.Black).toBe('Player2');
    expect(result.tags.Result).toBe('1-0');
  });

  it('parses comments', () => {
    const pgn = `1. e4 {Best move} e5 2. Nf3 *`;
    const result = parsePgn(pgn);
    expect(result.moves).toEqual(['e4', 'e5', 'Nf3']);
    expect(result.comments[0]).toBe('Best move');
  });

  it('handles result markers', () => {
    const pgn1 = `1. e4 e5 1-0`;
    expect(parsePgn(pgn1).result).toBe('1-0');

    const pgn2 = `1. e4 e5 0-1`;
    expect(parsePgn(pgn2).result).toBe('0-1');

    const pgn3 = `1. e4 e5 1/2-1/2`;
    expect(parsePgn(pgn3).result).toBe('1/2-1/2');
  });

  it('skips line numbers', () => {
    const pgn = `1. e4 e5 2. Nf3 Nc6 3. Bb5 *`;
    const result = parsePgn(pgn);
    expect(result.moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  });

  it('handles castling', () => {
    const pgn = `1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O *`;
    const result = parsePgn(pgn);
    expect(result.moves[6]).toBe('O-O');
  });

  it('handles captures', () => {
    const pgn = `1. e4 d5 2. exd5 *`;
    const result = parsePgn(pgn);
    expect(result.moves).toEqual(['e4', 'd5', 'exd5']);
  });

  it('handles promotions', () => {
    const pgn = `1. e4 d5 2. e5 d4 3. e6 d3 4. exd7+ d2 5. d8=Q *`;
    const result = parsePgn(pgn);
    expect(result.moves[8]).toBe('d8=Q');
  });

  it('handles check and checkmate symbols', () => {
    const pgn = `1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# *`;
    const result = parsePgn(pgn);
    expect(result.moves[6]).toBe('Qxf7#');
  });

  describe('variations', () => {
    // 别的软件导的棋谱几乎都带括号支线，棋盘这边只认主线：支线的内容可以不看，
    // 但主线被吃掉半截就是"导入的棋谱少了一半"。
    it('keeps the main line and the result across a branch', () => {
      const pgn = `1. e4 (1... c5 2. Nf3) 1... e5 2. Nf3 Nc6 1-0`;
      const result = parsePgn(pgn);
      expect(result.moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
      expect(result.result).toBe('1-0');
    });

    it('keeps the main line when a branch opens before the first move', () => {
      const pgn = `[Result "*"]\n\n(1. d4 d5) 1. e4 e5 *`;
      const result = parsePgn(pgn);
      expect(result.moves).toEqual(['e4', 'e5']);
      expect(result.result).toBe('*');
    });

    it('keeps the main line across a nested branch', () => {
      const pgn = `1. c4 (1. e4 e5 2. Nf3 (2. d4 exd4) 2... Nc6) 1... Nf6 2. Nc3 *`;
      const result = parsePgn(pgn);
      expect(result.moves).toEqual(['c4', 'Nf6', 'Nc3']);
      expect(result.result).toBe('*');
    });

    it('survives a branch split across lines by the 80-column wrap', () => {
      const pgn = `1. e4 (1... c5\n2. Nf3 d6 3. d4) 1... e5 2. Nf3 *`;
      const result = parsePgn(pgn);
      expect(result.moves).toEqual(['e4', 'e5', 'Nf3']);
    });

    it('does not run off the end on an unclosed branch', () => {
      const pgn = `1. e4 (1... c5 2. Nf3`;
      expect(() => parsePgn(pgn)).not.toThrow();
      expect(parsePgn(pgn).moves).toEqual(['e4']);
    });
  });
});

describe('parseFen', () => {
  it('validates a correct FEN', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const result = parseFen(fen);
    expect(result.valid).toBe(true);
    expect(result.fen).toBe(fen);
  });

  it('rejects FEN with wrong number of fields', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
    const result = parseFen(fen);
    expect(result.valid).toBe(false);
  });

  it('rejects FEN with invalid active color', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1';
    const result = parseFen(fen);
    expect(result.valid).toBe(false);
  });

  it('rejects FEN with wrong number of ranks', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const result = parseFen(fen);
    expect(result.valid).toBe(false);
  });
});

describe('detectFormat', () => {
  it('detects PGN format', () => {
    const pgn = `[Event "Test"]

1. e4 e5 *`;
    expect(detectFormat(pgn)).toBe('pgn');
  });

  it('detects FEN format', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    expect(detectFormat(fen)).toBe('fen');
  });

  it('detects PGN without tags', () => {
    const pgn = `1. e4 e5 2. Nf3 *`;
    expect(detectFormat(pgn)).toBe('pgn');
  });

  it('returns unknown for invalid input', () => {
    expect(detectFormat('random text')).toBe('unknown');
  });
});

describe('startFenFromTags', () => {
  const ENDGAME = '8/6pk/8/7p/4K2P/5P2/8/8 b - - 3 61';

  it('没有 FEN 标签时交回标准开局', () => {
    expect(startFenFromTags({ Event: 'Test' })).toBeNull();
    expect(startFenFromTags({})).toBeNull();
    expect(startFenFromTags(null)).toBeNull();
  });

  it('认 SetUp 1 配的 FEN', () => {
    expect(startFenFromTags({ SetUp: '1', FEN: ENDGAME })).toBe(ENDGAME);
  });

  it('漏了 SetUp 也照用 FEN —— 忽略它等于把整盘分析挪到别的局面上', () => {
    expect(startFenFromTags({ FEN: ENDGAME })).toBe(ENDGAME);
  });

  it('只在明确写了 SetUp 0 时才放弃', () => {
    expect(startFenFromTags({ SetUp: '0', FEN: ENDGAME })).toBeNull();
  });

  it('四段写法的 FEN 也认', () => {
    const four = ENDGAME.split(' ').slice(0, 4).join(' ');
    expect(startFenFromTags({ FEN: four })).toBe(four);
  });

  it('字段数不对、行棋方不对、缺棋盘的都不算', () => {
    expect(startFenFromTags({ FEN: 'random text' })).toBeNull();
    expect(startFenFromTags({ FEN: '8/8/8/4k3/8/8/8/4K3' })).toBeNull();
    expect(startFenFromTags({ FEN: '8/8/8/4k3/8/8/8/4K3 x - - 0 1' })).toBeNull();
    expect(startFenFromTags({ FEN: '8/8/8/4k3/8/8/8/4K3 w - - 0 1 extra' })).toBeNull();
  });

  it('从一整份带 FEN 头的棋谱里取出开局位置，引擎接得住', () => {
    const pgn = `[Event "Endgame drill"]
[SetUp "1"]
[FEN "${ENDGAME}"]
[Result "*"]

1... g6 2. Kf4 *`;
    const parsed = parsePgn(pgn);
    const fen = startFenFromTags(parsed.tags);
    expect(fen).toBe(ENDGAME);
    expect(new Chess(fen).fen()).toBe(fen);
    expect(parsed.moves).toEqual(['g6', 'Kf4']);
  });
});
