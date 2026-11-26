<?php
/**
 * 走法合法性的唯一裁判：FEN 解析、合法走法、SAN 读写、走子之后的局面。
 *
 * 为什么要有这份文件：在线对弈必须由服务器判定"这步能不能走"，否则房间里任何
 * 一边都能改前端伪造局面、伪造结果。裁判只能有一套标准 —— 就是棋盘里那套 JS
 * 引擎（chess-puter/src/chess/src/engine/chess.js）的标准。本文件按它的行为逐条
 * 写，并由 tools/chess_engine_audit.php 拿引擎自己导出的 fixture 对拍；对不上
 * 就是 bug，不存在"两边都对"。
 *
 * 约定（和 JS 那份一致，别改）：
 *   - 棋盘是 64 格扁平数组，0 = a8，63 = h1（第 0 行是第 8  ranks，往上数字变小）。
 *   - 棋子是单个字符，大写白棋小写黑棋，空格是 null。
 *   - flags：b 兵冲两格 / n 静走 / c 吃子 / e 吃过路兵 / p 升变 / cp 吃子升变 /
 *            k 短易位 / q 长易位。
 *
 * 局面对象是不可变的：chess_engine_move() 返回新局面，不改它的入参。服务器要按
 * 房间存 FEN、要比不同走法、要重连恢复，纯函数比 make/undo 那套带状态的好推理。
 *
 * 禁止直接 URL 访问（同目录 .htaccess 已 FilesMatch 拒绝）。
 */

const CHESS_ENGINE_WHITE = 'w';
const CHESS_ENGINE_BLACK = 'b';
const CHESS_ENGINE_START_FEN =
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const CHESS_ENGINE_FILES = 'abcdefgh';

// 易位权利位。和 JS 的 C_WK/C_WQ/C_BK/C_BQ 同值。
const CHESS_ENGINE_K_WK = 1;
const CHESS_ENGINE_K_WQ = 2;
const CHESS_ENGINE_K_BK = 4;
const CHESS_ENGINE_K_BQ = 8;

// 只要动到这些格子，易位权利就要清掉：王动了两边都没了，车被吃/车动了少一边。
const CHESS_ENGINE_CASTLE_MASK = [
    0 => 15 & ~CHESS_ENGINE_K_BQ,   // a8
    4 => 15 & ~(CHESS_ENGINE_K_BK | CHESS_ENGINE_K_BQ), // e8
    7 => 15 & ~CHESS_ENGINE_K_BK,   // h8
    56 => 15 & ~CHESS_ENGINE_K_WQ,  // a1
    60 => 15 & ~(CHESS_ENGINE_K_WK | CHESS_ENGINE_K_WQ), // e1
    63 => 15 & ~CHESS_ENGINE_K_WK,  // h1
];

/** 马的 8 个 (文件差, 行差)。 */
const CHESS_ENGINE_KNIGHT = [
    [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
/** 王的 8 个邻格。 */
const CHESS_ENGINE_KING = [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const CHESS_ENGINE_BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const CHESS_ENGINE_ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CHESS_ENGINE_QUEEN = [[1, 1], [1, -1], [-1, 1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1]];

function chess_engine_other($color) {
    return $color === CHESS_ENGINE_WHITE ? CHESS_ENGINE_BLACK : CHESS_ENGINE_WHITE;
}

function chess_engine_is_white($piece) {
    return ord($piece) < 97;
}

/** 'PN' -> 'p'，和 JS 的 typeOf 一样。 */
function chess_engine_type($piece) {
    return strtolower($piece);
}

/**
 * 'e4' -> 下标。返回 null 表示不是合法格子（JS 在这里抛异常；服务器不能因为
 * 一个畸形请求就 500）。
 */
function chess_engine_square_to_index($square) {
    if (!is_string($square) || strlen($square) !== 2) {
        return null;
    }
    $file = ord($square[0]) - 97;
    $rank = ord($square[1]) - 49;
    if ($file < 0 || $file > 7 || $rank < 0 || $rank > 7) {
        return null;
    }
    return (7 - $rank) * 8 + $file;
}

function chess_engine_index_to_square($index) {
    return CHESS_ENGINE_FILES[$index & 7] . (8 - ($index >> 3));
}

/**
 * FEN -> 局面对象；畸形输入返回 null。
 *
 * 校验范围和 JS 的 load() 一致（8 行、每行填满 8 格、两王俱在、行棋方合法、
 * 易位字段只用 KQkq），另外多一条：兵不许站在第 1/第 8 横排。JS 那种局面下会
 * 生成一个冲出棋盘的兵走法并且自己踩空崩掉；真实对局到不了这一步，但服务器要
 * 能在有人手填一个畸形 FEN 时干净地拒绝，而不是死掉。
 */
function chess_engine_parse_fen($fen) {
    if (!is_string($fen)) {
        return null;
    }
    $fields = preg_split('/\s+/', trim($fen));
    if (count($fields) < 4) {
        return null;
    }
    list($placement, $turn, $castling, $ep) = $fields;
    $halfmove = isset($fields[4]) ? (int) $fields[4] : 0;
    $fullmove = isset($fields[5]) ? (int) $fields[5] : 1;

    $ranks = explode('/', $placement);
    if (count($ranks) !== 8) {
        return null;
    }
    $board = array_fill(0, 64, null);
    $kw = -1;
    $kb = -1;
    foreach ($ranks as $r => $row) {
        $f = 0;
        for ($i = 0, $n = strlen($row); $i < $n; $i++) {
            $ch = $row[$i];
            if ($ch >= '1' && $ch <= '8') {
                $f += ord($ch) - 48;
                continue;
            }
            $at = strpos('pnbrqkPNBRQK', $ch);
            if ($at === false) {
                return null;
            }
            if ($f > 7) {
                return null;
            }
            $index = $r * 8 + $f;
            $board[$index] = $ch;
            if ($ch === 'K') {
                $kw = $index;
            } elseif ($ch === 'k') {
                $kb = $index;
            }
            if (($ch === 'P' && $r === 0) || ($ch === 'p' && $r === 7)) {
                return null;
            }
            $f++;
        }
        if ($f !== 8) {
            return null;
        }
    }
    if ($kw === -1 || $kb === -1) {
        return null;
    }
    if ($turn !== CHESS_ENGINE_WHITE && $turn !== CHESS_ENGINE_BLACK) {
        return null;
    }

    $bits = 0;
    if ($castling !== '-') {
        for ($i = 0, $n = strlen($castling); $i < $n; $i++) {
            switch ($castling[$i]) {
                case 'K': $bits |= CHESS_ENGINE_K_WK; break;
                case 'Q': $bits |= CHESS_ENGINE_K_WQ; break;
                case 'k': $bits |= CHESS_ENGINE_K_BK; break;
                case 'q': $bits |= CHESS_ENGINE_K_BQ; break;
                default: return null;
            }
        }
    }

    $epIndex = -1;
    if ($ep !== '-') {
        $epIndex = chess_engine_square_to_index($ep);
        if ($epIndex === null) {
            return null;
        }
    }

    // 易位权利要和现实一致：王和那一边的车都还在起始格上，否则 FEN 是自相矛盾的。
    // JS 生成不出这种 FEN，但服务器要挡得住手填的。
    if ($bits & CHESS_ENGINE_K_WK && !($board[60] === 'K' && $board[63] === 'R')) {
        $bits &= ~CHESS_ENGINE_K_WK;
    }
    if ($bits & CHESS_ENGINE_K_WQ && !($board[60] === 'K' && $board[56] === 'R')) {
        $bits &= ~CHESS_ENGINE_K_WQ;
    }
    if ($bits & CHESS_ENGINE_K_BK && !($board[4] === 'k' && $board[7] === 'r')) {
        $bits &= ~CHESS_ENGINE_K_BK;
    }
    if ($bits & CHESS_ENGINE_K_BQ && !($board[4] === 'k' && $board[0] === 'r')) {
        $bits &= ~CHESS_ENGINE_K_BQ;
    }

    return [
        'board' => $board,
        'turn' => $turn,
        'castling' => $bits,
        'ep' => $epIndex,
        'halfmove' => $halfmove,
        'fullmove' => $fullmove,
        'kw' => $kw,
        'kb' => $kb,
    ];
}

/** 局面对象 -> FEN。输出顺序与 JS 的 fen() 逐字符一致：KQkq、吃过路兵、两个计数。 */
function chess_engine_to_fen($pos) {
    $placement = '';
    for ($r = 0; $r < 8; $r++) {
        $empty = 0;
        for ($f = 0; $f < 8; $f++) {
            $piece = $pos['board'][$r * 8 + $f];
            if ($piece === null) {
                $empty++;
                continue;
            }
            if ($empty) {
                $placement .= $empty;
            }
            $empty = 0;
            $placement .= $piece;
        }
        if ($empty) {
            $placement .= $empty;
        }
        if ($r < 7) {
            $placement .= '/';
        }
    }
    $castling = '';
    if ($pos['castling'] & CHESS_ENGINE_K_WK) $castling .= 'K';
    if ($pos['castling'] & CHESS_ENGINE_K_WQ) $castling .= 'Q';
    if ($pos['castling'] & CHESS_ENGINE_K_BK) $castling .= 'k';
    if ($pos['castling'] & CHESS_ENGINE_K_BQ) $castling .= 'q';
    return implode(' ', [
        $placement,
        $pos['turn'],
        $castling === '' ? '-' : $castling,
        $pos['ep'] === -1 ? '-' : chess_engine_index_to_square($pos['ep']),
        $pos['halfmove'],
        $pos['fullmove'],
    ]);
}

/** $square 是否被 $by 这一方的任一子攻击到。与 JS 的 _attacked 同一套扫法。 */
function chess_engine_attacked($board, $square, $by) {
    $f = $square & 7;
    $r = $square >> 3;

    // 兵：白兵朝行号变小的方向进攻，所以进攻 $square 的白兵在它的下一行。
    $pawnRow = $by === CHESS_ENGINE_WHITE ? $r + 1 : $r - 1;
    if ($pawnRow >= 0 && $pawnRow <= 7) {
        $pawn = $by === CHESS_ENGINE_WHITE ? 'P' : 'p';
        if ($f > 0 && $board[$pawnRow * 8 + $f - 1] === $pawn) {
            return true;
        }
        if ($f < 7 && $board[$pawnRow * 8 + $f + 1] === $pawn) {
            return true;
        }
    }

    $knight = $by === CHESS_ENGINE_WHITE ? 'N' : 'n';
    foreach (CHESS_ENGINE_KNIGHT as $delta) {
        $tf = $f + $delta[0];
        $tr = $r + $delta[1];
        if ($tf >= 0 && $tf <= 7 && $tr >= 0 && $tr <= 7
            && $board[$tr * 8 + $tf] === $knight) {
            return true;
        }
    }

    $king = $by === CHESS_ENGINE_WHITE ? 'K' : 'k';
    foreach (CHESS_ENGINE_KING as $delta) {
        $tf = $f + $delta[0];
        $tr = $r + $delta[1];
        if ($tf >= 0 && $tf <= 7 && $tr >= 0 && $tr <= 7
            && $board[$tr * 8 + $tf] === $king) {
            return true;
        }
    }

    $rook = $by === CHESS_ENGINE_WHITE ? 'R' : 'r';
    $bishop = $by === CHESS_ENGINE_WHITE ? 'B' : 'b';
    $queen = $by === CHESS_ENGINE_WHITE ? 'Q' : 'q';
    foreach (CHESS_ENGINE_ROOK as $dir) {
        $tf = $f + $dir[0];
        $tr = $r + $dir[1];
        while ($tf >= 0 && $tf <= 7 && $tr >= 0 && $tr <= 7) {
            $target = $board[$tr * 8 + $tf];
            if ($target !== null) {
                if ($target === $rook || $target === $queen) {
                    return true;
                }
                break;
            }
            $tf += $dir[0];
            $tr += $dir[1];
        }
    }
    foreach (CHESS_ENGINE_BISHOP as $dir) {
        $tf = $f + $dir[0];
        $tr = $r + $dir[1];
        while ($tf >= 0 && $tf <= 7 && $tr >= 0 && $tr <= 7) {
            $target = $board[$tr * 8 + $tf];
            if ($target !== null) {
                if ($target === $bishop || $target === $queen) {
                    return true;
                }
                break;
            }
            $tf += $dir[0];
            $tr += $dir[1];
        }
    }
    return false;
}

/** $color 这一方是不是正被将军。 */
function chess_engine_in_check($pos, $color) {
    $king = $color === CHESS_ENGINE_WHITE ? $pos['kw'] : $pos['kb'];
    return chess_engine_attacked($pos['board'], $king, chess_engine_other($color));
}

/**
 * 走一步之后的棋盘（只动子，不更新计数器）。吃过路兵要清掉的是被吃的那个兵，
 * 不是落点；易位要把车一起搬过去。升变写哪一颗子由 flags/promotion 决定。
 */
function chess_engine_apply($board, $move) {
    $white = $move['color'] === CHESS_ENGINE_WHITE;
    $board[$move['from']] = null;
    $board[$move['to']] = $move['promotion'] !== null
        ? ($white ? strtoupper($move['promotion']) : $move['promotion'])
        : $move['piece'];

    if ($move['flags'] === 'e') {
        $board[$white ? $move['to'] + 8 : $move['to'] - 8] = null;
    } elseif ($move['flags'] === 'k') {
        $board[$move['to'] - 1] = $board[$move['to'] + 1];
        $board[$move['to'] + 1] = null;
    } elseif ($move['flags'] === 'q') {
        $board[$move['to'] + 1] = $board[$move['to'] - 2];
        $board[$move['to'] - 2] = null;
    }
    return $board;
}

/** 伪合法走法：只管子的走法，不检查走完会不会把王留在攻击之下。 */
function chess_engine_pseudo_moves($pos, $color = null) {
    $color = $color === null ? $pos['turn'] : $color;
    $board = $pos['board'];
    $white = $color === CHESS_ENGINE_WHITE;
    $moves = [];

    for ($from = 0; $from < 64; $from++) {
        $piece = $board[$from];
        if ($piece === null || (ord($piece) < 97) !== $white) {
            continue;
        }
        $type = chess_engine_type($piece);
        $f = $from & 7;
        $r = $from >> 3;

        if ($type === 'p') {
            $dir = $white ? -8 : 8;
            $startRow = $white ? 6 : 1;
            $one = $from + $dir;
            if ($board[$one] === null) {
                chess_engine_push_pawn($moves, $from, $one, $piece, $color, null);
                $two = $from + ($white ? -16 : 16);
                if ($r === $startRow && $board[$two] === null) {
                    $moves[] = [
                        'from' => $from, 'to' => $two, 'piece' => $piece,
                        'color' => $color, 'flags' => 'b', 'captured' => null,
                        'promotion' => null,
                    ];
                }
            }
            foreach ([-1, 1] as $df) {
                $tf = $f + $df;
                if ($tf < 0 || $tf > 7) {
                    continue;
                }
                $to = $one + $df;
                $target = $board[$to];
                if ($target !== null && (ord($target) < 97) !== $white) {
                    chess_engine_push_pawn($moves, $from, $to, $piece, $color, $target);
                } elseif ($to === $pos['ep']) {
                    // 落点是被跳过的那一格，被吃的兵在它后面一格。真到这里的局面
                    // 一定有兵可吃（ep 只在上一步冲两格时设置），所以不另查。
                    $moves[] = [
                        'from' => $from, 'to' => $to, 'piece' => $piece,
                        'color' => $color, 'flags' => 'e',
                        'captured' => $white ? 'p' : 'P', 'promotion' => null,
                    ];
                }
            }
        } elseif ($type === 'n' || $type === 'k') {
            $deltas = $type === 'n' ? CHESS_ENGINE_KNIGHT : CHESS_ENGINE_KING;
            foreach ($deltas as $delta) {
                $tf = $f + $delta[0];
                $tr = $r + $delta[1];
                if ($tf < 0 || $tf > 7 || $tr < 0 || $tr > 7) {
                    continue;
                }
                $to = $tr * 8 + $tf;
                $target = $board[$to];
                if ($target === null) {
                    $moves[] = [
                        'from' => $from, 'to' => $to, 'piece' => $piece,
                        'color' => $color, 'flags' => 'n', 'captured' => null,
                        'promotion' => null,
                    ];
                } elseif ((ord($target) < 97) !== $white) {
                    $moves[] = [
                        'from' => $from, 'to' => $to, 'piece' => $piece,
                        'color' => $color, 'flags' => 'c', 'captured' => $target,
                        'promotion' => null,
                    ];
                }
            }
            if ($type === 'k') {
                chess_engine_push_castling($pos, $moves, $color, $from);
            }
        } else {
            $dirs = $type === 'b' ? CHESS_ENGINE_BISHOP
                : ($type === 'r' ? CHESS_ENGINE_ROOK : CHESS_ENGINE_QUEEN);
            foreach ($dirs as $dir) {
                $tf = $f + $dir[0];
                $tr = $r + $dir[1];
                while ($tf >= 0 && $tf <= 7 && $tr >= 0 && $tr <= 7) {
                    $to = $tr * 8 + $tf;
                    $target = $board[$to];
                    if ($target === null) {
                        $moves[] = [
                            'from' => $from, 'to' => $to, 'piece' => $piece,
                            'color' => $color, 'flags' => 'n', 'captured' => null,
                            'promotion' => null,
                        ];
                    } else {
                        if ((ord($target) < 97) !== $white) {
                            $moves[] = [
                                'from' => $from, 'to' => $to, 'piece' => $piece,
                                'color' => $color, 'flags' => 'c',
                                'captured' => $target, 'promotion' => null,
                            ];
                        }
                        break;
                    }
                    $tf += $dir[0];
                    $tr += $dir[1];
                }
            }
        }
    }
    return $moves;
}

function chess_engine_push_pawn(&$moves, $from, $to, $piece, $color, $captured) {
    $promoRow = $color === CHESS_ENGINE_WHITE ? 0 : 7;
    if (($to >> 3) === $promoRow) {
        $flags = $captured === null ? 'p' : 'cp';
        foreach (['q', 'r', 'b', 'n'] as $promotion) {
            $moves[] = [
                'from' => $from, 'to' => $to, 'piece' => $piece, 'color' => $color,
                'flags' => $flags, 'captured' => $captured, 'promotion' => $promotion,
            ];
        }
        return;
    }
    $moves[] = [
        'from' => $from, 'to' => $to, 'piece' => $piece, 'color' => $color,
        'flags' => $captured === null ? 'n' : 'c', 'captured' => $captured,
        'promotion' => null,
    ];
}

/**
 * 易位：起始格、空档、车、以及王经过的三格都不受攻击。落点本身受不受攻击交给
 * 合法过滤去判（和 JS 一样，它在这里只查 home/home±1/home±2）。
 */
function chess_engine_push_castling($pos, &$moves, $color, $from) {
    $home = $color === CHESS_ENGINE_WHITE ? 60 : 4;
    if ($from !== $home) {
        return;
    }
    $white = $color === CHESS_ENGINE_WHITE;
    $board = $pos['board'];
    $enemy = chess_engine_other($color);
    $rook = $white ? 'R' : 'r';
    $kBit = $white ? CHESS_ENGINE_K_WK : CHESS_ENGINE_K_BK;
    $qBit = $white ? CHESS_ENGINE_K_WQ : CHESS_ENGINE_K_BQ;

    if ($pos['castling'] & $kBit
        && $board[$home + 1] === null && $board[$home + 2] === null
        && $board[$home + 3] === $rook
        && !chess_engine_attacked($board, $home, $enemy)
        && !chess_engine_attacked($board, $home + 1, $enemy)
        && !chess_engine_attacked($board, $home + 2, $enemy)) {
        $moves[] = [
            'from' => $from, 'to' => $home + 2, 'piece' => $board[$from],
            'color' => $color, 'flags' => 'k', 'captured' => null, 'promotion' => null,
        ];
    }
    if ($pos['castling'] & $qBit
        && $board[$home - 1] === null && $board[$home - 2] === null
        && $board[$home - 3] === null && $board[$home - 4] === $rook
        && !chess_engine_attacked($board, $home, $enemy)
        && !chess_engine_attacked($board, $home - 1, $enemy)
        && !chess_engine_attacked($board, $home - 2, $enemy)) {
        $moves[] = [
            'from' => $from, 'to' => $home - 2, 'piece' => $board[$from],
            'color' => $color, 'flags' => 'q', 'captured' => null, 'promotion' => null,
        ];
    }
}

/** 走完这一步之后的局面（纯函数：入参不变）。 */
function chess_engine_move($pos, $move) {
    $white = $move['color'] === CHESS_ENGINE_WHITE;
    $board = chess_engine_apply($pos['board'], $move);
    $kw = $move['piece'] === 'K' ? $move['to'] : $pos['kw'];
    $kb = $move['piece'] === 'k' ? $move['to'] : $pos['kb'];

    $castling = $pos['castling']
        & (CHESS_ENGINE_CASTLE_MASK[$move['from']] ?? 15)
        & (CHESS_ENGINE_CASTLE_MASK[$move['to']] ?? 15);

    // 冲两格就把被跳过的那格记成吃过路兵格，不管有没有兵真能吃 —— JS 这么写，
    // 棋盘的 FEN 也这么写，两边必须一字不差才能对上。
    $ep = $move['flags'] === 'b' ? intdiv($move['from'] + $move['to'], 2) : -1;

    $halfmove = (chess_engine_type($move['piece']) === 'p' || $move['captured'] !== null)
        ? 0
        : $pos['halfmove'] + 1;
    $fullmove = $white ? $pos['fullmove'] : $pos['fullmove'] + 1;

    return [
        'board' => $board,
        'turn' => chess_engine_other($pos['turn']),
        'castling' => $castling,
        'ep' => $ep,
        'halfmove' => $halfmove,
        'fullmove' => $fullmove,
        'kw' => $kw,
        'kb' => $kb,
    ];
}

/** 全部合法走法，顺序与 JS 的 _legalMoves 一致（按格子扫描、按同序生成）。 */
function chess_engine_legal_moves($pos) {
    $us = $pos['turn'];
    $legal = [];
    foreach (chess_engine_pseudo_moves($pos, $us) as $move) {
        $next = chess_engine_move($pos, $move);
        if (!chess_engine_in_check($next, $us)) {
            $legal[] = $move;
        }
    }
    return $legal;
}

/**
 * 走法 -> SAN。`$legal` 是同一局面的全部合法走法，用来做消歧（哪两颗同类子能到
 * 同一格）。写法与 JS 的 _moveToSan 一致：O-O / O-O-O / Nbd2 / R1a3 / exd5 /
 * e8=Q / 结尾 + 或 #。
 */
function chess_engine_to_san($pos, $move, $legal) {
    $fromFile = CHESS_ENGINE_FILES[$move['from'] & 7];
    $toSquare = chess_engine_index_to_square($move['to']);

    if ($move['flags'] === 'k') {
        $san = 'O-O';
    } elseif ($move['flags'] === 'q') {
        $san = 'O-O-O';
    } elseif (chess_engine_type($move['piece']) === 'p') {
        $san = $move['captured'] !== null ? $fromFile . 'x' . $toSquare : $toSquare;
        if ($move['promotion'] !== null) {
            $san .= '=' . strtoupper($move['promotion']);
        }
    } else {
        $rivals = [];
        foreach ($legal as $other) {
            if ($other['piece'] === $move['piece'] && $other['to'] === $move['to']
                && $other['from'] !== $move['from']) {
                $rivals[] = $other;
            }
        }
        $disambiguator = '';
        if ($rivals) {
            $sameFile = false;
            $sameRank = false;
            foreach ($rivals as $other) {
                if (($other['from'] & 7) === ($move['from'] & 7)) $sameFile = true;
                if (($other['from'] >> 3) === ($move['from'] >> 3)) $sameRank = true;
            }
            if (!$sameFile) {
                $disambiguator = $fromFile;
            } elseif (!$sameRank) {
                $disambiguator = (string) (8 - ($move['from'] >> 3));
            } else {
                $disambiguator = chess_engine_index_to_square($move['from']);
            }
        }
        $san = strtoupper($move['piece']) . $disambiguator
            . ($move['captured'] !== null ? 'x' : '') . $toSquare;
    }

    $next = chess_engine_move($pos, $move);
    if (chess_engine_in_check($next, $next['turn'])) {
        $san .= count(chess_engine_legal_moves($next)) === 0 ? '#' : '+';
    }
    return $san;
}

/**
 * SAN -> 走法；不合法或写法不对返回 null。
 *
 * 只认棋盘自己写得出来的那种写法（规范的 SAN，带 +/#，易位写 O-O）。这是刻意的：
 * 服务器裁判的输入越窄，能钻的空子越少。要放宽就得同时改这边和棋盘的写法，
 * 而且改了必须重跑对拍。
 */
function chess_engine_from_san($pos, $san) {
    $legal = chess_engine_legal_moves($pos);
    foreach ($legal as $move) {
        if (chess_engine_to_san($pos, $move, $legal) === $san) {
            return $move;
        }
    }
    return null;
}
