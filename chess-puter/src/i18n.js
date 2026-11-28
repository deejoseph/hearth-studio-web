import core from './i18n/dict-core.json';
import learnTactics from './i18n/dict-learn-tactics.json';
import accountReview from './i18n/dict-account-review.json';
import coach from './i18n/dict-coach.json';
import misc from './i18n/dict-misc.json';

const STORAGE_KEY = 'chess-language';
const CHINESE = /[\u2018-\u201d\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;
const DICTIONARY = { ...learnTactics, ...coach, ...misc, ...accountReview, ...core };
const NORMALIZED_DICTIONARY = Object.fromEntries(
  Object.entries(DICTIONARY)
    .filter(([source]) => source === source.trim())
    .map(([source, target]) => [normalizeSpaces(source), target]),
);
const PHRASES = Object.entries(DICTIONARY)
  .filter(([source, target]) => CHINESE.test(source) && typeof target === 'string' && target && target !== source)
  .sort((a, b) => b[0].length - a[0].length);
const TEXT_ATTRIBUTES = ['title', 'placeholder', 'aria-label', 'aria-valuetext', 'alt'];
const META_CONTENT = 'meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
const originalText = new WeakMap();
const originalAttributes = new WeakMap();
let language = detectLanguage();

export function detectLanguage() {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // Storage can be disabled; the browser language is still a useful default.
  }
  const browserLanguage = globalThis.navigator?.language ?? globalThis.navigator?.languages?.[0] ?? '';
  return /^en\b/i.test(browserLanguage) ? 'en' : 'zh';
}

export function getLanguage() {
  return language;
}

export function setUserText(element, value) {
  element.setAttribute('data-i18n-skip', '');
  element.textContent = value ?? '';
  return element;
}

export function userText(value) {
  const span = document.createElement('span');
  return setUserText(span, value);
}

export function fillText(element, value) {
  if (typeof Node !== 'undefined' && value instanceof Node) element.replaceChildren(value);
  else element.textContent = value ?? '';
  return element;
}

export function translateUserText(template, values = []) {
  const protectedValues = values.filter((value) => String(value ?? '').length > 0);
  const tokens = protectedValues.map((value, index) => `\uE000${index}\uE001`);
  let masked = String(template ?? '');
  protectedValues.forEach((value, index) => {
    masked = masked.split(String(value)).join(tokens[index]);
  });
  let translated = translateText(masked);
  protectedValues.forEach((value, index) => {
    translated = translated.split(tokens[index]).join(String(value));
  });
  return translated;
}

function normalizeSpaces(value) {
  return value.replace(/\s+/g, ' ').replace(/([\u3400-\u9fff]) +(?=[\u3400-\u9fff])/g, '$1');
}

function countLabel(count, singular, plural = `${singular}s`) {
  const total = Number(count);
  return `${count} ${total === 1 ? singular : plural}`;
}

export function translateText(value) {
  const source = String(value ?? '');
  if (language !== 'en' || !CHINESE.test(source)) return source;
  const exact = DICTIONARY[source];
  if (exact) return exact;

  const leading = source.match(/^\s*/)?.[0] ?? '';
  const trailing = source.match(/\s*$/)?.[0] ?? '';
  const body = source.slice(leading.length, source.length - trailing.length);
  const exactBody = DICTIONARY[body];
  if (exactBody) return leading + exactBody + trailing;

  const normalized = normalizeSpaces(body);
  const exactNormalized = NORMALIZED_DICTIONARY[normalized];
  if (exactNormalized) return leading + exactNormalized + trailing;

  const rendered = renderPattern(normalized);
  if (rendered !== null) return leading + rendered + trailing;

  let output = normalized;
  for (const [chinese, english] of PHRASES) {
    if (output.includes(chinese)) output = output.split(chinese).join(english);
  }
  return leading + output + trailing;
}

function renderPattern(source) {
  let match = source.match(/^第\s*(\d+)\s*\/\s*(\d+)\s*节$/);
  if (match) return `Lesson ${match[1]} / ${match[2]}`;

  match = source.match(/^练习\s*(\d+)\s*\/\s*(\d+)$/);
  if (match) return `Practice ${match[1]} / ${match[2]}`;

  match = source.match(/^第\s*(\d+)\s*回合$/);
  if (match) return `Move ${match[1]}`;

  match = source.match(/^第\s*(\d+)\s*[道题]$/);
  if (match) return `Puzzle ${match[1]}`;

  match = source.match(/^第\s*(\d+)\s*\/\s*(\d+)\s*题$/);
  if (match) return `Puzzle ${match[1]} / ${match[2]}`;

  match = source.match(/^(\d+)\s*\/\s*(\d+)\s*道$/);
  if (match) return `${match[1]} / ${match[2]}`;

  match = source.match(/^复习完成\s*·\s*共\s*(\d+)\s*题$/);
  if (match) return `Review complete · ${countLabel(match[1], 'problem')}`;

  match = source.match(/^复习\s*(\d+)\s*\/\s*(\d+)\s*·\s*剩\s*(\d+)\s*题$/);
  if (match) return `Review ${match[1]} / ${match[2]} · ${countLabel(match[3], 'problem')} remaining`;

  match = source.match(/^当前\s*(\d+)\s*题\s*·\s*已解决\s*(\d+)\s*·\s*错题\s*(\d+)\s*·\s*收藏\s*(\d+)\s*·\s*评级\s*(\d+)$/);
  if (match) {
    return `Current: ${countLabel(match[1], 'problem')} · solved ${match[2]} · mistakes ${match[3]} · favorites ${match[4]} · rating ${match[5]}`;
  }

  match = source.match(/^成功导入\s*(\d+)\s*道题，打开练习即可开始解题。$/);
  if (match) return `Successfully imported ${countLabel(match[1], 'problem')}. Open Practice to start solving.`;

  match = source.match(/^共\s*(\d+)\s*条记录。$/);
  if (match) return `Total ${countLabel(match[1], 'record')}.`;

  match = source.match(/^剩\s*(\d+)\s*道$/);
  if (match) return `${match[1]} remaining`;

  match = source.match(/^已换成(.+)视角。$/);
  if (match) return `Switched to the ${translateText(match[1])} view.`;

  match = source.match(/^执(.+)$/);
  if (match) return `Playing ${translateText(match[1])}`;

  match = source.match(/^(.+)的时间快用完了\s*——\s*还剩(.+)。$/);
  if (match) return `${translateText(match[1])} is almost out of time — ${match[2]} remaining.`;

  match = source.match(/^回看中\s*——\s*(.+)走了\s*(.+)。$/);
  if (match) return `Reviewing — ${translateText(match[1])} played ${match[2]}.`;

  match = source.match(/^已算到第\s*(.+?)\s*层$/);
  if (match) return `Searched to depth ${match[1]}`;

  match = source.match(/^正在下载引擎\s*(\d+)%$/);
  if (match) return `Downloading engine ${match[1]}%`;

  match = source.match(/^本节\s*(\d+)\s*题/);
  if (match) return `Practice ${match[1]} puzzles`;

  match = source.match(/^确定删除题目集「(.+)」？$/);
  if (match) return `Delete the puzzle set “${match[1]}”?`;

  match = source.match(/^(.*?)（(\d{4}-\d{2}-\d{2}) 填的）$/);
  if (match) return `${translateText(match[1])} (${match[2]} filled in)`;

  return null;
}

function setTextNode(node) {
  const current = node.nodeValue ?? '';
  let entry = originalText.get(node);
  if (!entry) {
    entry = { source: current, rendered: current };
    originalText.set(node, entry);
  } else if (current !== entry.source && current !== entry.rendered) {
    entry = { source: current, rendered: current };
    originalText.set(node, entry);
  }
  const translated = translateText(entry.source);
  entry.rendered = translated;
  if (current !== translated) node.nodeValue = translated;
}

function setAttribute(element, name) {
  if (SKIP_TAGS.has(element.tagName) || element.hasAttribute('data-i18n-skip')) return;
  const current = element.getAttribute(name);
  if (current === null) return;
  let saved = originalAttributes.get(element);
  if (!saved) {
    saved = new Map();
    originalAttributes.set(element, saved);
  }
  let entry = saved.get(name);
  if (!entry) {
    entry = { source: current, rendered: current };
    saved.set(name, entry);
  } else if (current !== entry.source && current !== entry.rendered) {
    entry = { source: current, rendered: current };
    saved.set(name, entry);
  }
  const translated = translateText(entry.source);
  entry.rendered = translated;
  if (current !== translated) element.setAttribute(name, translated);
}

function isSkippedText(node) {
  const parent = node.parentElement;
  return Boolean(parent && (SKIP_TAGS.has(parent.tagName) || parent.closest('[data-i18n-skip]')));
}

function translateElement(element) {
  if (element.nodeType === Node.TEXT_NODE) {
    if (!isSkippedText(element)) setTextNode(element);
    return;
  }
  if (element.nodeType !== Node.ELEMENT_NODE) return;
  if (SKIP_TAGS.has(element.tagName) || element.hasAttribute('data-i18n-skip')) return;
  for (const attribute of TEXT_ATTRIBUTES) setAttribute(element, attribute);
  if (element.matches(META_CONTENT)) setAttribute(element, 'content');
  for (const child of element.childNodes) translateElement(child);
}

function paintLanguageButton() {
  const button = document.getElementById('language-toggle');
  if (!button) return;
  const english = language === 'zh';
  button.textContent = english ? 'English' : '中文';
  button.setAttribute('aria-label', english ? 'Switch to English' : '切换到中文');
  button.setAttribute('title', english ? 'Switch to English' : '切换到中文');
}

export function setLanguage(next, { persist = true } = {}) {
  language = next === 'en' ? 'en' : 'zh';
  if (persist) {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, language);
    } catch {
      // The selection still works for this page when storage is unavailable.
    }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    translateElement(document.documentElement);
    paintLanguageButton();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('chess-language-change', { detail: { language } }));
  }
  return language;
}

export function toggleLanguage() {
  return setLanguage(language === 'zh' ? 'en' : 'zh');
}

export function initI18n() {
  setLanguage(language, { persist: false });
  const button = document.getElementById('language-toggle');
  button?.addEventListener('click', toggleLanguage);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') {
        if (!isSkippedText(record.target)) setTextNode(record.target);
      } else if (record.type === 'attributes') {
        setAttribute(record.target, record.attributeName);
      } else {
        for (const node of record.addedNodes) translateElement(node);
      }
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...TEXT_ATTRIBUTES, 'content'],
  });
  return { observer, setLanguage, toggleLanguage };
}
