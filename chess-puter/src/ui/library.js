/**
 * The game library: every game this device saw through to its end, ticked and
 * handed out as one PGN file.
 *
 * The rows come from storage (src/game/library.js) and nothing else, so what
 * gets exported here never depends on the board still holding that game — the
 * point of the panel is the games that are *not* on the board.
 *
 * Names, results and time controls are PGN notation and stay in the form
 * src/game/pgn.js wrote them; only the captions below are interface text.
 */

import { LEVELS } from '../engine/ai.js';
import { clearLibrary, loadLibrary, deleteFromServer } from '../game/library.js';
import { bundleFilename, bundlePgn } from '../game/pgn.js';

const $ = (id) => document.getElementById(id);

/** The four results game/library.js will store, in the words a row uses. */
const RESULT = {
  '1-0': '白胜',
  '0-1': '黑胜',
  '1/2-1/2': '和棋',
  '*': '未分胜负',
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * `11-23 19:40`. No year: these rows tell one game of a session apart from
 * another, and the file that gets written carries the full date.
 */
function finishedAt(at) {
  const date = new Date(at);
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The clock as minutes plus increment — 5+3, the way the picker writes it,
 * rather than the 300+3 seconds the TimeControl tag inside the file carries.
 */
function controlText(control) {
  if (!control) return '不限时';
  return `${Math.round(control.initial / 60000)}+${Math.round(control.increment / 1000)}`;
}

/** Who the player was up against, as far as a row of six dozen can say it. */
function opponentText(entry) {
  if (entry.mode === 'computer') {
    const label = LEVELS[entry.level]?.label;
    return label ? `电脑（${label}）` : '电脑';
  }
  // 在线和课堂都没有"这台设备上的你"：那两格各有各的名字，存档时就记下了（见 pgnNames）。
  if (entry.mode === 'online' || entry.mode === 'class') return `${entry.white} 对 ${entry.black}`;
  return '讲解两人'; // 同屏那一盘：两个颜色共用一台设备，没有名字可说
}

function scoreLine(entry) {
  return `${RESULT[entry.result] ?? entry.result} · ${opponentText(entry)}`;
}

function metaLine(entry) {
  return `${finishedAt(entry.at)} · ${entry.sans.length} 步 · ${controlText(entry.control)}`;
}

/**
 * Wire the panel to the board's chrome. It binds its own trigger button, so
 * main.js only has to mount it.
 *
 * @param {{
 *   showToast(text: string): void,
 *   askConfirm(
 *     details: {title: string, sub: string, confirmLabel: string},
 *     onConfirm: () => void,
 *   ): void,
 *   download(name: string, text: string): void, // hands a file to the browser
 * }} deps
 */
export function mountLibrary({ showToast, askConfirm, download }) {
  const el = {
    trigger: $('library-btn'),
    dialog: $('library-dialog'),
    bar: $('library-bar'),
    selectAll: $('library-select-all'),
    picked: $('library-picked'),
    list: $('library-list'),
    empty: $('library-empty'),
    exportBtn: $('library-export-btn'),
    clearBtn: $('library-clear-btn'),
    closeBtn: $('library-close-btn'),
  };

  /** What the list shows, newest first. */
  let entries = [];
  /** The games ticked since the panel last opened. */
  const picked = new Set();

  function paintPicked() {
    el.picked.textContent = picked.size ? `已选 ${picked.size} 局` : '还没勾选';
    el.exportBtn.disabled = picked.size === 0;
    el.selectAll.checked = entries.length > 0 && picked.size === entries.length;
  }

  function row(entry) {
    const li = document.createElement('li');
    li.className = 'library-row';

    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    // The delegated listener needs the id, and the label's own text is what
    // this checkbox is named by.
    box.dataset.id = entry.id;
    box.checked = picked.has(entry.id);

    const text = document.createElement('span');
    text.className = 'library-row-text';
    const score = document.createElement('span');
    score.className = 'library-score';
    score.textContent = scoreLine(entry);
    const meta = document.createElement('span');
    meta.className = 'library-meta';
    meta.textContent = metaLine(entry);

    text.append(score, meta);
    label.append(box, text);
    li.append(label);
    return li;
  }

  function render() {
    entries = loadLibrary();
    // A 清空, or a game that fell off the end of the list, must not leave a
    // tick on a row that is no longer there.
    const kept = new Set(entries.map((entry) => entry.id));
    for (const id of picked) if (!kept.has(id)) picked.delete(id);

    el.list.replaceChildren(...entries.map(row));
    el.bar.classList.toggle('hidden', entries.length === 0);
    el.list.classList.toggle('hidden', entries.length === 0);
    el.empty.classList.toggle('hidden', entries.length !== 0);
    paintPicked();
  }

  /** @returns {object[]} the ticked games, oldest first, as PGN wants them */
  function pickedGames() {
    // The list runs newest first, but a file of games reads the way the
    // session went, so the bundle is written in the order they were played.
    return entries
      .filter((entry) => picked.has(entry.id))
      .reverse()
      .map((entry) => ({
        sans: entry.sans,
        result: entry.result,
        white: entry.white,
        black: entry.black,
        date: new Date(entry.at),
        control: entry.control,
        termination: entry.termination,
      }));
  }

  function exportPicked() {
    const games = pickedGames();
    if (games.length === 0) return;
    const now = new Date();
    download(bundleFilename(now, games.length), bundlePgn(games));
    showToast(`已导出 ${games.length} 局棋谱。`);
  }

  el.trigger.addEventListener('click', () => {
    render();
    el.dialog.showModal();
    (entries.length ? el.selectAll : el.closeBtn).focus();
  });

  // One listener for the whole list: the rows are rebuilt every time the panel
  // opens, and a listener each would have to be added and thrown away with them.
  el.list.addEventListener('change', (e) => {
    const box = e.target;
    const id = box?.dataset?.id;
    if (!id) return;
    if (box.checked) picked.add(id);
    else picked.delete(id);
    paintPicked();
  });

  // Ticking 全选 rebuilds the rows rather than touching sixty checkboxes: the
  // rows come from the same render() a tick would have produced anyway.
  el.selectAll.addEventListener('change', () => {
    picked.clear();
    if (el.selectAll.checked) {
      for (const entry of entries) picked.add(entry.id);
    }
    render();
    el.selectAll.focus();
  });

  el.exportBtn.addEventListener('click', exportPicked);
  el.closeBtn.addEventListener('click', () => el.dialog.close());

  el.clearBtn.addEventListener('click', () => {
    askConfirm(
      {
        title: '清空棋谱库？',
        sub: `这 ${entries.length} 局会从这台设备上删掉。想留着的棋谱先导出。`,
        confirmLabel: '清空',
      },
      () => {
        // Delete from server in the background; failure is silent (the local
        // clear still happens, and server records will be overwritten on next
        // sync if the player adds new games).
        for (const entry of entries) {
          deleteFromServer(entry.id);
        }
        clearLibrary();
        picked.clear();
        render();
        showToast('棋谱库已清空。');
      },
    );
  });
}
