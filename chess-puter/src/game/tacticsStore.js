/**
 * 题库存储：收藏、进度、本地持久化。
 *
 * 用 localStorage 保存：
 *   - favorites: Set<problemId> 收藏的题目
 *   - progress: Map<problemId, { attempts, solved, lastAttempt }> 做题记录
 *   - problemSets: 已导入的题目集（可按名称管理）
 *   - userRating: number 用户难度评级（类似 ELO）
 */

const STORAGE_KEY = 'chess-tactics-store';
const DEFAULT_RATING = 1000;
const K_FACTOR = 32; // ELO 变化系数

/**
 * 加载存储数据。
 * @returns {object}
 */
function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      // 兼容旧数据：如果没有 userRating，设置为默认值
      if (data.userRating === undefined) {
        data.userRating = DEFAULT_RATING;
      }
      if (!Array.isArray(data.readTopics)) data.readTopics = [];
      return data;
    }
  } catch (e) {
    console.warn('Failed to load tactics store:', e);
  }
  return {
    favorites: [],
    progress: {},
    problemSets: {},
    userRating: DEFAULT_RATING,
    readTopics: [],
  };
}

/**
 * 保存存储数据。
 * @param {object} data
 */
function saveStore(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save tactics store:', e);
  }
}

/**
 * 切换收藏状态。
 * @param {string} problemId
 * @returns {boolean} 新的收藏状态
 */
export function toggleFavorite(problemId) {
  const store = loadStore();
  const idx = store.favorites.indexOf(problemId);
  if (idx >= 0) {
    store.favorites.splice(idx, 1);
    saveStore(store);
    return false;
  } else {
    store.favorites.push(problemId);
    saveStore(store);
    return true;
  }
}

/**
 * 检查是否已收藏。
 * @param {string} problemId
 * @returns {boolean}
 */
export function isFavorite(problemId) {
  const store = loadStore();
  return store.favorites.includes(problemId);
}

/**
 * 获取所有收藏的题目 ID。
 * @returns {string[]}
 */
export function getFavorites() {
  const store = loadStore();
  return [...store.favorites];
}

/**
 * 记录一次做题尝试。
 * @param {string} problemId
 * @param {boolean} solved - 是否答对
 */
export function recordAttempt(problemId, solved) {
  const store = loadStore();
  if (!store.progress[problemId]) {
    store.progress[problemId] = { attempts: 0, solved: false, lastAttempt: null };
  }
  const prog = store.progress[problemId];
  prog.attempts++;
  prog.lastAttempt = Date.now();
  if (solved) {
    prog.solved = true;
  }
  saveStore(store);
}

/**
 * 获取题目的做题进度。
 * @param {string} problemId
 * @returns {{ attempts: number, solved: boolean, lastAttempt: number|null }|null}
 */
export function getProgress(problemId) {
  const store = loadStore();
  return store.progress[problemId] || null;
}

/**
 * 获取所有做题进度。
 * @returns {object}
 */
export function getAllProgress() {
  const store = loadStore();
  return { ...store.progress };
}

export function getReadTopics() {
  return [...loadStore().readTopics];
}

export function markTopicRead(topicId) {
  const store = loadStore();
  if (!store.readTopics.includes(topicId)) {
    store.readTopics.push(topicId);
    saveStore(store);
  }
}

/**
 * 重置题目的做题进度。
 * @param {string} problemId
 */
export function resetProgress(problemId) {
  const store = loadStore();
  delete store.progress[problemId];
  saveStore(store);
}

/**
 * 保存一个题目集。
 * @param {string} name - 题目集名称
 * @param {object[]} problems - 题目列表
 */
export function saveProblemSet(name, problems) {
  const store = loadStore();
  store.problemSets[name] = {
    name,
    count: problems.length,
    savedAt: Date.now(),
    problems,
  };
  saveStore(store);
}

/**
 * 获取所有题目集名称。
 * @returns {string[]}
 */
export function getProblemSetNames() {
  const store = loadStore();
  return Object.keys(store.problemSets);
}

/**
 * 加载一个题目集。
 * @param {string} name
 * @returns {object[]|null}
 */
export function loadProblemSet(name) {
  const store = loadStore();
  const set = store.problemSets[name];
  return set ? set.problems : null;
}

/**
 * 删除一个题目集。
 * @param {string} name
 */
export function deleteProblemSet(name) {
  const store = loadStore();
  delete store.problemSets[name];
  saveStore(store);
}

/**
 * 获取统计信息。
 * @returns {{ total: number, favorites: number, solved: number, attempts: number }}
 */
export function getStats() {
  const store = loadStore();
  const allProblems = new Set();
  let solved = 0;
  let attempts = 0;

  for (const setName of Object.keys(store.problemSets)) {
    const set = store.problemSets[setName];
    for (const p of set.problems) {
      allProblems.add(p.id);
    }
  }

  for (const prog of Object.values(store.progress)) {
    if (prog.solved) solved++;
    attempts += prog.attempts;
  }

  return {
    total: allProblems.size,
    favorites: store.favorites.length,
    solved,
    attempts,
  };
}

/**
 * 获取用户当前评级。
 * @returns {number}
 */
export function getUserRating() {
  const store = loadStore();
  return store.userRating || DEFAULT_RATING;
}

/**
 * 设置用户评级。
 * @param {number} rating
 */
export function setUserRating(rating) {
  const store = loadStore();
  store.userRating = Math.max(100, Math.min(3000, rating)); // 限制在 100-3000
  saveStore(store);
}

/**
 * 根据做题结果更新用户评级。
 * 使用简化版 ELO 算法：
 * - 如果题目难度 > 用户评级，答对加分多，答错减分少
 * - 如果题目难度 < 用户评级，答对加分少，答错减分多
 *
 * @param {number} problemDifficulty - 题目难度（如果没有，默认为 1000）
 * @param {boolean} solved - 是否答对
 * @returns {{ oldRating: number, newRating: number, change: number }}
 */
export function updateRating(problemDifficulty, solved) {
  const store = loadStore();
  const oldRating = store.userRating || DEFAULT_RATING;
  const difficulty = problemDifficulty || DEFAULT_RATING;

  // 计算期望得分（ELO 公式）
  const expectedScore = 1 / (1 + Math.pow(10, (difficulty - oldRating) / 400));

  // 实际得分：答对 = 1，答错 = 0
  const actualScore = solved ? 1 : 0;

  // 计算新评级
  const change = Math.round(K_FACTOR * (actualScore - expectedScore));
  const newRating = oldRating + change;

  store.userRating = Math.max(100, Math.min(3000, newRating));
  saveStore(store);

  return { oldRating, newRating: store.userRating, change };
}

/**
 * 根据用户评级推荐合适的题目难度范围。
 * @param {number} userRating
 * @returns {{ min: number, max: number }}
 */
export function getRecommendedDifficultyRange(userRating) {
  const rating = userRating || getUserRating();
  return {
    min: Math.max(100, rating - 200),
    max: Math.min(3000, rating + 200),
  };
}

/**
 * 清空所有存储数据。
 */
export function clearAll() {
  localStorage.removeItem(STORAGE_KEY);
}
