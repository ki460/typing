/**
 * keyboard.js — 画面キーボードと両手ガイド。
 * LAYOUTS の配列データから div のキーを組み立て、次に押す文字(.is-next)と
 * 打鍵の結果(.is-hit / .is-miss)を短時間だけ表示する。
 * 指の色は FINGER_COLOR を CSS 変数 --fc として要素に渡し、配色と形の指定は
 * すべて assets/css/keyboard.css 側で解決する(色をJSに埋め込まない)。
 * HandsView は画像を使わず inline SVG で左右の手を描き、押す指だけを光らせる。
 */
import {
  LAYOUTS, keyInfoFor, FINGER_COLOR, FINGER_LABEL, FINGER_LABEL_ADULT,
  FINGERS, handOf, shiftSideFor, HOME_KEYS,
} from '../data/layouts.js';

const FLASH_MS = 180;
const SVG_NS = 'http://www.w3.org/2000/svg';

function fingerColor(f) {
  return FINGER_COLOR[f] || FINGER_COLOR.th;
}

/** 画面キーボード。mount の中に .kb-wrap > .kb を作る。 */
export class KeyboardView {
  constructor(opts) {
    const o = opts || {};
    this.mount = o.mount;
    this.layout = LAYOUTS[o.layout] ? o.layout : 'jis';
    this.kidsLabels = !!o.kidsLabels;
    this.compact = !!o.compact;
    this.showHands = !!o.showHands;

    this.cells = new Map();        // 'row:col' -> キー要素
    this.shiftEls = { left: null, right: null };
    this.timers = new Set();       // flash の解除待ち(destroy でまとめて解除)
    this.hands = null;

    this.wrap = document.createElement('div');
    this.wrap.className = 'kb-wrap';
    if (this.mount) this.mount.appendChild(this.wrap);

    this.kb = document.createElement('div');
    // 装飾なので支援技術からは隠す(打鍵のたびに読み上げられると邪魔になる)
    this.kb.setAttribute('aria-hidden', 'true');
    this.wrap.appendChild(this.kb);

    if (this.showHands) {
      this.handsHost = document.createElement('div');
      this.wrap.appendChild(this.handsHost);
      this.hands = new HandsView({ mount: this.handsHost, kids: this.kidsLabels });
    }

    this._build();
  }

  _build() {
    this.cells.clear();
    this.shiftEls.left = null;
    this.shiftEls.right = null;
    this.kb.textContent = '';
    this.kb.className = 'kb'
      + (this.compact ? ' is-compact' : '')
      + (this.kidsLabels ? ' is-kids' : '');

    const layout = LAYOUTS[this.layout] || LAYOUTS.jis;
    layout.rows.forEach((row, r) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';
      row.forEach((key, c) => {
        const el = this._makeKey(key);
        this.cells.set(r + ':' + c, el);
        rowEl.appendChild(el);
      });
      this.kb.appendChild(rowEl);
    });
  }

  _makeKey(key) {
    const el = document.createElement('div');
    el.className = 'kb-key';
    el.style.setProperty('--w', String(key.w || 1));
    el.style.setProperty('--fc', fingerColor(key.f));
    el.dataset.finger = key.f || '';

    const main = document.createElement('span');
    main.className = 'kb-main';

    if (key.special || key.c == null) {
      el.classList.add('kb-special');
      main.textContent = key.label || '';
      // Shift は左右で別要素なので指(lp/rp)で側を決めておく
      if (key.label === 'Shift') {
        const side = key.f === 'lp' ? 'left' : 'right';
        if (!this.shiftEls[side]) this.shiftEls[side] = el;
      }
    } else {
      el.dataset.char = key.c;
      if (key.c === ' ') el.classList.add('kb-space');
      if (HOME_KEYS.indexOf(key.c) >= 0) el.classList.add('is-home');
      if (key.s) {
        const sub = document.createElement('b');
        sub.className = 'kb-sub';
        sub.textContent = key.s;
        el.appendChild(sub);
      }
      main.textContent = key.c;
    }
    el.appendChild(main);
    return el;
  }

  setLayout(id) {
    if (!LAYOUTS[id] || id === this.layout) return;
    this.layout = id;
    this._build();
  }

  /** 次に押すべき文字集合をハイライト。Shift が要る文字は逆手の Shift も光らせる */
  highlight(chars) {
    const prev = this.kb.querySelectorAll('.is-next');
    for (const el of prev) el.classList.remove('is-next');

    let firstFinger = null;
    let firstShift = null;
    if (chars) {
      for (const ch of chars) {
        const info = keyInfoFor(this.layout, ch);
        if (!info) continue;
        const el = this.cells.get(info.row + ':' + info.col);
        if (el) el.classList.add('is-next');
        const side = info.shift ? shiftSideFor(info.finger) : null;
        if (side && this.shiftEls[side]) this.shiftEls[side].classList.add('is-next');
        if (!firstFinger) { firstFinger = info.finger; firstShift = side; }
      }
    }
    if (this.hands) this.hands.highlight(firstFinger, firstShift);
  }

  /** 打鍵フィードバック。該当キーが無ければ何もしない */
  flash(char, ok) {
    const info = keyInfoFor(this.layout, char);
    if (!info) return;
    const el = this.cells.get(info.row + ':' + info.col);
    if (!el) return;
    const cls = ok ? 'is-hit' : 'is-miss';
    el.classList.add(cls);
    const t = setTimeout(() => {
      el.classList.remove(cls);
      this.timers.delete(t);
    }, FLASH_MS);
    this.timers.add(t);
  }

  setVisible(v) {
    // wrap ごと隠す。kb だけだと showHands:true のとき手の図が残る
    (this.wrap || this.kb).hidden = !v;
  }

  destroy() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.hands) { this.hands.destroy(); this.hands = null; }
    this.cells.clear();
    if (this.wrap && this.wrap.parentNode) this.wrap.parentNode.removeChild(this.wrap);
    this.wrap = null;
    this.kb = null;
  }
}

// ------------------------------------------------------------ 手の SVG
/** 角丸長方形のパス文字列。指と手のひらの両方に使う */
function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  return 'M' + (x + rr) + ',' + y
    + 'H' + (x + w - rr) + 'A' + rr + ',' + rr + ' 0 0 1 ' + (x + w) + ',' + (y + rr)
    + 'V' + (y + h - rr) + 'A' + rr + ',' + rr + ' 0 0 1 ' + (x + w - rr) + ',' + (y + h)
    + 'H' + (x + rr) + 'A' + rr + ',' + rr + ' 0 0 1 ' + x + ',' + (y + h - rr)
    + 'V' + (y + rr) + 'A' + rr + ',' + rr + ' 0 0 1 ' + (x + rr) + ',' + y + 'Z';
}

// 左手の素形。右手はこれを左右反転して使う(slot 順に 小指→人差し指)
const FINGER_GEO = [
  { x: 42, y: 60, w: 18, h: 46 },
  { x: 64, y: 46, w: 19, h: 60 },
  { x: 87, y: 40, w: 19, h: 66 },
  { x: 110, y: 48, w: 19, h: 58 },
];
const PALM_GEO = { x: 38, y: 96, w: 96, h: 62, r: 22 };
const THUMB_GEO = { x: 132, y: 104, w: 44, h: 18, r: 9, rot: 22 };
const MIRROR_X = 380;

function handGroup(fingers, thumbId, mirrored) {
  const parts = [];
  if (mirrored) {
    parts.push('<g transform="translate(' + MIRROR_X + ',0) scale(-1,1)">');
  } else {
    parts.push('<g>');
  }
  parts.push('<path class="hands-palm" d="'
    + roundRect(PALM_GEO.x, PALM_GEO.y, PALM_GEO.w, PALM_GEO.h, PALM_GEO.r) + '"/>');
  FINGER_GEO.forEach((g, i) => {
    const f = fingers[i];
    parts.push('<path class="hands-finger" data-finger="' + f + '" style="--fc:'
      + fingerColor(f) + '" d="' + roundRect(g.x, g.y, g.w, g.h, g.w / 2) + '"/>');
  });
  const t = THUMB_GEO;
  parts.push('<path class="hands-finger hands-thumb" id="' + thumbId + '" data-finger="th" style="--fc:'
    + fingerColor('th') + '" transform="rotate(' + t.rot + ' ' + t.x + ' ' + t.y + ')" d="'
    + roundRect(t.x, t.y, t.w, t.h, t.r) + '"/>');
  parts.push('</g>');
  return parts.join('');
}

/** 両手の図。押す指だけ色が乗る */
export class HandsView {
  constructor(opts) {
    const o = opts || {};
    this.mount = o.mount;
    this.kids = !!o.kids;

    this.root = document.createElement('div');
    this.root.className = 'hands' + (this.kids ? ' is-kids' : '');
    this.root.setAttribute('aria-hidden', 'true');
    this.root.innerHTML = '<svg class="hands-svg" viewBox="20 26 340 142" '
      + 'preserveAspectRatio="xMidYMid meet" focusable="false">'
      + handGroup(['lp', 'lr', 'lm', 'li'], 'th-l', false)
      + handGroup(['rp', 'rr', 'rm', 'ri'], 'th-r', true)
      + '</svg>';
    this.svg = this.root.querySelector('svg');
    if (this.mount) this.mount.appendChild(this.root);
  }

  /** finger=null で全解除。shiftSide の側の小指には .is-on-shift を付ける */
  highlight(finger, shiftSide) {
    const lit = this.svg.querySelectorAll('.is-on, .is-on-shift');
    for (const el of lit) el.classList.remove('is-on', 'is-on-shift');
    if (finger) {
      const els = this.svg.querySelectorAll('[data-finger="' + finger + '"]');
      for (const el of els) el.classList.add('is-on');
    }
    if (shiftSide === 'left' || shiftSide === 'right') {
      const pinky = shiftSide === 'left' ? 'lp' : 'rp';
      const el = this.svg.querySelector('[data-finger="' + pinky + '"]');
      if (el) el.classList.add('is-on-shift');
    }
  }

  destroy() {
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
    this.svg = null;
  }
}

// ------------------------------------------------------------ 補助 API
/** 「右手の人差し指」などのヒント情報。未知の文字は null */
export function handHintFor(layoutId, char, kids = false) {
  const info = keyInfoFor(layoutId, char);
  if (!info) return null;
  const labels = kids ? FINGER_LABEL : FINGER_LABEL_ADULT;
  return {
    finger: info.finger,
    hand: handOf(info.finger),
    label: labels[info.finger] || '',
    color: fingerColor(info.finger),
  };
}

/** 指ごとの色凡例を mount に作る(中身は毎回作り直す) */
export function renderFingerLegend(mount, kids = false) {
  if (!mount) return;
  mount.textContent = '';
  const labels = kids ? FINGER_LABEL : FINGER_LABEL_ADULT;
  const list = document.createElement('div');
  list.className = 'kb-legend' + (kids ? ' is-kids' : '');
  FINGERS.forEach((f) => {
    const item = document.createElement('span');
    item.className = 'kb-legend-item';
    item.style.setProperty('--fc', fingerColor(f));
    const dot = document.createElement('i');
    dot.className = 'kb-legend-dot';
    const name = document.createElement('span');
    name.textContent = labels[f] || f;
    item.appendChild(dot);
    item.appendChild(name);
    list.appendChild(item);
  });
  mount.appendChild(list);
}
