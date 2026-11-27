import { Chess, START_FEN, indexToSquare, squareToIndex } from '../engine/chess.js';

export const SETUP_QUIZ_ID = 'learn-setup-board';

const PIECE_ORDER = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];
const PIECE_NAMES = {
  K: '白王', Q: '白后', R: '白车', B: '白象', N: '白马', P: '白兵',
  k: '黑王', q: '黑后', r: '黑车', b: '黑象', n: '黑马', p: '黑兵',
};
const EXPECTED_BOARD = new Chess(START_FEN).board();

export function emptySetupBoard() {
  return Array(64).fill(null);
}

export function standardSetupBoard() {
  return [...EXPECTED_BOARD];
}

export function setupBoardErrors(board) {
  return EXPECTED_BOARD.flatMap((piece, index) => (board[index] === piece ? [] : [indexToSquare(index)]));
}

export function isStandardSetup(board) {
  return setupBoardErrors(board).length === 0;
}

function pieceUrl(piece) {
  const color = piece.charCodeAt(0) < 97 ? 'w' : 'b';
  return `${import.meta.env.BASE_URL}pieces/${color}${piece.toUpperCase()}.svg`;
}

export function mountSetupQuiz({ onComplete = () => {} } = {}) {
  const root = document.createElement('section');
  root.className = 'setup-quiz';

  const guide = document.createElement('div');
  guide.className = 'setup-quiz-guide';
  guide.textContent = '口诀：白方左下角是黑格；白后在白格，黑后在黑格；兵排在第二排和第七排。';
  root.appendChild(guide);

  const palette = document.createElement('div');
  palette.className = 'setup-quiz-palette';
  palette.setAttribute('role', 'group');
  palette.setAttribute('aria-label', '选择要摆放的棋子');
  root.appendChild(palette);

  const tools = document.createElement('div');
  tools.className = 'setup-quiz-tools';
  const eraser = document.createElement('button');
  eraser.type = 'button';
  eraser.className = 'btn btn-ghost btn-sm';
  eraser.textContent = '橡皮擦';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'btn btn-ghost btn-sm';
  clear.textContent = '清空重摆';
  tools.append(eraser, clear);
  root.appendChild(tools);

  const boardEl = document.createElement('div');
  boardEl.className = 'setup-quiz-board';
  boardEl.setAttribute('role', 'grid');
  boardEl.setAttribute('aria-label', '摆放国际象棋棋子');
  root.appendChild(boardEl);

  const status = document.createElement('p');
  status.className = 'setup-quiz-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  root.appendChild(status);

  const actions = document.createElement('div');
  actions.className = 'setup-quiz-actions';
  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'btn btn-primary';
  check.textContent = '检查摆法';
  actions.appendChild(check);
  root.appendChild(actions);

  let board = emptySetupBoard();
  let selectedPiece = 'P';
  let wrongSquares = new Set();
  let completed = false;
  const squareButtons = new Map();
  const pieceButtons = new Map();

  for (const piece of PIECE_ORDER) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'setup-quiz-piece';
    button.dataset.piece = piece;
    button.setAttribute('aria-label', PIECE_NAMES[piece]);
    const img = document.createElement('img');
    img.src = pieceUrl(piece);
    img.alt = '';
    const label = document.createElement('span');
    label.textContent = PIECE_NAMES[piece];
    button.append(img, label);
    button.addEventListener('click', () => {
      selectedPiece = piece;
      render();
    });
    pieceButtons.set(piece, button);
    palette.appendChild(button);
  }

  let rowEl = null;
  for (let index = 0; index < 64; index += 1) {
    if ((index & 7) === 0) {
      rowEl = document.createElement('div');
      rowEl.className = 'setup-quiz-row';
      rowEl.setAttribute('role', 'row');
      boardEl.appendChild(rowEl);
    }
    const square = indexToSquare(index);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `setup-quiz-square ${(((index & 7) + (index >> 3)) & 1) === 0 ? 'light' : 'dark'}`;
    button.dataset.square = square;
    if ((index & 7) === 0) button.dataset.rank = square[1];
    if (index >> 3 === 7) button.dataset.file = square[0];
    button.setAttribute('role', 'gridcell');
    button.addEventListener('click', () => place(square));
    squareButtons.set(square, button);
    rowEl.appendChild(button);
  }

  eraser.addEventListener('click', () => {
    selectedPiece = null;
    render();
  });
  clear.addEventListener('click', reset);
  check.addEventListener('click', checkBoard);

  function render() {
    for (const [square, button] of squareButtons) {
      const piece = board[squareToIndex(square)];
      button.replaceChildren();
      if (piece) {
        const img = document.createElement('img');
        img.src = pieceUrl(piece);
        img.alt = PIECE_NAMES[piece];
        button.appendChild(img);
      }
      const wrong = wrongSquares.has(square);
      button.classList.toggle('is-wrong', wrong);
      button.disabled = completed;
      button.setAttribute('aria-label', `${square}，${piece ? PIECE_NAMES[piece] : '空格'}${wrong ? '，需要调整' : ''}`);
    }
    for (const [piece, button] of pieceButtons) {
      button.setAttribute('aria-pressed', String(selectedPiece === piece));
      button.disabled = completed;
    }
    eraser.setAttribute('aria-pressed', String(selectedPiece === null));
    eraser.disabled = completed;
    clear.disabled = completed;
    check.disabled = completed;
    if (!status.textContent) {
      status.textContent = `已放 ${board.filter(Boolean).length} / 32 个棋子`;
    }
  }

  function place(square) {
    if (completed) return;
    board[squareToIndex(square)] = selectedPiece;
    wrongSquares.delete(square);
    status.textContent = '';
    status.classList.remove('is-error', 'is-success');
    render();
  }

  function checkBoard() {
    if (completed) return;
    const errors = setupBoardErrors(board);
    if (errors.length === 0) {
      completed = true;
      wrongSquares.clear();
      status.textContent = '摆对了！标准开局已经完成。';
      status.classList.remove('is-error');
      status.classList.add('is-success');
      onComplete();
    } else {
      wrongSquares = new Set(errors);
      status.textContent = `还有 ${errors.length} 个格子与标准摆法不同，红色格子需要调整。`;
      status.classList.remove('is-success');
      status.classList.add('is-error');
    }
    render();
  }

  function reset() {
    if (completed) return;
    board = emptySetupBoard();
    wrongSquares.clear();
    status.textContent = '';
    status.classList.remove('is-error', 'is-success');
    render();
  }

  render();
  return root;
}
