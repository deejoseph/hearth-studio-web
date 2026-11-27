/**
 * 自学教程的界面：左边那张卡上的七个按钮 + 一个读正文的对话框。
 *
 * 教程对所有人开放 —— 这里不查登录、不查教练资格，也不发任何请求。
 * 正文在 game/learnContent.js 里，这一层只管摆出来和翻页。
 */

import { LEARN_TOPICS, learnTopicProgress } from '../game/learnContent.js';
import { getAllProgress, recordAttempt } from '../game/tacticsStore.js';
import { SETUP_QUIZ_ID, mountSetupQuiz } from './setupQuiz.js';
import { COORDINATE_QUIZ_ID, mountCoordinateQuiz } from './coordinateQuiz.js';
import { PIECE_RANGE_QUIZ_ID, mountPieceRangeQuiz } from './pieceRangeQuiz.js';

const $ = (id) => document.getElementById(id);
const QUIZ_MOUNTS = {
  [SETUP_QUIZ_ID]: mountSetupQuiz,
  [COORDINATE_QUIZ_ID]: mountCoordinateQuiz,
  [PIECE_RANGE_QUIZ_ID]: mountPieceRangeQuiz,
};

function progressLabel(progress) {
  if (progress.total === 0) return '阅读课';
  return progress.complete ? '已完成' : `练习 ${progress.solved}/${progress.total}`;
}

export function mountLearnPanel({ onPractice } = {}) {
  const card = $('learn-card');
  const dialog = $('learn-dialog');
  const el = {
    step: $('learn-dialog-step'),
    title: $('learn-dialog-title'),
    body: $('learn-dialog-body'),
    prev: $('learn-prev-btn'),
    next: $('learn-next-btn'),
    close: $('learn-close-btn'),
  };

  let current = 0;
  let practiceStatus = null;
  let practiceButton = null;
  let quizButtons = new Map();

  function paintCard() {
    const progress = getAllProgress();
    for (const button of card.querySelectorAll('[data-learn-topic]')) {
      const topic = LEARN_TOPICS.find((item) => item.id === button.dataset.learnTopic);
      if (!topic) continue;
      const state = learnTopicProgress(topic, progress);
      const label = document.createElement('span');
      label.textContent = topic.label;
      const badge = document.createElement('span');
      badge.className = 'learn-topic-progress';
      badge.textContent = progressLabel(state);
      button.replaceChildren(label, badge);
      button.classList.toggle('is-complete', state.complete);
      button.setAttribute('aria-label', `${topic.label}，${progressLabel(state)}`);
    }
  }

  function updatePractice(topic) {
    const progress = getAllProgress();
    const state = learnTopicProgress(topic, progress);
    practiceStatus.textContent = `本节${progressLabel(state)}`;
    practiceStatus.classList.toggle('is-complete', state.complete);
    if (practiceButton) {
      practiceButton.textContent = `${state.complete ? '再练一次' : '练一练'}：${topic.label}`;
    }
    for (const quiz of topic.quizzes ?? []) {
      const button = quizButtons.get(quiz.id);
      if (button) button.textContent = progress[quiz.id]?.solved ? `再测一次：${quiz.label}` : `开始${quiz.label}：${topic.label}`;
    }
  }

  function paint() {
    dialog.classList.remove('quiz-open');
    const topic = LEARN_TOPICS[current];
    el.prev.classList.remove('hidden');
    el.next.classList.remove('hidden');
    el.title.textContent = topic.title;
    el.step.textContent = `第 ${current + 1} / ${LEARN_TOPICS.length} 节`;

    el.body.replaceChildren();
    const lead = document.createElement('p');
    lead.className = 'learn-lead';
    lead.textContent = topic.lead;
    el.body.appendChild(lead);

    if (topic.mnemonic) {
      const mnemonic = document.createElement('div');
      mnemonic.className = 'learn-mnemonic';
      const heading = document.createElement('strong');
      heading.textContent = topic.mnemonicTitle ?? '口诀';
      const list = document.createElement('ul');
      for (const item of topic.mnemonic) {
        const line = document.createElement('li');
        line.textContent = item;
        list.appendChild(line);
      }
      mnemonic.append(heading, list);
      el.body.appendChild(mnemonic);
    }

    practiceStatus = document.createElement('p');
    practiceStatus.className = 'learn-practice-status';
    el.body.appendChild(practiceStatus);

    for (const section of topic.sections) {
      const heading = document.createElement('h3');
      heading.textContent = section.heading;
      el.body.appendChild(heading);

      const list = document.createElement('ul');
      for (const item of section.items) {
        const line = document.createElement('li');
        line.textContent = item;
        list.appendChild(line);
      }
      el.body.appendChild(list);
    }

    practiceButton = null;
    quizButtons = new Map();
    for (const quiz of topic.quizzes ?? []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-primary learn-practice';
      button.dataset.quizId = quiz.id;
      button.addEventListener('click', () => openQuiz(topic, quiz));
      el.body.appendChild(button);
      quizButtons.set(quiz.id, button);
    }
    if (onPractice && topic.practiceIds?.length) {
      practiceButton = document.createElement('button');
      practiceButton.type = 'button';
      practiceButton.className = `btn ${topic.quizzes?.length ? 'btn-ghost' : 'btn-primary'} learn-practice`;
      practiceButton.addEventListener('click', () => onPractice(topic.id));
      el.body.appendChild(practiceButton);
    }
    updatePractice(topic);

    el.body.scrollTop = 0;
  }

  function openQuiz(topic, quizConfig) {
    dialog.classList.add('quiz-open');
    el.title.textContent = `${quizConfig.label}：${topic.label}`;
    el.prev.classList.add('hidden');
    el.next.classList.add('hidden');
    el.body.replaceChildren();

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn btn-ghost btn-sm learn-quiz-back';
    back.textContent = '← 返回教程';
    back.addEventListener('click', () => paint());

    const quiz = QUIZ_MOUNTS[quizConfig.id]({
      onComplete: () => {
        recordAttempt(quizConfig.id, true);
        paintCard();
      },
    });
    el.body.append(back, quiz);
    el.body.scrollTop = 0;
  }

  function open(id) {
    const index = LEARN_TOPICS.findIndex((topic) => topic.id === id);
    current = index >= 0 ? index : 0;
    paint();
    if (!dialog.open) dialog.showModal();
  }

  function step(delta) {
    current = (current + delta + LEARN_TOPICS.length) % LEARN_TOPICS.length;
    paint();
  }

  for (const button of card.querySelectorAll('[data-learn-topic]')) {
    button.addEventListener('click', () => open(button.dataset.learnTopic));
  }
  el.prev.addEventListener('click', () => step(-1));
  el.next.addEventListener('click', () => step(1));
  el.close.addEventListener('click', () => dialog.close());

  paintCard();

  return {
    open,
    refresh() {
      paintCard();
      if (dialog.open) updatePractice(LEARN_TOPICS[current]);
    },
  };
}