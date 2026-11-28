import { indexToSquare, squareToIndex } from '../engine/chess.js';
import { pieceUrl } from '../game/appearance.js';

export const PIECE_RANGE_QUIZ_ID = 'learn-piece-ranges';

export const PIECE_RANGE_ROUNDS = [
  { piece: 'R', square: 'd4', name: '白车', action: '控制' },
  { piece: 'B', square: 'd4', name: '白象', action: '控制' },
  { piece: 'N', square: 'd4', name: '白马', action: '控制' },
  { piece: 'K', square: 'd4', name: '白王', action: '控制' },
  { piece: 'Q', square: 'd4', name: '白后', action: '控制' },
  { piece: 'P', square: 'e4', name: '白兵', action: '攻击' },
];

const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KING_STEPS = [...ORTHOGONAL, ...DIAGONAL];
const KNIGHT_STEPS = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

function offsetSquare(square, fileOffset, rankOffset) {
  const file = square.charCodeAt(0) - 97 + fileOffset;
  const rank = square.charCodeAt(1) - 49 + rankOffset;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return indexToSquare((7 - rank) * 8 + file);
}

export function pieceRangeSquares(piece, square) {
  if (piece === 'N' || piece === 'K' || piece === 'P') {
    const steps = piece === 'N' ? KNIGHT_STEPS : piece === 'K' ? KING_STEPS : [[-1, 1], [1, 1]];
    return steps.map(([file, rank]) => offsetSquare(square, file, rank)).filter(Boolean);
  }
  const directions = piece === 'R' ? ORTHOGONAL : piece === 'B' ? DIAGONAL : KING_STEPS;
  const squares = [];
  for (const [fileStep, rankStep] of directions) {
    for (let distance = 1; distance < 8; distance += 1) {
      const target = offsetSquare(square, fileStep * distance, rankStep * distance);
      if (!target) break;
      squares.push(target);
    }
  }
  return squares;
}

export function mountPieceRangeQuiz({ onComplete = () => {} } = {}) {
  const root = document.createElement('section');
  root.className = 'piece-range-quiz';

  const progress = document.createElement('p');
  progress.className = 'quiz-progress';
  const prompt = document.createElement('p');
  prompt.className = 'quiz-prompt';
  const guide = document.createElement('p');
  guide.className = 'quiz-guide';
  guide.textContent = '依次点选所有目标格，再按“检查”。点错的格子可以再点一次取消。';

  const board = document.createElement('div');
  board.className = 'setup-quiz-board';
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', '选择棋子的攻击或控制范围');

  const status = document.createElement('p');
  status.className = 'setup-quiz-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const actions = document.createElement('div');
  actions.className = 'setup-quiz-actions';
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'btn btn-primary';
  check.textContent = '检查';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn-primary hidden';
  next.textContent = '下一题';
  actions.append(check, next);
  root.append(progress, prompt, guide, board, status, actions);

  const squareButtons = new Map();
  let row = null;
  for (let index = 0; index < 64; index += 1) {
    if (index % 8 === 0) {
      row = document.createElement('div');
      row.className = 'setup-quiz-row';
      row.setAttribute('role', 'row');
      board.appendChild(row);
    }
    const square = indexToSquare(index);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `setup-quiz-square ${(((index & 7) + (index >> 3)) & 1) === 0 ? 'light' : 'dark'}`;
    button.dataset.square = square;
    if (index % 8 === 0) button.dataset.rank = square[1];
    if (index >= 56) button.dataset.file = square[0];
    button.setAttribute('role', 'gridcell');
    button.addEventListener('click', () => toggleSquare(square));
    squareButtons.set(square, button);
    row.appendChild(button);
  }

  let roundIndex = 0;
  let selected = new Set();
  let feedback = null;
  let completed = false;

  check.addEventListener('click', checkRound);
  next.addEventListener('click', nextRound);

  function currentRound() {
    return PIECE_RANGE_ROUNDS[roundIndex];
  }

  function toggleSquare(square) {
    const roundSolved = feedback && feedback.missing.length === 0 && feedback.extra.length === 0;
    if (completed || roundSolved || square === currentRound().square) return;
    if (selected.has(square)) selected.delete(square);
    else selected.add(square);
    feedback = null;
    status.textContent = '';
    status.className = 'setup-quiz-status';
    render();
  }

  function checkRound() {
    if (completed || feedback) return;
    const round = currentRound();
    const answers = new Set(pieceRangeSquares(round.piece, round.square));
    const missing = [...answers].filter((square) => !selected.has(square));
    const extra = [...selected].filter((square) => !answers.has(square));
    if (missing.length === 0 && extra.length === 0) {
      feedback = { missing: [], extra: [] };
      if (roundIndex === PIECE_RANGE_ROUNDS.length - 1) {
        completed = true;
        status.textContent = '六种棋子的攻击范围全部答对，测验通过！';
        status.className = 'setup-quiz-status is-success';
        onComplete();
      } else {
        status.textContent = `答对了！${round.name}在 ${round.square} ${round.action} ${answers.size} 格。`;
        status.className = 'setup-quiz-status is-success';
      }
    } else {
      feedback = { missing, extra };
      const details = [];
      if (missing.length) details.push(`漏选 ${missing.length} 格`);
      if (extra.length) details.push(`多选 ${extra.length} 格`);
      status.textContent = `${details.join('，')}。红色是漏选，橙色是多选，调整后再检查。`;
      status.className = 'setup-quiz-status is-error';
    }
    render();
  }

  function nextRound() {
    if (completed || !feedback || feedback.missing.length || feedback.extra.length) return;
    roundIndex += 1;
    selected = new Set();
    feedback = null;
    status.textContent = '';
    status.className = 'setup-quiz-status';
    render();
  }

  function render() {
    const round = currentRound();
    const answers = new Set(pieceRangeSquares(round.piece, round.square));
    const roundSolved = feedback && feedback.missing.length === 0 && feedback.extra.length === 0;
    progress.textContent = `第 ${roundIndex + 1} / ${PIECE_RANGE_ROUNDS.length} 题`;
    prompt.textContent = `${round.name}在 ${round.square}，请点出它${round.action}的所有格子。`;
    for (const [square, button] of squareButtons) {
      button.replaceChildren();
      const isPiece = square === round.square;
      if (isPiece) {
        const image = document.createElement('img');
        image.src = pieceUrl(round.piece);
        image.alt = round.name;
        button.appendChild(image);
      }
      const missing = feedback?.missing.includes(square) ?? false;
      const extra = feedback?.extra.includes(square) ?? false;
      button.classList.toggle('is-selected', selected.has(square));
      button.classList.toggle('is-correct', feedback && answers.has(square) && selected.has(square));
      button.classList.toggle('is-missing', missing);
      button.classList.toggle('is-extra', extra);
      button.disabled = completed || roundSolved || isPiece;
      button.setAttribute('aria-pressed', String(selected.has(square)));
      button.setAttribute('aria-label', `${square}${isPiece ? `，${round.name}` : ''}${selected.has(square) ? '，已选' : ''}${missing ? '，漏选' : ''}${extra ? '，多选' : ''}`);
    }
    check.classList.toggle('hidden', Boolean(feedback) || completed);
    check.disabled = Boolean(feedback) || completed;
    next.classList.toggle('hidden', !feedback || feedback.missing.length > 0 || feedback.extra.length > 0 || completed);
    next.disabled = !feedback || feedback.missing.length > 0 || feedback.extra.length > 0 || completed;
  }

  render();
  return root;
}
