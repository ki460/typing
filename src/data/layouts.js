/**
 * layouts.js — 物理キーボード配列と運指(どの指で打つか)の定義。
 * JIS / US の2配列に対応。画面キーボード描画と「次はこの指」ヒントの土台。
 */

export const FINGERS = ['lp', 'lr', 'lm', 'li', 'th', 'ri', 'rm', 'rr', 'rp'];

export const FINGER_LABEL = {
  lp: '左こゆび', lr: '左くすりゆび', lm: '左なかゆび', li: '左ひとさしゆび',
  th: 'おやゆび',
  ri: '右ひとさしゆび', rm: '右なかゆび', rr: '右くすりゆび', rp: '右こゆび',
};

export const FINGER_LABEL_ADULT = {
  lp: '左小指', lr: '左薬指', lm: '左中指', li: '左人差し指',
  th: '親指',
  ri: '右人差し指', rm: '右中指', rr: '右薬指', rp: '右小指',
};

/** 指ごとの色(CSS 変数名)。ホームポジション学習の視覚手がかり。 */
export const FINGER_COLOR = {
  lp: '#e05c6e', lr: '#e8934a', lm: '#d8c341', li: '#5fbf6a',
  th: '#8b93a7',
  ri: '#3fb4c4', rm: '#5a8ede', rr: '#9b72d8', rp: '#cf68b5',
};

const K = (c, s, f, w) => ({ c, s: s ?? null, f, w: w ?? 1 });
const SP = (label, f, w) => ({ c: null, label, f, w, special: true });

// --------------------------------------------------------------- US 配列
const US_ROWS = [
  [
    K('`', '~', 'lp'), K('1', '!', 'lp'), K('2', '@', 'lr'), K('3', '#', 'lm'),
    K('4', '$', 'li'), K('5', '%', 'li'), K('6', '^', 'ri'), K('7', '&', 'ri'),
    K('8', '*', 'rm'), K('9', '(', 'rr'), K('0', ')', 'rp'), K('-', '_', 'rp'),
    K('=', '+', 'rp'), SP('Back', 'rp', 2),
  ],
  [
    SP('Tab', 'lp', 1.5), K('q', 'Q', 'lp'), K('w', 'W', 'lr'), K('e', 'E', 'lm'),
    K('r', 'R', 'li'), K('t', 'T', 'li'), K('y', 'Y', 'ri'), K('u', 'U', 'ri'),
    K('i', 'I', 'rm'), K('o', 'O', 'rr'), K('p', 'P', 'rp'), K('[', '{', 'rp'),
    K(']', '}', 'rp'), K('\\', '|', 'rp', 1.5),
  ],
  [
    SP('Caps', 'lp', 1.75), K('a', 'A', 'lp'), K('s', 'S', 'lr'), K('d', 'D', 'lm'),
    K('f', 'F', 'li'), K('g', 'G', 'li'), K('h', 'H', 'ri'), K('j', 'J', 'ri'),
    K('k', 'K', 'rm'), K('l', 'L', 'rr'), K(';', ':', 'rp'), K("'", '"', 'rp'),
    SP('Enter', 'rp', 2.25),
  ],
  [
    SP('Shift', 'lp', 2.25), K('z', 'Z', 'lp'), K('x', 'X', 'lr'), K('c', 'C', 'lm'),
    K('v', 'V', 'li'), K('b', 'B', 'li'), K('n', 'N', 'ri'), K('m', 'M', 'ri'),
    K(',', '<', 'rm'), K('.', '>', 'rr'), K('/', '?', 'rp'), SP('Shift', 'rp', 2.75),
  ],
  [
    SP('Ctrl', 'lp', 1.25), SP('Alt', 'lp', 1.25), K(' ', null, 'th', 6.25),
    SP('Alt', 'rp', 1.25), SP('Ctrl', 'rp', 1.25),
  ],
];

// -------------------------------------------------------------- JIS 配列
const JIS_ROWS = [
  [
    SP('半/全', 'lp', 1), K('1', '!', 'lp'), K('2', '"', 'lr'), K('3', '#', 'lm'),
    K('4', '$', 'li'), K('5', '%', 'li'), K('6', '&', 'ri'), K('7', "'", 'ri'),
    K('8', '(', 'rm'), K('9', ')', 'rr'), K('0', null, 'rp'), K('-', '=', 'rp'),
    K('^', '~', 'rp'), K('¥', '|', 'rp'), SP('Back', 'rp', 1.5),
  ],
  [
    SP('Tab', 'lp', 1.5), K('q', 'Q', 'lp'), K('w', 'W', 'lr'), K('e', 'E', 'lm'),
    K('r', 'R', 'li'), K('t', 'T', 'li'), K('y', 'Y', 'ri'), K('u', 'U', 'ri'),
    K('i', 'I', 'rm'), K('o', 'O', 'rr'), K('p', 'P', 'rp'), K('@', '`', 'rp'),
    K('[', '{', 'rp'),
  ],
  [
    SP('Caps', 'lp', 1.75), K('a', 'A', 'lp'), K('s', 'S', 'lr'), K('d', 'D', 'lm'),
    K('f', 'F', 'li'), K('g', 'G', 'li'), K('h', 'H', 'ri'), K('j', 'J', 'ri'),
    K('k', 'K', 'rm'), K('l', 'L', 'rr'), K(';', '+', 'rp'), K(':', '*', 'rp'),
    K(']', '}', 'rp'), SP('Enter', 'rp', 1.25),
  ],
  [
    SP('Shift', 'lp', 2.25), K('z', 'Z', 'lp'), K('x', 'X', 'lr'), K('c', 'C', 'lm'),
    K('v', 'V', 'li'), K('b', 'B', 'li'), K('n', 'N', 'ri'), K('m', 'M', 'ri'),
    K(',', '<', 'rm'), K('.', '>', 'rr'), K('/', '?', 'rp'), K('\\', '_', 'rp'),
    SP('Shift', 'rp', 1.75),
  ],
  [
    SP('Ctrl', 'lp', 1.25), SP('無変換', 'th', 1.25), K(' ', null, 'th', 4.5),
    SP('変換', 'th', 1.25), SP('かな', 'rp', 1.25), SP('Ctrl', 'rp', 1.25),
  ],
];

export const LAYOUTS = {
  jis: { id: 'jis', name: 'JIS（日本語）配列', rows: JIS_ROWS },
  us: { id: 'us', name: 'US（英語）配列', rows: US_ROWS },
};

// ------------------------------------------------------------ 文字→キー索引
const indexCache = new Map();

function buildIndex(layoutId) {
  const layout = LAYOUTS[layoutId] || LAYOUTS.jis;
  const map = new Map();
  layout.rows.forEach((row, r) => {
    row.forEach((key, i) => {
      if (key.special || key.c == null) return;
      if (!map.has(key.c)) map.set(key.c, { key: key.c, shift: false, finger: key.f, row: r, col: i });
      if (key.s && !map.has(key.s)) map.set(key.s, { key: key.c, shift: true, finger: key.f, row: r, col: i });
      // 英大文字は Shift + 同キー
      if (/^[a-z]$/.test(key.c)) {
        map.set(key.c.toUpperCase(), { key: key.c, shift: true, finger: key.f, row: r, col: i });
      }
    });
  });
  return map;
}

export function charIndex(layoutId = 'jis') {
  if (!indexCache.has(layoutId)) indexCache.set(layoutId, buildIndex(layoutId));
  return indexCache.get(layoutId);
}

/** 文字を打つためのキー情報。未知の文字は null */
export function keyInfoFor(layoutId, char) {
  return charIndex(layoutId).get(char) || null;
}

export function fingerOf(layoutId, char) {
  return keyInfoFor(layoutId, char)?.finger || null;
}

export function handOf(finger) {
  if (!finger) return null;
  if (finger === 'th') return 'both';
  return finger[0] === 'l' ? 'left' : 'right';
}

export const HOME_KEYS = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'];

/** Shift が必要なとき、逆の手の Shift を押す(同じ手の Shift は運指が崩れる) */
export function shiftSideFor(finger) {
  if (!finger || finger === 'th') return null;
  return finger[0] === 'l' ? 'right' : 'left';
}
