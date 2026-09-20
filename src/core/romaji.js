/**
 * romaji.js — かな → ローマ字 入力オートマトン
 *
 * 日本語タイピングの要。1つのかな列に対して複数の正しい打ち方
 * (し = si / shi / ci、ちゃ = tya / cha / cya / chixya ...) をすべて受理する。
 *
 * 方式: 「生きている状態集合」を持つ非決定性オートマトン。
 *   状態 = { i: かな位置, buf: 現セグメントに入力済みの部分文字列 }
 * 1打鍵ごとに全状態を延長し、1つでも生き残れば「正解」。
 * これにより「ん」の n / nn の分岐や、促音の xtu / 子音重ねの分岐を
 * 打ち切りなしで同時に追跡できる。
 */

// ---------------------------------------------------------------- かな基本表
const BASE = {
  'あ': ['a'], 'い': ['i', 'yi'], 'う': ['u', 'wu', 'whu'], 'え': ['e'], 'お': ['o'],
  'か': ['ka', 'ca'], 'き': ['ki'], 'く': ['ku', 'cu', 'qu'], 'け': ['ke'], 'こ': ['ko', 'co'],
  'さ': ['sa'], 'し': ['si', 'shi', 'ci'], 'す': ['su'], 'せ': ['se', 'ce'], 'そ': ['so'],
  'た': ['ta'], 'ち': ['ti', 'chi'], 'つ': ['tu', 'tsu'], 'て': ['te'], 'と': ['to'],
  'な': ['na'], 'に': ['ni'], 'ぬ': ['nu'], 'ね': ['ne'], 'の': ['no'],
  'は': ['ha'], 'ひ': ['hi'], 'ふ': ['hu', 'fu'], 'へ': ['he'], 'ほ': ['ho'],
  'ま': ['ma'], 'み': ['mi'], 'む': ['mu'], 'め': ['me'], 'も': ['mo'],
  'や': ['ya'], 'ゆ': ['yu'], 'よ': ['yo'],
  'ら': ['ra'], 'り': ['ri'], 'る': ['ru'], 'れ': ['re'], 'ろ': ['ro'],
  'わ': ['wa'], 'ゐ': ['wi'], 'ゑ': ['we'], 'を': ['wo'],
  'が': ['ga'], 'ぎ': ['gi'], 'ぐ': ['gu'], 'げ': ['ge'], 'ご': ['go'],
  'ざ': ['za'], 'じ': ['zi', 'ji'], 'ず': ['zu'], 'ぜ': ['ze'], 'ぞ': ['zo'],
  'だ': ['da'], 'ぢ': ['di'], 'づ': ['du'], 'で': ['de'], 'ど': ['do'],
  'ば': ['ba'], 'び': ['bi'], 'ぶ': ['bu'], 'べ': ['be'], 'ぼ': ['bo'],
  'ぱ': ['pa'], 'ぴ': ['pi'], 'ぷ': ['pu'], 'ぺ': ['pe'], 'ぽ': ['po'],
  'ゔ': ['vu'],
  'ぁ': ['xa', 'la'], 'ぃ': ['xi', 'li', 'xyi', 'lyi'], 'ぅ': ['xu', 'lu'],
  'ぇ': ['xe', 'le'], 'ぉ': ['xo', 'lo'],
  'ゃ': ['xya', 'lya'], 'ゅ': ['xyu', 'lyu'], 'ょ': ['xyo', 'lyo'],
  'ゎ': ['xwa', 'lwa'], 'ゕ': ['xka', 'lka'], 'ゖ': ['xke', 'lke'],
  'ん': ['nn', 'xn', "n'"],
  'っ': ['xtu', 'ltu', 'xtsu', 'ltsu'],
  'ー': ['-'], '、': [','], '。': ['.'], '・': ['/'],
  '「': ['['], '」': [']'], '　': [' '],
};

// ------------------------------------------------------- 拗音(2かな)の融合表
const FUSED = {
  'きゃ': ['kya'], 'きゅ': ['kyu'], 'きょ': ['kyo'], 'きぇ': ['kye'], 'きぃ': ['kyi'],
  'ぎゃ': ['gya'], 'ぎゅ': ['gyu'], 'ぎょ': ['gyo'], 'ぎぇ': ['gye'],
  'しゃ': ['sya', 'sha'], 'しゅ': ['syu', 'shu'], 'しょ': ['syo', 'sho'],
  'しぇ': ['sye', 'she'], 'しぃ': ['syi'],
  'じゃ': ['zya', 'ja', 'jya'], 'じゅ': ['zyu', 'ju', 'jyu'],
  'じょ': ['zyo', 'jo', 'jyo'], 'じぇ': ['zye', 'je', 'jye'],
  'ちゃ': ['tya', 'cha', 'cya'], 'ちゅ': ['tyu', 'chu', 'cyu'],
  'ちょ': ['tyo', 'cho', 'cyo'], 'ちぇ': ['tye', 'che', 'cye'],
  'ぢゃ': ['dya'], 'ぢゅ': ['dyu'], 'ぢょ': ['dyo'],
  'にゃ': ['nya'], 'にゅ': ['nyu'], 'にょ': ['nyo'], 'にぇ': ['nye'],
  'ひゃ': ['hya'], 'ひゅ': ['hyu'], 'ひょ': ['hyo'], 'ひぇ': ['hye'],
  'びゃ': ['bya'], 'びゅ': ['byu'], 'びょ': ['byo'], 'びぇ': ['bye'],
  'ぴゃ': ['pya'], 'ぴゅ': ['pyu'], 'ぴょ': ['pyo'], 'ぴぇ': ['pye'],
  'みゃ': ['mya'], 'みゅ': ['myu'], 'みょ': ['myo'], 'みぇ': ['mye'],
  'りゃ': ['rya'], 'りゅ': ['ryu'], 'りょ': ['ryo'], 'りぇ': ['rye'],
  'ふぁ': ['fa', 'fwa'], 'ふぃ': ['fi', 'fyi', 'fwi'], 'ふぇ': ['fe', 'fye', 'fwe'],
  'ふぉ': ['fo', 'fwo'], 'ふゅ': ['fyu'],
  'ゔぁ': ['va'], 'ゔぃ': ['vi'], 'ゔぇ': ['ve'], 'ゔぉ': ['vo'], 'ゔゅ': ['vyu'],
  'てぃ': ['thi'], 'てゅ': ['thu'], 'でぃ': ['dhi'], 'でゅ': ['dhu'],
  'とぅ': ['twu'], 'どぅ': ['dwu'],
  'うぃ': ['whi', 'wi'], 'うぇ': ['whe', 'we'], 'うぉ': ['who'],
  'くぁ': ['qa', 'kwa'], 'くぃ': ['qi'], 'くぇ': ['qe'], 'くぉ': ['qo'],
  'つぁ': ['tsa'], 'つぃ': ['tsi'], 'つぇ': ['tse'], 'つぉ': ['tso'],
  'いぇ': ['ye'],
};

const VOWEL_KANA = new Set(['あ', 'い', 'う', 'え', 'お', 'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ']);
const NA_GYO = new Set(['な', 'に', 'ぬ', 'ね', 'の']);
const YA_GYO = new Set(['や', 'ゆ', 'よ', 'ゃ', 'ゅ', 'ょ']);
const CONSONANT = /^[bcdfghjkmpqrstvwxyz]/; // 促音で重ねられる子音(n を除く)

/** カタカナ・全角英数をひらがな/半角へ正規化する */
export function normalizeKana(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x30a1 && c <= 0x30f6) out += String.fromCodePoint(c - 0x60); // カタカナ→ひらがな
    else if (c >= 0xff01 && c <= 0xff5e) out += String.fromCodePoint(c - 0xfee0); // 全角→半角
    else if (ch === 'ヴ') out += 'ゔ';
    else if (ch === '％') out += '%';
    else out += ch;
  }
  return out;
}

/**
 * 位置 i から始まるセグメント候補を返す。
 * @returns {{romaji:string[], len:number}[]}
 */
function segmentsAt(kana, i, depth = 0) {
  const ch = kana[i];
  if (ch === undefined) return [];
  const segs = [];

  // --- 促音: 次セグメントの頭子音を重ねる / 単独 xtu
  if (ch === 'っ' && depth < 4) {
    segs.push({ romaji: BASE['っ'], len: 1 });
    for (const next of segmentsAt(kana, i + 1, depth + 1)) {
      const doubled = next.romaji.filter((r) => CONSONANT.test(r)).map((r) => r[0] + r);
      if (doubled.length) segs.push({ romaji: doubled, len: 1 + next.len });
    }
    return segs;
  }

  // --- 撥音: nn/xn は常に可。単独 n は次が母音・な行・や行・ん でないときのみ
  if (ch === 'ん') {
    const nxt = kana[i + 1];
    const soloOk = nxt === undefined
      || !(VOWEL_KANA.has(nxt) || NA_GYO.has(nxt) || YA_GYO.has(nxt) || nxt === 'ん');
    return [{ romaji: soloOk ? ['n', ...BASE['ん']] : BASE['ん'], len: 1 }];
  }

  // --- 拗音(2かな融合)。分解打ち(き+ゃ)も単独セグメントとして別途生きる
  const pair = kana.slice(i, i + 2);
  if (FUSED[pair]) segs.push({ romaji: FUSED[pair], len: 2 });

  if (BASE[ch]) segs.push({ romaji: BASE[ch], len: 1 });
  else segs.push({ romaji: [ch], len: 1 }); // 表に無い文字(英数・記号)はそのまま1打鍵

  return segs;
}

/**
 * かな列に対するローマ字入力マッチャ。
 * 1文字ずつ feed() し、ok / 完了 / 残りローマ字 を返す。
 */
export class RomajiMatcher {
  /** @param {string} kana 目標のかな列 */
  constructor(kana) {
    this.kana = normalizeKana(kana);
    this.segCache = new Map();
    this.minLen = this._computeMinLen();
    this.states = [{ i: 0, buf: '' }];
    this.typed = '';          // 実際に打たれた正しいローマ字
    this.unitIndex = 0;       // 確定したかな位置(表示カーソル用)
  }

  _segs(i) {
    if (!this.segCache.has(i)) this.segCache.set(i, segmentsAt(this.kana, i));
    return this.segCache.get(i);
  }

  /** 位置 i から最後まで打ち切る最短ローマ字長 (DP) */
  _computeMinLen() {
    const n = this.kana.length;
    const min = new Array(n + 1).fill(Infinity);
    min[n] = 0;
    for (let i = n - 1; i >= 0; i--) {
      for (const seg of this._segs(i)) {
        const shortest = Math.min(...seg.romaji.map((r) => r.length));
        const rest = min[i + seg.len];
        if (rest !== undefined && shortest + rest < min[i]) min[i] = shortest + rest;
      }
    }
    return min;
  }

  /** この目標を打ち切るのに必要な最短打鍵数 */
  get totalKeys() { return this.minLen[0]; }

  /** 現在受理できる文字の集合 */
  expected() {
    const set = new Set();
    for (const st of this.states) {
      for (const seg of this._segs(st.i)) {
        for (const r of seg.romaji) {
          if (r.length > st.buf.length && r.startsWith(st.buf)) set.add(r[st.buf.length]);
        }
      }
    }
    return set;
  }

  get done() { return this.states.some((s) => s.i >= this.kana.length && s.buf === ''); }

  /**
   * 1文字入力。
   * @returns {{ok:boolean, done:boolean, advanced:number}}
   */
  feed(ch) {
    const next = new Map();
    for (const st of this.states) {
      const buf = st.buf + ch;
      for (const seg of this._segs(st.i)) {
        for (const r of seg.romaji) {
          if (r === buf) {
            const k = `${st.i + seg.len}|`;
            if (!next.has(k)) next.set(k, { i: st.i + seg.len, buf: '' });
          } else if (r.startsWith(buf)) {
            const k = `${st.i}|${buf}`;
            if (!next.has(k)) next.set(k, { i: st.i, buf });
          }
        }
      }
    }
    if (next.size === 0) return { ok: false, done: false, advanced: 0 };

    const before = this.unitIndex;
    this.states = [...next.values()];
    this.typed += ch;
    // 表示カーソルは「全状態が到達済みの最小位置」= 確定した位置
    this.unitIndex = Math.min(...this.states.map((s) => s.i));
    return { ok: true, done: this.done, advanced: this.unitIndex - before };
  }

  /** 残りのローマ字(最短経路)。UI のヒント表示に使う */
  remaining() {
    let best = null;
    let bestCost = Infinity;
    for (const st of this.states) {
      // この状態から打ち切る最短コストを見積もる
      let cost = Infinity;
      let pick = null;
      for (const seg of this._segs(st.i)) {
        for (const r of seg.romaji) {
          if (!r.startsWith(st.buf) || r.length < st.buf.length) continue;
          const rest = this.minLen[st.i + seg.len] ?? Infinity;
          const c = (r.length - st.buf.length) + rest;
          if (c < cost) { cost = c; pick = { tail: r.slice(st.buf.length), nextI: st.i + seg.len }; }
        }
      }
      if (st.i >= this.kana.length && st.buf === '') { cost = 0; pick = { tail: '', nextI: st.i }; }
      if (pick && cost < bestCost) { bestCost = cost; best = { st, pick }; }
    }
    if (!best) return '';
    let out = best.pick.tail;
    let i = best.pick.nextI;
    // 以降は最短経路を貪欲に辿る
    let guard = 0;
    while (i < this.kana.length && guard++ < 500) {
      let pickSeg = null;
      let pickR = null;
      let cost = Infinity;
      for (const seg of this._segs(i)) {
        for (const r of seg.romaji) {
          const c = r.length + (this.minLen[i + seg.len] ?? Infinity);
          if (c < cost) { cost = c; pickSeg = seg; pickR = r; }
        }
      }
      if (!pickSeg) break;
      out += pickR;
      i += pickSeg.len;
    }
    return out;
  }

  /** 目標全体の代表的なローマ字(最短)を返す */
  static toRomaji(kana) {
    const m = new RomajiMatcher(kana);
    return m.remaining();
  }
}

/**
 * 英字などをそのまま1文字ずつ打つマッチャ。RomajiMatcher と同じ API を持つ。
 */
export class DirectMatcher {
  constructor(text) {
    this.kana = text;
    this.text = text;
    this.unitIndex = 0;
    this.typed = '';
  }
  get totalKeys() { return this.text.length; }
  get done() { return this.unitIndex >= this.text.length; }
  expected() { return this.done ? new Set() : new Set([this.text[this.unitIndex]]); }
  feed(ch) {
    if (this.done || ch !== this.text[this.unitIndex]) return { ok: false, done: false, advanced: 0 };
    this.unitIndex++;
    this.typed += ch;
    return { ok: true, done: this.done, advanced: 1 };
  }
  remaining() { return this.text.slice(this.unitIndex); }
}

export function createMatcher(lang, target) {
  return lang === 'ja' ? new RomajiMatcher(target) : new DirectMatcher(target);
}
