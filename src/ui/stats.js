/**
 * stats.js — 統計画面 (契約 2.9)。
 * 累計・推移グラフ・キー別ヒートマップ・苦手キー/連接・学習カレンダー・
 * 解禁の進み具合・バッジを 1 画面にまとめて見せる。
 * グラフはすべて inline SVG / CSS grid の自前描画（ライブラリ・外部画像なし）。
 * データが 1 件も無い状態でも必ず描画できるようにしてある。
 */
import { store, worstBigrams, mastery, levelFromXp, xpForLevel, todayKey, BADGES } from '../core/store.js';
import { LAYOUTS, keyInfoFor, FINGER_COLOR, FINGER_LABEL_ADULT } from '../data/layouts.js';
import { progressOf, unlockedChars, orderFor } from '../core/curriculum.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY = 86400000;
const WEEKS = 12;

/** バッジの説明文。store.js の BADGES は名前しか持たないのでここで補う。 */
const BADGE_DESC = {
  first: { e: '🚩', d: 'はじめて練習を終える' },
  keys1k: { e: '⌨️', d: '累計 1,000 打' },
  keys10k: { e: '⌨️', d: '累計 10,000 打' },
  keys50k: { e: '🏔️', d: '累計 50,000 打' },
  acc98: { e: '🎯', d: '120 打以上で正確率 98%' },
  acc100: { e: '💎', d: '80 打以上でミス 0' },
  wpm30: { e: '🚶', d: '30 WPM を出す' },
  wpm50: { e: '🏃', d: '50 WPM を出す' },
  wpm70: { e: '🚀', d: '70 WPM を出す' },
  streak3: { e: '🌱', d: '3 日つづけて練習' },
  streak7: { e: '🌿', d: '7 日つづけて練習' },
  streak30: { e: '🌳', d: '30 日つづけて練習' },
};

// ------------------------------------------------------------ 小さな道具

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function svg(name, attrs) {
  const n = document.createElementNS(SVG_NS, name);
  for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  return n;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function num(v, fallback = 0) { return Number.isFinite(v) ? v : fallback; }

/** 0..1 を赤→緑のグラデに。色は CSS 変数を color-mix で混ぜる。 */
function heatPaint(node, score) {
  const p = Math.round(clamp01(score) * 100);
  node.style.background = `color-mix(in oklab, var(--ok) ${p}%, var(--err))`;
  node.style.color = 'var(--sheat-ink)';
}

function pct1(v) { return (Math.round(num(v) * 1000) / 10).toFixed(1); }

function minutesOf(ms) {
  const m = num(ms) / 60000;
  if (m < 1) return Math.round(num(ms) / 1000) + ' 秒';
  return Math.round(m) + ' 分';
}

function dateLabel(t) {
  const d = new Date(t);
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function card(title, sub) {
  const c = el('section', 'card stats-card');
  if (title) {
    const head = el('div', 'stats-card-head');
    head.append(el('h2', null, title));
    if (sub) head.append(el('span', 'tiny faint', sub));
    c.append(head);
  }
  return c;
}

/** shell.css の .seg を借りたトグル */
function seg(options, value, onPick, ariaLabel) {
  const box = el('div', 'seg');
  box.setAttribute('role', 'group');
  if (ariaLabel) box.setAttribute('aria-label', ariaLabel);
  for (const o of options) {
    const b = el('button', null, o.label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(o.value === value));
    b.addEventListener('click', () => onPick(o.value));
    box.append(b);
  }
  return box;
}

function emptyNote(text) { return el('p', 'muted small stats-empty', text); }

// ------------------------------------------------------------ 1) サマリー

function buildSummary(lang) {
  const p = store.profile;
  const sessions = Array.isArray(p.sessions) ? p.sessions : [];
  const today = p.daily?.[todayKey()] || { ms: 0, keys: 0, sessions: 0 };
  const lv = levelFromXp(num(p.xp));
  const base = xpForLevel(lv);
  const next = xpForLevel(lv + 1);
  const span = Math.max(1, next - base); // 0 除算よけ
  const ratio = clamp01((num(p.xp) - base) / span);

  const c = card('サマリー', lang === 'ja' ? '日本語モード' : '英語モード');
  const grid = el('div', 'grid-kpi');
  const items = [
    [String(num(p.totalKeys)), '累計打鍵'],
    [num(p.streak) + ' 日', 'れんしゅう日数'],
    ['Lv.' + lv, 'レベル'],
    [minutesOf(today.ms), '今日の練習時間'],
    [num(today.sessions) + ' 回', '今日のセッション'],
    [sessions.length + ' 回', '記録ずみセッション'],
  ];
  for (const [b, s] of items) {
    const k = el('div', 'kpi');
    k.append(el('b', null, b), el('span', null, s));
    grid.append(k);
  }
  c.append(grid);

  const bar = el('div', 'bar stats-xpbar');
  const fill = el('i');
  fill.style.width = Math.round(ratio * 100) + '%';
  bar.append(fill);
  c.append(bar);
  c.append(el('p', 'tiny faint', `XP ${num(p.xp)} / つぎのレベルまで ${Math.max(0, next - num(p.xp))}`));
  return c;
}

// -------------------------------------------------------- 2) 推移グラフ

function buildTrend(lang) {
  const all = Array.isArray(store.profile.sessions) ? store.profile.sessions : [];
  const rows = all.filter((s) => s && s.lang === lang).slice(-30);
  const c = card('推移', '直近 30 セッション');

  if (rows.length < 3) {
    c.append(emptyNote('まだデータがありません。3 回以上練習すると推移グラフが出ます。'));
    return c;
  }

  const W = 680, H = 240, padL = 44, padR = 46, padT = 14, padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const wpms = rows.map((s) => Math.max(0, num(s.wpm)));
  const maxW = Math.max(10, Math.ceil(Math.max(...wpms) / 10) * 10);
  const ACC_LO = 50; // 正確率は 50〜100% を右軸に取ると差が見える
  const xAt = (i) => padL + (rows.length === 1 ? plotW / 2 : (i / (rows.length - 1)) * plotW);
  const yW = (v) => padT + (1 - clamp01(v / maxW)) * plotH;
  const yA = (v) => padT + (1 - clamp01((v - ACC_LO) / (100 - ACC_LO))) * plotH;

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`, class: 'schart', role: 'img',
    preserveAspectRatio: 'xMidYMid meet',
    'aria-label': 'WPM と正確率の推移',
  });

  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    root.append(svg('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: 'schart-grid' }));
    const lv = Math.round(maxW * (1 - i / 4));
    const rv = Math.round(ACC_LO + (100 - ACC_LO) * (1 - i / 4));
    const lt = svg('text', { x: padL - 8, y: y + 4, class: 'schart-tick', 'text-anchor': 'end' });
    lt.textContent = String(lv);
    const rt = svg('text', { x: W - padR + 8, y: y + 4, class: 'schart-tick schart-tick-acc' });
    rt.textContent = rv + '%';
    root.append(lt, rt);
  }

  const accPts = rows.map((s, i) => `${xAt(i)},${yA(clamp01(num(s.acc)) * 100)}`).join(' ');
  root.append(svg('polyline', { points: accPts, class: 'schart-acc' }));
  const wpmPts = rows.map((s, i) => `${xAt(i)},${yW(Math.max(0, num(s.wpm)))}`).join(' ');
  root.append(svg('polyline', { points: wpmPts, class: 'schart-wpm' }));

  rows.forEach((s, i) => {
    const g = svg('g', {});
    const t = svg('title', {});
    t.textContent = `${dateLabel(s.t)} ／ ${Math.round(num(s.wpm))} WPM ／ 正確率 ${pct1(num(s.acc))}% ／ ${num(s.keys)} 打`;
    g.append(t);
    g.append(svg('circle', { cx: xAt(i), cy: yA(clamp01(num(s.acc)) * 100), r: 2.5, class: 'schart-dot-acc' }));
    g.append(svg('circle', { cx: xAt(i), cy: yW(Math.max(0, num(s.wpm))), r: 3.2, class: 'schart-dot' }));
    root.append(g);
  });

  const x0 = svg('text', { x: padL, y: H - 8, class: 'schart-tick' });
  x0.textContent = dateLabel(rows[0].t);
  const x1 = svg('text', { x: W - padR, y: H - 8, class: 'schart-tick', 'text-anchor': 'end' });
  x1.textContent = dateLabel(rows[rows.length - 1].t);
  root.append(x0, x1);

  c.append(root);
  const legend = el('div', 'row wrap stats-legend tiny');
  legend.append(el('span', 'slg slg-wpm', 'WPM（左軸）'), el('span', 'slg slg-acc', '正確率（右軸 50〜100%）'));
  c.append(legend);
  return c;
}

// -------------------------------------------------- 3) キーヒートマップ

function keyStat(ch) {
  const k = store.profile.keys?.[ch];
  if (!k || !num(k.n)) return null;
  const n = num(k.n), err = num(k.err);
  return { n, err, ms: Number.isFinite(k.ms) ? k.ms : null, acc: n / Math.max(1, n + err) };
}

function buildHeatmap(mode, onMode) {
  const layoutId = LAYOUTS[store.settings.layout] ? store.settings.layout : 'jis';
  const layout = LAYOUTS[layoutId];
  const targetMs = Math.max(1, store.targetMs());

  const c = card('キー別ヒートマップ', layout.name);
  c.append(seg(
    [{ label: '速度', value: 'speed' }, { label: '正確率', value: 'acc' }],
    mode, onMode, '着色の基準',
  ));

  const board = el('div', 'sheat');
  for (const row of layout.rows) {
    const r = el('div', 'sheat-row');
    for (const key of row) {
      const k = el('div', 'sheat-key');
      k.style.setProperty('--w', String(num(key.w, 1)));
      if (key.special || key.c == null) {
        k.classList.add('is-special');
        k.textContent = key.label || '';
        k.title = key.label || '';
      } else {
        const ch = key.c;
        k.textContent = ch === ' ' ? '␣' : ch;
        const st = keyStat(ch);
        if (!st) {
          k.classList.add('is-empty');
          k.title = `${ch === ' ' ? 'スペース' : ch}: データなし`;
        } else {
          const score = mode === 'acc'
            ? clamp01((st.acc - 0.8) / 0.18)
            : (st.ms == null ? 0 : clamp01((targetMs / st.ms - 0.5) / 0.7));
          heatPaint(k, score);
          const msTxt = st.ms == null ? '—' : Math.round(st.ms) + 'ms';
          k.title = `${ch === ' ' ? 'スペース' : ch}: ${st.n}回 / 平均${msTxt} / 正確率${pct1(st.acc)}%`;
        }
      }
      r.append(k);
    }
    board.append(r);
  }
  c.append(board);
  c.append(el('p', 'tiny faint', mode === 'acc'
    ? '緑＝正確、赤＝ミスが多い。灰色はまだデータがないキー。'
    : `緑＝目標（${Math.round(targetMs)}ms）より速い、赤＝遅い。灰色はまだデータがないキー。`));
  return c;
}

// ------------------------------------------------------- 4) 苦手キー Top10

function buildWorstKeys() {
  const layoutId = LAYOUTS[store.settings.layout] ? store.settings.layout : 'jis';
  const targetMs = Math.max(1, store.targetMs());
  const keys = store.profile.keys || {};
  const list = Object.keys(keys)
    .map((ch) => {
      const st = keyStat(ch);
      if (!st || st.n < 3) return null;
      const slow = st.ms == null ? 0 : Math.max(0, (st.ms - targetMs) / targetMs);
      // 遅さとミス率を足し合わせた単純な弱点スコア（ミス率を重く見る）
      return { ch, ...st, score: Math.min(3, slow) + (1 - st.acc) * 6 };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const c = card('苦手なキー', 'Top 10');
  if (!list.length) { c.append(emptyNote('まだデータがありません。')); return c; }

  const ul = el('ul', 'stats-list');
  for (const it of list) {
    const li = el('li', 'stats-list-item');
    const info = keyInfoFor(layoutId, it.ch);
    const chip = el('span', 'skey-chip', it.ch === ' ' ? '␣' : it.ch);
    if (info && FINGER_COLOR[info.finger]) chip.style.borderColor = FINGER_COLOR[info.finger];
    const body = el('span', 'grow stats-list-body');
    body.append(el('span', 'small', info ? (FINGER_LABEL_ADULT[info.finger] || '—') : '—'));
    body.append(el('span', 'tiny faint', `${it.n}回 / 平均${it.ms == null ? '—' : Math.round(it.ms) + 'ms'} / 正確率${pct1(it.acc)}%`));
    li.append(chip, body);
    ul.append(li);
  }
  c.append(ul);
  return c;
}

// ----------------------------------------------------- 5) 苦手な連接 Top8

function buildWorstBigrams() {
  const list = worstBigrams(8, 6) || [];
  const c = card('苦手な連接', 'Top 8');
  if (!list.length) { c.append(emptyNote('まだデータがありません。')); return c; }

  const ul = el('ul', 'stats-list');
  for (const it of list) {
    const a = it.pair.slice(0, 1), b = it.pair.slice(1);
    const li = el('li', 'stats-list-item');
    const pair = el('span', 'sbg');
    pair.append(el('b', null, a === ' ' ? '␣' : a), el('i', null, '→'), el('b', null, b === ' ' ? '␣' : b));
    const body = el('span', 'grow stats-list-body');
    body.append(el('span', 'small', `${Math.round(num(it.ms))} ms`));
    body.append(el('span', 'tiny faint', `${num(it.n)} 回`));
    li.append(pair, body);
    ul.append(li);
  }
  c.append(ul);
  return c;
}

// ------------------------------------------------------ 6) 学習カレンダー

function buildCalendar() {
  const daily = store.profile.daily || {};
  const c = card('学習カレンダー', `直近 ${WEEKS} 週`);

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  // 最終列に今日が入るよう、(WEEKS-1) 週前の週初(日曜)から始める
  const start = new Date(today.getTime() - ((WEEKS - 1) * 7 + today.getDay()) * DAY);

  const wrap = el('div', 'scal');
  const labels = el('div', 'scal-labels');
  ['', '月', '', '水', '', '金', ''].forEach((t) => labels.append(el('span', null, t)));
  const grid = el('div', 'scal-grid');

  for (let i = 0; i < WEEKS * 7; i++) {
    const d = new Date(start.getTime() + i * DAY);
    const key = todayKey(d);
    const cell = el('span', 'scal-cell');
    if (d.getTime() > today.getTime()) {
      cell.classList.add('is-future');
      cell.title = `${key}（これから）`;
    } else {
      const rec = daily[key];
      const keys = num(rec?.keys);
      const lvl = keys === 0 ? 0 : keys < 120 ? 1 : keys < 400 ? 2 : keys < 900 ? 3 : 4;
      cell.dataset.level = String(lvl);
      cell.title = `${key}: ${keys} 打${keys ? ' / ' + minutesOf(rec?.ms) : ''}`;
    }
    grid.append(cell);
  }
  wrap.append(labels, grid);
  c.append(wrap);

  const legend = el('div', 'row scal-legend tiny faint');
  legend.append(el('span', null, 'すくない'));
  for (let l = 0; l <= 4; l++) {
    const s = el('span', 'scal-cell');
    s.dataset.level = String(l);
    legend.append(s);
  }
  legend.append(el('span', null, 'おおい'));
  c.append(legend);
  return c;
}

// ---------------------------------------------------- 7) 解禁の進み具合

function buildUnlock(lang) {
  const order = orderFor(lang);
  const open = new Set(unlockedChars(lang));
  const prog = progressOf(lang);
  const c = card('解禁の進み具合', lang === 'ja' ? 'ローマ字（日本語）' : 'アルファベット（英語）');

  const head = el('p', 'small muted');
  head.textContent = `${prog.unlocked} / ${prog.total} 文字を解禁 ／ 平均習熟度 ${pct1(clamp01(num(prog.mastery)))}%`
    + (prog.next ? ` ／ つぎは「${prog.next}」` : ' ／ すべて解禁ずみ');
  c.append(head);

  const box = el('div', 'sunlock');
  for (const ch of order) {
    const chip = el('span', 'sunlock-chip', ch);
    if (open.has(ch)) {
      const m = clamp01(num(mastery(ch)));
      const p = Math.round(m * 100);
      chip.style.background = `color-mix(in oklab, var(--accent) ${Math.max(8, p)}%, var(--surface-2))`;
      if (p >= 55) chip.style.color = 'var(--sheat-ink)';
      chip.title = `${ch}: 解禁ずみ / 習熟度 ${pct1(m)}%`;
    } else {
      chip.classList.add('is-locked');
      chip.title = `${ch}: まだ解禁されていません`;
    }
    box.append(chip);
  }
  c.append(box);

  const bar = el('div', 'bar');
  const fill = el('i');
  fill.style.width = Math.round((prog.unlocked / Math.max(1, prog.total)) * 100) + '%';
  bar.append(fill);
  c.append(bar);
  return c;
}

// ------------------------------------------------------------ 8) バッジ

function buildBadges() {
  const owned = new Set(Array.isArray(store.profile.badges) ? store.profile.badges : []);
  const c = card('バッジ', `${owned.size} / ${BADGES.length}`);
  const grid = el('div', 'sbadges');
  for (const b of BADGES) {
    const meta = BADGE_DESC[b.id] || { e: '⭐', d: '' };
    const item = el('div', 'sbadge' + (owned.has(b.id) ? ' is-on' : ''));
    item.append(el('span', 'sbadge-e', meta.e));
    const t = el('span', 'sbadge-t');
    t.append(el('b', null, b.name));
    t.append(el('span', 'tiny', owned.has(b.id) ? '獲得ずみ' : meta.d));
    item.append(t);
    item.title = `${b.name}: ${owned.has(b.id) ? '獲得ずみ' : meta.d}`;
    grid.append(item);
  }
  c.append(grid);
  return c;
}

// ------------------------------------------------------------ mount

export function mount(root, ctx) {
  const nav = ctx && typeof ctx.navigate === 'function' ? ctx.navigate : (h) => { location.hash = h; };
  const page = el('div', 'page stats');
  let lang = store.settings.lang === 'en' ? 'en' : 'ja';
  let heatMode = 'speed';

  const top = el('div', 'shell-top');
  const back = el('button', 'btn btn-ghost btn-sm', '← もどる');
  back.type = 'button';
  back.setAttribute('aria-label', 'まえの画面にもどる');
  back.addEventListener('click', () => {
    const m = store.settings.mode;
    nav(m === 'kids' ? '#/kids' : m === 'adult' ? '#/adult' : '#/');
  });
  top.append(back, el('h1', 'shell-title', 'とうけい'));
  page.append(top);

  const tabs = el('div', 'stats-tabs');
  page.append(tabs);

  const body = el('div', 'stats-grid');
  page.append(body);

  function renderTabs() {
    tabs.textContent = '';
    tabs.append(seg(
      [{ label: 'にほんご', value: 'ja' }, { label: 'English', value: 'en' }],
      lang,
      (v) => { if (v !== lang) { lang = v; renderTabs(); renderBody(); } },
      '言語の切り替え',
    ));
  }

  function renderBody() {
    body.textContent = '';
    const wide = (node) => { node.classList.add('is-wide'); return node; };
    body.append(wide(buildSummary(lang)));
    body.append(wide(buildTrend(lang)));
    body.append(wide(buildHeatmap(heatMode, (v) => { if (v !== heatMode) { heatMode = v; renderBody(); } })));
    body.append(buildWorstKeys());
    body.append(buildWorstBigrams());
    body.append(wide(buildCalendar()));
    body.append(buildUnlock(lang));
    body.append(buildBadges());
  }

  renderTabs();
  renderBody();
  root.append(page);

  return {
    destroy() {
      page.remove();
    },
  };
}
