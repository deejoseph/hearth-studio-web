import './style.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import {
  createIcons,
  Cpu,
  User,
  Users,
  Globe,
  Plus,
  Undo2,
  Trophy,
  Flag,
  Handshake,
  Sun,
  Moon,
  Monitor,
  Copy,
  Check,
  Link,
  LogOut,
  ChevronDown,
  ChevronFirst,
  ChevronLeft,
  ChevronRight,
  ChevronLast,
  ClipboardCopy,
  Download,
  Library,
  Activity,
  Square,
  ArrowRight,
  Eraser,
  RotateCw,
  Trash2,
  Upload,
  School,
  Hand,
  ScanSearch,
  Target,
  Megaphone,
  MessageSquare,
  BadgeCheck,
  FlipVertical2,
  Volume2,
  VolumeX,
} from 'lucide';

import { Chess, colorOf, START_FEN } from './engine/chess.js';
import { chooseMove, LEVELS } from './engine/ai.js';
import { createStockfish, scoreToCentipawns } from './engine/stockfish.js';
import { canAnalyze, evalPercent, formatLine, formatScore, pvToSan } from './game/analysis.js';
import { BoardView, pieceUrl, pieceLabel } from './ui/boardView.js';
import { AnnotationOverlay } from './ui/annotations.js';
import { parsePgn, parseFen, detectFormat, startFenFromTags } from './game/pgnParser.js';
import {
  fenCore,
  moveLabels,
  positionAt as replayFrom,
  replayFens,
  variationLabels,
} from './game/position.js';
import { RoomGame, normalizeCode, POLL_MS, ROOM_MAX_TIME_MS } from './net/room.js';
import { ClassSession, normalizeClassCode, CLASS_POLL_MS } from './net/classroom.js';
import { problemText } from './net/auth.js';
import { mountAccount } from './ui/account.js';
import {
  Clock,
  DEFAULT_TIME_ID,
  LOW_TIME_MS,
  TIME_CONTROLS,
  formatClock,
  isTimeId,
  roomControl,
  speakClock,
  timeControl,
} from './game/clock.js';
import { buildPgn, buildAnnotatedPgn, bundleFilename, bundlePgn, pgnFilename } from './game/pgn.js';
import { addEntry, pushToServer, deleteFromServer, loadLibrary } from './game/library.js';
import { clearGame, loadGame, saveGame } from './game/persistence.js';
import { mountLibrary } from './ui/library.js';
import { mountCoachPref } from './ui/coachPref.js';
import { mountCoachProfile } from './ui/coachProfile.js';
import { mountCoachDirectory } from './ui/coachDirectory.js';
import { mountCoachLightbox } from './ui/coachLightbox.js';
import { mountCoachEnrollment } from './ui/coachEnrollment.js';
import { mountCoachComplaint } from './ui/coachComplaint.js';
import { mountCoachApp } from './ui/coachApp.js';
import { analyzeGame, CLASSIFY_ANNOT, CLASSIFY_LABEL, markFor } from './game/review.js';
import { mountReviewPanel, mountReviewProgress } from './ui/reviewPanel.js';
import { mountTacticsPanel } from './ui/tacticsPanel.js';
import { mountLearnPanel } from './ui/learnPanel.js';
import { mountCommunityPresence } from './ui/communityPresence.js';
import { normalizeBoardStyle, normalizePieceStyle, setPieceStyle } from './game/appearance.js';
import { moveSoundKind, playMoveSound, setMoveSoundEnabled, unlockMoveAudio } from './game/moveAudio.js';
import { identifyOpening } from './game/opening.js';
import { BASIC_PROBLEMS } from './game/basicProblems.js';
import { learnTopic } from './game/learnContent.js';
import { track } from './analytics.js';
import {
  appendToBranch,
  branchAt,
  clearBranches,
  existingMoveAt,
  findBranch,
  getActiveBranch,
  getBranches,
  getNode,
  isViewingBranch,
  navigateActiveBranch,
  pruneBranches,
  restoreBranches,
  setActiveBranch,
} from './game/variations.js';

createIcons({
  icons: {
    Cpu,
    User,
    Users,
    Globe,
    Plus,
    Undo2,
    Trophy,
    Flag,
    Handshake,
    Sun,
    Moon,
    Monitor,
    Copy,
    Check,
    Link,
    LogOut,
    ChevronDown,
    ChevronFirst,
    ChevronLeft,
    ChevronRight,
    ChevronLast,
    ClipboardCopy,
    Download,
    Library,
    Activity,
    Square,
    ArrowRight,
    Eraser,
    RotateCw,
    Trash2,
    Upload,
    School,
    Hand,
    ScanSearch,
    Target,
    Megaphone,
    MessageSquare,
    BadgeCheck,
    FlipVertical2,
    Volume2,
    VolumeX,
  },
});

const $ = (id) => document.getElementById(id);

const els = {
  board: $('board'),
  boardFrame: document.querySelector('.board-frame'),
  annotationToolbar: $('annotation-toolbar'),
  flipBoardBtn: $('flip-board-btn'),
  boardStyleSelect: $('board-style-select'),
  pieceStyleSelect: $('piece-style-select'),
  soundBtn: $('sound-btn'),
  resultBanner: $('result-banner'),
  topbarNote: $('topbar-note'),
  modeButtons: document.querySelectorAll('.mode-switch [data-mode]'),
  cardTop: $('card-top'),
  cardBottom: $('card-bottom'),
  topName: $('top-name'),
  topCaption: $('top-caption'),
  bottomName: $('bottom-name'),
  bottomCaption: $('bottom-caption'),
  topIconCpu: document.querySelector('#card-top .icon-cpu'),
  topIconUser: document.querySelector('#card-top .icon-user'),
  capturesTop: $('captures-top'),
  capturesBottom: $('captures-bottom'),
  materialTop: $('material-top'),
  materialBottom: $('material-bottom'),
  clockTop: $('clock-top'),
  clockBottom: $('clock-bottom'),
  movesCard: $('moves-card'),
  moveList: $('move-list'),
  movesEmpty: $('moves-empty'),
  pgnCopyBtn: $('pgn-copy-btn'),
  pgnDownloadBtn: $('pgn-download-btn'),
  reviewFirstBtn: $('review-first-btn'),
  reviewPrevBtn: $('review-prev-btn'),
  reviewNextBtn: $('review-next-btn'),
  reviewLastBtn: $('review-last-btn'),
  reviewNote: $('review-note'),
  analysisBtn: $('analysis-btn'),
  analysisPanel: $('analysis-panel'),
  openingRow: $('opening-row'),
  openingCode: $('opening-code'),
  openingName: $('opening-name'),
  evalFill: $('eval-fill'),
  evalScore: $('eval-score'),
  evalLines: $('eval-lines'),
  evalNote: $('eval-note'),
  reviewGameBtn: $('review-game-btn'),
  reviewProgressSection: $('review-progress-section'),
  reviewProgressContainer: $('review-progress-container'),
  reviewResultPanel: $('review-result-panel'),
  reviewPanelContainer: $('review-panel-container'),
  pgnSheet: $('pgn-sheet'),
  pgnBody: $('pgn-body'),
  tacticsBtn: $('tactics-btn'),
  tacticsDialog: $('tactics-dialog'),
  tacticsDialogTitle: $('tactics-dialog-title'),
  tacticsDialogStep: $('tactics-dialog-step'),
  tacticsDialogClose: $('tactics-dialog-close'),
  tacticsPanelContainer: $('tactics-panel-container'),
  tacticsBoardHost: $('tactics-board-host'),
  layout: document.querySelector('.layout'),
  srStatus: $('sr-status'),
  toast: $('toast'),
  controls: $('controls'),
  fieldRow: $('field-row'),
  levelField: $('level-field'),
  colorField: $('color-field'),
  colorLabel: $('color-label'),
  timeField: $('time-field'),
  levelSelect: $('level-select'),
  colorSelect: $('color-select'),
  timeSelect: $('time-select'),
  buttonRow: $('button-row'),
  newGameBtn: $('new-game-btn'),
  undoBtn: $('undo-btn'),
  drawBtn: $('draw-btn'),
  resignBtn: $('resign-btn'),
  leaveBtn: $('leave-btn'),
  drawOfferDialog: $('draw-offer-dialog'),
  drawAccept: $('draw-accept-btn'),
  drawReject: $('draw-reject-btn'),
  controlsHint: $('controls-hint'),
  onlineCard: $('online-card'),
  onlineIdle: $('online-idle'),
  onlineHosting: $('online-hosting'),
  onlineJoining: $('online-joining'),
  onlineInviteNote: $('online-invite-note'),
  onlineError: $('online-error'),
  hostBtn: $('host-btn'),
  hostBtnLabel: $('host-btn-label'),
  joinForm: $('join-form'),
  joinInput: $('join-input'),
  joinBtn: $('join-btn'),
  inviteCode: $('invite-code'),
  copyCodeBtn: $('copy-code-btn'),
  copyLinkBtn: $('copy-link-btn'),
  copyLinkLabel: $('copy-link-label'),
  cancelHostBtn: $('cancel-host-btn'),
  cancelJoinBtn: $('cancel-join-btn'),
  classCard: $('class-card'),
  classIdle: $('class-idle'),
  classActive: $('class-active'),
  classStudentPanel: $('class-student-panel'),
  classCreateBtn: $('class-create-btn'),
  classJoinForm: $('class-join-form'),
  classJoinInput: $('class-join-input'),
  classJoinBtn: $('class-join-btn'),
  classCodeDisplay: $('class-code-display'),
  classStudents: $('class-students'),
  classLeaveBtn: $('class-leave-btn'),
  classStudentStatus: $('class-student-status'),
  classHandBtn: $('class-hand-btn'),
  classStudentLeaveBtn: $('class-student-leave-btn'),
  classError: $('class-error'),
  promoDialog: $('promo-dialog'),
  gameoverDialog: $('gameover-dialog'),
  gameoverTitle: $('gameover-title'),
  gameoverSub: $('gameover-sub'),
  gameoverNew: $('gameover-new'),
  gameoverClose: $('gameover-close'),
  gameoverIcons: {
    win: $('gameover-icon-win'),
    loss: $('gameover-icon-loss'),
    draw: $('gameover-icon-draw'),
  },
  confirmDialog: $('confirm-dialog'),
  confirmTitle: $('confirm-title'),
  confirmSub: $('confirm-sub'),
  confirmYes: $('confirm-yes'),
  confirmNo: $('confirm-no'),
  accountDialog: $('account-dialog'),
  libraryDialog: $('library-dialog'),
  themeButtons: document.querySelectorAll('.theme-toggle [data-theme-choice]'),
};

const SETTINGS_KEY = 'chess-settings';
// Display values for material difference (knight/bishop both count as 3).
const DISPLAY_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };
// Online play is the room API (src/net/room.js): the server holds the position
// and the clocks, and this board asks it what it has missed every few seconds.
const MODES = ['computer', 'local', 'online', 'class'];
/** What each mode is called: the top bar note, the player cards, and the
 *  switch's confirm dialog. The buttons in index.html carry the short form.
 *  「讲解」是两个人守着一台设备（同屏讲棋），「课堂」是那个有 4 位码的多人课。 */
const MODE_LABELS = { computer: '电脑对弈', local: '讲解对弈', online: '在线对弈', class: '课堂对弈' };
/** Clock repaint rate. Tenths are shown when the time is low; this reads them. */
const CLOCK_TICK_MS = 100;
/** Shared by every board render that has nothing to highlight. */
const NO_TARGETS = new Map();

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const game = new Chess();
/**
 * 这一盘是从哪个局面开走的。导入带 [FEN] 的棋谱、或课堂里从残局摆开时，它就不是
 * 标准开局，而复盘和时间轴都得按它重放 —— 见 game/position.js。
 */
let gameOrigin = START_FEN;

/**
 * 把棋盘放到某个局面，并记住这盘棋由此开始。
 *
 * 换局面同时意味着复盘作废：那些分数是给刚才那串走法打的，留着等于把上一盘的
 * 结论贴到这一盘上——走法区和导出的棋谱都会照抄。
 */
function loadBoard(fen) {
  game.load(fen);
  gameOrigin = fen;
  clearReview();
  clearBranches();
}

/** 开新的一盘：回到标准开局。 */
function resetBoard() {
  game.reset();
  gameOrigin = START_FEN;
  clearReview();
  clearBranches();
}

let mode = 'computer'; // 'computer' | 'local' | 'online'
let myColor = 'w'; // side controlled at this device (computer & online modes)
let viewColor = 'w'; // 讲解模式从哪一方看棋盘：那一方在下面（默认白方）
let level = 'medium';
let colorSetting = 'w';
let timeSetting = DEFAULT_TIME_ID; // time control for the next game we start
let themeSetting = 'system';
let boardStyle = 'classic';
let pieceStyle = 'classic';
let soundEnabled = true;
let thinking = false;
let thinkingLevel = null; // level the in-flight search actually uses
let aiToken = 0;
let selected = null;
let targets = new Map();
let pendingToggleOff = false;
let promoResolve = null;
let gameOverTimer = 0;
let announcedPlies = 0;

// Clocks. `clock` belongs to the game on the board (an untimed game gets a
// disabled one), and `clockStack` holds each side's time as it stood at the
// start of every ply, which is what undo rewinds to.
let clock = new Clock(null);
let clockTimer = 0;
let clockStack = [];
let lowAnnounced = { w: false, b: false }; // said "time is low" this game

// Reviewing an earlier position. null means the board shows the live game;
// otherwise it is the number of plies being shown.
let reviewIndex = null;

// Whether anything is currently in storage, so a game that cannot be saved
// (online, finished, not started) only clears it once instead of every render.
let hasSave = true;

// What the move list was last scrolled for: where the board is in the game
// (main-line ply, or a point inside a variation) and the length of the game.
// While neither changes, the list keeps whatever scroll position the player has
// given it.
let movesShown = { seen: '', total: -1 };

/** How long a move the referee has not written down stays on the board as our
 *  guess. A reply can be lost with the move already recorded, which is why the
 *  wait exists at all — but the polls go on answering, and a game they never
 *  mention is a game that never arrived. Three of the usual polls. */
const SENT_MAX_MS = 3 * POLL_MS;

// Online play. `roomGame` holds the room and the cursor over its event list
// (net/room.js); the rest of this is the board's side of that conversation —
// which state the chrome shows, and which of the server's moves are already on
// the screen.
let onlineUiState = 'idle'; // 'idle'|'creating'|'hosting'|'joining'|'playing'|'ended'
let onlineReturnState = 'idle'; // where a failed create/join falls back to
let onlineEnd = null; // the verdict, in the referee's own words
let roomRole = null; // 'host' (we made the room) | 'guest' (we joined one)
let roomTimer = 0; // the interval that asks the server what we have missed
let appliedSeq = 0; // the last event the board is showing
let sentSan = null; // our move, on its way to the referee and not yet taken
let sentAt = 0; // when it went, so the wait for its echo has an end
let requestOut = false; // one call at a time: a slow host must not pile them up
let rebuilding = false; // the board is being replayed from the server's move list
let flagPollDone = false; // asked once already after a displayed clock hit zero
let classUiState = 'idle'; // 'idle'|'creating'|'joining'|'teaching'|'spectating'
let classTimer = 0;
let classAppliedSeq = 0; // last classroom event drawn on the board
let classSentSan = null; // our move, on its way to the server
let classSentAt = 0; // when it went, so a lost request cannot lock the board
let classYourHand = 'none'; // what this seat was told last, to notice a change
let classRequestOut = false; // one classroom call at a time
let classAnnotTimer = 0; // coalesces a teacher's strokes into one broadcast
let manualEnd = null; // {kind,title,sub} for ends the engine can't see (a flag fall)
/** The room's pending draw offer as last seen: {by, mine} or null. */
let drawOfferPending = null;
let drawRequestOut = false; // one offer/answer on its way at a time
let confirmAction = null;
let toastTimer = 0;
let copyCodeTimer = 0;
let copyLinkTimer = 0;

const colorName = (color) => (color === 'w' ? '白方' : '黑方');
/** The color as it goes into 执白 / 执黑, which is how a player says it. */
const side = (color) => (color === 'w' ? '白' : '黑');
const otherColor = (color) => (color === 'w' ? 'b' : 'w');
/** The PGN result for a game `winner` won. */
const resultFor = (winner) => (winner === 'w' ? '1-0' : '0-1');

/** The color shown at the bottom of the board. */
function bottomColor() {
  if (tacticsMode) return tacticsViewColor;
  // A classroom board belongs to the position, not to the person holding it:
  // both colours are played by whoever the server has authorised, so there is no
  // "my side" to turn the board around for.
  if (mode === 'class') return 'w';
  // 讲解时两个颜色都坐在这台设备前，棋盘朝谁翻开由讲解的人说了算：默认白方
  // 在下，点右边那张对局卡或画笔旁的翻转按钮都能把视角换过去。
  if (mode === 'local') return viewColor;
  return myColor;
}

/** 讲解模式下换视角：把某一方放到棋盘下面，棋盘和对局卡一起翻。 */
function setViewColor(color) {
  if (mode !== 'local' || color === viewColor) return;
  viewColor = color;
  boardView.setOrientation(bottomColor());
  renderAll();
  els.srStatus.textContent = `已换成${colorName(color)}视角。`;
}

function gameFinished() {
  return currentEnd() !== null;
}

/**
 * Is there a game on the board worth protecting from a stray click? One that
 * is still going and that the player has actually put moves into — against the
 * computer, the computer's own opening move does not count.
 */
function gameInProgress() {
  // A room or a class is owned by the server: switching modes leaves the
  // position in place and the code still works, so there is nothing to warn
  // the player about losing.
  if (mode === 'online' || mode === 'class' || gameFinished()) return false;
  if (mode === 'computer') return game.history().some((m) => m.color === myColor);
  return game.history().length > 0;
}

/**
 * The nickname of whoever holds `color`, as the room's row carries it, or null
 * while that seat is still empty.
 */
function seatName(color) {
  return roomGame.room?.players?.[color]?.nickname ?? null;
}

function opponentLabel() {
  return seatName(otherColor(myColor)) || '对方';
}

/**
 * How to name whoever plays `color`, in a sentence the player reads about
 * themselves. English needed a lower-case mid-sentence form and a capitalized
 * one; Chinese has no case, so this serves wherever the name lands.
 */
function sideName(color) {
  if (mode === 'local') return colorName(color);
  if (color === myColor) return '你';
  return mode === 'computer' ? '电脑' : opponentLabel();
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/*                                                                     */
/* Four events, each standing for something a player actually got out  */
/* of the app: a game played, a game seen through to its end, an       */
/* invite made, and a friend actually reaching the board. Both flags   */
/* reset with the board, so undo and repeated game-over renders cannot */
/* double-count.                                                       */
/* ------------------------------------------------------------------ */

let startTracked = false;
let endTracked = false;

function resetTracking() {
  startTracked = false;
  endTracked = false;
  archiveId = null;
}

/** A reset board is not a game — the first ply is what makes it one. */
function trackGameStart() {
  if (startTracked) return;
  startTracked = true;
  track('Game Started', {
    mode,
    level: mode === 'computer' ? level : null,
    clock: gameTimeId(),
  });
}

function trackGameEnd(end) {
  // Games that ended before anyone moved (an opponent leaving the lobby)
  // never happened as far as the numbers are concerned.
  if (endTracked || game.history().length === 0) return;
  endTracked = true;
  // `result` is this device's point of view. Pass & play has no "you", so a
  // decisive game there is always reported as a win.
  track('Game Completed', { mode, result: end.kind, reason: end.reason });
}

/* ------------------------------------------------------------------ */
/* The game library                                                    */
/* ------------------------------------------------------------------ */

/**
 * This game's row in the library, made once and kept, so a game that ends,
 * gets un-ended by an undo, and ends again updates one row rather than adding a
 * truncated one beside it. resetTracking() starts a new row with a new game.
 */
let archiveId = null;

/**
 * Keep the game that just ended for the library panel (see ui/library.js),
 * which is where a session's games get exported together.
 *
 * An online game counts even though it is never saved for a reload: the
 * scoresheet outlives the connection, and handing it over afterwards is the
 * reason it is stored at all.
 */
function archiveFinishedGame(end) {
  // A game that ended before anyone moved never happened — the same test
  // trackGameEnd uses.
  if (game.history().length === 0) return;

  const names = pgnNames();
  archiveId ??= `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const entry = {
    // Enough to tell two games apart on this device; nothing reaches a server.
    id: archiveId,
    at: Date.now(),
    mode,
    level: mode === 'computer' ? level : null,
    sans: game.history().map((m) => m.san),
    result: end.result,
    white: names.w,
    black: names.b,
    // A pair, the way persistence.js stores a clock: the object is put back by
    // parseEntry when the row is read.
    control: clock.control ? [clock.control.initial, clock.control.increment] : null,
    termination: end.termination,
  };
  addEntry(entry);
  // Push to server in the background; failure is silent (the game is still in
  // localStorage, and will sync on next login).
  pushToServer(entry);
}

function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (stored && LEVELS[stored.level]) level = stored.level;
    if (stored && ['w', 'b', 'random'].includes(stored.color)) colorSetting = stored.color;
    if (stored && isTimeId(stored.time)) timeSetting = stored.time;
    if (stored && ['light', 'dark', 'system'].includes(stored.theme)) {
      themeSetting = stored.theme;
    }
    if (stored && MODES.includes(stored.mode)) mode = stored.mode;
    if (stored) {
      boardStyle = normalizeBoardStyle(stored.boardStyle);
      pieceStyle = normalizePieceStyle(stored.pieceStyle);
      if (typeof stored.sound === 'boolean') soundEnabled = stored.sound;
    }
  } catch {
    // Corrupt or missing settings: keep defaults.
  }
  els.levelSelect.value = level;
  els.colorSelect.value = colorSetting;
  els.timeSelect.value = timeSetting;
  applyAppearance();
  updateSoundButton();
}

function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        level,
        color: colorSetting,
        time: timeSetting,
        theme: themeSetting,
        mode,
        boardStyle,
        pieceStyle,
        sound: soundEnabled,
      }),
    );
  } catch {
    // Storage unavailable (private browsing, denied permission): settings
    // still apply for this session, they just won't persist.
  }
}

function applyAppearance() {
  document.documentElement.dataset.boardStyle = boardStyle;
  setPieceStyle(pieceStyle);
  els.boardStyleSelect.value = boardStyle;
  els.pieceStyleSelect.value = pieceStyle;
}

function updateSoundButton() {
  setMoveSoundEnabled(soundEnabled);
  const label = soundEnabled ? '关闭音效' : '开启音效';
  els.soundBtn.setAttribute('aria-pressed', String(soundEnabled));
  els.soundBtn.setAttribute('aria-label', label);
  els.soundBtn.title = label;
}

/**
 * Fill the clock picker from TIME_CONTROLS, grouped the way the menu reads
 * (子弹 / 闪电 / 快速). Building it here rather than in the markup keeps
 * the ids that cross the wire and land in saved games in one place.
 */
function buildTimeOptions() {
  const groups = new Map();
  const items = [];
  for (const control of TIME_CONTROLS) {
    const option = document.createElement('option');
    option.value = control.id;
    option.textContent = control.label;
    if (!control.group) {
      items.push(option);
      continue;
    }
    let group = groups.get(control.group);
    if (!group) {
      group = document.createElement('optgroup');
      group.label = control.group;
      groups.set(control.group, group);
      items.push(group);
    }
    group.appendChild(option);
  }
  els.timeSelect.replaceChildren(...items);
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const effective =
    themeSetting === 'system' ? (systemDark.matches ? 'dark' : 'light') : themeSetting;
  document.documentElement.dataset.theme = effective;
  // The theme-color metas pick by OS scheme; when the in-app theme overrides
  // it, keep the browser chrome in sync with the page background.
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', bg);
  }
  for (const button of els.themeButtons) {
    const active = button.dataset.themeChoice === themeSetting;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

systemDark.addEventListener('change', () => {
  if (themeSetting === 'system') applyTheme();
});

/* ------------------------------------------------------------------ */
/* Clocks                                                              */
/*                                                                     */
/* The clock always belongs to the game on the board, and syncClock()   */
/* is what keeps that true: it is idempotent (re-asserting the side     */
/* already running charges nothing), so renderAll can simply call it    */
/* rather than every state change having to remember to.               */
/* ------------------------------------------------------------------ */

/** The id of the time control the game on the board is using. */
function gameTimeId() {
  return clock.control ? clock.control.id : DEFAULT_TIME_ID;
}

/** Put a fresh clock on the board. Takes a control, not an id, because an
 *  online game's control is built from the room's own number of milliseconds. */
function resetClock(control) {
  clock = new Clock(control);
  clockStack = [];
  lowAnnounced = { w: false, b: false };
}

/**
 * Whose move the clocks and the player cards should follow: the referee's while
 * an online game is on the board (our own guess is not the state of the game),
 * the engine's own reading everywhere else.
 */
function turnNow() {
  if (mode === 'online' && roomGame.room) return roomGame.room.turn;
  return game.turn();
}

function clockLive() {
  if (tacticsMode || gameFinished()) return false;
  if (mode === 'online') {
    // The referee starts the clock the moment the second player sits down, so
    // an online game is timed from the first snapshot rather than from the
    // first move — and the time it charges is the server's, not ours.
    return onlineUiState === 'playing';
  }
  // The clock starts with the first move. Nothing else marks the moment a game
  // is under way — the board is simply there, and picking a control or opening
  // the tab is not the same as sitting down to play — so charging the first
  // mover before a piece has moved would run a clock down while nobody is
  // playing, and could lose a game on time that was never started.
  return game.history().length > 0;
}

function syncClock() {
  clock.setRunning(clockLive() ? turnNow() : null);
  if (clock.running) startClockTimer();
  else stopClockTimer();
}

function startClockTimer() {
  if (!clockTimer) clockTimer = setInterval(onClockTick, CLOCK_TICK_MS);
}

function stopClockTimer() {
  clearInterval(clockTimer);
  clockTimer = 0;
}

function onClockTick() {
  renderClocks();
  announceLowTime();
  const flagged = clock.flagged();
  if (!flagged) {
    flagPollDone = false;
    return;
  }
  if (mode === 'online') {
    // A clock that reads zero on this screen is only an estimate — the referee
    // has the time that counts. Ask it once, and ask again only if the number
    // comes back above zero (its clock started from a later moment than ours).
    if (flagPollDone) return;
    flagPollDone = true;
    pollRoom();
    return;
  }
  handleFlagFall(flagged);
}

/**
 * The clock turning red says "you are nearly out of time" to anyone who can
 * see it; role="timer" is deliberately never announced, so nothing says it to
 * anyone who cannot. Say it once per side, as that side crosses the mark.
 */
function announceLowTime() {
  const running = clock.running;
  if (!running || lowAnnounced[running]) return;
  const ms = clock.remaining(running);
  // Nothing to warn about once the time is actually gone: the flag fall that
  // follows announces itself.
  if (ms <= 0 || ms >= LOW_TIME_MS) return;
  lowAnnounced[running] = true;
  els.srStatus.textContent = `${sideName(running)}的时间快用完了 —— 还剩${speakClock(ms)}。`;
}

function handleFlagFall(loser) {
  if (gameFinished()) return;
  clock.setRunning(null);
  stopClockTimer();
  // A search still running would otherwise land a move after the flag fell.
  aiToken++;
  thinking = false;
  endGameManually(describeTimeout(loser));
}

/**
 * End the game for a reason the engine cannot see: a flag fall here, a
 * resignation there. An online game's end never comes this way — the referee
 * has already written it down, and `endFromRoom` puts it on the board.
 */
function endGameManually(end) {
  manualEnd = end;
  revealEnd(end);
}

/**
 * Say that the game is over, whatever decided it. The dialog comes a moment
 * later than the board (see showEnd) so the last move is still visible when the
 * player looks back at it.
 */
function revealEnd(end) {
  finishPromotion(null);
  clearSelection();
  // A confirm dialog opened before the game ended — our own pending resign,
  // say — is stale now, and acting on it could overwrite this result.
  closeDialogs();
  els.srStatus.textContent = `${end.title} —— ${end.sub}`;
  renderAll();
  showEnd(end);
}

/**
 * The result of a flag fall. Running out of time loses — unless the opponent
 * could not deliver mate with what is left on the board, which under FIDE 6.9
 * makes the game a draw instead.
 */
function describeTimeout(loser) {
  const winner = otherColor(loser);
  const base = { reason: 'timeout', termination: 'time forfeit' };
  if (!game.hasMatingMaterial(winner)) {
    return {
      ...base,
      kind: 'draw',
      result: '1/2-1/2',
      title: '和棋',
      sub: `${sideName(loser)}的钟走完了，可${sideName(winner)}没法将死。`,
    };
  }
  const sub = `${sideName(loser)}的钟走完了。`;
  if (mode === 'local') {
    return {
      ...base,
      kind: 'win',
      result: resultFor(winner),
      title: `${colorName(winner)}获胜`,
      sub,
    };
  }
  return {
    ...base,
    kind: loser === myColor ? 'loss' : 'win',
    result: resultFor(winner),
    title: loser === myColor ? '你输了' : '你赢了',
    sub,
  };
}

/**
 * Move the clock on after `mover` played: remember where it stood so undo can
 * put it back, charge the time they spent, add the increment, and hand over.
 * Only for games this board keeps time for — an online game's clocks are the
 * server's, and are put on the board whole by applyRoomClock().
 */
function afterPlyApplied(move) {
  clockStack.push(clock.baseline());
  if (clock.enabled) {
    clock.setRunning(null); // charges the mover for the time they just spent
    if (clock.remaining(move.color) > 0) clock.addIncrement(move.color);
    // Hand over now rather than after the move animation, or every move would
    // hand the other side a few free tenths of a second.
    syncClock();
  }
  trackGameStart();
}

/* ------------------------------------------------------------------ */
/* Reviewing earlier positions                                         */
/* ------------------------------------------------------------------ */

function reviewing() {
  return reviewIndex !== null;
}

/** How many plies the board is showing — the whole game unless reviewing. */
function viewPlies() {
  return reviewIndex === null ? game.history().length : reviewIndex;
}

/** 主线现在的走法（SAN）：支线树里那些「顶掉第几手」都是按它数下标的。 */
function mainSans() {
  return game.history().map((move) => move.san);
}

/**
 * 棋盘显示的是哪几手，和支线树必须对得上。
 *
 * 主线会变短（撤销），支线树因此要跟着剪 —— 每画一次都先剪掉够不着的支线，再把
 * "正在看支线"这件事绑回主线：reviewIndex 就停在这条支线分叉出去的那一手之前 ——
 * 走法区因此一直高亮着分叉点，看得清是从哪里走岔的。
 */
function clampReview() {
  const total = game.history().length;
  pruneBranches(total);
  const view = getActiveBranch();
  if (view) {
    const root = getNode(view.path.slice(0, 1));
    reviewIndex = root ? Math.max(0, Math.min(root.branchIndex, total - 1)) : null;
  }
  if (reviewIndex !== null && reviewIndex >= total) reviewIndex = null;
}

/**
 * The position after `plies` moves of the current game, replayed from the
 * position this game actually started at. A whole game is a few hundred moves
 * and the engine makes short work of them, which is cheaper to keep correct
 * than a cache that would have to be invalidated every time the live game
 * moves on underneath it.
 */
function positionAt(plies) {
  return replayFrom(gameOrigin, game.history(), plies);
}

/** The position the board is showing: the live game, an earlier ply, or a branch. */
function shownPosition(plies) {
  const view = getActiveBranch();
  if (view) return branchPositionAt(view.path, view.ply) || game;
  return plies === game.history().length ? game : (positionAt(plies) || game);
}

/**
 * 支线第 `ply` 手之后的局面：先回到它的分叉点，再把这条线走 `ply` 手。
 * ply=0 就是分叉点本身 —— 那条支线一手都还没走。
 */
function branchPositionAt(path, ply) {
  const base = branchBasePosition(path);
  const node = getNode(path);
  if (!base || !node) return null;
  return replaySan(base.fen(), node.moves, ply);
}

/**
 * 这条支线是从哪个局面分出去的。
 *
 * 一层层往上算：挂在主线上的是主线第 branchIndex 手之后的局面，挂在支线下面的
 * 是父支线自己走到 branchIndex 处的局面 —— 子支线的下标是相对父支线数的。
 */
function branchBasePosition(path) {
  const node = getNode(path);
  if (!node) return null;
  if (path.length === 1) return positionAt(node.branchIndex);
  const parentPath = path.slice(0, -1);
  const parent = getNode(parentPath);
  const base = branchBasePosition(parentPath);
  if (!parent || !base) return null;
  return replaySan(base.fen(), parent.moves, node.branchIndex);
}

/** 从 `fen` 起把 SAN 走法走 `count` 手。走不通返回 null，不硬凑一个局面。 */
function replaySan(fen, sans, count) {
  const pos = new Chess(fen);
  for (let i = 0; i < count && i < sans.length; i++) {
    if (!pos.move(sans[i])) return null;
  }
  return pos;
}

/** How a ply is written in chess: "12." for White's move, "12…" for Black's. */
function plyLabel(plies) {
  return `${Math.ceil(plies / 2)}${plies % 2 === 1 ? '.' : '…'}`;
}

function goToPly(target) {
  const total = game.history().length;
  const plies = Math.max(0, Math.min(total, target));
  const next = plies === total ? null : plies;
  // Stepping through the main line leaves any branch view. See #107.
  const leftBranch = isViewingBranch();
  if (leftBranch) setActiveBranch(null);
  if (next === reviewIndex) {
    if (leftBranch) {
      renderAll();
      announceReview();
    }
    return;
  }
  reviewIndex = next;
  // A piece cannot stay picked up across a jump to another position.
  boardView.cancelDrag();
  clearSelection();
  renderAll();
  announceReview();
}

/**
 * 把棋盘切到某条支线的第 `ply` 手。
 *
 * reviewIndex 跟着钉在这条支线分叉出去的那一手之前：一来"在看旧局面"这个状态
 * 是靠它表达的（movableColorNow、attemptMove 都读它），二来走法区因此还亮着分叉
 * 点，看得清现在走的是哪条岔路。
 */
function enterBranch(path, ply) {
  if (!path.length) {
    setActiveBranch(null);
    renderAll();
    return true;
  }
  if (!setActiveBranch(path, ply)) return false;
  const root = getNode(path.slice(0, 1));
  reviewIndex = root ? Math.max(0, Math.min(root.branchIndex, game.history().length - 1)) : null;
  boardView.cancelDrag();
  clearSelection();
  return true;
}

/**
 * Move the view one step. While a branch is open the arrows walk inside that
 * line; otherwise they walk the main line (and drop out of any branch).
 */
function reviewNavigate(action) {
  if (analyzing && isViewingBranch()) {
    navigateActiveBranch(action);
    renderAll();
    announceReview();
    return;
  }
  const total = game.history().length;
  if (action === 'first') goToPly(0);
  else if (action === 'prev') goToPly(viewPlies() - 1);
  else if (action === 'next') goToPly(viewPlies() + 1);
  else if (action === 'last') goToPly(total);
}


function announceReview() {
  const plies = viewPlies();
  const view = analyzing ? getActiveBranch() : null;
  if (!reviewing()) {
    els.srStatus.textContent = '已回到最新局面。';
  } else if (view) {
    const node = getNode(view.path);
    const played = (node?.moves ?? []).slice(0, view.ply);
    if (!played.length) {
      els.srStatus.textContent = '支线的起点。';
    } else {
      // 支线里那一手的颜色，读显示局面的行棋方就行：分叉点可能落在任何一局任何
      // 一个先后手里，按主线奇偶算会算反。刚走完的那一手是它的对家。
      const shown = branchPositionAt(view.path, view.ply);
      const mover = shown ? (shown.turn() === 'w' ? 'b' : 'w') : null;
      els.srStatus.textContent = mover
        ? `支线上 —— ${colorName(mover)}走了 ${played[played.length - 1]}。`
        : `支线上 ${played.join(' ')}。`;
    }
  } else if (plies === 0) {
    els.srStatus.textContent = '开局局面。';
  } else {
    const move = game.history()[plies - 1];
    els.srStatus.textContent = `回看中 —— ${colorName(move.color)}走了 ${move.san}。`;
  }
}

/* ------------------------------------------------------------------ */
/* Analysing the position on the board                                 */
/*                                                                     */
/* Stockfish is opt-in, and only ever for a look: it is 1.8MB and takes */
/* 10-20 seconds to arrive on this site's connection, so nothing about  */
/* playing waits for it and nothing about playing depends on it.        */
/* ------------------------------------------------------------------ */

const ANALYSIS_TITLE = '用 Stockfish 分析棋盘上的局面';
const ANALYSIS_BLOCKED_TITLE = '在线对弈进行中不能分析 —— 等这一局结束再复盘。';
const ENGINE_LOAD_NOTE = '正在装载分析引擎……';
const ENGINE_FAIL_NOTE = '分析引擎没能加载 —— 下棋不受影响，稍后再按一下试试。';
/** What an ended position is called, in the one word the panel has room for. */
const END_TERM = {
  checkmate: '将死',
  stalemate: '逼和',
  'insufficient material': '子力不足',
  'fifty-move rule': '五十步',
  'threefold repetition': '三次重复',
};

let engine = null;
let engineStarting = null;
let analyzing = false;
// The position the engine last spoke about, so a render that changed nothing
// else cannot start a second search for the same one.
let analyzedFen = null;
// Bumped whenever analysis stops, so a boot or a search already on its way
// learns that the player has walked away from it.
let analysisToken = 0;

/**
 * An engine may look at a game while it is still going only when nobody is
 * waiting for their turn in it. Once an online game has ended, the player can
 * see what either side should have done.
 */
function analysisAllowed() {
  return !tacticsMode && canAnalyze({ mode, onlineUiState });
}

function setAnalysis(on) {
  if (analyzing === on) return;
  analyzing = on;
  els.analysisBtn.classList.toggle('btn-primary', on);
  els.analysisBtn.classList.toggle('btn-ghost', !on);
  els.analysisBtn.setAttribute('aria-pressed', String(on));
  els.analysisPanel.classList.toggle('hidden', !on);
  if (!on) {
    closeEngine();
    // 支线只在分析模式下能走，所以关掉分析就退出支线的 view。那些变化本身留着，
    // 下次开分析还在。退出支线时把棋盘送回最新的一手：关掉分析之后旧局面只是
    // 一张图片，留人站在那里没棋可走。
    if (isViewingBranch()) {
      setActiveBranch(null);
      reviewIndex = null;
    }
  }
  // 棋盘下面那份棋谱两边都要重画：开分析才点得动支线，关分析要看得见它变成只能看。
  renderAll();
  // 回到下棋：分析期间欠着电脑的那一手补上（见 afterMove 里让路的那句）。
  if (!on && !tacticsMode && mode === 'computer' && !thinking && !gameFinished() && game.turn() !== myColor) {
    computerTurn();
  }
}

function closeEngine() {
  analysisToken++;
  if (engine) engine.dispose();
  // A boot that is still in progress has no controller to close yet, but it
  // will have one a moment from now; hand it the same instruction then.
  else if (engineStarting) engineStarting.then((e) => e.dispose()).catch(() => {});
  engine = null;
  engineStarting = null;
  analyzedFen = null;
  clearAnalysis();
}

function clearAnalysis() {
  els.evalFill.style.width = `${evalPercent(null)}%`;
  els.evalScore.textContent = '';
  els.evalLines.replaceChildren();
  els.evalNote.textContent = '';
}

function renderOpening() {
  const opening = identifyOpening(gameOrigin, game.history());
  els.openingCode.textContent = opening?.eco || '—';
  els.openingName.textContent = opening?.name || '尚未识别';
  els.openingName.title = opening?.officialName || '';
  els.openingRow.classList.toggle('unrecognized', !opening?.eco);
}

/** Called from renderAll, so the engine follows whatever the board shows. */
function renderAnalysis(plies, position) {
  if (!analyzing || !analysisAllowed()) return;
  analyzePosition(plies, position);
}

/**
 * Ask about one position. Stepping through a game asks again as it goes: the
 * adapter stops the search that is running and drops anything the player has
 * already walked past, which is what keeps this responsive while an arrow key
 * is held down instead of leaving the engine working through stale plies.
 */
async function analyzePosition(plies, position) {
  const fen = position.fen();
  if (fen === analyzedFen) return;
  const token = analysisToken;
  const turn = position.turn();
  const status = position.status();
  if (status.over) {
    // The game is decided, so there is nothing to search and no line to show.
    analyzedFen = fen;
    els.evalFill.style.width = `${
      status.result === '1-0' ? 100 : status.result === '0-1' ? 0 : evalPercent(0)
    }%`;
    els.evalScore.textContent = END_TERM[status.reason] || '和棋';
    els.evalLines.replaceChildren();
    els.evalNote.textContent = '这一局已经结束了。';
    return;
  }
  analyzedFen = fen;
  els.evalNote.textContent = '正在分析……';
  try {
    const controller = await ensureEngine(token);
    if (!controller || token !== analysisToken) return;
    const result = await controller.analyze({
      fen,
      // Only the bar moves while the search deepens. The three lines are
      // written once, at the end, because turning each of their moves into SAN
      // means replaying it and there is no reason to replay a line three times
      // a second.
      onInfo: (info) => {
        // `analyzedFen` is the newest position asked for, so a report about
        // one the player has stepped past is dropped rather than painted over
        // the position now on the board.
        if (info.multipv === 1 && token === analysisToken && fen === analyzedFen) {
          paintEvaluation([info], turn);
        }
      },
    });
    if (token !== analysisToken || fen !== analyzedFen) return;
    paintEvaluation(result.lines, turn);
    paintLineTexts(result.lines, turn, plies, fen);
    els.evalNote.textContent = `已算到第 ${result.lines[0]?.depth ?? '…'} 层`;
  } catch (error) {
    // A later ply replaced this search; the one that superseded it is already
    // painting, so there is nothing to say about this one.
    if (error?.reason === 'superseded' || token !== analysisToken) return;
    analyzedFen = null;
    analyzing = false;
    els.analysisBtn.classList.toggle('btn-primary', false);
    els.analysisBtn.classList.toggle('btn-ghost', true);
    els.analysisBtn.setAttribute('aria-pressed', 'false');
    els.evalNote.textContent = ENGINE_FAIL_NOTE;
  }
}

async function ensureEngine(token, onNote = null) {
  if (engine) return engine;
  if (!engineStarting) {
    els.evalNote.textContent = ENGINE_LOAD_NOTE;
    onNote?.(ENGINE_LOAD_NOTE);
    engineStarting = createStockfish({
      onProgress: (progress) => {
        showDownloadProgress(token, progress);
        if (onNote) {
          const pct = progress?.percent ? Math.min(99, Math.round(progress.percent * 100)) : 0;
          onNote(pct ? `正在下载引擎 ${pct}%` : ENGINE_LOAD_NOTE);
        }
      },
    }).catch((err) => {
      // A failed download must not poison every later attempt: drop the
      // rejected promise so the next click starts a fresh download.
      engineStarting = null;
      throw err;
    });
  }
  const controller = await engineStarting;
  if (token !== analysisToken) {
    controller.dispose();
    return null;
  }
  engine = controller;
  engineStarting = null;
  return engine;
}

/**
 * The engine reports its own download, because the wasm arrives inside the
 * worker and the page cannot see that request. `percent` runs 0..1.
 */
function showDownloadProgress(token, progress) {
  if (token !== analysisToken || !analyzing || engine) return;
  const pct = progress?.percent ? Math.min(99, Math.round(progress.percent * 100)) : 0;
  els.evalNote.textContent = pct ? `正在下载引擎 ${pct}%` : ENGINE_LOAD_NOTE;
}

function paintEvaluation(lines, turn) {
  const top = [...lines].sort((a, b) => a.multipv - b.multipv)[0];
  if (!top) return;
  els.evalFill.style.width = `${evalPercent(scoreToCentipawns(top.score, turn))}%`;
  els.evalScore.textContent = formatScore(top.score, turn);
}

function paintLineTexts(lines, turn, plies, fen) {
  const items = [...lines].sort((a, b) => a.multipv - b.multipv);
  els.evalLines.replaceChildren(
    ...items.map((info) => {
      const li = document.createElement('li');
      li.className = 'eval-line';
      const score = document.createElement('span');
      score.className = 'eval-line-score';
      score.textContent = formatScore(info.score, turn);
      const moves = document.createElement('span');
      moves.className = 'eval-line-moves';
      moves.textContent = formatLine(pvToSan(new Chess(fen), info.pv), plies);
      li.append(score, moves);
      return li;
    }),
  );
}

/* ------------------------------------------------------------------ */
/* 复盘功能                                                            */
/* ------------------------------------------------------------------ */

let reviewData = null;
let reviewPanel = null;
let reviewProgress = null;
let reviewAnalyzing = false;
let reviewOpen = false;

/** 是否可以复盘：有走法记录且不在在线对弈中。 */
function canReview() {
  if (tacticsMode) return false;
  if (mode === 'online' && onlineUiState === 'playing') return false;
  return game.history().length > 0;
}

/** 更新复盘按钮状态。 */
function updateReviewButton() {
  const enabled = canReview() && !reviewAnalyzing;
  els.reviewGameBtn.disabled = !enabled;
  els.reviewGameBtn.title = enabled
    ? '用 Stockfish 逐手分析这盘棋'
    : (game.history().length === 0 ? '先走几步棋，或导入一局棋谱，才能复盘' : '在线对弈中不能复盘');
}

/** 复盘报告开着时按钮变蓝 —— 面板里点了「收起」也回灰。 */
function paintReviewToggle(on) {
  els.reviewGameBtn.classList.toggle('btn-primary', on);
  els.reviewGameBtn.classList.toggle('btn-ghost', !on);
  els.reviewGameBtn.setAttribute('aria-pressed', String(on));
}

/**
 * 显示/收起复盘报告。body 上的 review-open 让主区改为整页滚动：报告很长，
 * 不能再被棋盘列的剩余高度压成一条（那样只有内层小框在滚，正文看不到）。
 */
function setReviewReportOpen(open) {
  reviewOpen = open;
  els.reviewResultPanel.classList.toggle('hidden', !open);
  document.body.classList.toggle('review-open', open);
  paintReviewToggle(open);
}

/** 开始复盘分析。 */
async function startReview() {
  if (reviewAnalyzing || !canReview()) return;

  reviewAnalyzing = true;
  updateReviewButton();

  // 显示进度条
  els.reviewProgressSection.classList.remove('hidden');
  setReviewReportOpen(false);
  reviewProgress = mountReviewProgress(els.reviewProgressContainer);

  // Every position the game passed through, replayed the same way the review
  // timeline shows them, so the engine and the board agree on which ply a
  // score belongs to. A record that will not replay onto the board the player
  // is looking at stops here with a word: analysing the wrong positions would
  // only dress the mistake up as numbers.
  try {
    const history = game.history();
    const { fens, error } = replayFens(gameOrigin, history, game.fen());
    if (error) throw new Error(error);

    // 收集 UCI 格式的走法
    const moves = history.map((m) => m.from + m.to + (m.promotion || ''));

    // 确保引擎已加载
    const controller = await ensureEngine(analysisToken, (note) => reviewProgress?.setText(note));
    if (!controller) {
      throw new Error('无法加载分析引擎');
    }
    reviewProgress?.setText('正在分析...');

    // 批量分析
    const results = await analyzeGame(controller, fens, moves, {
      movetime: 400,
      onProgress: ({ current, total }) => {
        reviewProgress?.update(current, total);
      },
    });

    // 保存结果
    reviewData = {
      results,
      sans: history.map((m) => m.san),
      fens,
    };

    // 显示结果
    showReviewResults();
    // 走法区也按结论重画一次：不然符号要等你按一下上/下才出现。
    renderAll();

  } catch (err) {
    console.error('复盘分析失败:', err);
    showToast('复盘分析失败：' + (err.message || '未知错误'));
    els.reviewProgressSection.classList.add('hidden');
  } finally {
    reviewAnalyzing = false;
    updateReviewButton();
  }
}

/** 把已经算好的结论装进棋盘下方那份报告。 */
function showReviewResults() {
  els.reviewProgressSection.classList.add('hidden');
  setReviewReportOpen(true);
  reviewProgress?.destroy();
  reviewProgress = null;
  // 主线换段之后要重装一遍：面板里那份走法列表、曲线和小结都是按旧的结论建的。
  reviewPanel?.destroy();
  reviewPanel = mountReviewPanel(els.reviewPanelContainer, {
    results: reviewData.results,
    sans: reviewData.sans,
    gameOrigin,
    onPlyClick: (ply) => goToPly(ply),
    // 双人同屏（课堂、本地对战）时"你"没有意义，小结就按白方/黑方说
    viewerColor: mode === 'local' ? null : myColor,
  });
  reviewPanel.setCurrentPly(viewPlies());
}

/**
 * 清除复盘数据。支线不进这里：关闭复盘面板、或切到题库模式都不该把老师刚摆出来
 * 的变化抹掉，那两处只是不再显示。支线跟着棋盘局面走，见 loadBoard / resetBoard。
 */
function clearReview() {
  reviewData = null;
  reviewPanel?.destroy();
  reviewPanel = null;
  reviewProgress?.destroy();
  reviewProgress = null;
  els.reviewProgressSection.classList.add('hidden');
  setReviewReportOpen(false);
  els.reviewPanelContainer.innerHTML = '';
  els.reviewProgressContainer.innerHTML = '';
}

/** 更新复盘面板的当前局面高亮。 */
function updateReviewHighlight(ply) {
  reviewPanel?.setCurrentPly(ply);
}

/* ------------------------------------------------------------------ */
/* 题库功能                                                            */
/* ------------------------------------------------------------------ */

let tacticsPanel = null;
let tacticsMode = false;
let tacticsReturn = null;
let tacticsViewColor = 'w';
let learnPanel = null;
const tacticsBoardHome = {
  parent: document.querySelector('.board-column'),
  next: document.querySelector('.board-frame').nextSibling,
};

function canManageTactics() {
  return coachApp?.state() === 'approved';
}

function paintTacticsColumn() {
  document.body.classList.toggle('practice-open', tacticsMode);
  els.tacticsBtn.setAttribute('aria-pressed', String(tacticsMode));
}

function attachTacticsBoard() {
  els.tacticsBoardHost.appendChild(document.querySelector('.board-frame'));
}

function detachTacticsBoard() {
  const frame = document.querySelector('.board-frame');
  tacticsBoardHome.parent.insertBefore(frame, tacticsBoardHome.next);
}

/** 离开棋盘去做题前，把这一盘连钟、支线和复盘位置一起收好。 */
function saveTacticsReturn() {
  clock.setRunning(null);
  const activeBranch = getActiveBranch();
  return {
    origin: gameOrigin,
    moves: game.history().map((move) => ({
      from: move.from,
      to: move.to,
      promotion: move.promotion || null,
    })),
    myColor,
    viewColor,
    analyzing,
    clockControl: clock.control ? { ...clock.control } : null,
    clock: clock.enabled ? clock.snapshot() : null,
    clockStack: clockStack.map((pair) => ({ ...pair })),
    lowAnnounced: { ...lowAnnounced },
    manualEnd,
    reviewData,
    reviewOpen,
    reviewIndex,
    branches: getBranches(),
    activeBranch: activeBranch ? { path: [...activeBranch.path], ply: activeBranch.ply } : null,
    startTracked,
    endTracked,
    archiveId,
    announcedPlies,
  };
}

function restoreTacticsReturn() {
  const saved = tacticsReturn;
  if (!saved) return;
  loadBoard(saved.origin);
  for (const move of saved.moves) {
    game.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
  }
  restoreBranches(saved.branches);
  if (saved.activeBranch) setActiveBranch(saved.activeBranch.path, saved.activeBranch.ply);
  myColor = saved.myColor;
  viewColor = saved.viewColor;
  reviewIndex = saved.reviewIndex;
  reviewData = saved.reviewData;
  manualEnd = saved.manualEnd;
  startTracked = saved.startTracked;
  endTracked = saved.endTracked;
  archiveId = saved.archiveId;
  announcedPlies = saved.announcedPlies;
  clock = new Clock(saved.clockControl);
  clockStack = saved.clockStack;
  lowAnnounced = saved.lowAnnounced;
  if (clock.enabled) clock.restore(saved.clock);
  if (reviewData) {
    showReviewResults();
    setReviewReportOpen(saved.reviewOpen);
  }
  tacticsReturn = null;
  tacticsViewColor = 'w';
  clearSelection();
  boardView.setOrientation(bottomColor());
}

/** 题库人人都能解题；只有教练资格控制导入和题目集管理。 */
function openTactics(topicId = null) {
  if (tacticsMode) {
    if (topicId && tacticsPanel) openPractice(topicId);
    return;
  }
  if (reviewAnalyzing) {
    showToast('复盘还在计算，算完再来做题。');
    return;
  }
  const onlineActive = ['creating', 'hosting', 'joining', 'playing'].includes(onlineUiState);
  const classActive = ['creating', 'joining', 'teaching', 'spectating'].includes(classUiState);
  if (onlineActive || classActive) {
    showToast('先离开在线对弈或课堂，再来做题 —— 棋盘要跟着那边更新。');
    return;
  }

  tacticsReturn = saveTacticsReturn();
  tacticsMode = true;
  aiToken++;
  thinking = false;
  reviewIndex = null;
  if (analyzing) setAnalysis(false);
  clearReview();

  paintTacticsColumn();
  attachTacticsBoard();
  els.tacticsDialog.classList.remove('lesson-mode');
  els.tacticsDialogTitle.textContent = '国际象棋练习';
  els.tacticsDialogStep.textContent = '完整题库 · 在棋盘上走出答案';
  tacticsPanel.setCanManage(canManageTactics());
  tacticsPanel.selectAll();
  if (!els.tacticsDialog.open) els.tacticsDialog.showModal();
  if (topicId) openPractice(topicId);
  if (account.player() && coachApp?.state() == null) void coachApp.refresh();
}

/** 教程练习只在本章推荐题内切换，不跳到其他章节。 */
function openPractice(topicId) {
  const topic = learnTopic(topicId);
  if (!topic?.practiceIds?.length) {
    showToast('这节课的练习暂时没找到。');
    return false;
  }
  if (!tacticsMode) {
    openTactics();
    if (!tacticsMode) return false;
  }
  if (!tacticsPanel?.selectLesson(topic.practiceIds)) {
    showToast('这节课的练习暂时没找到。');
    return false;
  }
  els.tacticsDialog.classList.add('lesson-mode');
  els.tacticsDialogTitle.textContent = `练一练：${topic.label}`;
  els.tacticsDialogStep.textContent = `本节 ${topic.practiceIds.length} 题 · 在棋盘上走出答案`;
  if (!els.tacticsDialog.open) els.tacticsDialog.showModal();
  return true;
}

/** 收起题库并恢复原来的对局；面板本身留着，下次还是刚才那道题。 */
function closeTactics() {
  if (!tacticsMode) return;
  const resumeAnalysis = tacticsReturn?.analyzing ?? false;
  tacticsMode = false;
  if (els.tacticsDialog.open) els.tacticsDialog.close();
  detachTacticsBoard();
  restoreTacticsReturn();
  paintTacticsColumn();
  renderAll();
  if (resumeAnalysis && !analyzing) setAnalysis(true);
  else if (mode === 'computer' && !thinking && !gameFinished() && game.turn() !== myColor) computerTurn();
}

/** 换模式或开新局时丢弃快照，不能把上一盘恢复回来。 */
function clearTactics() {
  const wasOpen = tacticsMode;
  tacticsMode = false;
  if (els.tacticsDialog.open) els.tacticsDialog.close();
  if (wasOpen) detachTacticsBoard();
  tacticsReturn = null;
  tacticsViewColor = 'w';
  paintTacticsColumn();
  if (tacticsPanel) tacticsPanel.selectAll();
}

/** 更新题库面板的当前局面。 */
function updateTacticsHighlight(plies) {
  // 题库模式下，当棋盘局面变化时更新面板
  if (tacticsPanel && tacticsMode) {
    const state = tacticsPanel.getState();
    if (state && state.problems.length > 0) {
      const problem = state.problems[state.currentIndex];
      if (problem) {
        // 检查当前局面是否与题目局面匹配
        const currentFen = game.fen();
        if (currentFen !== problem.fen) {
          // 局面不匹配，可能是玩家走了其他棋
          // 这里可以添加提示逻辑
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Saving a game in progress                                           */
/* ------------------------------------------------------------------ */

/**
 * Keep storage in step with the board. Called from renderAll, so no state
 * change can forget to; also called when the page is hidden or leaving, which
 * is the only way a clock reading taken mid-move gets stored.
 */
function saveNow() {
  if (tacticsMode) return;
  if (mode === 'online' || gameFinished() || game.history().length === 0) {
    // Nothing worth resuming: an online game cannot outlive its connection, a
    // finished one should not greet the player as if it were still going, and
    // an untouched board is what a fresh visit gets anyway.
    if (hasSave) {
      clearGame();
      hasSave = false;
    }
    return;
  }
  saveGame({
    mode,
    myColor,
    time: gameTimeId(),
    moves: game.history().map((m) => ({ from: m.from, to: m.to, promotion: m.promotion })),
    clock: clock.enabled ? clock.snapshot() : null,
    clockStack: clock.enabled ? clockStack : [],
  });
  hasSave = true;
}

/**
 * Put back the game stored by an earlier visit. Returns false when there is
 * nothing to restore, or when what is there doesn't replay — in which case the
 * caller starts a new game as usual.
 */
function restoreGame() {
  const saved = loadGame();
  if (!saved || saved.mode !== mode) return false;

  let ok = true;
  try {
    resetBoard();
    for (const move of saved.moves) {
      if (!game.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' })) {
        ok = false;
        break;
      }
    }
  } catch {
    ok = false; // malformed squares throw inside the engine
  }
  // Finished games are not stored, so one showing up here means the save was
  // written by something else; don't trust the rest of it either.
  if (ok && game.isGameOver()) ok = false;
  if (!ok) {
    resetBoard();
    clearGame();
    hasSave = false;
    return false;
  }

  aiToken++;
  thinking = false;
  myColor = saved.myColor;
  manualEnd = null;
  reviewIndex = null;
  resetClock(timeControl(saved.time));
  if (clock.enabled && saved.clock) clock.restore(saved.clock);
  if (clock.enabled) clockStack = saved.clockStack.map((c) => ({ ...c }));
  // A stored game has moves, so it was already counted as started.
  resetTracking();
  startTracked = true;
  finishPromotion(null);
  clearSelection();
  closeDialogs();
  boardView.setOrientation(bottomColor());
  announcedPlies = game.history().length;
  els.srStatus.textContent =
    mode === 'local'
      ? `棋局已接上。${colorName(game.turn())}走。`
      : `棋局已接上。你执${side(myColor)}。`;
  renderAll();
  showToast('接着上次未完的一局。', { onlyIfIdle: true });
  if (mode === 'computer' && game.turn() !== myColor) computerTurn();
  return true;
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const boardView = new BoardView(els.board, { onSquarePress, onDrop, onSquareActivate });

const annotationOverlay = new AnnotationOverlay(els.boardFrame, {
  getFen: () => shownPosition(viewPlies()).fen(),
  getOrientation: () => boardView.orientation,
});

// Wire up annotation toolbar
els.annotationToolbar.addEventListener('click', (e) => {
  const toolBtn = e.target.closest('[data-tool]');
  const colorBtn = e.target.closest('[data-color]');
  const clearBtn = e.target.closest('#annotation-clear');
  const flipBtn = e.target.closest('#flip-board-btn');

  if (toolBtn) {
    const tool = toolBtn.dataset.tool;
    const isAlreadySelected = toolBtn.getAttribute('aria-pressed') === 'true';
    if (isAlreadySelected) {
      // Toggle off: deselect tool, return to normal move mode
      annotationOverlay.setTool(null);
      els.annotationToolbar.querySelectorAll('[data-tool]').forEach((btn) => {
        btn.setAttribute('aria-pressed', 'false');
      });
    } else {
      // Select tool
      annotationOverlay.setTool(tool);
      els.annotationToolbar.querySelectorAll('[data-tool]').forEach((btn) => {
        btn.setAttribute('aria-pressed', btn === toolBtn ? 'true' : 'false');
      });
      // When activating arrow tool, deselect any selected piece
      if (tool === 'arrow') {
        selected = null;
        targets = NO_TARGETS;
      }
    }
    toolBtn.blur();
  } else if (colorBtn) {
    const color = colorBtn.dataset.color;
    annotationOverlay.setColor(color);
    els.annotationToolbar.querySelectorAll('[data-color]').forEach((btn) => {
      const isSelected = btn === colorBtn;
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      const colorName = btn.title;
      btn.setAttribute('aria-label', isSelected ? `${colorName}（当前选中）` : colorName);
    });
    colorBtn.blur();
  } else if (clearBtn) {
    annotationOverlay.clearAll();
    clearBtn.blur();
  } else if (flipBtn) {
    setViewColor(otherColor(viewColor));
    flipBtn.blur();
  }
});

// 讲解模式下两张对局卡就是视角开关：点（或按回车/空格）哪一方，棋盘就把哪一方
// 翻到下面。其余模式里 renderPlayers 会把 role/tabindex 摘掉，这里也就什么也不做。
for (const card of [els.cardTop, els.cardBottom]) {
  card.addEventListener('click', () => {
    if (card.dataset.color) setViewColor(card.dataset.color);
  });
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (card.getAttribute('role') !== 'button' || !card.dataset.color) return;
    e.preventDefault();
    setViewColor(card.dataset.color);
  });
}

// Import dialog
const importDialog = $('import-dialog');
const importTextarea = $('import-textarea');
const importError = $('import-error');
const importBtn = $('import-btn');
const importConfirm = $('import-confirm');
const importCancel = $('import-cancel');

importBtn.addEventListener('click', () => {
  importTextarea.value = '';
  importError.classList.add('hidden');
  importDialog.showModal();
});

importCancel.addEventListener('click', () => {
  importDialog.close();
});

importConfirm.addEventListener('click', () => {
  const text = importTextarea.value.trim();
  if (!text) {
    importError.textContent = '请输入 PGN 或 FEN 字符串';
    importError.classList.remove('hidden');
    return;
  }

  const format = detectFormat(text);
  if (format === 'fen') {
    const result = parseFen(text);
    if (!result.valid) {
      importError.textContent = 'FEN 格式无效';
      importError.classList.remove('hidden');
      return;
    }
    // Load FEN position
    loadBoard(result.fen);
    reviewIndex = null;
    selected = null;
    targets = NO_TARGETS;
    announcedPlies = 0;
    importDialog.close();
    renderAll();
  } else if (format === 'pgn') {
    const result = parsePgn(text);
    if (result.moves.length === 0) {
      importError.textContent = 'PGN 中未找到有效走法';
      importError.classList.remove('hidden');
      return;
    }
    // [FEN] 说了算：这类棋谱是从棋盘中间某一格开走的，硬按标准开局重放会把
    // 每一手都记错位置。先在一份草稿上试通整串走法，走通了才动玩家的棋盘，
    // 免得报一半错留下走过一半的局面。
    const fenTag = String(result.tags.FEN || '').trim();
    const startFen = startFenFromTags(result.tags);
    // 读不懂的 [FEN] 不能当它不存在：棋谱明说了这盘是从中间开走的，退回标准
    // 开局重放就又回到"每一手都记错位置"那个毛病上。 SetUp "0" 是另一回事，
    // 它明说了用标准开局，FEN 只是附带的参考。
    if (fenTag && result.tags.SetUp !== '0' && !startFen) {
      importError.textContent = 'PGN 的 [FEN] 标签不是合法局面';
      importError.classList.remove('hidden');
      return;
    }
    let draft;
    try {
      draft = new Chess(startFen || START_FEN);
    } catch {
      importError.textContent = 'PGN 的 [FEN] 标签不是合法局面';
      importError.classList.remove('hidden');
      return;
    }
    for (const san of result.moves) {
      if (!draft.move(san)) {
        importError.textContent = startFen ? `按 [FEN] 的开局走不通: ${san}` : `无效走法: ${san}`;
        importError.classList.remove('hidden');
        return;
      }
    }
    if (startFen) loadBoard(startFen);
    else resetBoard();
    for (const san of result.moves) game.move(san);
    reviewIndex = null;
    selected = null;
    targets = NO_TARGETS;
    announcedPlies = game.history().length;
    importDialog.close();
    renderAll();
  } else {
    importError.textContent = '无法识别的格式，请输入 PGN 或 FEN';
    importError.classList.remove('hidden');
  }
});

/**
 * renderAll 画走法区，而 setAnalysis 又要 renderAll（走法区按分析模式决定画不画
 * 支线）。在画的过程中被关掉分析就会重入一层，所以这面旗让重入的那次直接返回：
 * 状态已经改好了，正在跑的那一遍会照新状态画完。
 */
let renderingAll = false;

function renderAll() {
  if (renderingAll) return;
  renderingAll = true;
  try {
    paint();
  } finally {
    renderingAll = false;
  }
}

function paint() {
  clampReview();
  // 在线对弈要等人时不该开着引擎，所以在这里自动关掉。要赶在画图之前：棋盘下面那份
  // 棋谱的支线是按分析模式画的，画完了才关掉就会把能点的支线留在屏上。
  if (analyzing && !analysisAllowed()) setAnalysis(false);
  // Before anything is drawn, so the clocks are painted in the state they are
  // actually in rather than the one they were in a moment ago.
  syncClock();
  const plies = viewPlies();
  const live = !reviewing();
  // The board shows the position being reviewed; everything that describes the
  // game as it stands — the player cards, the clocks, the result — stays live.
  const shown = shownPosition(plies);
  const liveStatus = game.status();
  const shownStatus = live ? liveStatus : shown.status();
  const shownLast = shown.lastMove();

  boardView.render({
    board: shown.board(),
    // In analysis mode while reviewing, allow piece selection for creating
    // variations (see #107).
    selected: (live || (analyzing && reviewing())) ? selected : null,
    targets: (live || (analyzing && reviewing())) ? targets : NO_TARGETS,
    lastMove: shownLast ? { from: shownLast.from, to: shownLast.to } : null,
    checkSquare: shownStatus.check ? shown.kingSquare(shownStatus.turn) : null,
  });
  els.board.classList.toggle('reviewing', !live);
  annotationOverlay._render();

  renderPlayers();
  renderClocks();
  renderCaptures(plies);
  renderMoves(plies);
  renderNotation(plies);
  scrollNotationIntoView();
  renderReviewBar(plies);
  renderOpening();
  renderAnalysis(plies, shown);
  updateReviewButton();
  updateReviewHighlight(plies);
  renderBanner();
  announceState(liveStatus, game.lastMove());

  els.undoBtn.disabled = !canUndo();
  updateModeUi();
  saveNow();
}

/** Undo takes back from the live position, so it is off while reviewing. */
function canUndo() {
  if (tacticsMode || mode === 'online' || reviewing()) return false;
  if (mode === 'computer') {
    return !thinking && game.history().some((m) => m.color === myColor);
  }
  return game.history().length > 0;
}

/** Tell assistive technology about moves, check, and game results. */
function announceState(status, lastMove) {
  const plies = game.history().length;
  if (plies === announcedPlies) return;
  let text;
  if (plies < announcedPlies) {
    text = '已悔棋。';
  } else {
    text = `${sideName(lastMove.color)}走了 ${lastMove.san}。`;
    // The verdict the app is standing behind, not the engine's opinion: an
    // online game has not ended until the referee says it has, and its words
    // are the server's. revealEnd() says it again when the end arrives without
    // a move attached to it.
    const end = currentEnd();
    playMoveSound(moveSoundKind(lastMove, end ? { ...status, over: true } : status));
    if (end) text += `${end.title}。${end.sub}`;
    else if (status.check) text += '将军。';
  }
  announcedPlies = plies;
  els.srStatus.textContent = text;
}

function renderPlayers() {
  const bottom = bottomColor();
  const top = otherColor(bottom);
  const finished = gameFinished();
  const turn = turnNow();

  let topIsCpu = false;
  if (tacticsMode) {
    els.topName.textContent = colorName(top);
    els.topCaption.textContent = turn === top ? '由你走' : '等待';
    els.bottomName.textContent = colorName(bottom);
    els.bottomCaption.textContent = turn === bottom ? '由你走' : '等待';
  } else if (mode === 'computer') {
    topIsCpu = true;
    els.topName.textContent = '电脑';
    els.topCaption.textContent = thinking
      ? `${LEVELS[thinkingLevel].label} · 思考中`
      : LEVELS[level].label;
    els.bottomName.textContent = '你';
    els.bottomCaption.textContent = `执${side(bottom)}`;
  } else if (mode === 'local' || mode === 'class') {
    // Nobody at this device holds a colour: the board belongs to the class, and
    // whose turn it is to touch it comes from the server ply by ply.
    els.topName.textContent = colorName(top);
    els.topCaption.textContent = MODE_LABELS[mode];
    els.bottomName.textContent = colorName(bottom);
    els.bottomCaption.textContent = MODE_LABELS[mode];
  } else {
    // The nicknames are the room's own row, so a player sees the name they
    // chose rather than "Opponent" — and the empty seat still has a name.
    els.topName.textContent = seatName(top) || opponentLabel();
    els.topCaption.textContent = `执${side(top)}`;
    els.bottomName.textContent = seatName(bottom) || '你';
    els.bottomCaption.textContent = `执${side(bottom)}`;
  }
  els.topIconCpu?.classList.toggle('hidden', !topIsCpu);
  els.topIconUser?.classList.toggle('hidden', topIsCpu);

  // 讲解模式下两张对局卡可以点：点哪一方，棋盘就把哪一方翻到下面。它说的是
  // "视角"，和 .active（轮到谁走）不是一回事，所以只标可点状态和当前那只。
  const pickable = mode === 'local';
  for (const [card, color] of [
    [els.cardTop, top],
    [els.cardBottom, bottom],
  ]) {
    card.dataset.color = color;
    card.classList.toggle('pickable', pickable);
    if (!pickable) {
      card.removeAttribute('role');
      card.removeAttribute('tabindex');
      card.removeAttribute('aria-pressed');
      card.removeAttribute('aria-label');
      card.removeAttribute('title');
      continue;
    }
    const viewing = color === bottom; // 在下面那张就是当前的视角
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-pressed', String(viewing));
    card.setAttribute(
      'aria-label',
      viewing ? `${colorName(color)}：当前视角` : `换到${colorName(color)}视角`,
    );
    card.title = viewing ? '当前视角' : `点一下，换成${colorName(color)}视角`;
  }

  els.cardTop.classList.toggle('thinking', mode === 'computer' && thinking);
  els.cardTop.classList.toggle('active', !finished && turn === top);
  els.cardBottom.classList.toggle('active', !finished && turn === bottom);
}

function renderCaptures(plies) {
  const bottom = bottomColor();
  const byBottom = [];
  const byTop = [];
  // Only what has been captured in the position on the board, so a reviewed
  // position and the pieces beside it describe the same moment.
  for (const move of game.history().slice(0, plies)) {
    if (!move.captured) continue;
    (move.color === bottom ? byBottom : byTop).push(move.captured);
  }
  const value = (list) =>
    list.reduce((sum, piece) => sum + DISPLAY_VALUES[piece.toLowerCase()], 0);
  const fill = (el, list) => {
    list.sort(
      (a, b) => DISPLAY_VALUES[b.toLowerCase()] - DISPLAY_VALUES[a.toLowerCase()],
    );
    el.replaceChildren(
      ...list.map((piece) => {
        const img = document.createElement('img');
        img.src = pieceUrl(piece);
        img.alt = pieceLabel(piece);
        return img;
      }),
    );
  };
  fill(els.capturesBottom, byBottom);
  fill(els.capturesTop, byTop);
  const diff = value(byBottom) - value(byTop);
  els.materialBottom.textContent = diff > 0 ? `+${diff}` : '';
  els.materialTop.textContent = diff < 0 ? `+${-diff}` : '';
}

function renderMoves(plies) {
  const history = game.history();
  els.movesEmpty.classList.toggle('hidden', history.length > 0);
  // Which ply holds the keyboard. The list is rebuilt whole, so without this a
  // move activated from it — or one arriving from the opponent — would drop
  // focus to the top of the page, and the next Tab would start over.
  const focusedEl = els.moveList.contains(document.activeElement) ? document.activeElement : null;
  const focusedSel = focusedEl?.dataset.ply
    ? `button.ply[data-ply="${focusedEl.dataset.ply}"]`
    : '';
  // 按回合号分组：标准开局从 1 开始白方先走，但导入带 [FEN] 的残局或从黑方
  // 先走的局面开局时，ply 0 是黑方的第一手。用 moveLabels 从引擎读回合号和行棋方，
  // 不再按 ply/2 硬算。
  const labels = moveLabels(gameOrigin, history);
  const rows = [];
  let cur = null;
  for (let i = 0; i < history.length; i++) {
    const lbl = labels[i] ?? { number: Math.floor(i / 2) + 1, white: i % 2 === 0 };
    if (!cur || cur.number !== lbl.number) {
      cur = { number: lbl.number, whitePly: null, blackPly: null };
      rows.push(cur);
    }
    if (lbl.white) cur.whitePly = { ply: i, move: history[i] };
    else cur.blackPly = { ply: i, move: history[i] };
  }
  const domRows = [];
  for (const row of rows) {
    const li = document.createElement('li');
    li.className = `move-row${row.number % 2 === 1 ? ' shade' : ''}`;
    const num = document.createElement('span');
    num.className = 'num';
    // 白方空着（黑方先走的局面）时显示 `1...` 而不是 `1.`
    num.textContent = row.whitePly ? `${row.number}.` : `${row.number}...`;
    li.appendChild(num);
    for (const slot of [row.whitePly, row.blackPly]) {
      if (!slot) {
        // 这一手空着：占位符，让两列对齐。
        li.appendChild(Object.assign(document.createElement('span'), { className: 'ply' }));
        continue;
      }
      const j = slot.ply;
      const move = slot.move;
      const ply = document.createElement('button');
      ply.type = 'button';
      ply.className = 'ply';
      ply.textContent = move.san;
      ply.dataset.ply = String(j + 1);
      // 复盘跑过之后，走法区也按结论上色：教练在棋谱上怎么写，这里就怎么写。
      const verdict = reviewData?.results?.[j];
      const mark = verdict ? markFor(verdict) : '';
      if (mark) {
        ply.classList.add(CLASSIFY_ANNOT[verdict.classification]);
        const markEl = document.createElement('span');
        markEl.className = 'review-mark';
        markEl.textContent = mark;
        ply.appendChild(markEl);
      }
      ply.setAttribute(
        'aria-label',
        `${colorName(move.color)}的第 ${row.number} 手，${move.san}` +
          (mark ? `，${CLASSIFY_LABEL[verdict.classification]}` : ''),
      );
      if (j + 1 === plies) {
        ply.classList.add('current');
        ply.setAttribute('aria-current', 'true');
      }
      li.appendChild(ply);
    }
    domRows.push(li);
  }
  els.moveList.replaceChildren(...domRows);
  // Put the keyboard back on the same ply. Scrolling is left to the lines
  // below, which know which move the board is showing.
  if (focusedSel) {
    els.moveList.querySelector(focusedSel)?.focus({ preventScroll: true });
  }
  // Scroll only when the move on the board has changed. The list is rebuilt on
  // every render — picking up a piece is one — and a player who has scrolled
  // up to look over the opening should not be yanked back down for it.
  const seen = `m${plies}`;
  if (seen !== movesShown.seen || history.length !== movesShown.total) {
    movesShown = { seen, total: history.length };
    scrollMoveIntoView();
  }
}

/**
 * 棋盘正下方那份棋谱：主线 + 括号里的支线，写法照 PGN，和导出的文件一模一样。
 *
 * 走法区不写这些 —— 它是记录本，只记走出来的那一条线；另一条线写在这里，要看的
 * 时候点一下就能跳过去（导出的 PGN 走的是 game/pgn.js 里同一套括号规则）。
 * 只在分析开着时出现：支线是分析里记下的变化，关了分析就是下棋，棋盘下面留走法。
 */
function renderNotation(plies) {
  const branches = analyzing ? getBranches() : [];
  els.pgnSheet.classList.toggle('hidden', branches.length === 0);
  if (branches.length === 0) {
    els.pgnBody.replaceChildren();
    return;
  }
  const view = getActiveBranch();
  const sans = mainSans();
  const labels = moveLabels(gameOrigin, sans);
  const byIndex = new Map();
  for (const node of branches) {
    if (!byIndex.has(node.branchIndex)) byIndex.set(node.branchIndex, []);
    byIndex.get(node.branchIndex).push(node);
  }
  const line = document.createElement('div');
  line.className = 'pgn-line';
  /** 把分叉于这一手的支线接在后面。返回有没有真的写下括号。 */
  const appendBranches = (index) => {
    let wrote = false;
    for (const node of byIndex.get(index) ?? []) {
      const el = notationBranch(node, sans.slice(0, index), view);
      if (el) {
        line.append(' ', el);
        wrote = true;
      }
    }
    return wrote;
  };
  // 顶掉白方第一手的支线前面没有着法可挂，只能写在最前面。
  appendBranches(0);
  let lastNumber = null;
  sans.forEach((san, i) => {
    const lbl = labels[i] ?? { number: Math.floor(i / 2) + 1, white: i % 2 === 0 };
    if (lastNumber !== lbl.number) {
      line.append(` ${lbl.white ? `${lbl.number}.` : `${lbl.number}...`}`);
    }
    // 支线打开着的时候，"现在这一手"在括号里，主线这边只是那几条岔路的来路。
    line.append(' ', pgnPly([], i + 1, san, !view && i + 1 === plies));
    // 括号里那条线自己把回合号走到别处去了，出括号要把号重写一遍，否则
    // `1. f3 (1... e5 2. g4) d6` 读起来像白方走的 d6。导出的 PGN 同此规则。
    lastNumber = appendBranches(i + 1) ? null : lbl.number;
  });
  els.pgnBody.replaceChildren(line);
}

/**
 * 一条支线，写成 PGN 那样的一整段括号。往里面再分出去的支线递归套一层，
 * 缩进由 CSS 自己叠（`.pgn-var` 嵌在 `.pgn-var` 里面）。
 *
 * `prefix` 是从开局位置走到这层的分叉点要经过的走法，回合号按它读。
 */
function notationBranch(node, prefix, view) {
  const labels = variationLabels(gameOrigin, prefix, node.moves);
  if (!labels) return null;
  const span = document.createElement('span');
  span.className = 'pgn-var';
  if (view && samePath(view.path, node.path)) span.classList.add('active');
  span.append('(');
  const byIndex = new Map();
  for (const child of node.children ?? []) {
    if (!byIndex.has(child.branchIndex)) byIndex.set(child.branchIndex, []);
    byIndex.get(child.branchIndex).push(child);
  }
  // 顶掉这条支线第一个动作的子支线没有前面的走法可以挂，只能写在括号最前面。
  for (const child of byIndex.get(0) ?? []) {
    const el = notationBranch(child, prefix, view);
    if (el) span.append(' ', el);
  }
  let lastNumber = null;
  node.moves.forEach((san, k) => {
    const lbl = labels[k];
    if (lastNumber !== lbl.number) {
      span.append(` ${lbl.white ? `${lbl.number}.` : `${lbl.number}...`}`);
    }
    span.append(' ', pgnPly(node.path, k + 1, san, isCurrentBranchPly(view, node.path, k + 1)));
    lastNumber = lbl.number;
    for (const child of byIndex.get(k + 1) ?? []) {
      const el = notationBranch(child, [...prefix, ...node.moves.slice(0, k + 1)], view);
      if (el) span.append(' ', el);
    }
  });
  span.append(' )');
  return span;
}

/**
 * 一个走法 token：点了把棋盘挪到那条线的这一手上。走法区只记主线，岔路只有这份
 * 棋谱里有，所以它必须能点（棋谱区只在分析模式出现，见 renderNotation）。
 */
function pgnPly(path, ply, san, current) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'pgn-ply';
  el.textContent = san;
  el.dataset.path = path.join(',');
  el.dataset.ply = String(ply);
  if (current) {
    el.classList.add('current');
    el.setAttribute('aria-current', 'true');
  }
  return el;
}

function isCurrentBranchPly(view, path, ply) {
  return Boolean(view) && samePath(view.path, path) && view.ply === ply;
}

function samePath(a, b) {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/**
 * Keep the move on the board in sight: at the bottom of the list while the
 * game is live, and inside the visible rows while reviewing. Scrolling is
 * measured against the list's own box so that it, and never an ancestor,
 * is what moves.
 */
function scrollMoveIntoView() {
  const list = els.moveList;
  if (!reviewing()) {
    list.scrollTop = list.scrollHeight;
    return;
  }
  const current = list.querySelector('.move-row .ply.current');
  if (!current) {
    list.scrollTop = 0; // the starting position, above the first move
    return;
  }
  const box = list.getBoundingClientRect();
  const rect = current.getBoundingClientRect();
  if (rect.top < box.top) list.scrollTop += rect.top - box.top;
  else if (rect.bottom > box.bottom) list.scrollTop += rect.bottom - box.bottom;
}

/**
 * 棋谱区里同样别让"现在这一手"跑出框外：在支线里按下一步的时候，那份棋谱正是
 * 唯一还指着那条线的地方。量的还是它自己那个框，不去动外层。
 */
function scrollNotationIntoView() {
  const body = els.pgnBody;
  if (els.pgnSheet.classList.contains('hidden') || !isViewingBranch()) return;
  const current = body.querySelector('.pgn-ply.current');
  if (!current) return;
  const box = body.getBoundingClientRect();
  const rect = current.getBoundingClientRect();
  if (rect.top < box.top) body.scrollTop += rect.top - box.top;
  else if (rect.bottom > box.bottom) body.scrollTop += rect.bottom - box.bottom;
}

function renderClocks() {
  const shown = clock.enabled && !tacticsMode;
  els.clockTop.classList.toggle('hidden', !shown);
  els.clockBottom.classList.toggle('hidden', !shown);
  if (!shown) return;
  const bottom = bottomColor();
  const pairs = [
    [els.clockTop, otherColor(bottom)],
    [els.clockBottom, bottom],
  ];
  for (const [el, color] of pairs) {
    const ms = clock.remaining(color);
    const text = formatClock(ms);
    // This runs ten times a second; don't touch the DOM when nothing moved.
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('running', clock.running === color);
    el.classList.toggle('low', ms < LOW_TIME_MS);
    el.classList.toggle('out', ms <= 0);
  }
}

function renderReviewBar(plies) {
  const total = game.history().length;
  // Inside an open branch the arrows walk that line, so their end stops are
  // the ends of the branch, not of the game.
  const view = analyzing ? getActiveBranch() : null;
  const branchLen = view ? (getNode(view.path)?.moves.length ?? 0) : 0;
  const atStart = view ? view.ply === 0 : plies === 0;
  const atEnd = view ? view.ply >= branchLen : plies >= total;
  // Disabling the focused button blurs it there and then, so note where the
  // keyboard was before the flags below can take it away.
  const focused = document.activeElement;
  els.reviewFirstBtn.disabled = atStart;
  els.reviewPrevBtn.disabled = atStart;
  els.reviewNextBtn.disabled = atEnd;
  els.reviewLastBtn.disabled = atEnd;
  els.pgnCopyBtn.disabled = total === 0;
  els.pgnDownloadBtn.disabled = total === 0;
  // An engine is a coach, and a coach has no business at the board while
  // somebody is waiting for their turn in an online game. paint() turns analysis
  // off before anything is drawn; all this does is keep the button honest about
  // why it is dark.
  const analysable = analysisAllowed();
  els.analysisBtn.disabled = !analysable;
  els.analysisBtn.title = analysable ? ANALYSIS_TITLE : ANALYSIS_BLOCKED_TITLE;
  keepReviewFocus(focused);
  if (!reviewing()) {
    els.reviewNote.textContent = '';
  } else if (view) {
    const played = (getNode(view.path)?.moves ?? []).slice(0, view.ply);
    els.reviewNote.textContent = played.length ? `支线 ${played.join(' ')}` : '支线起点';
  } else if (plies === 0) {
    els.reviewNote.textContent = '回看开局';
  } else {
    els.reviewNote.textContent = `回看 ${plyLabel(plies)} ${game.history()[plies - 1].san}`;
  }
}

/**
 * Reaching either end of the game disables the button that got you there —
 * both of them, since first/prev and next/last go dark together. Hand the
 * keyboard to the pair that still leads somewhere, rather than let it fall to
 * the top of the page halfway through stepping over a game.
 */
function keepReviewFocus(focused) {
  const pairs = [
    [els.reviewFirstBtn, els.reviewNextBtn],
    [els.reviewPrevBtn, els.reviewNextBtn],
    [els.reviewNextBtn, els.reviewPrevBtn],
    [els.reviewLastBtn, els.reviewPrevBtn],
  ];
  for (const [button, fallback] of pairs) {
    if (focused === button && button.disabled && !fallback.disabled) {
      fallback.focus({ preventScroll: true });
      return;
    }
  }
}

/**
 * Describe a game the engine has called. `result` and `termination` are the
 * PGN spellings of the same thing, for the export; every end the app makes up
 * itself (a resignation, a flag fall) carries them too, so the exporter never
 * has to work out what happened. An online game is not described here — the
 * referee has already written its verdict down, in the room's own fields.
 */
function describeEnd(status) {
  if (status.reason === 'checkmate') {
    const base = { reason: 'checkmate', result: status.result, termination: 'normal' };
    if (mode === 'local') {
      const winner = status.result === '1-0' ? 'w' : 'b';
      return {
        ...base,
        kind: 'win',
        title: `${colorName(winner)}获胜`,
        sub: `将死 —— ${colorName(otherColor(winner))}的王无路可走。`,
      };
    }
    const iWon = (status.result === '1-0') === (myColor === 'w');
    if (iWon) {
      return {
        ...base,
        kind: 'win',
        title: '你赢了',
        sub: '将死 —— 电脑的王无路可走。',
      };
    }
    return {
      ...base,
      kind: 'loss',
      title: '你输了',
      sub: '将死 —— 你的王无路可走。',
    };
  }
  const reasons = {
    stalemate: '逼和 —— 已经没有合法走法。',
    'insufficient material': '双方的棋子都不够将死。',
    'fifty-move rule': '连续五十步没有吃子、没有动兵。',
    'threefold repetition': '同一局面出现了三次。',
  };
  return {
    kind: 'draw',
    reason: status.reason,
    result: status.result,
    termination: 'normal',
    title: '和棋',
    sub: reasons[status.reason] || '双方都无法将死。',
  };
}

/** How the game on the board ended, or null while it is still going. */
function currentEnd() {
  if (tacticsMode) {
    const status = game.status();
    // 走法题常用王对象、王对王教走法；子力不足不能把这些题面锁死。
    return status.over && status.reason !== 'insufficient material' ? describeEnd(status) : null;
  }
  // Online, nothing but the server's verdict counts: it does not judge the
  // three draws the engine sees (repetition, fifty moves, bare kings), so
  // `game.status()` would end games the referee is still playing.
  if (mode === 'online') return onlineEnd;
  if (manualEnd) return manualEnd;
  const status = game.status();
  return status.over ? describeEnd(status) : null;
}

// Fills in the result text and color; whether it is on screen at all is
// updateModeUi's call, so the banner comes and goes with the player cards and
// the move list it belongs to.
function renderBanner() {
  const end = currentEnd();
  els.resultBanner.className = end ? `result-banner ${end.kind}` : 'result-banner';
  els.resultBanner.textContent = end ? `${end.title} · ${end.sub}` : '';
}

function showEnd(end) {
  trackGameEnd(end);
  archiveFinishedGame(end);
  els.gameoverTitle.textContent = end.title;
  els.gameoverSub.textContent = end.sub;
  for (const [kind, el] of Object.entries(els.gameoverIcons)) {
    el.classList.toggle('shown', kind === end.kind);
  }
  clearTimeout(gameOverTimer);
  gameOverTimer = setTimeout(() => {
    if (!els.gameoverDialog.open) els.gameoverDialog.showModal();
  }, 450);
}

function showToast(text, { onlyIfIdle = false } = {}) {
  // 'onlyIfIdle' is for news that is nice to know but must not push out news a
  // player is waiting on — the email-confirmation reply arrives on the same
  // load as the restored-game note, and losing it means reloading to check.
  if (onlyIfIdle && els.toast.classList.contains('show')) return;
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 4000);
}

/* ------------------------------------------------------------------ */
/* Mode-dependent chrome                                               */
/* ------------------------------------------------------------------ */

function updateModeUi() {
  for (const button of els.modeButtons) {
    const active = button.dataset.mode === mode;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  }
  els.topbarNote.textContent = MODE_LABELS[mode];

  const online = mode === 'online';
  const inClass = mode === 'class';
  const showIdle = online && ['idle', 'creating', 'ended'].includes(onlineUiState);
  els.onlineCard.classList.toggle('hidden', !online || onlineUiState === 'playing');
  els.onlineIdle.classList.toggle('hidden', !showIdle);
  els.onlineHosting.classList.toggle('hidden', onlineUiState !== 'hosting');
  els.onlineJoining.classList.toggle('hidden', onlineUiState !== 'joining');

  // The two doors into a game share one busy flag: a double click would ask
  // the referee for two rooms, or for a seat twice.
  const busy = onlineUiState === 'creating' || onlineUiState === 'joining';
  els.hostBtn.disabled = busy;
  els.joinBtn.disabled = busy;
  els.joinInput.disabled = busy;
  els.hostBtnLabel.textContent =
    onlineUiState === 'creating' ? '正在开局…' : '开一局';

  // Unlike a room, the class panel keeps its border once the class is running:
  // the code is on it and, for a teacher, so is the list of raised hands.
  const classBusy = classUiState === 'creating' || classUiState === 'joining';
  const teaching = inClass && classUiState === 'teaching';
  const spectating = inClass && classUiState === 'spectating';
  const classLive = teaching || spectating;
  els.classCard.classList.toggle('hidden', !inClass);
  els.classIdle.classList.toggle('hidden', inClass && classLive);
  els.classActive.classList.toggle('hidden', !teaching);
  els.classStudentPanel.classList.toggle('hidden', !spectating);
  els.classCreateBtn.disabled = classBusy || teacherBlocked();
  els.classJoinBtn.disabled = classBusy;
  els.classJoinInput.disabled = classBusy;
  if (teaching) els.classCodeDisplay.textContent = classSession.code || '';
  if (spectating) {
    els.classStudentStatus.textContent = CLASS_HAND_NOTE[classSession.handStatus] ?? '等待老师走子……';
    const raised = classSession.handStatus === 'raised';
    els.classHandBtn.querySelector('.class-hand-label').textContent = raised ? '放下手' : '举手';
    els.classHandBtn.disabled = classSession.handStatus === 'approved' || classRequestOut;
  }

  // The board-side cards only make sense once an online game exists. The
  // result banner goes with them: while the setup panel is up, a leftover
  // 「你赢了」 would read as a verdict on the game being arranged.
  const showGame = !online || onlineUiState === 'playing' || onlineUiState === 'ended';
  els.cardTop.classList.toggle('hidden', !showGame);
  els.cardBottom.classList.toggle('hidden', !showGame);
  els.movesCard.classList.toggle('hidden', !showGame);
  els.resultBanner.classList.toggle('hidden', !showGame || !els.resultBanner.textContent);

  const showLevel = mode === 'computer';
  const showColor = (mode === 'computer' || showIdle) && !inClass;
  // A guest has nothing to pick: the room's clock and seats are the host's
  // doing, and the referee writes them down before either side moves. A class
  // has no clock at all, and nobody at a desk chooses whose turn it is.
  const showTime = !online && !inClass || showIdle;
  // Nothing to press during a game arranged or reviewed — Undo and New game
  // belong to games this device owns, and there is no second game to offer a
  // friend from here (they need a new code; see the note in the online card).
  const playing = online && onlineUiState === 'playing';
  const showButtons = !online && !inClass || playing;
  const showField = showLevel || showColor || showTime;
  const finished = gameFinished();
  els.levelField.classList.toggle('hidden', !showLevel);
  els.colorField.classList.toggle('hidden', !showColor);
  els.colorLabel.textContent = online ? '你执' : '执子';
  els.timeField.classList.toggle('hidden', !showTime);
  els.fieldRow.classList.toggle('hidden', !showField);
  // The hint belongs to the settings that only take hold at the start of a
  // game, so it comes and goes with them. Only the host of an online game
  // picks a side and a clock — a guest is dealt both, which is worth saying
  // next to controls that sit above the Join box.
  const showHint = showColor || showTime;
  if (online) {
    els.controlsHint.textContent =
      '只有开局的一方选颜色和时限，而且在线对弈的钟没有每步加时。';
  } else if (showColor) {
    els.controlsHint.textContent = '颜色和时限在开始新的一局时生效。';
  } else {
    els.controlsHint.textContent = '时限在开始新的一局时生效。';
  }
  els.controlsHint.classList.toggle('hidden', !showHint);

  els.newGameBtn.classList.toggle('hidden', online || inClass || tacticsMode);
  els.undoBtn.classList.toggle('hidden', online || inClass || tacticsMode);
  // 和棋/认输：在线要坐下之后才有对面，电脑和讲解一开局就能用。
  // 题库里的棋盘是题面，不归这两个按钮管。
  const canEndNow = !finished && !tacticsMode && (playing || (!online && !inClass));
  els.drawBtn.classList.toggle('hidden', !canEndNow);
  els.resignBtn.classList.toggle('hidden', !canEndNow);
  els.leaveBtn.classList.toggle('hidden', !playing);
  paintDrawButton();
  els.buttonRow.classList.toggle('hidden', !showButtons);
  els.controlsHint.classList.toggle('hidden', !showHint);
  // The card is only worth its border when one of the three things inside it
  // is on show.
  els.controls.classList.toggle('hidden', !(showField || showButtons || showHint));

  // A student's drawings cannot be sent, and an import would put this board
  // somewhere the class is not. The teacher may draw but not paste in a game:
  // the server holds the position, and a board it never saw would be erased by
  // the next poll.
  els.annotationToolbar.classList.toggle('hidden', inClass && !teaching);
  // 翻转棋盘只在讲解里有意义：电脑和在线模式的"你"固定在下面，翻过来名字就对不上了。
  els.flipBoardBtn.classList.toggle('hidden', mode !== 'local');
  importBtn.classList.toggle('hidden', inClass);

  // The game-over dialog's other button starts a new game, which online means
  // a new room and a new friend: the panel above has that.
  els.gameoverNew.classList.toggle('hidden', online || inClass);
}

function setOnlineError(message) {
  els.onlineError.textContent = message;
  els.onlineError.hidden = !message;
}

/* ------------------------------------------------------------------ */
/* Interaction                                                         */
/* ------------------------------------------------------------------ */

function clearSelection() {
  boardView.cancelDrag();
  selected = null;
  targets = new Map();
  pendingToggleOff = false;
}

function targetsFor(square) {
  const map = new Map();
  // In analysis mode while reviewing, use the historical position's moves,
  // not the current game's moves (see #107).
  const pos = analyzing && reviewing() ? shownPosition(viewPlies()) : game;
  for (const move of pos.moves({ square })) {
    map.set(move.to, !!move.captured);
  }
  return map;
}

/** The color the person at this device may pick up right now, or null. */
function movableColorNow() {
  // 题库里轮到谁走就谁走：题面可能执黑先行，教练也会用棋盘现摆局面。
  if (tacticsMode) return gameFinished() && !analyzing ? null : game.turn();
  // An older position is a picture of the game, not a place to play from.
  // Exception: in analysis mode, the player may try moves from any position
  // to create variations (see #107). Allow both colors when reviewing in
  // analysis mode, since we're exploring variations, not playing a real game.
  if (reviewing() && !analyzing) return null;
  if (gameFinished() && !analyzing) return null;
  // In analysis mode while reviewing, allow moves for the color whose turn it
  // is at the historical position being viewed (not the current game's turn).
  if (analyzing && reviewing()) {
    const pos = shownPosition(viewPlies());
    return pos.turn();
  }
  if (mode === 'computer') return thinking ? null : myColor;
  if (mode === 'local') return game.turn();
  // In a class both colours sit on the board and the server decides who is
  // allowed to touch them: a teacher always, a student for the one move they
  // were given. While a move is on its way the board holds still, or the next
  // snapshot would be replaying two plies it has only one of.
  if (mode === 'class') {
    if (!['teaching', 'spectating'].includes(classUiState)) return null;
    if (classSentSan !== null || !classSession.canMove) return null;
    return game.turn();
  }
  // Online, the referee's turn is the only one that counts, and a second move
  // may not leave before the first has been written down: the server would
  // refuse it as not-the-right-turn and the player would watch their own piece
  // jump back.
  if (onlineUiState !== 'playing' || sentSan !== null) return null;
  const snap = roomGame.room;
  return snap && snap.turn === myColor && appliedSeq === snap.seq ? myColor : null;
}

function onSquarePress(square, event) {
  if (annotationOverlay.activeTool === 'arrow' || annotationOverlay.activeTool === 'erase') return;
  if (!tacticsMode && mode === 'class' && ['teaching', 'spectating'].includes(classUiState) && !classSession.canMove) {
    showToast(classSession.isStudent ? '课堂里先看着 —— 要走棋就举手。' : '课堂已经不能走了。');
    return;
  }
  const movable = movableColorNow();
  if (!movable) return;
  if (selected && targets.has(square)) {
    attemptMove(selected, square, { animate: true });
    return;
  }
  // When reviewing in analysis mode, get the piece from the historical
  // position we're viewing, not the current game state (see #107).
  const pos = analyzing && reviewing() ? shownPosition(viewPlies()) : game;
  const piece = pos.get(square);
  // When reviewing in analysis mode, use the turn of the position we're
  // viewing, not the current game's turn (see #107).
  const currentTurn = analyzing && reviewing() ? pos.turn() : game.turn();
  if (piece && colorOf(piece) === movable && currentTurn === movable) {
    pendingToggleOff = selected === square;
    selected = square;
    targets = targetsFor(square);
    renderAll();
    boardView.startDrag(square, event);
  } else if (selected) {
    clearSelection();
    renderAll();
  }
}

// Keyboard activation (Enter/Space on a focused square): same semantics as a
// pointer press, minus the drag, and pressing the selected square deselects.
function onSquareActivate(square) {
  if (annotationOverlay.activeTool === 'arrow' || annotationOverlay.activeTool === 'erase') return;
  if (!tacticsMode && mode === 'class' && ['teaching', 'spectating'].includes(classUiState) && !classSession.canMove) {
    showToast(classSession.isStudent ? '课堂里先看着 —— 要走棋就举手。' : '课堂已经不能走了。');
    return;
  }
  const movable = movableColorNow();
  if (!movable) return;
  if (selected === square) {
    clearSelection();
    renderAll();
    return;
  }
  if (selected && targets.has(square)) {
    attemptMove(selected, square, { animate: true });
    return;
  }
  // When reviewing in analysis mode, get the piece from the historical
  // position we're viewing, not the current game state (see #107).
  const pos = analyzing && reviewing() ? shownPosition(viewPlies()) : game;
  const piece = pos.get(square);
  // When reviewing in analysis mode, use the turn of the position we're
  // viewing, not the current game's turn (see #107).
  const currentTurn = analyzing && reviewing() ? pos.turn() : game.turn();
  if (piece && colorOf(piece) === movable && currentTurn === movable) {
    selected = square;
    targets = targetsFor(square);
    renderAll();
  } else if (selected) {
    clearSelection();
    renderAll();
  }
}

function onDrop(from, to, moved) {
  if (annotationOverlay.activeTool === 'arrow' || annotationOverlay.activeTool === 'erase') {
    renderAll();
    return;
  }
  if (to && to !== from && targets.has(to)) {
    attemptMove(from, to, { animate: false });
    return;
  }
  if (to === from && !moved && pendingToggleOff) {
    clearSelection();
  }
  renderAll();
}

/**
 * 把复盘位上走出的这一手写进棋谱。
 *
 * 分析里走出来的棋是"试"，不是"下"：主线那份记录一律不动，改的手另起一条支线，
 * 棋盘跟着支线走（常规国象软件都是这个规矩 —— 复盘要能试，但不能把下过的棋改掉）。
 *
 * - 这一手本来就在看着的那条线上：往前走一步就完事，别另起一支（重复点同一手会
 *   多出支线就是这么来的）。
 * - 主线中途改走别的手：挂在那一手的位置上成为支线，旧的那一截还是主线。
 * - 支线中途改走别的手：挂在它下面，旧的那一截留着。那才是"当时还可以这样"。
 * - 支线末尾：续着这条支线往下走。
 */
function recordBranchMove(san) {
  const main = mainSans();
  const view = getActiveBranch();
  if (!view) {
    const ply = viewPlies();
    if (main[ply] === san) {
      reviewIndex = ply + 1; // 走到最新一手的下一格，clampReview 会把视角放回 live
      return;
    }
    const known = findBranch([], ply, san);
    if (known) {
      enterBranch(known, 1);
      return;
    }
    const path = branchAt([], ply, san);
    if (path) {
      enterBranch(path, 1);
      showToast(
        mode === 'online' || mode === 'class'
          ? `已记下支线（${san}）—— 主线是裁判记的那一份`
          : `已记下支线（${san}）—— 主线照旧`,
      );
    }
    return;
  }

  const node = getNode(view.path);
  if (!node) {
    setActiveBranch(null);
    return;
  }
  const replaced = existingMoveAt(view.path, view.ply, main);
  if (replaced === null) {
    appendToBranch(view.path, san);
    setActiveBranch(view.path, view.ply + 1);
    return;
  }
  if (replaced === san) {
    // 这一手就是上面那条线本来走的：跳到那条线的下一格。
    const parent = view.path.slice(0, -1);
    if (view.ply !== 0) {
      setActiveBranch(view.path, view.ply + 1);
    } else if (parent.length === 0) {
      setActiveBranch(null);
      reviewIndex = node.branchIndex + 1;
    } else {
      const outer = getNode(parent);
      setActiveBranch(parent, outer ? node.branchIndex + 1 : 1);
    }
    return;
  }
  const known = findBranch(view.path, view.ply, san);
  if (known) {
    setActiveBranch(known, 1);
    return;
  }
  const path = branchAt(view.path, view.ply, san);
  if (path) setActiveBranch(path, 1);
}

/** 错着在落盘前撤销；解法没走完时，两边回合都由做题者继续。 */
function acceptTacticsMove(played) {
  const uci = played.from + played.to + (played.promotion || '');
  if (tacticsPanel?.checkMove(uci)) return true;
  game.undo();
  return false;
}

function attemptMove(from, to, { animate }) {
  // 分析模式里回头看旧局面时，这一手是记进棋谱的变化而不是在下这盘棋（见 #107）。
  // 要赶在拿 live game 校验之前处理：显示的那个局面和棋盘现在的 turn 可能已经不
  // 是一回事。
  if (analyzing && reviewing()) {
    const played = shownPosition(viewPlies()).move({ from, to });
    if (!played) {
      clearSelection();
      renderAll();
      return;
    }
    recordBranchMove(played.san);
    clearSelection();
    renderAll();
    announceReview();
    return;
  }

  const candidates = game.moves({ square: from }).filter((m) => m.to === to);
  if (candidates.length === 0) {
    clearSelection();
    renderAll();
    return;
  }
  const commit = (promotion) => {
    const played = game.move({ from, to, promotion });
    if (!played) {
      clearSelection();
      renderAll();
      return;
    }
    if (tacticsMode) {
      if (!acceptTacticsMove(played)) {
        clearSelection();
        renderAll();
        return;
      }
    } else if (mode === 'online') {
      // Show the move at once and ask the referee to write it down. `sentSan`
      // marks the ply as ours until the server's own record of it comes back,
      // and the clock is deliberately not moved here: the server keeps
      // charging the player who is thinking until their move lands, and the
      // reading that counts arrives with the snapshot.
      sentSan = played.san;
      sentAt = Date.now();
      trackGameStart();
      sendRoomMove(played.san);
    } else if (mode === 'class') {
      trackGameStart();
      sendClassMove(played.san);
    } else {
      afterPlyApplied(played);
    }
    clearSelection();
    const proceed = () => {
      renderAll();
      afterMove();
    };
    if (animate) boardView.animateMove(from, to, proceed);
    else proceed();
  };
  if (candidates[0].promotion) {
    askPromotion().then((promotion) => {
      if (promotion) {
        commit(promotion);
      } else {
        clearSelection();
        renderAll();
      }
    });
  } else {
    commit('q');
  }
}

function afterMove() {
  // Online, this board does not call games finished: the referee's verdict
  // arrives with the snapshot of the move that ends the game, and it is the
  // only one that can be exported or shown. An optimistic checkmate here would
  // be a result the server has not agreed to yet.
  // A classroom game has no verdict to hand out — the teacher keeps the board
  // after the mate to talk about it — so the same silence applies.
  if (mode === 'online' || mode === 'class') return;
  const status = game.status();
  if (status.over) {
    renderAll();
    // 题库做完了由面板宣布；别弹出对局结束的对话框盖住题面。
    if (!tacticsMode) showEnd(describeEnd(status));
    return;
  }
  // 开着分析就是在打谱思考，不是在下这盘棋：电脑不能替棋手应一手。引擎给的几条
  // 线摆在走法里，试哪条由棋手自己定。关掉分析会把欠这一手补上（见 setAnalysis）。
  if (analyzing) return;
  // 题库要按解法一步不差地走完，两边都由做题的人来走，电脑不能插进来应棋。
  if (tacticsMode) return;
  if (mode === 'computer' && game.turn() !== myColor) {
    computerTurn();
  }
}

function computerTurn() {
  thinking = true;
  thinkingLevel = level;
  renderAll();
  const token = ++aiToken;
  chooseMove(game, thinkingLevel).then((reply) => {
    if (token !== aiToken || mode !== 'computer') return;
    thinking = false;
    if (!reply) {
      renderAll();
      return;
    }
    const played = game.move({
      from: reply.from,
      to: reply.to,
      promotion: reply.promotion || 'q',
    });
    if (!played) {
      renderAll();
      return;
    }
    afterPlyApplied(played); // also counts the game as started: the computer
                             // opens when the player chose Black
    showMove(reply.from, reply.to, () => {
      renderAll();
      const status = game.status();
      if (status.over) showEnd(describeEnd(status));
    });
  });
}

/**
 * Slide a piece into place and then re-render. While an older position is on
 * the board there is nothing to slide — the move has landed in the game, but
 * not in what the player is looking at.
 */
function showMove(from, to, done) {
  if (reviewing()) done();
  else boardView.animateMove(from, to, done);
}

/* ------------------------------------------------------------------ */
/* Promotion dialog                                                    */
/* ------------------------------------------------------------------ */

function askPromotion() {
  const mover = game.turn(); // promotion is asked before the move commits
  for (const button of els.promoDialog.querySelectorAll('[data-promo]')) {
    const piece = button.dataset.promo;
    button.querySelector('img').src = pieceUrl(
      mover === 'w' ? piece.toUpperCase() : piece,
    );
  }
  els.promoDialog.showModal();
  return new Promise((resolve) => {
    promoResolve = resolve;
  });
}

function finishPromotion(choice) {
  if (!promoResolve) return;
  const resolve = promoResolve;
  promoResolve = null;
  if (els.promoDialog.open) els.promoDialog.close();
  resolve(choice);
}

/* ------------------------------------------------------------------ */
/* Confirm dialog                                                      */
/* ------------------------------------------------------------------ */

/**
 * `danger` paints the confirming button red: for giving up a game (resign,
 * leave) rather than merely moving on from one (a new game, another mode).
 */
function askConfirm({ title, sub, confirmLabel, danger = true }, onConfirm) {
  confirmAction = onConfirm;
  els.confirmTitle.textContent = title;
  els.confirmSub.textContent = sub;
  els.confirmYes.textContent = confirmLabel;
  els.confirmYes.classList.toggle('btn-danger-solid', danger);
  els.confirmYes.classList.toggle('btn-primary', !danger);
  els.confirmDialog.showModal();
}

function closeDialogs() {
  if (els.gameoverDialog.open) els.gameoverDialog.close();
  if (els.confirmDialog.open) els.confirmDialog.close();
  // A draw offer belongs to the game that is going away; the button follows
  // the same reset so a new game does not start with it greyed out.
  if (els.drawOfferDialog.open) els.drawOfferDialog.close();
  drawOfferPending = null;
  drawRequestOut = false;
  paintDrawButton();
}

/* ------------------------------------------------------------------ */
/* Game flow controls                                                  */
/* ------------------------------------------------------------------ */

function newGame() {
  if (mode === 'online' || mode === 'class') return; // a class starts with a code, not here
  aiToken++;
  thinking = false;
  myColor =
    mode === 'computer'
      ? colorSetting === 'random'
        ? Math.random() < 0.5
          ? 'w'
          : 'b'
        : colorSetting
      : 'w';
  // 讲解每开一局都回到白方在下面的默认视角；换到黑方看是这一局里的事。
  if (mode === 'local') viewColor = 'w';
  manualEnd = null;
  reviewIndex = null;
  resetBoard();
  resetClock(timeControl(timeSetting));
  resetTracking();
  finishPromotion(null);
  clearSelection();
  clearTimeout(gameOverTimer);
  clearReview();
  clearTactics();
  closeDialogs();
  boardView.setOrientation(bottomColor());
  announcedPlies = 0;
  els.srStatus.textContent =
    mode === 'local'
      ? '新的一局。白方走。'
      : `新的一局。你执${side(myColor)}。`;
  renderAll();
  if (mode === 'computer' && game.turn() !== myColor) computerTurn();
}

/** The New game button: a game in progress is worth a second look first. */
function requestNewGame() {
  if (mode === 'online') return;
  if (!gameInProgress()) {
    newGame();
    return;
  }
  askConfirm(
    {
      title: '开始新的一局？',
      sub: '现在这一局会丢掉。',
      confirmLabel: '新的一局',
      danger: false,
    },
    newGame,
  );
}

function undoTurn() {
  if (!canUndo()) return;
  aiToken++;
  thinking = false;
  // Taking a move back also takes back an end the app declared for itself —
  // running out of time is the one a player can undo their way out of.
  manualEnd = null;
  finishPromotion(null);
  clearTimeout(gameOverTimer);
  if (els.gameoverDialog.open) els.gameoverDialog.close();
  if (mode === 'computer') {
    // Take back the player's last move along with any computer reply.
    do {
      undoPly();
    } while (game.turn() !== myColor && game.history().length > 0);
  } else {
    undoPly();
  }
  clearSelection();
  renderAll();
}

/** Take back one ply, rewinding both clocks to where they stood before it. */
function undoPly() {
  if (!game.undo()) return;
  const before = clockStack.pop();
  if (before) clock.restore(before);
}

function clearAnnotationTool() {
  annotationOverlay.setTool(null);
  els.annotationToolbar.querySelectorAll('[data-tool]').forEach((btn) => {
    btn.setAttribute('aria-pressed', 'false');
  });
}

/** Drop every game, room and timer ahead of a mode change. */
function teardownForModeChange() {
  clearAnnotationTool();
  stopRoomPolling();
  stopClassPolling();
  roomGame.reset();
  classSession.reset();
  onlineUiState = 'idle';
  onlineReturnState = 'idle';
  onlineEnd = null;
  roomRole = null;
  appliedSeq = 0;
  sentSan = null;
  flagPollDone = false;
  rebuilding = false;
  classUiState = 'idle';
  classAppliedSeq = 0;
  classSentSan = null;
  classSentAt = 0;
  classYourHand = 'none';
  classRequestOut = false;
  clearTimeout(classAnnotTimer);
  classAnnotTimer = 0;
  aiToken++;
  thinking = false;
  manualEnd = null;
  reviewIndex = null;
  clearReview();
  clearTactics();
  closeDialogs();
  finishPromotion(null);
}

function setMode(next) {
  if (next === mode || !MODES.includes(next)) return;
  const perform = () => {
    teardownForModeChange();
    mode = next;
    saveSettings();
    if (mode === 'online') {
      enterOnlineIdle();
    } else if (mode === 'class') {
      enterClassIdle();
    } else {
      newGame();
    }
  };
  if (onlineUiState === 'playing' && !gameFinished() && game.history().length > 0) {
    askConfirm(
      {
        title: '离开在线对弈？',
        sub: '换了模式就不再刷新这一局：钟会一直走到归零，而这个房间码不能坐回来。',
        confirmLabel: '离开',
      },
      perform,
    );
  } else if (['teaching', 'spectating'].includes(classUiState)) {
    // Going away does not touch the class: the code still opens it and every
    // move is on the server. Stopping the refresh is what needs saying.
    askConfirm(
      {
        title: '离开课堂？',
        sub: '换了模式这块棋盘就不再跟着课堂刷新。用同一个课堂码还能回来。',
        confirmLabel: '离开',
      },
      perform,
    );
  } else if (gameInProgress()) {
    // Switching modes starts over, and the game on the board is not kept for
    // coming back to. The mode buttons sit right above the board, so make sure
    // the player meant it.
    askConfirm(
      {
        title: `换到${MODE_LABELS[next]}？`,
        sub: `换了模式，现在的${MODE_LABELS[mode]}就丢掉了。`,
        confirmLabel: '换模式',
        danger: false,
      },
      perform,
    );
  } else {
    perform();
  }
}

/* ------------------------------------------------------------------ */
/* Online play                                                         */
/* ------------------------------------------------------------------ */

// The sentence the join box needs before any room exists, for a player who
// arrived through an invite link.
const INVITE_NOTE = '有人约你对弈 —— 按「进入」就能坐下。';

const roomGame = new RoomGame({
  onSnapshot: handleRoomSnapshot,
  onError: handleRoomProblem,
});

const classSession = new ClassSession({
  onSnapshot: handleClassSnapshot,
  onError: handleClassProblem,
});

/**
 * The clock to open a room with: this device's picker, under the server's own
 * ceiling. "No limit" has no online equivalent — a game nobody can lose on time
 * would hold its room open forever — so that choice sends nothing and the room
 * gets the referee's default.
 */
function roomTimeMs() {
  const control = timeControl(timeSetting);
  return control ? Math.min(control.initial, ROOM_MAX_TIME_MS) : null;
}

/**
 * Where a sentence about the room goes. While the setup panel is on screen it
 * has a line of its own; a player mid-game has only the board to look at, so
 * the news goes to the toast there. `creating` and `joining` count as setup:
 * the call that failed came from this panel, and it is back on screen by the
 * time the answer arrives.
 */
function onlineProblem(message) {
  if (['idle', 'creating', 'joining', 'ended'].includes(onlineUiState)) setOnlineError(message);
  else showToast(message);
}

/**
 * The online tab with nothing in it: no room, no clock, and either an empty
 * code box or one already filled by an invite link.
 */
function enterOnlineIdle({ inviteCode = null } = {}) {
  stopRoomPolling();
  roomGame.reset();
  onlineUiState = 'idle';
  onlineReturnState = 'idle';
  onlineEnd = null;
  roomRole = null;
  appliedSeq = 0;
  sentSan = null;
  flagPollDone = false;
  rebuilding = false;
  myColor = 'w';
  manualEnd = null;
  reviewIndex = null;
  resetBoard();
  // No clock until a game exists: an online game runs on the host's control,
  // which this side only learns from the room.
  resetClock(null);
  resetTracking();
  clearSelection();
  clearTimeout(gameOverTimer);
  boardView.setOrientation('w');
  announcedPlies = 0;
  setOnlineError('');
  els.joinInput.value = inviteCode || '';
  els.onlineInviteNote.hidden = !inviteCode;
  if (inviteCode) els.onlineInviteNote.textContent = INVITE_NOTE;
  els.srStatus.textContent = inviteCode
    ? '你收到了对弈邀请。按「进入」就能坐下。'
    : '在线对弈。开一局把房间码发给对方，或者输入对方的房间码。';
  renderAll();
  if (inviteCode) els.joinBtn.focus();
}

/** Open a room and wait for a friend to sit down in the other half of it. */
async function createRoom() {
  if (mode !== 'online' || !['idle', 'ended'].includes(onlineUiState)) return;
  onlineReturnState = onlineUiState; // a refusal keeps whatever board was there
  roomRole = 'host';
  // A room that has not been played starts at seq 0, and the cursor left over
  // from the game before it would read that as an answer arriving too late.
  appliedSeq = 0;
  sentSan = null;
  flagPollDone = false;
  setOnlineError('');
  els.onlineInviteNote.hidden = true;
  onlineUiState = 'creating';
  updateModeUi();
  const reply = await roomGame.create({ color: colorSetting, timeMs: roomTimeMs() });
  if (!reply?.ok) {
    roomRole = null;
    onlineUiState = onlineReturnState;
    updateModeUi();
    return;
  }
  // handleRoomSnapshot has already put the code on screen, moved the panel to
  // "waiting for your friend", and started the polling that tells us when
  // somebody arrives.
  if (onlineUiState === 'hosting') els.copyLinkBtn.focus();
}

/** Take the empty seat in somebody else's room. */
async function joinRoom(rawCode) {
  if (mode !== 'online' || !['idle', 'ended'].includes(onlineUiState)) return;
  const code = normalizeCode(rawCode);
  if (!code) {
    setOnlineError('先填房间码 —— 六位字母和数字。');
    els.joinInput.focus();
    return;
  }
  onlineReturnState = onlineUiState;
  roomRole = 'guest';
  // The cursor of the room this board last watched says nothing about this one.
  appliedSeq = 0;
  sentSan = null;
  flagPollDone = false;
  setOnlineError('');
  els.onlineInviteNote.hidden = true;
  onlineUiState = 'joining';
  updateModeUi();
  const reply = await roomGame.join(code);
  if (!reply?.ok) {
    roomRole = null;
    onlineUiState = onlineReturnState;
    updateModeUi();
    els.joinInput.focus();
    return;
  }
  // The room came back active with a seat in it, so handleRoomSnapshot has
  // already sat us down at it.
}

/**
 * Back out of an attempt: a room nobody joined, or a join that did not get in.
 *
 * There is nothing to tell the server. A room still `waiting` is not a game
 * yet, and reaping the ones nobody sits down in is a later phase's job; this
 * device simply stops asking about it.
 */
function cancelOnlineSetup() {
  stopRoomPolling();
  roomGame.reset();
  roomRole = null;
  appliedSeq = 0;
  sentSan = null;
  onlineUiState = onlineReturnState;
  setOnlineError('');
  updateModeUi();
}

/**
 * The referee's word about the room, whichever call brought it.
 *
 * This board is not a copy of the server's state but a replay of the server's
 * move list, with the clocks written in whole from every snapshot. That is what
 * lets one path serve all three ways news arrives: the answer to our own move,
 * a poll that found nothing, and a poll that found four moves this tab played
 * hide-and-seek through.
 */
function handleRoomSnapshot(snap, fresh) {
  if (mode !== 'online') return;
  // A question that left after a newer one can still answer first. The cursor
  // only moves forward, so the older picture is dropped rather than unplayable.
  if (snap.seq < appliedSeq) return;

  // 提和不是走子，seq 不动：它只看快照，每次都得重摆一遍。
  paintDrawOffer(snap);

  if (snap.status === 'waiting') {
    // A room with one seat. This is also the only thing that ever tells a host
    // a friend has arrived — a guest sitting down is not a move, so it makes no
    // event — which is why the hosting panel stays on the polling.
    els.inviteCode.textContent = snap.code;
    onlineUiState = 'hosting';
    startRoomPolling();
    updateModeUi();
    return;
  }

  if (onlineUiState !== 'playing' && onlineUiState !== 'ended') {
    sitDown(snap, fresh);
    return;
  }

  applyRoomClock(snap);
  // rebuild() reads the whole list itself when the catch-up poll lands; taking
  // its snapshot on the way through would play every move a second time.
  if (rebuilding) return;

  const before = game.history().length;
  if (!applyEvents(fresh) || needsRebuild(snap)) {
    // A piece jumping back on its own looks like the board misbehaving, so say
    // which of the two it is: the referee never got that move.
    if (staleGuess()) showToast('那一步服务器没有收到，棋盘已退回。');
    rebuild();
    return;
  }
  const last = game.history()[game.history().length - 1];
  const settle = () => {
    clearSelection();
    renderAll();
    if (snap.status === 'over') endFromRoom(snap);
  };
  // Slide the newest ply in. A board that caught up on four moves animates the
  // last of them — the rest are history the player has already walked past.
  if (game.history().length > before) showMove(last.from, last.to, settle);
  else settle();
}

/**
 * A game to play has appeared, so sit down at it. The seat, the clock and the
 * moves so far all come from the room: a guest chose none of them, and a host
 * chose the first two on this device but sees them repeated back by the
 * referee, which is the version that counts.
 */
function sitDown(snap, fresh) {
  aiToken++;
  thinking = false;
  myColor = snap.you;
  onlineUiState = 'playing';
  onlineEnd = null;
  manualEnd = null;
  reviewIndex = null;
  appliedSeq = 0;
  sentSan = null;
  flagPollDone = false;
  resetBoard();
  resetClock(roomControl(snap.time_ms));
  resetTracking();
  finishPromotion(null);
  clearSelection();
  clearTimeout(gameOverTimer);
  closeDialogs();
  boardView.setOrientation(myColor);
  announcedPlies = 0;
  track('Online Game Connected', { role: roomRole });
  applyRoomClock(snap);
  applyEvents(fresh);
  startRoomPolling();
  // A room that ended before this seat arrived — rejoining one somebody else
  // finished. The join reply carries no moves, so ask for the record now rather
  // than wait for the next poll to get round to it: the alternative is a board
  // that looks ready to play for a couple of seconds before the verdict lands.
  if (snap.status === 'over') {
    roomGame.reread();
    return;
  }
  // The clock starts here rather than at the first move: the referee sets it
  // running the moment the second seat fills, whether or not anybody answers.
  const text = `你执${side(myColor)}，对面是 ${opponentLabel()}${
    clock.enabled ? `，每方 ${speakClock(snap.time_ms)}` : ''
  }。`;
  els.srStatus.textContent = text;
  showToast(text);
  renderAll();
}

/**
 * Put the server's clocks on the board. Nothing here counts a move down by
 * hand: `Clock` keeps spending from the balance it is handed, so between two
 * polls the player watches a live countdown that the next snapshot straightens
 * out by the few hundred milliseconds of travel time it took.
 */
function applyRoomClock(snap) {
  if (!clock.enabled || !snap.clock) return;
  clock.restore(snap.clock);
}

/**
 * Replay the moves the board has not seen. Returns false the moment the list
 * stops fitting — a hole in the numbering, or a move the engine will not play
 * from here — which is the caller's cue to rebuild the game from the whole list
 * rather than go on patching it.
 */
function applyEvents(events) {
  for (const event of events) {
    if (!applyEvent(event)) return false;
  }
  return true;
}

function applyEvent(event) {
  if (event.seq <= appliedSeq) return true; // already on the board
  if (event.seq !== appliedSeq + 1) return false; // a move we were never told about
  if (event.san === sentSan) {
    // The referee writing down what this side already played in anticipation.
    // The ply is on the board, so only the cursor moves.
    appliedSeq = event.seq;
    sentSan = null;
    return true;
  }
  // A move of theirs where we had guessed ours: their word is the one that
  // stands, so take the guess back before playing what actually happened.
  if (sentSan !== null) rewindGuess();
  // The SAN came from the referee, so it is one this engine would have written
  // itself — unless the two have fallen out over the position, which is what
  // the null answer means and what a rebuild is for.
  const played = game.move(event.san);
  if (!played) return false;
  appliedSeq = event.seq;
  trackGameStart(); // also counts the game as started: they may have opened
  return true;
}

/** Lift the anticipated move off the board. Rendering is the caller's. */
function rewindGuess() {
  if (sentSan === null) return;
  sentSan = null;
  game.undo();
}

/** Do the board and the referee disagree about where the game is? */
function needsRebuild(snap) {
  if (appliedSeq < snap.seq) return true; // moves exist that this board has not seen
  // Ahead of the room row is the server's own two reads a move apart, not a
  // board out of step; and with a move in flight this side is honestly one ply
  // past the record until the referee confirms or refuses it.
  if (appliedSeq > snap.seq) return false;
  if (sentSan !== null) return staleGuess();
  return game.fen() !== snap.fen;
}

/** Has the referee stopped answering about a move we still believe we played?
 *  The reply to a move can be lost with the move itself, which is why the guess
 *  waits at all — but the polls go on coming back without it, and after three of
 *  them the request is gone. Every tap is locked until the board stops assuming
 *  otherwise, so this is what ends the wait. */
function staleGuess() {
  return sentSan !== null && Date.now() - sentAt >= SENT_MAX_MS;
}

/**
 * Play the game again from the referee's own list of moves. The one recovery
 * this board can do by itself, and the one thing a player should never notice:
 * the pieces land back where the server says they are.
 */
async function rebuild() {
  if (rebuilding) return;
  rebuilding = true;
  try {
    resetBoard();
    appliedSeq = 0;
    sentSan = null;
    const reply = await roomGame.reread();
    if (!reply?.ok || !applyEvents(roomGame.events) || needsRebuild(roomGame.room)) {
      roomDesynced();
    }
  } finally {
    rebuilding = false;
  }
  if (onlineUiState === 'ended') return; // roomDesynced has already spoken
  applyRoomClock(roomGame.room);
  renderAll();
  if (roomGame.room?.status === 'over') endFromRoom(roomGame.room);
}

/**
 * The board cannot be brought into line with the referee. There is no move to
 * take back and no position to trust, so the game stops here; the two players
 * have to open another room. The list is still on the server if anybody wants
 * to read it.
 */
function roomDesynced() {
  if (onlineUiState === 'ended' && !roomTimer) return; // already said
  stopRoomPolling();
  onlineUiState = 'ended';
  finishPromotion(null);
  clearSelection();
  closeDialogs();
  const text = '棋盘和服务器的记录对不上，这一局只能停下。请重新开一局。';
  els.srStatus.textContent = text;
  showToast(text);
  renderAll();
}

/** How the referee ended a game, in the words PGN exports. */
const ROOM_TERMINATION = {
  checkmate: 'normal',
  stalemate: 'normal',
  agreement: 'normal',
  'resign-white': 'resigned',
  'resign-black': 'resigned',
  'timeout-white': 'time forfeit',
  'timeout-black': 'time forfeit',
};

const ROOM_SIDE = {
  'resign-white': 'w',
  'resign-black': 'b',
  'timeout-white': 'w',
  'timeout-black': 'b',
};

/** The verdict, in the shape every other end on this board has. */
function roomEnd(snap) {
  const won = snap.winner !== null && snap.winner !== undefined;
  const kind = won ? (snap.winner === myColor ? 'win' : 'loss') : 'draw';
  return {
    kind,
    // The server's own code, so the analytics for online games name the reason
    // the referee gave rather than one this board inferred.
    reason: snap.result,
    result: won ? resultFor(snap.winner) : '1/2-1/2',
    termination: ROOM_TERMINATION[snap.result] || 'abandoned',
    title: kind === 'draw' ? '和棋' : kind === 'win' ? '你赢了' : '你输了',
    sub: roomEndText(snap),
  };
}

/**
 * What the end says to the person sitting at this seat. The room carries the
 * phrase too, but it is written for somebody reading a list of rooms: it names
 * colours, where a player wants to know about themselves.
 */
function roomEndText(snap) {
  if (snap.result === 'checkmate') {
    return snap.winner === myColor ? '你把对方将死了。' : `${opponentLabel()}把你将死了。`;
  }
  if (snap.result === 'stalemate') return '逼和 —— 两边都没有合法走法。';
  if (snap.result === 'agreement') return '双方同意和棋。';
  const side = ROOM_SIDE[snap.result];
  if (!side) return snap.result_text || '这局结束了。';
  const who = side === myColor ? '你' : opponentLabel();
  return snap.result.startsWith('resign') ? `${who}认输了。` : `${who}的钟走完了。`;
}

/** Take the referee's verdict onto the board, once. */
function endFromRoom(snap) {
  if (onlineEnd) return;
  onlineEnd = roomEnd(snap);
  onlineUiState = 'ended';
  // Nothing left to ask about: the game is written down and its clocks are
  // stopped where the referee stopped them.
  stopRoomPolling();
  revealEnd(onlineEnd);
}

/* ------------------------------------------------------------------ */
/* Keeping up with the room                                            */
/* ------------------------------------------------------------------ */

function startRoomPolling() {
  if (roomTimer || !roomGame.code) return;
  roomTimer = setInterval(pollRoom, POLL_MS);
}

function stopRoomPolling() {
  clearInterval(roomTimer);
  roomTimer = 0;
}

/**
 * Ask what we have missed. One question at a time, and the same flag covers a
 * move on its way: two answers arriving out of order is a board that has to be
 * rebuilt, and a slow host should not have twenty polls queued up behind them.
 */
async function pollRoom() {
  if (requestOut) return;
  requestOut = true;
  try {
    await roomGame.poll();
  } finally {
    requestOut = false;
  }
}

/** Send a move the player has already seen played. */
async function sendRoomMove(san) {
  requestOut = true;
  try {
    await roomGame.move(san);
  } finally {
    requestOut = false;
  }
  // The reply carried the room as the referee saw it after writing the move
  // down, so handleRoomSnapshot has already put the clocks right; a refusal
  // went to handleRoomProblem. There is nothing left to do from here.
}

/**
 * A call that came back refused. Which of the three kinds it is decides how
 * much changes: an account problem stops the game and opens the panel that
 * fixes it, a room we are no longer in stops the game, and a dropped question
 * is not news at all — the next poll asks it again.
 */
function handleRoomProblem(reply) {
  if (!reply || mode !== 'online') return;
  const code = reply.code;

  if (code === 'sign_in_required' || code === 'verify_required') {
    stopRoomPolling();
    const text = problemText(reply);
    els.srStatus.textContent = text;
    onlineProblem(text);
    if (onlineUiState === 'playing') onlineUiState = 'ended';
    updateModeUi();
    account.open(code === 'sign_in_required' ? 'signin' : 'account');
    return;
  }

  if (code === 'not_room_member' || code === 'no_such_room') {
    stopRoomPolling();
    onlineUiState = 'ended';
    onlineProblem(problemText(reply));
    updateModeUi();
    return;
  }

  const arranging = onlineUiState === 'creating' || onlineUiState === 'joining';
  if ((code === 'network' || code === 'service') && sentSan === null && !arranging) {
    return; // a hole in the connection, not a problem with the game
  }

  onlineProblem(problemText(reply));
  // The move came back refused, so the position on the board is one the
  // referee is not playing. A dropped request is the exception: the move may
  // well have landed, and waiting for the answer beats guessing it here.
  if (sentSan !== null && code !== 'network') {
    rewindGuess();
    renderAll();
  }
}

/**
 * 认输。在线交给裁判；电脑/讲解没有裁判，本机记下结果就能收摊。
 * 讲解是两个人共用一台设备，没有"我"这个身份，认输按轮到谁走算，
 * 确认框里把这一点说明白，免得赢的那一方莫名其妙。
 */
function requestResign() {
  if (gameFinished() || tacticsMode) return;
  if (mode === 'online') {
    if (onlineUiState !== 'playing') return;
    askConfirm(
      {
        title: '要认输吗？',
        sub: `认输就把这一局送给了 ${opponentLabel()}。`,
        confirmLabel: '认输',
      },
      () => {
        // The referee may have ended the game while this dialog was open; a stale
        // confirmation must not go and write over that verdict.
        if (!(mode === 'online' && onlineUiState === 'playing' && !gameFinished())) return;
        // Nothing is decided here. The reply comes back with the game over, and
        // that snapshot is what puts the result on the board.
        roomGame.resign();
      },
    );
    return;
  }
  if (mode !== 'computer' && mode !== 'local') return;
  const loser = mode === 'local' ? game.turn() : myColor;
  askConfirm(
    {
      title: '要认输吗？',
      sub: mode === 'local'
        ? `轮到${colorName(loser)}走 —— 这一下按${colorName(loser)}认输算。`
        : '认输就把这一局给了电脑。',
      confirmLabel: '认输',
    },
    () => {
      if (mode === 'online' || tacticsMode || gameFinished()) return;
      endGameManually(resignEnd());
    },
  );
}

/**
 * 和棋。在线是真正的提和，等对面答复；电脑和讲解没有对面可问，
 * 确认之后直接判和 —— 两种结束都写 result/termination，导出和棋谱库才说得清。
 */
function requestDraw() {
  if (gameFinished() || tacticsMode) return;
  if (mode === 'online') {
    if (onlineUiState !== 'playing' || drawRequestOut) return;
    if (drawOfferPending) {
      // 已经有一条在等答复：自己的那条提醒一句，对方的那条把答复框打开。
      if (drawOfferPending.mine) showToast('已经提和了，等对方答复。');
      else if (!els.drawOfferDialog.open) els.drawOfferDialog.showModal();
      return;
    }
    askConfirm(
      {
        title: '要提和吗？',
        sub: '对方接受就和棋，拒绝就接着下。',
        confirmLabel: '提和',
        danger: false,
      },
      () => {
        if (!(mode === 'online' && onlineUiState === 'playing' && !gameFinished())) return;
        if (drawOfferPending || drawRequestOut) return;
        offerRoomDraw();
      },
    );
    return;
  }
  if (mode !== 'computer' && mode !== 'local') return;
  askConfirm(
    {
      title: '要和棋吗？',
      sub: mode === 'local'
        ? '同屏讲解，这一下就当坐在两边的两个人都同意和棋。'
        : '和电脑下棋，这一下直接判和。',
      confirmLabel: '判和',
      danger: false,
    },
    () => {
      if (mode === 'online' || tacticsMode || gameFinished()) return;
      endGameManually(drawEnd());
    },
  );
}

/** 本机认输的结束条：电脑那局输家永远是坐在这一侧的人。 */
function resignEnd() {
  const loser = mode === 'local' ? game.turn() : myColor;
  const winner = otherColor(loser);
  if (mode === 'local') {
    return {
      kind: 'win',
      reason: 'resign',
      result: resultFor(winner),
      termination: 'resigned',
      title: `${colorName(winner)}获胜`,
      sub: `${colorName(loser)}认输。`,
    };
  }
  return {
    kind: 'loss',
    reason: 'resign',
    result: resultFor(winner),
    termination: 'resigned',
    title: '你输了',
    sub: '你认输了。',
  };
}

/** 本机同意和棋的结束条。 */
function drawEnd() {
  return {
    kind: 'draw',
    reason: 'agreement',
    result: '1/2-1/2',
    termination: 'normal',
    title: '和棋',
    sub: '双方同意和棋。',
  };
}

/** 在线提和：回复里带着裁判记下的那条，界面下一帧就挂上"等答复"的态。 */
async function offerRoomDraw() {
  if (drawRequestOut) return;
  drawRequestOut = true;
  paintDrawButton();
  const reply = await roomGame.offerDraw();
  drawRequestOut = false;
  paintDrawButton();
  if (!reply?.ok) drawProblem(reply);
}

/** 在线答复：接受会让裁判结案，拒绝只删掉那条提和。 */
async function answerRoomDraw(accept) {
  if (drawRequestOut || !drawOfferPending || drawOfferPending.mine) return;
  drawRequestOut = true;
  els.drawAccept.disabled = true;
  els.drawReject.disabled = true;
  paintDrawButton();
  const reply = await roomGame.answerDraw(accept);
  drawRequestOut = false;
  els.drawAccept.disabled = false;
  els.drawReject.disabled = false;
  paintDrawButton();
  if (!reply?.ok) drawProblem(reply);
}

/**
 * 提和/答复失败。账号和房间的问题交给 handleRoomProblem 去开对应的面板；
 * 掉线只是这一下没送到，用一句话说清，别拿红色的错误条吓人。
 */
function drawProblem(reply) {
  if (!reply) return;
  if (['sign_in_required', 'verify_required', 'not_room_member', 'no_such_room'].includes(reply.code)) {
    handleRoomProblem(reply);
    return;
  }
  if (reply.code === 'network' || reply.code === 'service') {
    showToast('网络不稳，这一下没送出去，再试一次。');
    return;
  }
  showToast(problemText(reply));
}

/**
 * 把裁判记着的提和摆到界面上。每次快照都调一次，而不是只在"收到提和"那个
 * 瞬间做：轮询会重复送来同一条，按钮和对话框都该按快照说话，不该自己记状态。
 */
function paintDrawOffer(snap) {
  const offer = snap.status === 'active' ? (snap.draw_offer ?? null) : null;
  const before = drawOfferPending;
  drawOfferPending = offer;
  paintDrawButton();

  if (!offer) {
    if (els.drawOfferDialog.open) els.drawOfferDialog.close();
    // 对面拒绝了我们的提和：局面还在，能这么说一句。终局、离开、换房
    // 会有自己的话，不再补这一句。自己走一步也会把提和清掉，那是我们收回的，
    // 不是对方拒绝的 —— sentSan 还挂着就说明这一帧是我们自己的刚落子。
    if (before?.mine && sentSan === null && snap.status === 'active' && !onlineEnd) {
      showToast('对方拒绝了和棋，接着下。');
    }
    return;
  }
  if (offer.mine) {
    if (els.drawOfferDialog.open) els.drawOfferDialog.close();
    return;
  }
  // 对方的提和：答复框只开一次，后面的轮询不再重开。
  if (!els.drawOfferDialog.open && !drawRequestOut) {
    els.drawOfferDialog.showModal();
  }
}

/** 「和棋」按钮的灰/亮跟着裁判记的那条提和走。 */
function paintDrawButton() {
  const pending = mode === 'online' && onlineUiState === 'playing' ? drawOfferPending : null;
  els.drawBtn.disabled = !!pending || drawRequestOut;
  els.drawBtn.title = pending?.mine
    ? '已经提和，等对方答复'
    : pending
      ? '对方提和了，先答复'
      : '';
}

/**
 * Stop watching this room. There is no message to send: the game stays exactly
 * as it is, the clocks included, and the other player goes on waiting for a
 * move that will not come. What cannot be undone is this side's seat — a room
 * only takes a player while it is empty — so leaving is final, and the player
 * is told so.
 */
function requestLeave() {
  if (mode !== 'online') return;
  const inPlay = onlineUiState === 'playing' && !gameFinished() && game.history().length > 0;
  if (!inPlay) {
    enterOnlineIdle();
    return;
  }
  askConfirm(
    {
      title: '离开这一局？',
      sub: '离开之后这个房间码不能再坐回来。钟会继续走，直到归零。',
      confirmLabel: '离开',
    },
    enterOnlineIdle,
  );
}

/* ------------------------------------------------------------------ */
/* Invite codes and links                                              */
/* ------------------------------------------------------------------ */

function inviteLink() {
  return `${location.origin}${location.pathname}#g=${encodeURIComponent(roomGame.code || '')}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function copyInviteCode() {
  if (!roomGame.code) return;
  if (await copyToClipboard(roomGame.code)) {
    showToast('房间码已复制。');
    const copyIcon = els.copyCodeBtn.querySelector('.icon-copy');
    const checkIcon = els.copyCodeBtn.querySelector('.icon-check');
    copyIcon?.classList.add('hidden');
    checkIcon?.classList.remove('hidden');
    clearTimeout(copyCodeTimer);
    copyCodeTimer = setTimeout(() => {
      copyIcon?.classList.remove('hidden');
      checkIcon?.classList.add('hidden');
    }, 1600);
  } else {
    showToast('复制没成功 —— 请选中房间码自己复制。');
  }
}

async function copyInviteLink() {
  if (!roomGame.code) return;
  if (await copyToClipboard(inviteLink())) {
    showToast('邀请链接已复制 —— 发给对方就能进来。');
    els.copyLinkLabel.textContent = '链接已复制！';
    clearTimeout(copyLinkTimer);
    copyLinkTimer = setTimeout(() => {
      els.copyLinkLabel.textContent = '复制邀请链接';
    }, 1600);
  } else {
    showToast('复制没成功 —— 请选中房间码自己复制。');
  }
}

/* ------------------------------------------------------------------ */
/* Classroom (one teacher, many students)                              */
/* ------------------------------------------------------------------ */

/**
 * A classroom board is a picture of the server's move list, never a game this
 * device owns: there is no clock and no result, and whose turn it is to move
 * changes ply by ply as the teacher hands the board out. So none of the online
 * machinery — seats, time controls, verdicts, resigning — applies here, and the
 * only recovery a wrong board needs is to read the record again.
 */

/** How long a move may go unanswered before the board stops assuming it landed. */
const CLASS_SENT_MS = 8000;

const CLASS_HAND_LABEL = { none: '旁听', raised: '举手', approved: '可走一步' };

/** The line under a student's 举手 button, which is also their only read on
 *  what is happening to them — the board itself looks the same either way. */
const CLASS_HAND_NOTE = {
  none: '等待老师走子……想走棋就举手。',
  raised: '手已经举起来了，等老师点你。',
  approved: '老师让你走一步 —— 现在可以动棋盘了。',
};

/** 那一行现在讲的是账号（要先登录/先验证），不是课堂出了什么事。身份一落定就
 *  该收掉，否则人刚从那个对话框里登录成功，屏幕上还挂着"请先登录"。 */
let classGateLine = false;

function setClassError(message) {
  classGateLine = false;
  els.classError.textContent = message;
  els.classError.hidden = !message;
}

/** Where a line about the class goes: the panel while arranging it, a toast after. */
function classProblem(message) {
  if (['idle', 'creating', 'joining'].includes(classUiState)) setClassError(message);
  else showToast(message);
}

/** Hold one classroom call at a time, so a slow host cannot queue up twenty. */
async function classCall(what) {
  classRequestOut = true;
  try {
    return await what();
  } finally {
    classRequestOut = false;
    // Snapshots repaint the panel while the request is still in flight, so the
    // button disabled above must be undone here rather than at the next poll.
    updateModeUi();
  }
}

/** Empty the classroom panel and put a clean board back in its place. */
function enterClassIdle() {
  clearAnnotationTool();
  stopClassPolling();
  clearTimeout(classAnnotTimer);
  classSession.reset();
  classUiState = 'idle';
  classAppliedSeq = 0;
  classSentSan = null;
  classSentAt = 0;
  classYourHand = 'none';
  manualEnd = null;
  reviewIndex = null;
  aiToken++;
  thinking = false;
  resetBoard();
  resetClock(null);
  resetTracking();
  finishPromotion(null);
  clearSelection();
  clearTimeout(gameOverTimer);
  closeDialogs();
  boardView.setOrientation('w');
  announcedPlies = 0;
  setClassError('');
  els.classJoinInput.value = '';
  els.classStudents.replaceChildren();
  els.srStatus.textContent = '课堂。老师开课堂拿课堂码，学生输这四位数字进来旁听。';
  // 进这一栏顺带问一次教练资格：上一次问可能是几小时前、甚至换个账号之后，
  // 而那一行话和【开课堂】能不能点都取自它。
  coachApp?.refresh();
  renderAll();
}

/** Open a class and read out its code for the teacher to dictate. */
async function createClass() {
  if (mode !== 'class' || classUiState !== 'idle') return;
  setClassError('');
  classUiState = 'creating';
  updateModeUi();
  const reply = await classCall(() => classSession.create());
  if (!reply?.ok) {
    classUiState = 'idle';
    updateModeUi();
    return;
  }
  // handleClassSnapshot has sat us in the class and started the polling.
  els.classJoinInput.value = '';
}

/** Take a seat in a class from its 4-digit code. */
async function joinClass(rawCode) {
  if (mode !== 'class' || classUiState !== 'idle') return;
  const code = normalizeClassCode(rawCode);
  if (!code) {
    setClassError('先填课堂码 —— 4 位数字。');
    els.classJoinInput.focus();
    return;
  }
  setClassError('');
  classUiState = 'joining';
  updateModeUi();
  const reply = await classCall(() => classSession.join(code));
  if (!reply?.ok) {
    classUiState = 'idle';
    updateModeUi();
    els.classJoinInput.focus();
  }
}

/**
 * Stop watching, and for a teacher end the class. A student leaves only
 * themselves: the board stays where it is for everyone still in the room.
 */
async function leaveClass() {
  if (mode !== 'class' || !classSession.code) return;
  const wasTeacher = classSession.isTeacher;
  stopClassPolling();
  clearTimeout(classAnnotTimer);
  await classCall(() => classSession.leave());
  enterClassIdle();
  showToast(wasTeacher ? '课堂已关闭。' : '已离开课堂。');
}

/**
 * The server's word about the class, whichever call brought it.
 *
 * The board is a replay of the server's move list rather than a copy of its
 * position, which is what keeps the scoresheet, the review buttons and the PGN
 * export working while several people push the same board around.
 */
function handleClassSnapshot(cls, fresh) {
  if (mode !== 'class') return;

  if (classUiState === 'creating' || classUiState === 'joining') {
    sitInClass(cls);
    return;
  }
  if (!['teaching', 'spectating'].includes(classUiState)) return;

  if (cls.status !== 'open') {
    endClass();
    return;
  }

  const broke = !applyClassEvents(fresh);
  if (broke || classDrifted(cls)) rebuildClass(cls);

  announceHand(cls);
  updateClassRoster();
  updateModeUi();
  renderAll();
}

/** A seat has appeared in a class: take it and get the board under it. */
function sitInClass(cls) {
  aiToken++;
  thinking = false;
  manualEnd = null;
  reviewIndex = null;
  classAppliedSeq = 0;
  classSentSan = null;
  classSentAt = 0;
  classYourHand = cls.you?.hand ?? 'none';
  finishPromotion(null);
  clearSelection();
  closeDialogs();
  clearTimeout(gameOverTimer);
  resetClock(null);
  resetTracking();
  boardView.setOrientation('w');
  announcedPlies = 0;
  resetBoard();
  classUiState = cls.you?.role === 'teacher' ? 'teaching' : 'spectating';
  // A student joining halfway gets the record with the seat, so the replay here
  // lands on the live position and fills in the scoresheet at the same time.
  rebuildClass(cls);
  startClassPolling();
  updateClassRoster();
  updateModeUi();
  renderAll();
  const text =
    classUiState === 'teaching'
      ? `课堂已开。课堂码 ${cls.code} —— 让学生输这四位数字进来。`
      : `已进入课堂 ${cls.code}。${cls.you?.hand === 'approved' ? '老师已经让你走一步。' : '先看着，想走棋就举手。'}`;
  els.srStatus.textContent = text;
  showToast(text);
  track('Class Joined', { role: cls.you?.role });
}

/**
 * Draw the events this board has not seen. False means the list stopped fitting
 * — a hole in the numbering, or a move this engine will not play from here —
 * which is the caller's cue to read the whole record again instead of patching.
 */
function applyClassEvents(events) {
  for (const event of events) {
    if (event.seq <= classAppliedSeq) continue;
    classAppliedSeq = event.seq;
    const data = event.data ?? {};
    if (event.type === 'move') {
      // The referee writing down what this side already played in anticipation.
      if (data.san === classSentSan) {
        classSentSan = null;
        continue;
      }
      if (!game.move(data.san)) return false;
      trackGameStart();
    } else if (event.type === 'annotation') {
      annotationOverlay.applyRemote(game.fen(), data.annotations);
    }
  }
  return true;
}

/** Do the board and the server disagree about where the class got to? */
function classDrifted(cls) {
  // An older position is a picture of the game, not a claim about where it is.
  if (reviewing()) return false;
  if (classSentSan !== null) {
    // A move still on its way is one ply the record has not caught up with. Past
    // the wait the request is gone, so stop believing it and let the record win.
    if (Date.now() - classSentAt < CLASS_SENT_MS) return false;
    classSentSan = null;
  }
  // Events can outpace the class row, and a list that arrived in pages leaves
  // this board short until the next poll. Neither is a disagreement.
  if (classAppliedSeq < cls.seq) return false;
  return fenCore(game.fen()) !== fenCore(cls.fen);
}

/**
 * Play the class's own move list again. The one recovery this board can do by
 * itself, and the one thing nobody in the room should notice happening.
 */
function rebuildClass(cls) {
  resetBoard();
  for (const event of classSession.events) {
    if (event.type === 'move') {
      const san = event.data?.san;
      if (!san || !game.move(san)) break;
    } else if (event.type === 'annotation') {
      annotationOverlay.applyRemote(game.fen(), event.data?.annotations);
    }
  }
  // A list this engine will not replay — or one that has not all arrived yet —
  // leaves the position as the shorter lie, since that is what everyone is
  // looking at. The scoresheet fills in as the polls catch up.
  if (fenCore(game.fen()) !== fenCore(cls.fen)) loadBoard(cls.fen);
  classAppliedSeq = classSession.seqSeen();
  classSentSan = null;
  clampReview();
}

/** The class is over: stop asking, and say so once. */
function endClass() {
  if (classUiState === 'ended') return;
  stopClassPolling();
  clearTimeout(classAnnotTimer);
  classUiState = 'ended';
  finishPromotion(null);
  clearSelection();
  closeDialogs();
  const text = '课堂已经关闭，棋盘停在最后一步。要再上课就重新开一个。';
  els.srStatus.textContent = text;
  setClassError(text);
  updateModeUi();
  renderAll();
}

/** Tell a student the teacher has just handed them the board. */
function announceHand(cls) {
  const hand = cls.you?.hand ?? 'none';
  if (hand === classYourHand) return;
  classYourHand = hand;
  if (hand === 'approved') {
    els.srStatus.textContent = '老师让你走一步。现在可以动棋盘了。';
    showToast('老师让你走一步 —— 现在可以动棋盘了。');
  }
}

/** The teacher's list of who is in the room and whose hand is up. */
function updateClassRoster() {
  if (classUiState !== 'teaching') return;
  const rows = classSession.members.filter((m) => m.role !== 'teacher');
  if (rows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'online-note';
    empty.textContent = '还没有学生进来。把课堂码念给他们。';
    els.classStudents.replaceChildren(empty);
    return;
  }
  els.classStudents.replaceChildren(
    ...rows.map((member) => {
      const row = document.createElement('div');
      row.className = 'class-student';
      const name = document.createElement('span');
      name.className = 'class-student-name';
      name.textContent = member.nickname || `学生 ${member.id}`;
      const badge = document.createElement('span');
      badge.className = `class-hand-badge hand-${member.hand}`;
      badge.textContent = CLASS_HAND_LABEL[member.hand] || '旁听';
      row.append(name, badge);
      if (member.hand === 'raised' || member.hand === 'approved') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-small class-approve-btn';
        btn.textContent = member.hand === 'approved' ? '收回' : '请他走一步';
        btn.addEventListener('click', () => approveStudent(member.id, member.hand !== 'approved'));
        row.appendChild(btn);
      }
      return row;
    }),
  );
}

/** Grant or take back one student's one move. */
async function approveStudent(playerId, approve) {
  if (classUiState !== 'teaching' || !classSession.code) return;
  await classCall(() => classSession.approveMove(playerId, approve));
}

/** Raise or lower this student's hand. */
async function toggleHand() {
  if (classUiState !== 'spectating' || !classSession.code) return;
  const raising = classSession.handStatus !== 'raised';
  await classCall(() => (raising ? classSession.raiseHand() : classSession.lowerHand()));
}

/**
 * Mirror the teacher's drawing to the room. Strokes come faster than anyone
 * needs: a short pause between the last one and the send keeps a dragged arrow
 * from turning into thirty requests.
 */
function queueClassBroadcast() {
  if (mode !== 'class' || classUiState !== 'teaching' || !classSession.code) return;
  clearTimeout(classAnnotTimer);
  classAnnotTimer = setTimeout(broadcastAnnotations, 400);
}

async function broadcastAnnotations() {
  const fen = annotationOverlay.ctx.getFen();
  const list = annotationOverlay.annotations.get(fen) ?? [];
  await classCall(() => classSession.annotate(JSON.parse(JSON.stringify(list))));
}

function startClassPolling() {
  if (classTimer || !classSession.code) return;
  classTimer = setInterval(pollClass, CLASS_POLL_MS);
}

function stopClassPolling() {
  clearInterval(classTimer);
  classTimer = 0;
}

async function pollClass() {
  if (classRequestOut || !classSession.code) return;
  await classCall(() => classSession.poll());
}

/** Send a move the teacher or an approved student has already seen played. */
async function sendClassMove(san) {
  classSentSan = san;
  classSentAt = Date.now();
  await classCall(() => classSession.move(san));
}

/**
 * A call that came back refused. An account problem opens the panel that fixes
 * it; being put out of the class ends the view; a dropped question is not news,
 * since the next poll asks it again.
 */
function handleClassProblem(reply) {
  if (!reply || mode !== 'class') return;
  const code = reply.code;

  if (code === 'sign_in_required' || code === 'verify_required') {
    stopClassPolling();
    const text = problemText(reply);
    els.srStatus.textContent = text;
    classProblem(text);
    classGateLine = true;
    if (['teaching', 'spectating'].includes(classUiState)) {
      classUiState = 'idle';
      classSession.reset();
    }
    updateModeUi();
    account.open(code === 'sign_in_required' ? 'signin' : 'account');
    return;
  }

  // 不够格的人按下了【开课堂】。界面只在没问到那一态时才让按钮亮着，所以这一条
  // 是兜底：把那一行补上、直接把申请表打开，而不是让人对着一句 403 猜。
  if (code === 'teacher_only') {
    coachApp?.noteBlocked();
    return;
  }

  if (code === 'not_class_member' || code === 'no_such_class' || code === 'class_closed') {
    stopClassPolling();
    clearTimeout(classAnnotTimer);
    classSession.reset();
    classUiState = code === 'class_closed' ? 'ended' : 'idle';
    classProblem(problemText(reply));
    updateModeUi();
    return;
  }

  if (code === 'no_permission') {
    // Somebody else moved the board while this side was deciding to. The next
    // snapshot says what actually happened; the guess on the screen does not.
    classProblem('现在轮不到你走 —— 棋盘已经跟着老师更新了。');
    if (classSession.cls) rebuildClass(classSession.cls);
    renderAll();
    return;
  }

  if (code === 'network' || code === 'service') {
    // A move may well have landed even though the answer was lost, so hold the
    // guess until the poll brings the record back.
    return;
  }

  classProblem(problemText(reply));
}

/* ------------------------------------------------------------------ */
/* PGN export                                                          */
/* ------------------------------------------------------------------ */

/**
 * Player names for the export. A PGN header is scoresheet notation rather than
 * interface text, so it keeps the English form — the difficulty included, which
 * is why that is spelled out here instead of reading LEVELS' labels.
 */
const PGN_LEVEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

function pgnNames() {
  if (mode === 'local') return { w: 'Player 1', b: 'Player 2' };
  if (mode === 'class') {
    const teacher = classSession.members.find((m) => m.role === 'teacher');
    const teacherName = teacher?.nickname || '老师';
    return { w: teacherName, b: '学生' };
  }
  if (mode === 'online') {
    // The nicknames the referee holds, so a scoresheet says who played rather
    // than who was sitting at this device.
    return { w: seatName('w') || 'White', b: seatName('b') || 'Black' };
  }
  const cpu = `Computer (${PGN_LEVEL[level]})`;
  return myColor === 'w' ? { w: 'Player', b: cpu } : { w: cpu, b: 'Player' };
}

function currentPgn(date) {
  const end = currentEnd();
  const names = pgnNames();
  const baseArgs = {
    sans: game.history().map((m) => m.san),
    result: end ? end.result : '*',
    white: names.w,
    black: names.b,
    date,
    control: clock.control,
    termination: end ? end.termination : 'unterminated',
    // 从别的局面开走的棋要把它写进棋谱，不然这份文件再导回来就变成另一盘。
    startFen: fenCore(gameOrigin) === fenCore(START_FEN) ? null : gameOrigin,
    // 分析里记下的支线树一起写出去（PGN 的括号段），不然换到别的软件就只剩主线。
    variations: getBranches(),
  };

  // Use annotated PGN if review data is available
  if (reviewData) {
    return buildAnnotatedPgn({
      ...baseArgs,
      review: { results: reviewData.results },
    });
  }
  return buildPgn(baseArgs);
}

async function copyPgn() {
  if (game.history().length === 0) return;
  if (await copyToClipboard(currentPgn(new Date()))) {
    showToast('棋谱已复制（PGN 格式）。');
  } else {
    showToast('复制没成功 —— 浏览器拦下了剪贴板。');
  }
}

/**
 * Put a PGN document where the browser will offer it as a file. Returns whether
 * it managed that: `onBlocked` is for the browsers that refuse downloads
 * outright (the ones inside a chat app), and only a caller that can hand the
 * text some other way has anything to do there.
 */
function savePgnFile(name, text, onBlocked) {
  let url = null;
  try {
    url = URL.createObjectURL(new Blob([text], { type: 'application/x-chess-pgn' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Released on a later task, once the download has certainly started.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch {
    if (url) URL.revokeObjectURL(url);
    onBlocked();
    return false;
  }
}

function downloadPgn() {
  if (game.history().length === 0) return;
  const now = new Date();
  // The clipboard still gets the player their game where downloads do not work.
  if (savePgnFile(pgnFilename(now), currentPgn(now), copyPgn)) {
    showToast('棋谱已存成 PGN 文件。');
  }
}

/* ------------------------------------------------------------------ */
/* Game library                                                        */
/* ------------------------------------------------------------------ */

/**
 * The panel of finished games (see ui/library.js). It reads storage and not the
 * board, so all this needs is a way to hand a file over and a way to ask before
 * throwing the list away.
 */
mountLibrary({
  showToast,
  askConfirm,
  download: (name, text) =>
    savePgnFile(name, text, () => showToast('下载被浏览器拦下了 —— 换个浏览器再试。')),
});

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

/**
 * The ichessgeek panel in the top bar (see ui/account.js). Online play is the
 * only thing the account is needed for, so the one thing to keep in step with
 * it is the room: signing out stops watching it, since the referee will not
 * take another move from a seat that is no longer signed in.
 */
/** 见 ui/coachPref.js、ui/coachApp.js、ui/coachProfile.js、ui/coachDirectory.js。
 * 用 let 而不是 const：下面 mountAccount 会同步 paint 一次，那一次的 onIdentity
 * 就要读这几个变量，声明在它后面会撞暂时性死区。 */
let coachPref = null;
let coachApp = null;
let coachProfile = null;
let coachDirectory = null;
let coachLightbox = null;
let coachEnrollment = null;
let coachComplaint = null;

/** null = 资格还在查询；投诉入口必须等明确知道“不是教练”后才出现。 */
function coachTeachState() {
  const state = coachApp?.state();
  return state == null ? null : state === 'approved';
}

function coachWasTeacher() {
  return coachApp?.identity()?.wasTeacher ?? null;
}

const account = mountAccount({
  showToast,
  onSignOut: handleSignedOut,
  // 身份一落定就问一次偏好和一次教练资格：那两行不能是上个账号留下的。
  onIdentity: () => {
    // 登录/注册/退出的那一下就把"请先登录"那行收掉：它说的是刚才那个身份。
    if (classGateLine) setClassError('');
    coachEnrollment?.syncGate();
    coachComplaint?.syncGate();
    coachProfile?.syncGate();
    coachDirectory?.syncGate();
    coachPref?.refresh();
    coachApp?.refresh();
    // 退出之后【填我的教练资料】要立刻收掉，名录上"这是我"那一枚也一样；
    // 登录之后问一次资料，那颗按钮才知道该说"填"还是"改"。
    coachProfile?.refresh();
  },
});

$('coach-admin-btn')?.addEventListener('click', () => {
  window.location.assign('/coach-admin');
});

coachLightbox = mountCoachLightbox();
const openCoachImage = (src, alt) => coachLightbox?.openImage(src, alt);

/** Signed out with a room open: put the online tab back to where it starts. */
function handleSignedOut() {
  if (!roomGame.code) return; // nothing was open
  const inPlay = onlineUiState === 'playing' && !gameFinished();
  enterOnlineIdle();
  const text = inPlay
    ? '你已退出登录，这一局不再刷新。钟会继续走。'
    : '你已退出登录。';
  showToast(text);
  els.srStatus.textContent = text;
}

/**
 * 「我想找什么样的教练」：附加位上的那张表（见 ui/coachPref.js）。
 * 它不改对弈的任何一条规则，只要两样东西 —— 现在是谁、以及怎么把人送去登录。
 */
coachPref = mountCoachPref({
  showToast,
  player: () => account.player(),
  openAccount: (which) => account.open(which),
  // 偏好一改，名录那一列的顺序就得重算（排序在界面这一侧，见 game/coachMatch.js）。
  onPrefChange: () => coachDirectory?.rerender(),
});

/** 预约与投诉都先在前端确认邮箱验证；服务端仍从会话重新判定身份。 */
coachEnrollment = mountCoachEnrollment({
  showToast,
  player: () => account.player(),
  openAccount: (which) => account.open(which),
});
coachComplaint = mountCoachComplaint({
  showToast,
  player: () => account.player(),
  openAccount: (which) => account.open(which),
  wasTeacher: coachWasTeacher,
  onChanged: () => coachDirectory?.refresh({ force: true }),
});

/**
 * 「填我的教练资料」：只给批过的教练（含管理员）看，判据来自 coachApp 那一态。
 * 资料本身在服务器上还有第二道门（chess_coach_profile_save.php 里的 can_teach），
 * 这里的隐藏只是为了不让人点了才吃一句 403。
 */
coachProfile = mountCoachProfile({
  showToast,
  player: () => account.player(),
  openAccount: (which) => account.open(which),
  canTeach: coachTeachState,
  onChanged: () => coachDirectory?.refresh({ force: true }),
  openImage: openCoachImage,
});

/** 名录 + 主页：公开数据，首屏就取一次，没登录也看得见有谁在教。 */
coachDirectory = mountCoachDirectory({
  player: () => account.player(),
  pref: () => coachPref?.value() ?? null,
  openProfile: () => coachProfile?.open(),
  openEnrollment: (coach) => coachEnrollment?.open(coach),
  openComplaint: (coach) => coachComplaint?.open(coach),
  complaints: coachComplaint,
  canTeach: coachTeachState,
  openImage: openCoachImage,
});

/**
 * 「申请成为教练」：课堂面板上那一小块（见 ui/coachApp.js）。
 * 它管的是【开课堂】点不点得动，所以状态一变要重画一次那一栏。
 */
coachApp = mountCoachApp({
  showToast,
  player: () => account.player(),
  openAccount: (which) => account.open(which),
  onStateChange: () => {
    updateModeUi();
    tacticsPanel?.setCanManage(canManageTactics());
    learnPanel?.syncCoachAccess(canManageTactics());
    // 刚批下来的教练当场就能看到【填我的教练资料】，不用刷新页面。
    coachProfile?.syncGate();
    // 投诉按钮与教练投诉记录都随资格变化；查询中一律不显示投诉入口。
    coachComplaint?.syncGate();
    coachDirectory?.syncGate();
  },
});

/**
 * 服务端算出来"现在还不能开课堂"。只有问到了、且那一态不是 approved 才算拦：
 * 没登录、或者这一次根本没取回来（state 为 null）时按钮照旧能点，
 * 由 chess_class_create.php 在那一次请求上说话。
 */
function teacherBlocked() {
  const state = coachApp?.state() ?? null;
  return state !== null && state !== 'approved';
}

/** 国象自学教程：左边常驻的一张小卡，人人可看，不经过任何资格门。 */
learnPanel = mountLearnPanel({ onPractice: openPractice, canAccessCoach: canManageTactics });
tacticsPanel = mountTacticsPanel(els.tacticsPanelContainer, {
  problems: [],
  canManage: canManageTactics(),
  importContainer: $('coach-import-container'),
  onProgress: () => learnPanel?.refresh(),
  setFen: (fen) => {
    if (!tacticsMode) return;
    loadBoard(fen);
    tacticsViewColor = game.turn();
    boardView.setOrientation(tacticsViewColor);
    const plies = renderAll();
    updateTacticsHighlight(plies);
  },
  getFen: () => game.fen(),
});
mountCommunityPresence();

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

for (const button of els.modeButtons) {
  button.addEventListener('click', () => setMode(button.dataset.mode));
}

els.newGameBtn.addEventListener('click', requestNewGame);
els.undoBtn.addEventListener('click', undoTurn);
els.drawBtn.addEventListener('click', requestDraw);
els.resignBtn.addEventListener('click', requestResign);
els.drawAccept.addEventListener('click', () => answerRoomDraw(true));
els.drawReject.addEventListener('click', () => answerRoomDraw(false));
// Esc 不能把提和框收掉：服务器那条还挂着，下一次轮询又会摆回来。
els.drawOfferDialog.addEventListener('cancel', (e) => e.preventDefault());
els.leaveBtn.addEventListener('click', requestLeave);
els.gameoverNew.addEventListener('click', newGame); // hidden in online mode
els.gameoverClose.addEventListener('click', () => els.gameoverDialog.close());

els.hostBtn.addEventListener('click', createRoom);
els.joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  joinRoom(els.joinInput.value);
});
els.copyCodeBtn.addEventListener('click', copyInviteCode);
els.copyLinkBtn.addEventListener('click', copyInviteLink);
els.cancelHostBtn.addEventListener('click', cancelOnlineSetup);
els.cancelJoinBtn.addEventListener('click', cancelOnlineSetup);

els.classCreateBtn.addEventListener('click', createClass);
els.classJoinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  joinClass(els.classJoinInput.value);
});
els.classLeaveBtn.addEventListener('click', leaveClass);
els.classStudentLeaveBtn.addEventListener('click', leaveClass);
els.classHandBtn.addEventListener('click', toggleHand);

// A teacher's drawing is broadcast, but only after a short pause so that a
// single dragged arrow does not turn into thirty requests.
annotationOverlay.onEdit = queueClassBroadcast;

els.levelSelect.addEventListener('change', () => {
  level = els.levelSelect.value;
  saveSettings();
  renderAll();
});

els.colorSelect.addEventListener('change', () => {
  colorSetting = els.colorSelect.value;
  saveSettings();
});

els.timeSelect.addEventListener('change', () => {
  timeSetting = els.timeSelect.value;
  saveSettings();
  // Nothing has been played yet, so there is no game to disturb: put the new
  // clock on the board at once rather than making the player press New game
  // to see the choice they just made.
  if (mode !== 'online' && !gameFinished() && game.history().length === 0) {
    resetClock(timeControl(timeSetting));
  }
  renderAll();
});

els.boardStyleSelect.addEventListener('change', () => {
  boardStyle = normalizeBoardStyle(els.boardStyleSelect.value);
  applyAppearance();
  saveSettings();
});

els.pieceStyleSelect.addEventListener('change', () => {
  pieceStyle = normalizePieceStyle(els.pieceStyleSelect.value);
  applyAppearance();
  saveSettings();
  renderAll();
});

els.soundBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  updateSoundButton();
  saveSettings();
  if (soundEnabled) {
    unlockMoveAudio();
    playMoveSound('move');
  }
});

window.addEventListener('pointerdown', unlockMoveAudio, { capture: true, passive: true });
window.addEventListener('keydown', unlockMoveAudio, { capture: true, passive: true });

els.reviewFirstBtn.addEventListener('click', () => reviewNavigate('first'));
els.reviewPrevBtn.addEventListener('click', () => reviewNavigate('prev'));
els.reviewNextBtn.addEventListener('click', () => reviewNavigate('next'));
els.reviewLastBtn.addEventListener('click', () => reviewNavigate('last'));
els.analysisBtn.addEventListener('click', () => setAnalysis(!analyzing));
els.reviewGameBtn.addEventListener('click', () => {
  if (reviewData) {
    // 已有复盘数据，切换显示
    setReviewReportOpen(els.reviewResultPanel.classList.contains('hidden'));
  } else {
    startReview();
  }
});
els.tacticsBtn.addEventListener('click', () => {
  if (tacticsMode) closeTactics();
  else openTactics();
});
els.tacticsDialogClose.addEventListener('click', closeTactics);
els.tacticsDialog.addEventListener('close', () => {
  if (tacticsMode) closeTactics();
});

// The move list is rebuilt on every render, so the click lands on the list.
// 记录本里只有主线：支线在棋盘下方那份棋谱上点，见 els.pgnBody。
els.moveList.addEventListener('click', (e) => {
  const ply = e.target.closest('button.ply');
  if (ply) goToPly(Number(ply.dataset.ply));
});

// 棋盘下方那份棋谱：括号里的走法点一下就把棋盘挪到那条支线上，主线那一段还是
// 普通的跳步。只有分析开着时这些 token 才是按钮（见 pgnPly）。
els.pgnBody.addEventListener('click', (e) => {
  const token = e.target.closest('.pgn-ply');
  if (!token || !analyzing) return;
  const path = (token.dataset.path ?? '').split(',').filter(Boolean).map(Number);
  const ply = Number(token.dataset.ply);
  if (!path.length) {
    goToPly(ply);
    return;
  }
  if (!enterBranch(path, ply)) return;
  renderAll();
  announceReview();
});

els.pgnCopyBtn.addEventListener('click', copyPgn);
els.pgnDownloadBtn.addEventListener('click', downloadPgn);

for (const button of els.themeButtons) {
  button.addEventListener('click', () => {
    themeSetting = button.dataset.themeChoice;
    saveSettings();
    applyTheme();
  });
}

for (const button of els.promoDialog.querySelectorAll('[data-promo]')) {
  button.addEventListener('click', () => finishPromotion(button.dataset.promo));
}
// Native <dialog> close (Escape, close()) — resolve a pending promotion as
// cancelled. finishPromotion is a no-op when nothing is pending.
els.promoDialog.addEventListener('close', () => finishPromotion(null));

els.confirmYes.addEventListener('click', () => {
  const action = confirmAction;
  confirmAction = null;
  els.confirmDialog.close();
  action?.();
});
els.confirmNo.addEventListener('click', () => els.confirmDialog.close());
els.confirmDialog.addEventListener('close', () => {
  confirmAction = null;
});

// Clicking the backdrop dismisses a dialog. Backdrop clicks target the dialog
// element itself but land outside its box; padding clicks land inside it.
function closeOnBackdropClick(dialog) {
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right &&
      e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
}
closeOnBackdropClick(els.promoDialog);
closeOnBackdropClick(els.gameoverDialog);
closeOnBackdropClick(els.confirmDialog);
closeOnBackdropClick(els.accountDialog);
closeOnBackdropClick(els.libraryDialog);

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  // Escape in the account or library panel closes that panel and nothing else.
  if (e.target instanceof Element && e.target.closest('#account-dialog, #library-dialog')) return;
  // Dialogs close natively on Escape; handle them here too so the shortcut
  // cannot be lost, and so Escape means "close dialog" before "deselect".
  if (els.promoDialog.open) {
    finishPromotion(null);
  } else if (els.gameoverDialog.open) {
    els.gameoverDialog.close();
  } else if (els.confirmDialog.open) {
    els.confirmDialog.close();
  } else if (els.accountDialog.open) {
    els.accountDialog.close();
  } else if (selected) {
    // Escape means "put it back": a piece still held under the pointer is
    // dropped along with the selection, rather than left riding the cursor
    // with nowhere legal to land.
    boardView.cancelDrag();
    clearSelection();
    renderAll();
  }
});

function anyDialogOpen() {
  return (
    els.promoDialog.open ||
    els.gameoverDialog.open ||
    els.confirmDialog.open ||
    els.accountDialog.open
  );
}

// Step through the game with the arrow keys. Two things already own these
// keys and keep them: a focused square, where they move around the board's
// ARIA grid, and a form control, where they change its value.
window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  if (anyDialogOpen()) return;
  if (e.target instanceof Element && e.target.closest('#board, input, select, textarea')) {
    return;
  }
  const plies = viewPlies();
  switch (e.key) {
    case 'ArrowLeft': reviewNavigate('prev'); break;
    case 'ArrowRight': reviewNavigate('next'); break;
    case 'Home': reviewNavigate('first'); break;
    case 'End': reviewNavigate('last'); break;
    default: return;
  }
  e.preventDefault();
});

// The page is going away, or into the back/forward cache. There is no goodbye
// to send: the room stays as it is, clock and all. So the two things worth
// doing are stop asking about it, and stop the local countdown — a page frozen
// for ten minutes should not come back ten minutes down, and `pagehide` is the
// only moment that knows the page is leaving.
window.addEventListener('pagehide', () => {
  stopRoomPolling();
  clock.setRunning(null);
  stopClockTimer();
  saveNow();
});

// Hidden: a tab put in the background may never be looked at again, so store
// the clock where it stands rather than at the last move. Shown again: the
// timers were throttled while we were away, so ask what happened rather than
// wait for the next poll to get round to it.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveNow();
  else if (mode === 'online' && roomGame.code) pollRoom();
});

// Back from the back/forward cache: the room is still ours but pagehide stopped
// watching it, and the clocks have been frozen for as long as the page was put
// away. One poll says what happened in the meantime; the render picks the clock
// back up where pagehide left it.
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  if (mode === 'online' && roomGame.code && ['hosting', 'playing'].includes(onlineUiState)) {
    startRoomPolling();
    pollRoom();
  }
  renderAll();
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

buildTimeOptions();
loadSettings();
applyTheme();

// An invite link is a room code in the address bar. Arriving through one lands
// on the online tab with the code already in the box — but the player still has
// to press 进入, so a link that was not meant for them cannot seat them in a
// stranger's game. This does not go into the settings: the next plain visit to
// the board opens whatever mode they last chose.
const invited = normalizeCode(window.location.hash);
if (invited) mode = 'online';

function startApp() {
  if (mode === 'online') enterOnlineIdle({ inviteCode: invited });
  else if (mode === 'class') enterClassIdle();
  else if (!restoreGame()) newGame();
}

startApp();
