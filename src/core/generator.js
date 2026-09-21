/**
 * generator.js — 出題文(Line)の生成。
 * 解禁済み文字・弱点統計・教材データから、擬似語 / 実在語 / 文章 / コード行を組み立てる。
 * 返すのは { display, target, lang, kind, reading?, note? } の配列と meta。
 * 教材データ(content.js)がまだ空でも例外を投げず、擬似語へ穏当にフォールバックする。
 * 日本語の target は必ず正規化済みひらがなで、ローマ字入力が成立するものだけを返す。
 */
import { store, worstBigrams } from './store.js';
import { unlockedChars, charWeights, weakestChars, planSession, maybeUnlock } from './curriculum.js';
import * as C from '../data/content.js';
import { RomajiMatcher, normalizeKana } from './romaji.js';

const VOWELS = 'aeiou';
const EN_ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');
// ja の実在語判定用。'ー' は '-'、'、' '。' は ',' '.' に写るので許可しておく
const JA_ALPHA = "abcdefghijklmnopqrstuvwxyz-,.'".split('');

/* ---------------------------------------------------------------- 小道具 */

function arr(v) { return Array.isArray(v) ? v : []; }
function rnd(n) { return Math.floor(Math.random() * n); }
function between(min, max) { return min + rnd(Math.max(1, max - min + 1)); }

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function weightOf(weights, key) {
  const w = weights && typeof weights.get === 'function' ? weights.get(key) : undefined;
  return Number.isFinite(w) && w > 0 ? w : 1;
}

/** 重み付き抽選。ban と一致する要素は候補から外す(同じ文字の3連続を防ぐのに使う) */
function weightedPick(items, weights, ban) {
  const all = arr(items);
  if (!all.length) return null;
  let pool = all;
  if (ban != null) {
    const filtered = all.filter((x) => x !== ban);
    if (filtered.length) pool = filtered;
  }
  let total = 0;
  const ws = pool.map((x) => { const w = weightOf(weights, x); total += w; return w; });
  if (!(total > 0)) return pool[rnd(pool.length)];
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) { r -= ws[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** 直前2要素が同じならその要素を禁止して抽選する */
function pickNext(seq, items, weights) {
  const n = seq.length;
  const ban = n >= 2 && seq[n - 1] === seq[n - 2] ? seq[n - 1] : null;
  return weightedPick(items, weights, ban);
}

/** 目標文字列がローマ字入力として成立するか */
function typable(target) {
  if (!target) return false;
  try { return new RomajiMatcher(target).totalKeys > 0; } catch { return false; }
}

/* ------------------------------------------------------------ 擬似語(英字) */

const TEMPLATES = [
  { p: 'CV', w: 2.5 }, { p: 'CVC', w: 3 }, { p: 'CVCV', w: 3 },
  { p: 'VC', w: 1.2 }, { p: 'CVCVC', w: 2 },
];
const TEMPLATE_W = new Map(TEMPLATES.map((t) => [t.p, t.w]));

function randomWord(chars, weights, lo, hi) {
  const seq = [];
  const n = between(lo, hi);
  for (let i = 0; i < n; i++) { const c = pickNext(seq, chars, weights); if (c == null) break; seq.push(c); }
  return seq.join('');
}

/** どのテンプレートも長さ範囲に収まらないとき、CV 音節を継ぎ足して作る */
function syllabicWord(vowels, cons, weights, lo, hi) {
  const seq = [];
  while (seq.length + 2 <= hi && seq.length < lo) {
    seq.push(pickNext(seq, cons, weights));
    seq.push(pickNext(seq, vowels, weights));
  }
  if (seq.length < lo && seq.length < hi) seq.push(pickNext(seq, cons, weights));
  if (!seq.length) { seq.push(pickNext(seq, cons, weights)); seq.push(pickNext(seq, vowels, weights)); }
  return seq.join('');
}

export function pseudoWords({ alphabet, weights, count = 8, minLen = 3, maxLen = 6 } = {}) {
  const chars = [...new Set(arr(alphabet).filter((c) => typeof c === 'string' && c.length === 1))];
  const out = [];
  if (!chars.length || count <= 0) return out;
  const lo = Math.max(1, Math.min(minLen, maxLen));
  const hi = Math.max(lo, maxLen);
  const vowels = chars.filter((c) => VOWELS.includes(c));
  const cons = chars.filter((c) => !VOWELS.includes(c));

  // 母音(または子音)が無いと音節が組めないので、重み付きランダムな3〜5文字で代用する
  if (!vowels.length || !cons.length) {
    const rLo = Math.max(3, Math.min(lo, 5));
    const rHi = Math.max(rLo, Math.min(5, Math.max(3, hi)));
    for (let i = 0; i < count; i++) out.push(randomWord(chars, weights, rLo, rHi));
    return out.filter(Boolean);
  }

  const usable = TEMPLATES.filter((t) => t.p.length >= lo && t.p.length <= hi).map((t) => t.p);
  for (let i = 0; i < count; i++) {
    let w = '';
    if (usable.length) {
      const seq = [];
      for (const s of weightedPick(usable, TEMPLATE_W, null)) {
        seq.push(pickNext(seq, s === 'V' ? vowels : cons, weights));
      }
      w = seq.join('');
    } else {
      w = syllabicWord(vowels, cons, weights, lo, hi);
    }
    if (w) out.push(w);
  }
  return out;
}

/* ------------------------------------------------------------ 擬似語(かな) */

const ROMAJI_CACHE = new Map();
function romajiOf(kana) {
  if (ROMAJI_CACHE.has(kana)) return ROMAJI_CACHE.get(kana);
  let r = '';
  try { r = RomajiMatcher.toRomaji(kana) || ''; } catch { r = ''; }
  ROMAJI_CACHE.set(kana, r);
  return r;
}

const VOWEL_KANA = ['あ', 'い', 'う', 'え', 'お'];
// KANA_POOL が未提供でもステージ生成が動くよう、行単位の最小表を内蔵しておく
const GYO = [
  ['あ', 'い', 'う', 'え', 'お'],
  ['か', 'き', 'く', 'け', 'こ'],
  ['さ', 'し', 'す', 'せ', 'そ'],
  ['た', 'ち', 'つ', 'て', 'と'],
  ['な', 'に', 'ぬ', 'ね', 'の'],
  ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  ['ま', 'み', 'む', 'め', 'も'],
  ['や', 'ゆ', 'よ'],
  ['ら', 'り', 'る', 'れ', 'ろ'],
  ['わ', 'を', 'ん'],
  ['が', 'ぎ', 'ぐ', 'げ', 'ご'],
  ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'],
  ['だ', 'で', 'ど'],
  ['ば', 'び', 'ぶ', 'べ', 'ぼ'],
  ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'],
  ['きゃ', 'きゅ', 'きょ', 'しゃ', 'しゅ', 'しょ', 'ちゃ', 'ちゅ', 'ちょ',
    'にゃ', 'にゅ', 'にょ', 'ひゃ', 'ひゅ', 'ひょ', 'みゃ', 'みゅ', 'みょ',
    'りゃ', 'りゅ', 'りょ', 'ぎゃ', 'ぎゅ', 'ぎょ', 'じゃ', 'じゅ', 'じょ',
    'びゃ', 'びゅ', 'びょ', 'ぴゃ', 'ぴゅ', 'ぴょ'],
];
const SKIP_KANA = new Set(['っ', 'ー', '、', '。', '・', '「', '」', '　']);

function fullKana() {
  const pool = arr(C.KANA_POOL).filter((k) => typeof k === 'string' && k.length && !SKIP_KANA.has(k));
  return pool.length ? pool : GYO.flat();
}

/** ローマ字が alphabet に収まるかなだけを候補にし、構成文字の重みの平均を重みにする */
function kanaCandidates(alphabet, weights) {
  const set = new Set(arr(alphabet));
  const items = [];
  const w = new Map();
  for (const k of fullKana()) {
    const r = romajiOf(k);
    if (!r) continue;
    let ok = true;
    for (const c of r) { if (!set.has(c)) { ok = false; break; } }
    if (!ok) continue;
    items.push(k);
    let s = 0;
    for (const c of r) s += weightOf(weights, c);
    w.set(k, s / r.length);
  }
  return { items, weights: w };
}

/** かな要素を lo〜hi 個つないだ語。語頭の「ん」は避ける */
function kanaWord(items, weights, lo, hi) {
  const n = between(lo, hi);
  const seq = [];
  for (let i = 0; i < n; i++) {
    let k = pickNext(seq, items, weights);
    if (k == null) break;
    if (i === 0 && k === 'ん') {
      const alt = items.filter((x) => x !== 'ん');
      if (alt.length) k = weightedPick(alt, weights, null);
    }
    seq.push(k);
  }
  return normalizeKana(seq.join(''));
}

/** かな要素の一覧から擬似語を count 個作る(重みなし) */
function kanaWordsFrom(list, count, lo, hi) {
  const items = arr(list).filter((k) => typeof k === 'string' && k.length);
  const out = [];
  if (!items.length || count <= 0) return out;
  for (let i = 0; i < count; i++) {
    let w = '';
    for (let t = 0; t < 6; t++) { const c = kanaWord(items, null, lo, hi); if (typable(c)) { w = c; break; } }
    out.push(w || 'あい');
  }
  return out;
}

export function pseudoKana({ alphabet, weights, count = 8, minKana = 2, maxKana = 4 } = {}) {
  const lo = Math.max(1, Math.min(minKana, maxKana));
  const hi = Math.max(lo, maxKana);
  const out = [];
  if (count <= 0) return out;

  let { items, weights: kw } = kanaCandidates(alphabet, weights);
  // 候補が少なすぎると同じ語ばかりになるので、母音だけの語に退避する
  if (items.length < 5) {
    const set = new Set(arr(alphabet));
    const v = VOWEL_KANA.filter((k) => [...romajiOf(k)].every((c) => set.has(c)));
    items = v.length ? v : VOWEL_KANA.slice();
    kw = null;
  }
  for (let i = 0; i < count; i++) {
    let word = '';
    for (let t = 0; t < 6; t++) { const c = kanaWord(items, kw, lo, hi); if (typable(c)) { word = c; break; } }
    out.push(word || 'あい');
  }
  return out;
}

/* ---------------------------------------------------------------- 実在語 */

function jaWordEntries() {
  return arr(C.JA_WORDS).filter((it) => it && typeof it.k === 'string' && it.k);
}

function fitsAlphabet(romaji, set) {
  if (!romaji) return false;
  for (const c of romaji) { if (!set.has(c)) return false; }
  return true;
}

/** 表示と入力のペアで実在語を返す。足りない分は擬似語で埋める */
function realEntries(lang, alphabet, count, tag) {
  const want = Math.max(0, Math.floor(count) || 0);
  const set = new Set(arr(alphabet));
  const out = [];
  if (!want) return out;

  if (lang === 'en') {
    const pool = arr(C.EN_WORDS)
      .filter((w) => typeof w === 'string' && w.length && fitsAlphabet(w, set));
    for (const w of shuffle(pool).slice(0, want)) out.push({ display: w, target: w });
  } else {
    const src = tag ? C.byTag(jaWordEntries(), tag) : jaWordEntries();
    const pool = src.filter((it) => fitsAlphabet(romajiOf(normalizeKana(it.k)), set));
    for (const it of shuffle(pool).slice(0, want)) {
      const target = normalizeKana(it.k);
      if (!typable(target)) continue;
      out.push({ display: typeof it.d === 'string' && it.d ? it.d : target, target });
    }
  }

  const need = want - out.length;
  if (need > 0) {
    const fill = lang === 'en'
      ? pseudoWords({ alphabet, count: need, minLen: 3, maxLen: 6 })
      : pseudoKana({ alphabet, count: need, minKana: 2, maxKana: 4 });
    for (const w of fill) out.push({ display: w, target: w });
  }
  return out;
}

export function realWordsFor(lang, alphabet, count = 8) {
  return realEntries(lang === 'en' ? 'en' : 'ja', alphabet, count).map((e) => e.target);
}

/* ------------------------------------------------------------ 行の組み立て */

function enLine(words, kind) {
  const s = words.filter(Boolean).join(' ');
  return { display: s, target: s, lang: 'en', kind };
}

function jaLine(entries, kind) {
  const target = normalizeKana(entries.map((e) => e.target).join(''));
  const display = entries.map((e) => e.display || e.target).join('');
  const line = { display: display || target, target, lang: 'ja', kind };
  if (line.display !== target) line.reading = target; // 漢字表示のときだけ読みを添える
  return line;
}

/** getWord() を繰り返して「空白なしで連結した1行」を作る */
function collectJa(getWord, minKana = 12, maxKana = 24, minWords = 3, maxWords = 5) {
  const parts = [];
  let len = 0;
  // 語数の上限より「かな数の下限」を優先する。
  // 2かなの短い語が続いても 12 かな未満の行を作らないため、語数上限は下限充足後にだけ効かせる。
  for (let guard = 0; guard < 40; guard++) {
    if (len >= minKana && parts.length >= minWords) break;
    const w = getWord();
    if (!w || !w.target) break;
    if (len >= minKana && (parts.length >= maxWords || len + w.target.length > maxKana)) break;
    parts.push(w);
    len += w.target.length;
  }
  return parts;
}

/** 配列を使い切ったら作り直す語の供給器 */
function supplier(gen) {
  let buf = [];
  return () => {
    if (!buf.length) buf = arr(gen());
    return buf.length ? buf.shift() : null;
  };
}

/** 配列を順番に(尽きたら先頭に戻って)配る供給器 */
function cyclic(list) {
  const items = arr(list);
  let i = 0;
  return () => (items.length ? items[i++ % items.length] : null);
}

function buildLine(lang, kind, getWord) {
  if (lang === 'en') {
    const n = between(5, 7);
    const words = [];
    for (let i = 0; i < n; i++) { const w = getWord(); if (!w) break; words.push(w.target); }
    return enLine(words.length ? words : ['type'], kind);
  }
  const parts = collectJa(getWord);
  return jaLine(parts.length ? parts : [{ display: 'あい', target: 'あい' }], kind);
}

function fallbackLesson(lang, lines, extra) {
  const l = buildAdaptiveLesson({ lang, lines });
  return { lines: l.lines, meta: { ...l.meta, ...extra, fallback: 'adaptive' } };
}

/* -------------------------------------------------------------- 適応レッスン */

function wordSupplier(lang, alphabet, weights, real) {
  if (real) return supplier(() => realEntries(lang, alphabet, 12));
  if (lang === 'en') {
    return supplier(() => pseudoWords({ alphabet, weights, count: 12, minLen: 3, maxLen: 6 })
      .map((w) => ({ display: w, target: w })));
  }
  return supplier(() => pseudoKana({ alphabet, weights, count: 12, minKana: 3, maxKana: 5 })
    .map((w) => ({ display: w, target: w })));
}

export function buildAdaptiveLesson({ lang = store.settings.lang, lines = 8 } = {}) {
  const L = lang === 'en' ? 'en' : 'ja';
  const n = Math.max(1, Math.floor(lines) || 1);
  let newChar = null;
  try { newChar = maybeUnlock(L); } catch { newChar = null; }

  const unlocked = unlockedChars(L);
  const weights = charWeights(unlocked, L);
  const focus = weakestChars(unlocked, 3);

  // 弱点文字を極端に厚くした重み。弱点が未検出なら通常の重みをそのまま使う
  let focusW = weights;
  if (focus.length) {
    focusW = new Map();
    for (const c of unlocked) focusW.set(c, focus.includes(c) ? weightOf(weights, c) * 8 : 0.12);
  }

  const gens = {
    focus: wordSupplier(L, unlocked, focusW, false),
    mixed: wordSupplier(L, unlocked, weights, false),
    real: wordSupplier(L, unlocked, weights, true),
  };
  const recipe = planSession(n);
  const out = [];
  for (let i = 0; i < n; i++) {
    const kind = gens[recipe[i]] ? recipe[i] : 'mixed';
    out.push(buildLine(L, kind, gens[kind]));
  }
  return { lines: out, meta: { unlocked, newChar, focus } };
}

/* ------------------------------------------------------- 単語 / 文章 / コード */

export function buildWordLesson({ lang = store.settings.lang, tag = null, count = 12 } = {}) {
  const L = lang === 'en' ? 'en' : 'ja';
  const n = Math.max(1, Math.floor(count) || 1);
  const alphabet = L === 'en' ? EN_ALPHA : JA_ALPHA;
  const words = realEntries(L, alphabet, n * (L === 'en' ? 6 : 4), L === 'ja' ? tag : null);
  const getWord = cyclic(shuffle(words));
  const out = [];
  for (let i = 0; i < n; i++) out.push(buildLine(L, 'word', getWord));
  return { lines: out, meta: { tag, lang: L, count: out.length } };
}

export function buildTextLesson({ lang = store.settings.lang, tag = null, count = 6 } = {}) {
  const L = lang === 'en' ? 'en' : 'ja';
  const n = Math.max(1, Math.floor(count) || 1);
  const out = [];

  if (L === 'en') {
    const pool = arr(C.EN_SENTENCES).filter((s) => typeof s === 'string' && s.trim());
    for (const s of shuffle(pool).slice(0, n)) out.push({ display: s, target: s, lang: 'en', kind: 'text' });
  } else {
    // 文章は短文とビジネス定型句を同じ池として扱い、タグで絞る
    const pool = [...arr(C.JA_SENTENCES), ...arr(C.BUSINESS_JA)]
      .filter((it) => it && typeof it.k === 'string' && it.k);
    let picked = C.byTag(pool, tag);
    if (!picked.length) picked = pool;
    for (const it of shuffle(picked).slice(0, n)) {
      const target = normalizeKana(it.k);
      if (!typable(target)) continue;
      const display = typeof it.d === 'string' && it.d ? it.d : target;
      out.push({ display, target, lang: 'ja', kind: 'text', reading: target });
    }
  }
  if (!out.length) return fallbackLesson(L, n, { tag });
  return { lines: out, meta: { tag, lang: L, count: out.length } };
}

export function buildCodeLesson({ count = 8, lang = null } = {}) {
  const n = Math.max(1, Math.floor(count) || 1);
  const pool = arr(C.CODE_LINES).filter((it) => it && typeof it.text === 'string' && it.text.trim());
  const picked = lang ? pool.filter((it) => it.lang === lang) : pool;
  const src = picked.length ? picked : pool;
  // コードは直接入力なので Line.lang は常に 'en'(DirectMatcher)
  const out = shuffle(src).slice(0, n).map((it) => ({
    display: it.text, target: it.text, lang: 'en', kind: 'code', note: it.lang || null,
  }));
  if (!out.length) return fallbackLesson('en', n, { codeLang: lang });
  return { lines: out, meta: { codeLang: lang, langs: [...new Set(pool.map((it) => it.lang))], count: out.length } };
}

/* ------------------------------------------------------------ 弱点ドリル */

/** 連接 pair を含む擬似語を1つ作る */
function bigramWord(pair, alphabet, weights) {
  const chars = arr(alphabet).filter((c) => typeof c === 'string' && c.length === 1);
  const vowels = chars.filter((c) => VOWELS.includes(c));
  const cons = chars.filter((c) => !VOWELS.includes(c));
  const isV = (c) => VOWELS.includes(c);
  const seq = [...pair];

  // 連接の前後に母音/子音を足して発音できる形に寄せる
  if (!isV(pair[0]) && vowels.length && Math.random() < 0.7) seq.unshift(weightedPick(vowels, weights, null));
  else if (isV(pair[0]) && cons.length && Math.random() < 0.6) seq.unshift(weightedPick(cons, weights, null));
  if (!isV(pair[1]) && vowels.length) seq.push(weightedPick(vowels, weights, null));
  else if (cons.length && Math.random() < 0.5) seq.push(weightedPick(cons, weights, null));

  const out = [];
  for (const c of seq) {
    if (!c) continue;
    const m = out.length;
    if (m >= 2 && out[m - 1] === c && out[m - 2] === c) continue; // 3連続を落とす
    out.push(c);
  }
  return out.join('');
}

/** その連接を含むローマ字になるかな(1かな、無ければ2かな連結)を集める */
function kanaSnippetsFor(pairs, alphabet) {
  const set = new Set(arr(alphabet));
  const pool = fullKana();
  const rom = pool.map((k) => romajiOf(k));
  for (const strict of [true, false]) {
    const found = [];
    for (const p of pairs) {
      let hit = 0;
      for (let i = 0; i < pool.length; i++) {
        if (!rom[i] || !rom[i].includes(p)) continue;
        if (strict && !fitsAlphabet(rom[i], set)) continue;
        found.push(pool[i]); hit++;
      }
      for (let i = 0; i < pool.length && hit < 10; i++) {
        for (let j = 0; j < pool.length && hit < 10; j++) {
          const r = (rom[i] || '') + (rom[j] || '');
          if (!r.includes(p)) continue;
          if (strict && !fitsAlphabet(r, set)) continue;
          found.push(pool[i] + pool[j]); hit++;
        }
      }
    }
    const uniq = [...new Set(found)];
    if (uniq.length) return uniq;
  }
  return [];
}

export function buildDrillLesson({ lang = store.settings.lang, count = 10 } = {}) {
  const L = lang === 'en' ? 'en' : 'ja';
  const n = Math.max(1, Math.floor(count) || 1);
  let pairs = [];
  try {
    pairs = worstBigrams(6).map((b) => b.pair).filter((p) => typeof p === 'string' && p.length === 2);
  } catch { pairs = []; }
  // 統計が溜まっていない間は適応レッスンに委譲する
  if (!pairs.length) return fallbackLesson(L, n, { pairs: [] });

  const unlocked = unlockedChars(L);
  const alphabet = [...new Set([...unlocked, ...pairs.join('')])];
  const weights = charWeights(unlocked, L);
  const out = [];

  if (L === 'en') {
    const getWord = () => {
      const w = bigramWord(pairs[rnd(pairs.length)], alphabet, weights);
      return w ? { display: w, target: w } : null;
    };
    for (let i = 0; i < n; i++) out.push(buildLine('en', 'focus', getWord));
    return { lines: out, meta: { pairs, lang: 'en', count: out.length } };
  }

  const snippets = kanaSnippetsFor(pairs, alphabet);
  if (!snippets.length) return fallbackLesson(L, n, { pairs });
  const filler = kanaCandidates(alphabet, weights);
  const getWord = () => {
    const s = snippets[rnd(snippets.length)];
    // 連接を含むかなに1かな足して語らしくする
    const extra = filler.items.length && Math.random() < 0.5
      ? (weightedPick(filler.items, filler.weights, null) || '') : '';
    const t = normalizeKana(s + extra);
    if (typable(t)) return { display: t, target: t };
    return typable(s) ? { display: s, target: s } : null;
  };
  for (let i = 0; i < n; i++) out.push(buildLine('ja', 'focus', getWord));
  return { lines: out, meta: { pairs, lang: 'ja', count: out.length } };
}

/* ------------------------------------------------------------ ステージ(子供) */

const EN_HOME = 'asdfghjkl';
const EN_TOP = 'qwertyuiop';
const EN_BOTTOM = 'zxcvbnm';
const EN_HOME_STEPS = ['fjdk', 'fjdkls', 'fjdklsa', 'fjdklsag', 'fjdklsagh', EN_HOME];
const EN_TOP_STEPS = ['ei', 'eiru', 'eiruty', 'eirutywo', 'eirutywopq', EN_TOP];
const EN_BOTTOM_STEPS = ['vm', 'vmcn', 'vmcnxb', EN_BOTTOM];
// 1..6 あ〜ま行 / 7..12 や〜だ行 / 13..16 ば行・ぱ行・拗音 / 17以降は全部
const JA_STAGE_ROWS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 16];

function enStageChars(stage) {
  let s = '';
  if (stage <= 6) s = EN_HOME_STEPS[stage - 1];
  else if (stage <= 12) s = EN_HOME + EN_TOP_STEPS[stage - 7];
  else if (stage <= 16) s = EN_HOME + EN_TOP + EN_BOTTOM_STEPS[stage - 13];
  else s = EN_ALPHA.join('');
  return [...new Set(s.split(''))];
}

function jaStageKana(stage) {
  if (stage >= 17) return fullKana();
  const rows = JA_STAGE_ROWS[Math.max(0, Math.min(JA_STAGE_ROWS.length - 1, stage - 1))];
  return GYO.slice(0, rows).flat();
}

export function buildStageLesson({ stage = 1, lang = 'ja' } = {}) {
  const L = lang === 'en' ? 'en' : 'ja';
  const s = Math.max(1, Math.floor(stage) || 1);
  const isBoss = s % 5 === 0;
  const n = 6 + (s % 3) + (isBoss ? 4 : 0); // ボスは行数を増やして長丁場にする
  const out = [];

  if (L === 'en') {
    const charset = enStageChars(s);
    const getWord = cyclic(shuffle(realEntries('en', charset, n * 3)));
    for (let i = 0; i < n; i++) {
      const cnt = between(4, 6);
      const words = [];
      for (let k = 0; k < cnt; k++) { const w = getWord(); if (w) words.push(w.target); }
      out.push(enLine(words.length ? words : ['fj'], 'word'));
    }
    return { lines: out, meta: { stage: s, charset, isBoss, lang: 'en' } };
  }

  const charset = jaStageKana(s);
  const charSet = new Set(charset.join(''));
  const real = shuffle(C.byTag(jaWordEntries(), 'kids'))
    .map((it) => ({ display: typeof it.d === 'string' && it.d ? it.d : it.k, target: normalizeKana(it.k) }))
    .filter((e) => [...e.target].every((c) => charSet.has(c)) && typable(e.target))
    .slice(0, n * 2);
  const pseudo = kanaWordsFrom(charset, n * 3, 2, 4).map((w) => ({ display: w, target: w }));
  const getWord = cyclic(shuffle([...real, ...pseudo]));
  for (let i = 0; i < n; i++) {
    const parts = collectJa(getWord, 8, 16, 2, 4);
    out.push(jaLine(parts.length ? parts : [{ display: 'あい', target: 'あい' }], 'word'));
  }
  return { lines: out, meta: { stage: s, charset, isBoss, lang: 'ja' } };
}
