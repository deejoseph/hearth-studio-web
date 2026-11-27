import { indexToSquare, squareToIndex } from '../engine/chess.js';

export const COORDINATE_QUIZ_ID = 'learn-coordinates';
export const COORDINATE_QUIZ_STREAK = 5;

export function squareColor(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = square.charCodeAt(1) - 49;
  return (file + rank) % 2 === 0 ? 'dark' : 'light';
}

function shuffledDeck(random) {
  const squares = Array.from({ length: 64 }, (_, index) => indexToSquare(index));
  for (let index = squares.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [squares[index], squares[swap]] = [squares[swap], squares[index]];
  }
  return squares;
}

export function mountCoordinateQuiz({ onComplete = () => {}, random = Math.random } = {}) {
  const root = document.createElement('section');
  root.className = 'coordinate-quiz';

  const progress = document.createElement('p');
  progress.className = 'quiz-progress';
  const prompt = document.createElement('p');
  prompt.className = 'quiz-prompt';
  prompt.setAttribute('aria-live', 'polite');

  const board = document.createElement('div');
  board.className = 'setup-quiz-board';
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', '选择随机报出的坐标');

  const actions = document.createElement('div');
  actions.className = 'quiz-color-actions';
  const dark = document.createElement('button');
  dark.type = 'button';
  dark.className = 'btn btn-ghost';
  dark.textContent = '黑格';
  const light = document.createElement('button');
  light.type = 'button';
  light.className = 'btn btn-ghost';
  light.textContent = '白格';
  actions.append(dark, light);

  const status = document.createElement('p');
  status.className = 'setup-quiz-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  const nextActions = document.createElement('div');
  nextActions.className = 'setup-quiz-actions';
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'btn btn-primary';
  next.textContent = '下一题';
  nextActions.appendChild(next);

  root.append(progress, prompt, board, actions, status, nextActions);

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
    button.className = `setup-quiz-square ${squareColor(square)}`;
    button.dataset.square = square;
    if (index % 8 === 0) button.dataset.rank = square[1];
    if (index >= 56) button.dataset.file = square[0];
    button.setAttribute('role', 'gridcell');
    button.addEventListener('click', () => locate(square));
    squareButtons.set(square, button);
    row.appendChild(button);
  }

  let deck = [];
  let target = '';
  let stage = 'locate';
  let streak = 0;
  let completed = false;
  let answeredSquare = '';

  dark.addEventListener('click', () => answerColor('dark'));
  light.addEventListener('click', () => answerColor('light'));
  next.addEventListener('click', nextQuestion);

  function drawSquare() {
    if (deck.length === 0) {
      deck = shuffledDeck(random);
      if (deck.at(-1) === target) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
    }
    target = deck.pop();
  }

  function nextQuestion() {
    if (completed || stage !== 'feedback') return;
    stage = 'locate';
    answeredSquare = '';
    status.textContent = '';
    status.className = 'setup-quiz-status';
    drawSquare();
    render();
  }

  function locate(square) {
    if (completed || stage !== 'locate') return;
    answeredSquare = square;
    if (square === target) {
      stage = 'color';
      status.textContent = '坐标找对了。这个格子是黑格还是白格？';
      status.className = 'setup-quiz-status';
    } else {
      streak = 0;
      stage = 'feedback';
      status.textContent = `点错了，正确坐标是 ${target}。连续答对次数已归零。`;
      status.className = 'setup-quiz-status is-error';
    }
    render();
  }

  function answerColor(color) {
    if (completed || stage !== 'color') return;
    if (color === squareColor(target)) {
      streak += 1;
      if (streak === COORDINATE_QUIZ_STREAK) {
        completed = true;
        stage = 'complete';
        status.textContent = '连续 5 题全部答对，认坐标测验通过！';
        status.className = 'setup-quiz-status is-success';
        onComplete();
      } else {
        stage = 'feedback';
        status.textContent = `答对了！已连续答对 ${streak} / ${COORDINATE_QUIZ_STREAK} 题。`;
        status.className = 'setup-quiz-status is-success';
      }
    } else {
      streak = 0;
      stage = 'feedback';
      status.textContent = `颜色答错了，${target} 是${squareColor(target) === 'dark' ? '黑格' : '白格'}。连续答对次数已归零。`;
      status.className = 'setup-quiz-status is-error';
    }
    render();
  }

  function render() {
    progress.textContent = `连续答对：${streak} / ${COORDINATE_QUIZ_STREAK}`;
    prompt.textContent = stage === 'color'
      ? `${target} 是黑格还是白格？`
      : stage === 'complete'
        ? '认坐标测验完成'
        : `请点选：${target}`;
    for (const [square, button] of squareButtons) {
      button.classList.toggle('is-selected', stage === 'color' && square === target);
      button.classList.toggle('is-correct', stage === 'feedback' && square === target && answeredSquare !== target);
      button.classList.toggle('is-extra', stage === 'feedback' && square === answeredSquare && answeredSquare !== target);
      button.disabled = completed || stage !== 'locate';
      button.setAttribute('aria-label', `${square}，${squareColor(square) === 'dark' ? '黑格' : '白格'}`);
    }
    dark.disabled = completed || stage !== 'color';
    light.disabled = completed || stage !== 'color';
    next.classList.toggle('hidden', stage !== 'feedback');
    next.disabled = stage !== 'feedback';
  }

  drawSquare();
  render();
  return root;
}
