/**
 * 支线：分析模式下从任何一个已经走过的局面改走一手，就把另一条变化记下来。
 *
 * 记的是一棵树，而**主线不在这棵树里** —— 主线就是棋盘上那盘棋（main.js 的
 * `game`）。每个节点只说两件事：它顶掉了父线的第几手，以及顶掉之后怎么走。
 *
 *   { branchIndex, moves, children }
 *
 * `branchIndex` 是父线走法列表里的下标，本节点的 `moves[0]` 就是那一手的替代品；
 * 子节点对本文的 `moves` 做同样的事。这么记有三个好处：导出 PGN 时括号该套在哪
 * 层一目了然；在支线中间改走时旧的那一截不用扔（它就是父线，新走法是孩子）；
 * 界面上"支线里再分支线"有地方放。
 *
 * 只在内存里，随新一盘棋清空。
 */

/** @typedef {{ branchIndex: number, moves: string[], children: Branch[] }} Branch */
/** @typedef {number[]} Path 从主线数下来的下标链，[] 表示主线本身 */

/** @type {Branch[]} */
let mainChildren = [];

/**
 * 棋盘正在看的那条线。null = 主线；否则 { path, ply }，ply 是本节点已显示几手
 * （0 = 停在分叉点，1 = 走过第一手……）。
 * @type {null | { path: Path, ply: number }}
 */
let active = null;

/** 内部用：拿到活的节点对象（会改它，所以不外传）。 */
function resolve(path) {
  let list = mainChildren;
  let node = null;
  for (const index of path) {
    node = list?.[index];
    if (!node) return null;
    list = node.children;
  }
  return node;
}

function clone(node, path) {
  return {
    path: [...path],
    branchIndex: node.branchIndex,
    moves: [...node.moves],
    children: node.children.map((child, i) => clone(child, [...path, i])),
  };
}

/** 带 path 的支线树：界面点哪条线要拿这个。主线没有节点，所以 path 为空。 */
export function getBranches() {
  return mainChildren.map((node, i) => clone(node, [i]));
}

/** 某条支线现在记着什么（只读的一份）。path 为空 = 主线，没有节点。 */
export function getNode(path) {
  if (!Array.isArray(path) || path.length === 0) return null;
  const node = resolve(path);
  return node ? clone(node, path) : null;
}

/** 一条支线的父线是哪条（[] = 主线）。 */
function parentPath(path) {
  return path.slice(0, -1);
}

/**
 * 「在 `path` 这条支线的第 `ply` 手位置上改走一手」会挂在哪里。
 *
 * 三种落点，只有第三种是往深处走：
 * - 主线（path 为空）：挂在主线下，顶掉第 ply 手。
 * - 支线的第 0 手：这一手替代的是支线自己的第一手，而那条支线本身也就是同一个
 *   位置上的替代 —— 所以它是**同级**，写进父线的列表里。套成子节点就变成括号
 *   里再开一个括号说同一件事。
 * - 支线的中间：挂在它下面，顶掉第 ply 手。
 *
 * @returns {null | { list: Branch[], owner: Path, branchIndex: number }}
 */
function slotFor(path, ply) {
  if (!Array.isArray(path)) return null;
  if (!Number.isInteger(ply) || ply < 0) return null;
  if (path.length === 0) return { list: mainChildren, owner: [], branchIndex: ply };
  const node = resolve(path);
  if (!node) return null;
  if (ply === 0) {
    const owner = parentPath(path);
    const siblings = owner.length === 0 ? mainChildren : resolve(owner)?.children;
    if (!siblings) return null;
    return { list: siblings, owner, branchIndex: node.branchIndex };
  }
  if (ply > node.moves.length) return null;
  return { list: node.children, owner: path, branchIndex: ply };
}

/**
 * 那个位置上本来走的是哪一手，null 表示本来没有着法（走在支线末尾，是续着走）。
 *
 * 界面靠它判断「这手其实就在现有那条线上」—— 那就往前走一步，别另起一支。
 */
export function existingMoveAt(path, ply, mainSans) {
  const slot = slotFor(path, ply);
  if (!slot) return null;
  const line = slot.owner.length === 0 ? mainSans : resolve(slot.owner)?.moves;
  return line?.[slot.branchIndex] ?? null;
}

/**
 * 同一个位置、同一手改走已经记过了？返回那条支线的 path。
 * 棋盘上再走一遍同一手不该多出一条一模一样的支线。
 */
export function findBranch(path, ply, san) {
  const slot = slotFor(path, ply);
  if (!slot || !san) return null;
  const index = slot.list.findIndex(
    (node) => node.branchIndex === slot.branchIndex && node.moves[0] === san,
  );
  if (index < 0) return null;
  return [...slot.owner, index];
}

/** 在支线的第 ply 手处改走 `san`，生成一条挂在它下面（或同级）的支线。返回新 path。 */
export function branchAt(path, ply, san) {
  const slot = slotFor(path, ply);
  if (!slot || !san) return null;
  const ownerLine = slot.owner.length === 0 ? null : resolve(slot.owner)?.moves;
  if (ownerLine && slot.branchIndex >= ownerLine.length) return null;
  if (slot.owner.length === 0 && !Number.isInteger(slot.branchIndex)) return null;
  slot.list.push({ branchIndex: slot.branchIndex, moves: [san], children: [] });
  return [...slot.owner, slot.list.length - 1];
}

/** 走到支线末尾之后的续着：直接长在这条支线上，不是新的支线。 */
export function appendToBranch(path, san) {
  const node = resolve(path);
  if (!node || !san) return -1;
  node.moves.push(san);
  return node.moves.length;
}

/**
 * 主线变短（撤销、或换主线）之后，够不着的支线整条扔掉。
 *
 * 分叉点正好落在主线末尾的要留着：那是"主线走到这里之后另走过的一条线"，撤销把
 * 改走的那一手退掉之后，旧的那一截就停在这个位置上 —— 扔了等于把用户记下的变化
 * 撤没。
 */
export function pruneBranches(mainLen) {
  const limit = Number.isInteger(mainLen) ? mainLen : 0;
  mainChildren = mainChildren.filter(
    (node) => node.branchIndex <= limit && node.moves.length,
  );
  if (active) {
    const node = resolve(active.path);
    if (!node) active = null;
    else if (active.ply > node.moves.length) active = { path: active.path, ply: node.moves.length };
  }
}

/**
 * 看哪条线。path 为空数组（或 null）= 回主线。
 * @returns {boolean} 有没有真的切过去
 */
export function setActiveBranch(path, ply) {
  if (!path || path.length === 0) {
    active = null;
    return true;
  }
  const node = resolve(path);
  if (!node) return false;
  const at = Number.isInteger(ply) ? Math.max(0, Math.min(ply, node.moves.length)) : 0;
  active = { path: [...path], ply: at };
  return true;
}

/** @returns {null | { path: Path, ply: number }} */
export function getActiveBranch() {
  return active;
}

export function isViewingBranch() {
  return active !== null;
}

/** 支线内部的上下一步。返回走完之后显示的 ply。 */
export function navigateActiveBranch(direction) {
  if (!active) return 0;
  const node = resolve(active.path);
  if (!node) {
    active = null;
    return 0;
  }
  const last = node.moves.length;
  const ply =
    direction === 'first'
      ? 0
      : direction === 'prev'
        ? Math.max(0, active.ply - 1)
        : direction === 'next'
          ? Math.min(last, active.ply + 1)
          : last;
  active = { path: active.path, ply };
  return ply;
}

/** 恢复 getBranches() 取出的只读快照。 */
export function restoreBranches(branches) {
  clearBranches();
  if (!Array.isArray(branches)) return;
  for (const branch of branches) {
    if (!branch || !Array.isArray(branch.moves) || !branch.moves.length) continue;
    const path = branchAt([], branch.branchIndex, branch.moves[0]);
    if (!path) continue;
    for (const san of branch.moves.slice(1)) appendToBranch(path, san);
    restoreChildren(path, branch.children);
  }
}

function restoreChildren(parentPath, children) {
  if (!Array.isArray(children)) return;
  for (const child of children) {
    if (!child || !Array.isArray(child.moves) || !child.moves.length) continue;
    const path = branchAt(parentPath, child.branchIndex, child.moves[0]);
    if (!path) continue;
    for (const san of child.moves.slice(1)) appendToBranch(path, san);
    restoreChildren(path, child.children);
  }
}

export function clearBranches() {
  mainChildren = [];
  active = null;
}
