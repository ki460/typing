/**
 * shell.js — アプリ全体の外枠。
 * location.hash によるルーティング、ホーム画面、設定画面、
 * そして全ビューが共用する toast / modal を提供する。
 * 各ビューは mount(root, ctx) を export し、{ destroy() } を返す契約。
 * ctx = { navigate, toast, modal, store }。
 */

import { store, levelFromXp } from '../core/store.js';
import { mount as mountAdult } from './adult.js';
import { mount as mountKids } from './kids.js';
import { mount as mountStats } from './stats.js';

const ROUTES = ['#/', '#/adult', '#/kids', '#/stats', '#/settings'];

let appRoot = null;
let current = null;      // 現在のビューの {destroy}
let started = false;

// ------------------------------------------------------------ 小さな道具

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function btn(cls, text) {
  const b = el('button', cls, text);
  b.type = 'button';
  return b;
}

/** 設定値に応じてテーマ・文字サイズ・動きの設定を <html> に反映する */
function applyPrefs() {
  const html = document.documentElement;
  const s = store.settings;
  html.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
  html.style.setProperty('--scale', String(s.fontScale || 1));
  html.dataset.motion = s.reduceMotion ? 'off' : '';
}

// ------------------------------------------------------------- トースト

export function toast(msg, ms = 2200) {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = el('div', 'toast-host');
    host.setAttribute('aria-live', 'polite');
    document.body.append(host);
  }
  const t = el('div', 'toast', msg);
  host.append(t);
  setTimeout(() => t.remove(), Math.max(400, ms));
}

// -------------------------------------------------------------- モーダル

/**
 * actions = [{label, value, variant}]。押した値で resolve。
 * Escape と背景クリックは null で resolve する。
 */
export function modal({ title = '', body = '', actions = [{ label: 'OK', value: true, variant: 'primary' }] } = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const host = el('div', 'modal-host');
    const box = el('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    if (title) {
      const h = el('h2', 'modal-title', title);
      h.id = 'modal-title-' + Math.random().toString(36).slice(2, 8);
      box.setAttribute('aria-labelledby', h.id);
      box.append(h);
    }
    const bodyWrap = el('div', 'modal-body');
    if (body instanceof HTMLElement) bodyWrap.append(body);
    else bodyWrap.append(el('p', 'muted', String(body)));
    box.append(bodyWrap);

    const bar = el('div', 'modal-actions');
    const buttons = actions.map((a) => {
      const b = btn('btn' + (a.variant ? ' btn-' + a.variant : ''), a.label);
      b.addEventListener('click', () => close(a.value));
      bar.append(b);
      return b;
    });
    box.append(bar);
    host.append(box);
    document.body.append(host);

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
      // ダイアログ内でフォーカスを循環させる
      if (e.key === 'Tab' && buttons.length) {
        const i = buttons.indexOf(document.activeElement);
        if (i === -1) { e.preventDefault(); buttons[0].focus(); return; }
        const next = e.shiftKey ? i - 1 : i + 1;
        if (next < 0 || next >= buttons.length) { e.preventDefault(); buttons[e.shiftKey ? buttons.length - 1 : 0].focus(); }
      }
    }
    function onDown(e) { if (e.target === host) close(null); }

    function close(v) {
      document.removeEventListener('keydown', onKey, true);
      host.remove();
      if (prev && typeof prev.focus === 'function') prev.focus();
      resolve(v);
    }

    document.addEventListener('keydown', onKey, true);
    host.addEventListener('mousedown', onDown);
    if (buttons[0]) {
      buttons[0].focus();
    } else {
      box.setAttribute('tabindex', '-1');
      box.focus();
    }
  });
}

// ---------------------------------------------------------------- 遷移

export function navigate(route) {
  const r = ROUTES.includes(route) ? route : '#/';
  if (location.hash === r) render();
  else location.hash = r;
}

const ctx = { navigate, toast, modal, store };

// ---------------------------------------------------------------- ホーム

function homeCard({ cls, title, lead, lines, route, mode }) {
  const b = btn('home-card ' + cls);
  b.append(el('span', 'home-card-title', title));
  b.append(el('span', 'home-card-lead', lead));
  const ul = el('ul', 'home-card-points');
  lines.forEach((t) => ul.append(el('li', null, t)));
  b.append(ul);
  b.append(el('span', 'home-card-go', 'はじめる →'));
  b.addEventListener('click', () => {
    store.set({ mode });
    navigate(route);
  });
  return b;
}

function mountHome(root) {
  const page = el('div', 'page home');

  const hero = el('header', 'home-hero');
  hero.append(el('h1', 'home-title', 'Kaede Typing'));
  hero.append(el('p', 'home-lead muted', '広告なし・課金なし・登録なし。ブラウザだけで最短習得。'));
  page.append(hero);

  const grid = el('div', 'home-grid');
  grid.append(homeCard({
    cls: 'is-adult', mode: 'adult', route: '#/adult', title: 'おとなコース',
    lead: '静かに、速く、正確に。仕事で使える指を作ります。',
    lines: ['適応カリキュラムが弱点だけを出題', 'ビジネス文・コード・速度計測', '無音・低彩度。表示スタイルは6種類'],
  }));
  grid.append(homeCard({
    cls: 'is-kids', mode: 'kids', route: '#/kids', title: 'こどもコース',
    lead: 'あそびながら、ゆびがおぼえる。ステージをクリアしよう！',
    lines: ['20いじょうのステージと ボスバトル', '★あつめ・なかまコレクション・レベルアップ', 'ぜんぶ ひらがなで あんしん'],
  }));
  page.append(grid);

  // 進捗は初回（まだ1打も打っていない）は出さない
  const p = store.profile;
  if (p.totalKeys > 0 || p.sessions.length > 0) {
    const meta = el('div', 'home-meta');
    const items = [
      ['れんぞく', p.streak + ' 日'],
      ['るいけい打鍵', p.totalKeys.toLocaleString('ja-JP')],
      ['レベル', String(levelFromXp(p.xp))],
    ];
    items.forEach(([k, v]) => {
      const box = el('div', 'home-meta-item');
      box.append(el('b', null, v));
      box.append(el('span', null, k));
      meta.append(box);
    });
    page.append(meta);
  }

  if (store.settings.mode) {
    const cont = btn('btn btn-primary home-continue', 'つづきから');
    cont.addEventListener('click', () => navigate(store.settings.mode === 'kids' ? '#/kids' : '#/adult'));
    page.append(cont);
  }

  const links = el('nav', 'home-links');
  links.setAttribute('aria-label', 'そのほか');
  const toStats = btn('btn btn-ghost btn-sm', 'せいせき');
  toStats.addEventListener('click', () => navigate('#/stats'));
  const toSettings = btn('btn btn-ghost btn-sm', 'せってい');
  toSettings.addEventListener('click', () => navigate('#/settings'));
  links.append(toStats, toSettings);
  page.append(links);

  root.append(page);
  return { destroy() { /* 後片付け不要 */ } };
}

// ---------------------------------------------------------------- 設定

function settingRow(label, control, hint) {
  const r = el('div', 'setting-row');
  const l = el('div', 'setting-label');
  l.append(el('span', null, label));
  if (hint) l.append(el('span', 'tiny faint', hint));
  const c = el('div', 'setting-ctl');
  c.append(control);
  r.append(l, c);
  return r;
}

function seg(options, value, onPick, ariaLabel) {
  const g = el('div', 'seg');
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', ariaLabel);
  options.forEach((o) => {
    const b = btn(null, o.label);
    b.setAttribute('aria-pressed', String(o.value === value));
    b.addEventListener('click', () => {
      g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      onPick(o.value);
    });
    g.append(b);
  });
  return g;
}

function toggle(checked, onChange, ariaLabel) {
  const b = btn('switch');
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(!!checked));
  b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    onChange(v);
  });
  return b;
}

function slider({ min, max, step, value, format, onInput, ariaLabel }) {
  const wrap = el('div', 'slider');
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.value = String(value);
  input.setAttribute('aria-label', ariaLabel);
  const out = el('output', 'slider-out', format(value));
  // change でだけ保存すると操作感が鈍いので input で反映し、値表示も同時に更新する
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  wrap.append(input, out);
  return wrap;
}

function saved(msg) { toast(msg); }

function mountSettings(root) {
  const s = store.settings;
  const page = el('div', 'page settings');

  const top = el('div', 'shell-top');
  const back = btn('btn btn-ghost btn-sm', '← もどる');
  back.addEventListener('click', () => navigate(s.mode === 'kids' ? '#/kids' : (s.mode === 'adult' ? '#/adult' : '#/')));
  top.append(back, el('h1', 'shell-title', 'せってい'));
  page.append(top);

  const card = el('section', 'card settings-card');

  card.append(el('h2', 'settings-head', '練習'));
  card.append(settingRow('言語', seg(
    [{ label: '日本語', value: 'ja' }, { label: '英語', value: 'en' }],
    s.lang, (v) => { store.set({ lang: v }); saved('言語を切り替えました'); }, '言語',
  )));
  card.append(settingRow('キーボード配列', seg(
    [{ label: 'JIS', value: 'jis' }, { label: 'US', value: 'us' }],
    s.layout, (v) => { store.set({ layout: v }); saved('配列を切り替えました'); }, 'キーボード配列',
  )));
  card.append(settingRow('目標 WPM', slider({
    min: 20, max: 120, step: 5, value: s.targetWpm,
    format: (v) => v + ' WPM', ariaLabel: '目標 WPM',
    onInput: (v) => store.set({ targetWpm: v }),
  }), '習熟度の判定基準になります'));
  card.append(settingRow('解禁の順番', seg(
    [{ label: 'バランス', value: 'balanced' }, { label: 'ホーム段から', value: 'homerow' }],
    s.order, (v) => { store.set({ order: v }); saved('解禁順を変えました'); }, '解禁の順番',
  )));
  card.append(settingRow('強制訂正', toggle(s.strict, (v) => {
    store.set({ strict: v }); saved(v ? '誤打は先へ進めません' : '誤打でも先へ進みます');
  }, '強制訂正'), '誤って打ったとき先に進めない'));
  card.append(settingRow('休憩リマインダー', slider({
    min: 0, max: 60, step: 5, value: s.breakReminder,
    format: (v) => (v === 0 ? 'オフ' : v + ' 分'), ariaLabel: '休憩リマインダー',
    onInput: (v) => store.set({ breakReminder: v }),
  })));

  card.append(el('h2', 'settings-head', '表示'));
  card.append(settingRow('テーマ', seg(
    [{ label: 'ダーク', value: 'dark' }, { label: 'ライト', value: 'light' }],
    s.theme === 'light' ? 'light' : 'dark',
    (v) => { store.set({ theme: v }); applyPrefs(); saved('テーマを変えました'); }, 'テーマ',
  )));
  card.append(settingRow('文字サイズ', slider({
    min: 0.8, max: 1.5, step: 0.05, value: s.fontScale || 1,
    format: (v) => Math.round(v * 100) + '%', ariaLabel: '文字サイズ',
    onInput: (v) => { store.set({ fontScale: v }); applyPrefs(); },
  })));
  card.append(settingRow('画面キーボード', toggle(s.showKeyboard, (v) => {
    store.set({ showKeyboard: v }); saved(v ? 'キーボードを表示します' : 'キーボードを隠します');
  }, '画面キーボード')));
  card.append(settingRow('手の図', toggle(s.showHands, (v) => {
    store.set({ showHands: v }); saved(v ? '手の図を表示します' : '手の図を隠します');
  }, '手の図')));
  card.append(settingRow('効果音', toggle(s.sound, (v) => {
    store.set({ sound: v }); saved(v ? '効果音をオンにしました' : '効果音をオフにしました');
  }, '効果音')));
  card.append(settingRow('動きを減らす', toggle(s.reduceMotion, (v) => {
    store.set({ reduceMotion: v }); applyPrefs(); saved(v ? 'アニメーションを止めます' : 'アニメーションを戻しました');
  }, '動きを減らす'), 'アニメーションを止める'));

  card.append(el('h2', 'settings-head', 'おとなモード'));
  card.append(el('p', 'small muted settings-note',
    '画面に出す情報量を減らして、文字そのものに集中しやすくするための設定です。'));
  card.append(settingRow('ひかえめ表示', toggle(s.discreet !== false, (v) => {
    store.set({ discreet: v });
    saved(v ? 'キーボードと強調色を隠します' : 'キーボードと運指ガイドを表示します');
  }, 'ひかえめ表示'), '画面キーボード・手の図・強調色を消し、計測値を下端に寄せる'));
  card.append(settingRow('離れたら隠す', toggle(s.panicOnBlur, (v) => {
    store.set({ panicOnBlur: v });
    saved(v ? '別の画面に移ると自動で隠します' : '自動では隠しません');
  }, '離れたら隠す'), '別のタブ・ウィンドウに移ったら自動で退避する'));
  card.append(settingRow('タイトルも差し替える', toggle(s.spoofTitle, (v) => {
    store.set({ spoofTitle: v });
    saved(v ? 'タブのタイトルとアイコンも差し替えます' : 'タイトルはそのままにします');
  }, 'タイトルも差し替える'), 'Esc 2回で退避したとき、タブの見出しとアイコンも変える'));

  card.append(el('h2', 'settings-head', 'データ'));
  card.append(el('p', 'small muted settings-note', '記録はこのブラウザの中だけに保存されます。外部へ送信しません。'));

  const dataRow = el('div', 'setting-actions');
  const outBtn = btn('btn btn-sm', '書き出し');
  outBtn.addEventListener('click', () => {
    try {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el('a');
      a.href = url;
      a.download = 'kaede-typing-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      saved('ファイルを書き出しました');
    } catch {
      toast('書き出しに失敗しました');
    }
  });

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.className = 'sr-only';
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try {
      store.importJSON(await f.text());
      applyPrefs();
      toast('読み込みました');
      render();
    } catch {
      toast('読み込みに失敗しました（形式が違います）');
    } finally {
      file.value = '';
    }
  });
  const inBtn = btn('btn btn-sm', '読み込み');
  inBtn.addEventListener('click', () => file.click());

  const delBtn = btn('btn btn-sm btn-danger', '全消去');
  delBtn.addEventListener('click', async () => {
    const ans = await modal({
      title: 'すべての記録を消しますか？',
      body: '練習の記録・レベル・バッジ・なかまがすべて消えます。元には戻せません。',
      actions: [{ label: 'やめる', value: false }, { label: '消す', value: true, variant: 'danger' }],
    });
    if (ans === true) { store.reset(); toast('記録を消しました'); render(); }
  });

  dataRow.append(outBtn, inBtn, delBtn, file);
  card.append(dataRow);

  page.append(card);
  root.append(page);
  return { destroy() { /* 後片付け不要 */ } };
}

// ------------------------------------------------------------ ルーティング

function routeOf() {
  const h = location.hash || '#/';
  return ROUTES.includes(h) ? h : '#/';
}

function render() {
  if (!appRoot) return;
  if (current && typeof current.destroy === 'function') {
    try { current.destroy(); } catch { /* ビュー側の失敗で全体を止めない */ }
  }
  current = null;
  appRoot.textContent = '';

  let route = routeOf();
  if (location.hash && location.hash !== route) history.replaceState(null, '', route);
  // #/adult や #/kids に直接来た場合は、そのコースを選んだものとして扱う
  // （ブックマークや共有リンクからそのまま練習に入れるようにする）
  if (!store.settings.mode && (route === '#/adult' || route === '#/kids')) {
    store.set({ mode: route === '#/kids' ? 'kids' : 'adult' });
  }

  if (route === '#/adult') current = mountAdult(appRoot, ctx);
  else if (route === '#/kids') current = mountKids(appRoot, ctx);
  else if (route === '#/stats') current = mountStats(appRoot, ctx);
  else if (route === '#/settings') current = mountSettings(appRoot);
  else current = mountHome(appRoot);

  if (!current) current = { destroy() {} };
  appRoot.scrollTop = 0;
  window.scrollTo(0, 0);
}

export function startApp(root) {
  appRoot = root;
  if (!appRoot) return;
  applyPrefs();
  if (!started) {
    started = true;
    window.addEventListener('hashchange', render);
  }
  // ハッシュ無し・未知のハッシュで来た初回だけホームに寄せる
  // （#/adult などの明示的な指定は render() 側で尊重する）
  if (!store.settings.mode && location.hash && !ROUTES.includes(location.hash)) {
    history.replaceState(null, '', '#/');
  }
  render();
}
