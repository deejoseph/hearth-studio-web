/**
 * 题库面板：导入题目、做题、选题、管理。
 *
 * 题库从走法框里搬出来单独成列，只有 260–320px 宽，所以能省的都省：
 * 难度从五个单选项收成一个下拉框，题目列表常驻在下面，导入和格式说明
 * 收进 <details>。做题区和列表都在同一个面板里，选中哪道题一眼能看出来。
 */

import { Chess } from '../engine/chess.js';
import { BASIC_PROBLEMS } from '../game/basicProblems.js';
import { importAuto, importFenSolutionFormat } from '../game/tactics.js';
import {
  toggleFavorite,
  isFavorite,
  recordAttempt,
  getProgress,
  saveProblemSet,
  getProblemSetNames,
  loadProblemSet,
  deleteProblemSet,
  getUserRating,
  updateRating,
  getRecommendedDifficultyRange,
} from '../game/tacticsStore.js';

const DIFFICULTY_MODES = [
  ['all', '全部难度'],
  ['auto', '自动（按评级）'],
  ['easy', '简单'],
  ['medium', '中等'],
  ['hard', '困难'],
];

const STATUS_TEXT = {
  idle: '',
  solving: '解题中',
  correct: '✓ 正确',
  incorrect: '✗ 错误',
  complete: '已完成',
  'showing-solution': '查看答案',
};

const FORMAT_SAMPLE = [
  'fen: r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
  'solution: Qxf7#',
  'difficulty: 900',
].join('\n');

/**
 * 挂载题库面板。
 *
 * @param {HTMLElement} container
 * @param {object} options
 * @param {function} options.setFen - 把棋盘摆成题目局面 (fen) => void
 * @param {function} options.getFen - 读棋盘当前局面 () => fen，导入时用来取局面
 * @param {boolean} options.canManage - 是否显示教练的导入与题目集管理
 * @param {object[]} options.problems - 初始题目
 * @param {function} options.onProgress - 答题进度变化时通知外部
 */
export function mountTacticsPanel(container, {
  setFen, getFen, canManage = false, problems = [], onProgress = () => {},
} = {}) {
  container.innerHTML = '';
  container.classList.add('tactics-panel');

  const panel = {
    problems: [],
    currentIndex: 0,
    currentMoveIndex: 0,
    status: 'idle',
    canManage: Boolean(canManage),
    importMode: 'text',
    filter: {
      favoritesOnly: false,
      unsolvedOnly: false,
      mistakesOnly: false,
      searchText: '',
      difficultyMode: 'all',
    },
    setFen,
    getFen,
    onProgress,
    refreshProblem: () => {},
    refreshList: () => {},
    refreshStore: () => {},
    refreshAll: () => {},
    resetFilters: () => {},
  };
  panel.refreshAll = () => {
    panel.refreshProblem();
    panel.refreshList();
    panel.refreshStore();
  };

  const problemSection = buildProblemSection(panel);
  const listSection = buildListSection(panel);
  const storeSection = buildStoreSection(panel);
  const importSection = buildImportSection(panel);

  container.append(problemSection, listSection, storeSection.root, importSection);

  function syncManagement() {
    importSection.hidden = !panel.canManage;
    importSection.open = panel.canManage;
    storeSection.manage.hidden = !panel.canManage;
    panel.refreshStore();
  }

  syncManagement();
  loadProblems(panel, problems);

  return {
    setCanManage(canManage) {
      panel.canManage = Boolean(canManage);
      syncManagement();
    },
    selectProblemById(id) {
      panel.resetFilters();
      let index = panel.problems.findIndex((problem) => problem.id === id);
      if (index < 0 && BASIC_PROBLEMS.some((problem) => problem.id === id)) {
        const merged = [...BASIC_PROBLEMS];
        for (const problem of panel.problems) {
          if (!merged.some((known) => known.id === problem.id)) merged.push(problem);
        }
        loadProblems(panel, merged, id);
        index = panel.problems.findIndex((problem) => problem.id === id);
      }
      if (index < 0) return false;
      selectProblem(panel, index);
      return true;
    },
    update(problems) {
      loadProblems(panel, problems);
    },
    loadProblems(problems) {
      loadProblems(panel, problems);
    },
    destroy() {
      container.innerHTML = '';
    },
    getState() {
      return {
        problems: panel.problems,
        currentIndex: panel.currentIndex,
        currentProblemId: panel.problems[panel.currentIndex]?.id ?? null,
        currentMoveIndex: panel.currentMoveIndex,
        status: panel.status,
        canManage: panel.canManage,
      };
    },
    checkMove(uci) {
      return handlePlayerMove(panel, uci);
    },
  };
}

/* ------------------------------------------------------------------ */
/* 做题区                                                              */
/* ------------------------------------------------------------------ */

function buildProblemSection(panel) {
  const section = document.createElement('div');
  section.className = 'tactics-problem';

  const header = document.createElement('div');
  header.className = 'tactics-problem-header';
  const counter = document.createElement('span');
  counter.className = 'tactics-counter';
  const statusBadge = document.createElement('span');
  statusBadge.className = 'tactics-status';
  header.append(counter, statusBadge);

  const hint = document.createElement('div');
  hint.className = 'tactics-hint';

  const feedback = document.createElement('div');
  feedback.className = 'tactics-feedback hidden';

  const nav = document.createElement('div');
  nav.className = 'tactics-nav-grid';

  const prevBtn = navButton('← 上一题', 'btn btn-ghost', () => {
    if (panel.currentIndex > 0) selectProblem(panel, panel.currentIndex - 1);
  });
  const nextBtn = navButton('下一题 →', 'btn btn-primary', () => {
    if (panel.currentIndex < panel.problems.length - 1) {
      selectProblem(panel, panel.currentIndex + 1);
    }
  });
  const retryBtn = navButton('重做', 'btn btn-ghost', () => {
    if (panel.problems.length > 0) selectProblem(panel, panel.currentIndex);
  });
  const solutionBtn = navButton('显示答案', 'btn btn-ghost', () => {
    if (panel.problems.length === 0) return;
    panel.status = 'showing-solution';
    panel.refreshProblem();
  });
  const randomBtn = navButton('随机一题', 'btn btn-ghost tactics-random', () => {
    const filtered = filteredProblems(panel);
    if (filtered.length === 0) return;
    const pick = filtered[Math.floor(Math.random() * filtered.length)];
    selectProblem(panel, pick.index);
  });
  nav.append(prevBtn, nextBtn, retryBtn, solutionBtn, randomBtn);

  section.append(header, hint, feedback, nav);

  panel.refreshProblem = () => {
    const problem = panel.problems[panel.currentIndex];
    if (!problem) {
      counter.textContent = '暂无题目';
      statusBadge.textContent = '';
      statusBadge.className = 'tactics-status';
      hint.textContent = panel.canManage
        ? '先在下面「导入题目与格式」里导入一道题。'
        : '基础练习加载中。';
      feedback.textContent = '';
      feedback.className = 'tactics-feedback hidden';
      for (const button of [prevBtn, nextBtn, retryBtn, solutionBtn, randomBtn]) {
        button.disabled = true;
      }
      return;
    }

    counter.textContent = `第 ${panel.currentIndex + 1} / ${panel.problems.length} 题`;
    statusBadge.textContent = STATUS_TEXT[panel.status] || '';
    statusBadge.className = `tactics-status status-${panel.status}`;

    const turn = problem.fen.split(' ')[1] === 'w' ? '白方' : '黑方';
    let hintText = problem.prompt || `${turn}走棋，找到最佳走法`;
    if (problem.tags && problem.tags.length > 0) {
      hintText += ` · ${problem.tags.join('、')}`;
    }
    hint.textContent = hintText;

    if (panel.status === 'correct') {
      feedback.textContent = '正确！';
      feedback.className = 'tactics-feedback feedback-correct';
    } else if (panel.status === 'incorrect') {
      feedback.textContent = '不对，再想想？或者点「显示答案」';
      feedback.className = 'tactics-feedback feedback-incorrect';
    } else if (panel.status === 'showing-solution') {
      feedback.textContent = `答案：${solutionToSan(problem.fen, problem.solution)}`;
      feedback.className = 'tactics-feedback feedback-solution';
    } else {
      feedback.textContent = '';
      feedback.className = 'tactics-feedback hidden';
    }

    prevBtn.disabled = panel.currentIndex === 0;
    nextBtn.disabled = panel.currentIndex >= panel.problems.length - 1;
    retryBtn.disabled = false;
    solutionBtn.disabled = false;
    randomBtn.disabled = false;
  };

  return section;
}

function navButton(label, className, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/* ------------------------------------------------------------------ */
/* 题目列表                                                            */
/* ------------------------------------------------------------------ */

function buildListSection(panel) {
  const section = document.createElement('div');
  section.className = 'tactics-list-block';

  const toolbar = document.createElement('div');
  toolbar.className = 'tactics-toolbar';

  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'tactics-search';
  search.placeholder = '搜索题目编号或标签';
  search.setAttribute('aria-label', '搜索题目');
  search.value = panel.filter.searchText;
  search.addEventListener('input', () => {
    panel.filter.searchText = search.value;
    panel.refreshList();
  });

  const filterRow = document.createElement('div');
  filterRow.className = 'tactics-filter-row';
  const favoritesFilter = filterCheckbox('仅收藏', panel.filter.favoritesOnly, (checked) => {
    panel.filter.favoritesOnly = checked;
    panel.refreshList();
  });
  const unsolvedFilter = filterCheckbox('仅未做', panel.filter.unsolvedOnly, (checked) => {
    panel.filter.unsolvedOnly = checked;
    panel.refreshList();
  });
  const mistakesFilter = filterCheckbox('错题本', panel.filter.mistakesOnly, (checked) => {
    panel.filter.mistakesOnly = checked;
    panel.refreshList();
  });
  filterRow.append(favoritesFilter, unsolvedFilter, mistakesFilter);

  const selectRow = document.createElement('label');
  selectRow.className = 'tactics-select-row';
  const selectLabel = document.createElement('span');
  selectLabel.textContent = '难度';
  const select = document.createElement('select');
  select.className = 'tactics-select';
  select.setAttribute('aria-label', '难度筛选');
  for (const [value, label] of DIFFICULTY_MODES) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
  select.value = panel.filter.difficultyMode;
  select.addEventListener('change', () => {
    panel.filter.difficultyMode = select.value;
    panel.refreshList();
  });
  selectRow.append(selectLabel, select);

  toolbar.append(search, filterRow, selectRow);

  const listHead = document.createElement('div');
  listHead.className = 'tactics-list-head';
  const listTitle = document.createElement('span');
  listTitle.textContent = '题目列表';
  const listCount = document.createElement('span');
  listCount.className = 'tactics-list-count';
  listHead.append(listTitle, listCount);

  const list = document.createElement('div');
  list.className = 'tactics-problem-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', '题目列表');

  section.append(toolbar, listHead, list);

  panel.resetFilters = () => {
    panel.filter.favoritesOnly = false;
    panel.filter.unsolvedOnly = false;
    panel.filter.mistakesOnly = false;
    panel.filter.searchText = '';
    panel.filter.difficultyMode = 'all';
    search.value = '';
    favoritesFilter.firstChild.checked = false;
    unsolvedFilter.firstChild.checked = false;
    mistakesFilter.firstChild.checked = false;
    select.value = 'all';
  };

  panel.refreshList = () => {
    list.innerHTML = '';
    const filtered = filteredProblems(panel);
    listCount.textContent =
      panel.problems.length === 0 ? '' : `${filtered.length} / ${panel.problems.length} 道`;

    if (panel.problems.length === 0) {
      list.appendChild(emptyNote(panel.canManage
        ? '还没有题目。点下面「导入题目与格式」试试。'
        : '基础练习加载中。'));
      return;
    }
    if (filtered.length === 0) {
      list.appendChild(emptyNote(panel.filter.mistakesOnly
        ? '错题本是空的——答错且还没解决的题会出现在这里。'
        : '没有符合筛选的题目。'));
      return;
    }
    for (const item of filtered) {
      list.appendChild(problemRow(panel, item.problem, item.index));
    }
  };

  return section;
}

function filterCheckbox(label, checked, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'tactics-filter-option';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, document.createTextNode(label));
  return wrap;
}

function emptyNote(text) {
  const p = document.createElement('p');
  p.className = 'tactics-empty';
  p.textContent = text;
  return p;
}

function problemRow(panel, problem, index) {
  const selected = index === panel.currentIndex;
  const row = document.createElement('div');
  row.className = 'tactics-problem-item';
  row.classList.toggle('selected', selected);
  row.setAttribute('role', 'option');
  row.setAttribute('aria-selected', String(selected));
  row.dataset.problemId = problem.id;
  row.tabIndex = 0;

  const info = document.createElement('div');
  info.className = 'problem-info';

  const idSpan = document.createElement('span');
  idSpan.className = 'problem-id';
  idSpan.textContent = problem.title || `第 ${index + 1} 题`;
  info.appendChild(idSpan);

  if (problem.tags && problem.tags.length > 0) {
    const tags = problem.tags.join('、');
    const tagsSpan = document.createElement('span');
    tagsSpan.className = 'problem-tags';
    tagsSpan.textContent = tags;
    tagsSpan.title = tags;
    info.appendChild(tagsSpan);
  }

  const meta = [];
  if (problem.difficulty) meta.push(`难度 ${problem.difficulty}`);
  const progress = getProgress(problem.id);
  if (progress) {
    meta.push(progress.solved ? `✓ 已解决（${progress.attempts} 次）` : `试过 ${progress.attempts} 次`);
  }
  if (meta.length > 0) {
    const metaSpan = document.createElement('span');
    metaSpan.className = 'problem-meta';
    metaSpan.textContent = meta.join(' · ');
    info.appendChild(metaSpan);
  }

  const fav = isFavorite(problem.id);
  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = `fav-btn btn-icon ${fav ? 'active' : ''}`;
  favBtn.textContent = fav ? '★' : '☆';
  favBtn.title = fav ? '取消收藏' : '收藏';
  favBtn.setAttribute('aria-label', `${fav ? '取消收藏' : '收藏'}第 ${index + 1} 题`);
  favBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleFavorite(problem.id);
    panel.refreshList();
    panel.refreshStore();
  });

  row.append(info, favBtn);

  row.addEventListener('click', (event) => {
    if (event.target.closest('.fav-btn')) return;
    selectProblem(panel, index);
  });
  row.addEventListener('keydown', (event) => {
    if (event.target !== row) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectProblem(panel, index);
    }
  });

  return row;
}

function filteredProblems(panel) {
  const userRating = getUserRating();
  const range = getRecommendedDifficultyRange(userRating);
  const search = panel.filter.searchText.trim().toLowerCase();

  return panel.problems
    .map((problem, index) => ({ problem, index }))
    .filter(({ problem }) => {
      if (panel.filter.favoritesOnly && !isFavorite(problem.id)) return false;

      if (panel.filter.unsolvedOnly) {
        const progress = getProgress(problem.id);
        if (progress && progress.solved) return false;
      }

      if (panel.filter.mistakesOnly) {
        const progress = getProgress(problem.id);
        if (!progress || progress.attempts < 1 || progress.solved) return false;
      }

      const difficulty = problem.difficulty || 1000;
      if (panel.filter.difficultyMode === 'auto') {
        if (difficulty < range.min || difficulty > range.max) return false;
      } else if (panel.filter.difficultyMode === 'easy') {
        if (difficulty >= userRating - 100) return false;
      } else if (panel.filter.difficultyMode === 'medium') {
        if (difficulty < userRating - 200 || difficulty > userRating + 200) return false;
      } else if (panel.filter.difficultyMode === 'hard') {
        if (difficulty <= userRating + 100) return false;
      }

      if (search) {
        const inId = problem.id.toLowerCase().includes(search);
        const inTags = (problem.tags || []).some((tag) => tag.toLowerCase().includes(search));
        if (!inId && !inTags) return false;
      }

      return true;
    });
}

/* ------------------------------------------------------------------ */
/* 题目集与统计                                                        */
/* ------------------------------------------------------------------ */

function buildStoreSection(panel) {
  const root = document.createElement('section');
  root.className = 'tactics-store';

  const statsLine = document.createElement('p');
  statsLine.className = 'tactics-stats-line';
  root.appendChild(statsLine);

  const manage = document.createElement('details');
  manage.className = 'tactics-more tactics-manage';

  const summary = document.createElement('summary');
  summary.className = 'tactics-more-summary';
  summary.textContent = '题目集管理';
  manage.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'tactics-more-body';

  const setsList = document.createElement('div');
  setsList.className = 'tactics-sets-list';

  const saveRow = document.createElement('div');
  saveRow.className = 'tactics-save-set';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'tactics-set-name-input';
  nameInput.placeholder = '给这套题起个名字';
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary btn-sm';
  saveBtn.textContent = '保存当前';
  saveBtn.addEventListener('click', () => {
    if (!panel.canManage) return;
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    saveProblemSet(name, panel.problems);
    nameInput.value = '';
    panel.refreshStore();
  });
  saveRow.append(nameInput, saveBtn);

  body.append(setsList, saveRow);
  manage.appendChild(body);
  root.appendChild(manage);

  panel.refreshStore = () => {
    const solved = panel.problems.filter((problem) => getProgress(problem.id)?.solved).length;
    const mistakes = panel.problems.filter((problem) => {
      const progress = getProgress(problem.id);
      return progress && progress.attempts > 0 && !progress.solved;
    }).length;
    statsLine.textContent =
      `当前 ${panel.problems.length} 题 · 已解决 ${solved} · 错题 ${mistakes} · ` +
      `收藏 ${panel.problems.filter((problem) => isFavorite(problem.id)).length} · ` +
      `评级 ${getUserRating()}`;

    setsList.innerHTML = '';
    const names = getProblemSetNames();
    if (names.length === 0) {
      setsList.appendChild(emptyNote('还没有保存过题目集'));
    } else {
      for (const name of names) {
        setsList.appendChild(setItem(panel, name));
      }
    }

    saveBtn.disabled = !panel.canManage || panel.problems.length === 0;
    nameInput.disabled = !panel.canManage || panel.problems.length === 0;
  };

  return { root, manage };
}

function setItem(panel, name) {
  const row = document.createElement('div');
  row.className = 'tactics-set-item';

  const label = document.createElement('span');
  label.textContent = name;
  label.title = name;

  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.className = 'btn btn-ghost btn-sm';
  loadBtn.textContent = '加载';
  loadBtn.addEventListener('click', () => {
    if (!panel.canManage) return;
    const problems = loadProblemSet(name);
    if (problems) loadProblems(panel, problems);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-ghost btn-sm btn-danger';
  deleteBtn.textContent = '删除';
  deleteBtn.addEventListener('click', () => {
    if (!panel.canManage) return;
    if (confirm(`确定删除题目集「${name}」？`)) {
      deleteProblemSet(name);
      panel.refreshStore();
    }
  });

  row.append(label, loadBtn, deleteBtn);
  return row;
}

/* ------------------------------------------------------------------ */
/* 导入                                                                */
/* ------------------------------------------------------------------ */

function buildImportSection(panel) {
  const details = document.createElement('details');
  details.className = 'tactics-more tactics-import';

  const summary = document.createElement('summary');
  summary.className = 'tactics-more-summary';
  summary.textContent = '教练导入与格式';
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'tactics-more-body';

  const tabs = document.createElement('div');
  tabs.className = 'tactics-tabs';
  const fileTab = document.createElement('button');
  fileTab.type = 'button';
  fileTab.className = 'tactics-tab';
  fileTab.textContent = '文件上传';
  const textTab = document.createElement('button');
  textTab.type = 'button';
  textTab.className = 'tactics-tab';
  textTab.textContent = '文本粘贴';
  tabs.append(fileTab, textTab);

  const fileArea = document.createElement('div');
  fileArea.className = 'tactics-file-area';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pgn,.txt';
  fileInput.className = 'tactics-file-input';
  const fileLabel = document.createElement('label');
  fileLabel.className = 'tactics-file-label';
  fileLabel.textContent = '点击选择 PGN 或 TXT 文件';
  fileLabel.appendChild(fileInput);
  fileArea.appendChild(fileLabel);

  const textArea = document.createElement('div');
  textArea.className = 'tactics-text-area';
  const textarea = document.createElement('textarea');
  textarea.className = 'tactics-textarea';
  textarea.rows = 6;
  textarea.spellcheck = false;
  textarea.placeholder = '每道题一段，题与题之间空一行：\n\nfen: （点下面「取棋盘当前局面」自动填）\nsolution: Qxf7#\ndifficulty: 900';

  const actions = document.createElement('div');
  actions.className = 'tactics-import-actions';
  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn btn-primary';
  importBtn.textContent = '导入';
  const fillBtn = document.createElement('button');
  fillBtn.type = 'button';
  fillBtn.className = 'btn btn-ghost';
  fillBtn.textContent = '取棋盘当前局面';
  actions.append(importBtn, fillBtn);

  textArea.append(textarea, actions);

  const resultDiv = document.createElement('div');
  resultDiv.className = 'tactics-import-result';

  const guide = buildFormatGuide();

  body.append(tabs, fileArea, textArea, resultDiv, guide);
  details.appendChild(body);

  function showResult(message, isError = false) {
    resultDiv.textContent = message;
    resultDiv.className = `tactics-import-result ${isError ? 'error' : 'success'}`;
  }

  function switchMode(mode) {
    panel.importMode = mode;
    fileTab.classList.toggle('active', mode === 'file');
    textTab.classList.toggle('active', mode === 'text');
    fileArea.classList.toggle('hidden', mode !== 'file');
    textArea.classList.toggle('hidden', mode !== 'text');
  }

  function runImport(text) {
    if (!panel.canManage) return;
    const problems = parseImportText(text);
    loadProblems(panel, problems);
    showResult(`成功导入 ${problems.length} 道题，第一道已摆到棋盘上。`);
  }

  fileTab.addEventListener('click', () => switchMode('file'));
  textTab.addEventListener('click', () => switchMode('text'));

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        runImport(String(event.target.result));
      } catch (err) {
        showResult(`导入失败：${err.message}`, true);
      }
      fileInput.value = '';
    };
    reader.onerror = () => {
      showResult('读取文件失败', true);
      fileInput.value = '';
    };
    reader.readAsText(file);
  });

  importBtn.addEventListener('click', () => {
    try {
      runImport(textarea.value);
    } catch (err) {
      showResult(`导入失败：${err.message}`, true);
    }
  });

  fillBtn.addEventListener('click', () => {
    if (!panel.canManage) return;
    const fen = panel.getFen ? panel.getFen() : null;
    if (!fen) {
      showResult('没拿到棋盘局面 —— 先把棋盘摆成你要的局面。', true);
      return;
    }
    switchMode('text');
    const block = `fen: ${fen}\nsolution: \ndifficulty: 900`;
    const current = textarea.value.trim();
    textarea.value = current ? `${current}\n\n${block}` : block;
    textarea.focus();
    const caret = textarea.value.lastIndexOf('solution: ') + 'solution: '.length;
    textarea.setSelectionRange(caret, caret);
    showResult('局面已取到文本框，接着写下正确的走法。');
  });

  switchMode(panel.importMode);
  return details;
}

function parseImportText(text) {
  const trimmed = String(text).trim();
  if (!trimmed) throw new Error('还没有内容');
  const problems = /(^|\n)\s*fen:/.test(trimmed)
    ? importFenSolutionFormat(trimmed)
    : importAuto(trimmed);
  if (problems.length === 0) {
    throw new Error('没解析出题目 —— 每段要有 fen: 和 solution:，题与题之间空一行');
  }
  return problems;
}

function buildFormatGuide() {
  const details = document.createElement('details');
  details.className = 'tactics-format';

  const summary = document.createElement('summary');
  summary.textContent = '格式说明：怎么编一道题';
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'tactics-format-body';

  const lead = document.createElement('p');
  lead.textContent = '每道题写成一段，题与题之间空一行。fen 和 solution 必填，difficulty 可选。';

  const list = document.createElement('ul');
  for (const [strong, rest] of [
    ['fen', '局面。在棋盘上摆好，点「取棋盘当前局面」会自动填进来。'],
    ['solution', '正确走法。写 SAN（Qxf7#）或 UCI（f3f7）都行，多步用空格隔开。'],
    ['difficulty', '难度 100–3000。答对答错按它给你的评级加减分；不写按 1000 算。'],
  ]) {
    const li = document.createElement('li');
    const code = document.createElement('code');
    code.textContent = strong;
    li.append(code, document.createTextNode(`：${rest}`));
    list.appendChild(li);
  }

  const pgnNote = document.createElement('p');
  pgnNote.textContent =
    '也可以直接粘 PGN：主线走法会当成解法；带 [FEN "..."] 就从那个局面开始，否则从开局摆起。';

  const sample = document.createElement('pre');
  sample.className = 'tactics-format-sample';
  sample.textContent = FORMAT_SAMPLE;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn btn-ghost btn-sm tactics-format-copy';
  copyBtn.textContent = '复制示例';
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(FORMAT_SAMPLE);
      copyBtn.textContent = '已复制';
      setTimeout(() => {
        copyBtn.textContent = '复制示例';
      }, 1500);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(sample);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      copyBtn.textContent = '已选中，按 Ctrl+C';
    }
  });

  body.append(lead, list, pgnNote, sample, copyBtn);
  details.appendChild(body);
  return details;
}

/* ------------------------------------------------------------------ */
/* 共用的状态操作                                                      */
/* ------------------------------------------------------------------ */

function loadProblems(panel, problems, selectedId = null) {
  panel.problems = problems;
  const selectedIndex = selectedId
    ? problems.findIndex((problem) => problem.id === selectedId)
    : 0;
  panel.currentIndex = Math.max(0, selectedIndex);
  if (problems.length > 0) {
    selectProblem(panel, panel.currentIndex);
  } else {
    panel.status = 'idle';
    panel.refreshAll();
  }
  // 题目集统计和「保存当前」跟着这一批题走，不必等第一次答对才更新。
  panel.refreshStore();
}

function selectProblem(panel, index) {
  const problem = panel.problems[index];
  if (!problem) return;
  panel.currentIndex = index;
  panel.currentMoveIndex = 0;
  panel.status = 'solving';
  if (panel.setFen) panel.setFen(problem.fen);
  panel.refreshProblem();
  panel.refreshList();
}

function handlePlayerMove(panel, uci) {
  if (!['solving', 'incorrect'].includes(panel.status)) return false;

  const problem = panel.problems[panel.currentIndex];
  if (!problem) return false;

  const expectedMove = problem.solution[panel.currentMoveIndex];
  if (!expectedMove) return false;

  if (uci === expectedMove) {
    panel.currentMoveIndex += 1;
    const finished = panel.currentMoveIndex >= problem.solution.length;
    if (finished) {
      panel.status = 'correct';
      recordAttempt(problem.id, true);
      updateRating(problem.difficulty || 1000, true);
    } else {
      panel.status = 'solving';
    }
    panel.refreshProblem();
    panel.refreshList();
    if (finished) {
      panel.refreshStore();
      panel.onProgress();
    }
    return true;
  }

  panel.status = 'incorrect';
  recordAttempt(problem.id, false);
  if (panel.currentMoveIndex === 0) {
    updateRating(problem.difficulty || 1000, false);
  }
  panel.refreshProblem();
  panel.refreshList();
  panel.refreshStore();
  panel.onProgress();
  return false;
}

function solutionToSan(fen, moves) {
  try {
    const chess = new Chess(fen);
    return moves
      .map((uci) => {
        const move = chess.move({
          from: uci.slice(0, 2),
          to: uci.slice(2, 4),
          promotion: uci.length > 4 ? uci[4] : undefined,
        });
        return move ? move.san : uci;
      })
      .join(' → ');
  } catch {
    return moves.join(' → ');
  }
}