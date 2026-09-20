/**
 * content.js — 教材データの集約点(バレル)。
 * 実データは ja.js / en.js / code.js に分けて持ち、ここから再輸出する。
 * 利用側は必ずこのファイル経由で import する。
 */
export { JA_WORDS, JA_SENTENCES, BUSINESS_JA, KANA_POOL } from './ja.js';
export { EN_WORDS, EN_SENTENCES } from './en.js';
export { CODE_LINES } from './code.js';

/** タグで絞り込む。tag が null/undefined なら全件をそのまま返す。 */
export function byTag(list, tag) {
  if (!tag) return list;
  return list.filter((it) => Array.isArray(it.t) && it.t.includes(tag));
}

/** 配列から1件ランダムに取り出す */
export function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/** 配列をシャッフルした新しい配列を返す(Fisher-Yates) */
export function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
