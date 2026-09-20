/**
 * curriculum.js — 適応型カリキュラム。
 *
 * 設計根拠:
 *  - 一度に全キーを扱わず、少数から始めて「習熟したら1文字ずつ解禁」する
 *    (keybr 方式)。認知負荷を一定に保ち、常に能力の少し上で練習させる。
 *  - 解禁済みキーの出現確率を「弱点スコア」で重み付けし、苦手を自動で狙い撃つ。
 *  - 1セッションは focus / mixed / real を混ぜる(インターリーブ練習)。
 *    ブロック練習より定着が良いことが運動学習研究で一貫して示されている。
 */
import { store, isLearned, weakness, mastery } from './store.js';

// 運指上の広がりと単語形成のしやすさを両立させた解禁順(英字)
const ORDER_EN_BALANCED = [
  'f', 'j', 'd', 'k', 'e', 'i', 'r', 'u', 's', 'l', 'a', 'o', 'n', 't',
  'g', 'h', 'c', 'm', 'w', 'p', 'v', 'b', 'y', 'x', 'q', 'z',
];
// 伝統的な段ごとの解禁順(ホームポジション→上段→下段)
const ORDER_EN_HOMEROW = [
  'f', 'j', 'd', 'k', 's', 'l', 'a', 'g', 'h', 'e', 'i', 'r', 'u', 'o',
  't', 'y', 'w', 'p', 'q', 'c', 'm', 'v', 'n', 'x', 'b', 'z',
];
// 日本語ローマ字: 母音がないと1文字も打てないため 5 母音を初期解禁にする
const ORDER_JA = [
  'a', 'i', 'u', 'e', 'o',
  'k', 's', 't', 'n', 'h', 'm', 'y', 'r', 'w',
  'g', 'z', 'd', 'b', 'p', 'j', 'f', 'c', 'v', 'x', 'l', 'q',
];

export function orderFor(lang, style = store.settings.order) {
  if (lang === 'ja') return ORDER_JA;
  return style === 'homerow' ? ORDER_EN_HOMEROW : ORDER_EN_BALANCED;
}

export function seedSize(lang) { return lang === 'ja' ? 6 : 4; }

/** courseId ごとに解禁数を保持する */
export function unlockedChars(lang, courseId = `adaptive.${lang}`) {
  const order = orderFor(lang);
  const c = store.course(courseId);
  const n = Math.max(seedSize(lang), Math.min(order.length, c.unlocked || 0));
  return order.slice(0, n);
}

/**
 * 解禁条件を満たしていれば次の1文字を解禁する。
 * 条件: 解禁済みの 85% 以上が「習得済み」かつ直近解禁文字も習得済み。
 * @returns {string|null} 新しく解禁された文字
 */
export function maybeUnlock(lang, courseId = `adaptive.${lang}`) {
  const order = orderFor(lang);
  const c = store.course(courseId);
  const n = Math.max(seedSize(lang), Math.min(order.length, c.unlocked || 0));
  if (n >= order.length) return null;

  const cur = order.slice(0, n);
  const target = store.targetMs();
  const learned = cur.filter((ch) => isLearned(ch, target)).length;
  const newest = cur[n - 1];
  if (learned / cur.length >= 0.85 && isLearned(newest, target)) {
    c.unlocked = n + 1;
    store.save();
    return order[n];
  }
  return null;
}

/** 進捗(0..1): 解禁率と習熟度の合成 */
export function progressOf(lang, courseId = `adaptive.${lang}`) {
  const order = orderFor(lang);
  const cur = unlockedChars(lang, courseId);
  const target = store.targetMs();
  const m = cur.reduce((s, ch) => s + mastery(ch, target), 0) / cur.length;
  return { unlocked: cur.length, total: order.length, mastery: m, next: order[cur.length] || null };
}

/** 出題重み。弱点ほど高く、直近解禁の文字は更にブースト */
export function charWeights(chars, lang) {
  const target = store.targetMs();
  const order = orderFor(lang);
  const w = new Map();
  for (const ch of chars) {
    const idx = order.indexOf(ch);
    const recency = idx >= chars.length - 2 ? 2.2 : 1; // 最新2文字を厚めに
    w.set(ch, weakness(ch, target) * recency);
  }
  return w;
}

/** 弱いキーを上位 n 件 */
export function weakestChars(chars, n = 3) {
  const target = store.targetMs();
  return [...chars]
    .filter((ch) => (store.profile.keys[ch]?.n || 0) >= 3)
    .sort((a, b) => weakness(b, target) - weakness(a, target))
    .slice(0, n);
}

/**
 * セッション構成を決める。インターリーブされた行レシピの配列を返す。
 * kind: 'focus'(弱点集中) | 'mixed'(全解禁ミックス) | 'real'(実在語/文)
 */
export function planSession(lines = 8) {
  const recipe = [];
  const pattern = ['mixed', 'real', 'focus', 'mixed', 'real', 'mixed', 'focus', 'real'];
  for (let i = 0; i < lines; i++) recipe.push(pattern[i % pattern.length]);
  return recipe;
}
