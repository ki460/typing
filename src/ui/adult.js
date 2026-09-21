/**
 * adult.js — 大人モードの練習画面。
 * メニュー → 練習 → 結果 の3画面を1つの root の中で差し替えて表示する。
 * 職場で目立たないことを最優先にし、擬態スキン(editor/docs/sheet/mail/terminal/plain)で
 * 見た目ごと入れ替える。Esc を素早く2回、または Ctrl+ピリオドで「無害な待機画面」へ退避する。
 * 効果音・アニメーション・祝福演出は既定で無効。
 */
import { TypingSession, attachInput, formatMs } from '../core/engine.js';
import {
  buildAdaptiveLesson, buildDrillLesson, buildWordLesson,
  buildTextLesson, buildCodeLesson,
} from '../core/generator.js';
import { KeyboardView, HandsView, handHintFor } from '../core/keyboard.js';
import { store } from '../core/store.js';
import { progressOf, unlockedChars, weakestChars } from '../core/curriculum.js';
import { sfx } from '../core/audio.js';

const SKINS = ['editor', 'docs', 'sheet', 'mail', 'terminal', 'plain'];
/** ひかえめ表示（既定 ON）。store に無い初回は true として扱う */
const discreet = () => store.settings.discreet !== false;
const SKIN_LABEL = {
  editor: 'エディタ', docs: '文書', sheet: '表計算',
  mail: 'メール', terminal: '端末', plain: 'シンプル',
};
// パニック中に見せるタブ名。アプリ名を連想させない無害な文字列にする
const SPOOF_TITLE = {
  editor: 'index.js — 作業中',
  docs: '無題ドキュメント',
  sheet: '集計表_2026.xlsx',
  mail: '受信トレイ',
  terminal: 'bash — 80×24',
  plain: 'ページ',
};
// 文字の入っていない灰色の角丸。data URL なので外部リクエストは発生しない
const BLANK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'"
  + " viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23b3b9c1'/%3E%3C/svg%3E";

const MENU = [
  { id: 'adaptive', name: '適応練習', note: 'おすすめ。いまの実力に合わせて出題します' },
  { id: 'drill', name: '弱点ドリル', note: '遅い連接だけを集中して打ちます' },
  { id: 'word', name: '単語', note: '短い語をテンポよく' },
  { id: 'text', name: '文章', note: 'まとまった文を通して打ちます' },
  { id: 'biz', name: 'ビジネス文', note: 'メールの定型文' },
  { id: 'code', name: 'コード', note: '記号と英数の運指' },
  { id: 'timed', name: '60秒計測', note: '時間を区切って測ります' },
];

const KIND_LABEL = {
  adaptive: '適応練習', drill: '弱点ドリル', word: '単語',
  text: '文章', biz: 'ビジネス文', code: 'コード', timed: '60秒計測',
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** 表計算スキンの列数。狭い画面では列を減らして横スクロールを避ける */
function colsForWidth() {
  const w = window.innerWidth || 1024;
  if (w < 420) return 2;
  if (w < 760) return 3;
  return 6;
}

/** 指ヒントの日本語。handHintFor が null を返す文字では空文字 */
function handText(layout, ch) {
  if (!ch) return '';
  const h = handHintFor(layout, ch, false);
  if (!h) return '';
  // FINGER_LABEL_ADULT は「右中指」のように左右を含むので、side を重ねない
  return h.label ? '次は ' + h.label : '';
}

export function mount(root, ctx) {
  const c = ctx || {};
  const toast = typeof c.toast === 'function' ? c.toast : () => {};
  const navigate = typeof c.navigate === 'function' ? c.navigate : () => {};

  sfx.enabled = false;   // 大人モードは無音が既定

  const st = {
    view: 'menu',
    kind: 'adaptive',
    lesson: null,
    session: null,
    detach: null,
    kb: null,
    hands: null,
    ui: null,          // 練習画面の各要素への参照
    panic: false,
    needResume: false,
    lastKey: null,
    escAt: 0,
    breakTimer: null,
    breakShown: false,
    savedTitle: null,
    savedIcon: null,
    tempIcon: null,
  };

  root.textContent = '';
  root.classList.add('adult-root');

  const app = el('div', 'adult-app');
  const panicEl = el('div', 'panic-screen');
  panicEl.hidden = true;
  panicEl.title = 'ダブルクリックで戻ります';
  root.append(app, panicEl);

  function skin() {
    const s = store.settings.skin;
    return SKINS.indexOf(s) >= 0 ? s : 'editor';
  }
  function lang() {
    return store.settings.lang === 'en' ? 'en' : 'ja';
  }
  root.dataset.skin = skin();

  // ------------------------------------------------------------ 擬態の枠

  function buildRail(rail) {
    const s = skin();
    if (s === 'editor') {
      const tree = el('div', 'ad-tree');
      ['src', 'index.js', 'utils.js', 'notes.js', 'README.md'].forEach((n, i) => {
        tree.appendChild(el('i', 'ad-tree-item' + (i === 3 ? ' is-on' : ''), n));
      });
      rail.appendChild(tree);
      return;
    }
    if (s === 'mail') {
      const list = el('div', 'ad-list');
      [['週次report の件', '10:12'], ['資料の確認のお願い', '9:48'],
        ['来週の打ち合わせ', '昨日'], ['経費精算について', '月曜']].forEach((m, i) => {
        const item = el('div', 'ad-list-item' + (i === 0 ? ' is-on' : ''));
        item.appendChild(el('b', null, m[0]));
        item.appendChild(el('span', null, m[1]));
        list.appendChild(item);
      });
      rail.appendChild(list);
      return;
    }
    rail.hidden = true;
  }

  function buildChrome(chrome) {
    const s = skin();
    if (s === 'editor') {
      const tabs = el('div', 'ad-tabs');
      ['index.js', 'notes.js', 'utils.js'].forEach((n, i) => {
        tabs.appendChild(el('i', 'ad-tab' + (i === 1 ? ' is-on' : ''), n));
      });
      chrome.appendChild(tabs);
      return;
    }
    if (s === 'docs') {
      const bar = el('div', 'ad-toolbar');
      bar.setAttribute('aria-hidden', 'true');   // 装飾だけ。押せないただの記号
      ['B', 'I', 'U', '¶', '☰', '⌗'].forEach((g) => bar.appendChild(el('i', 'ad-tool', g)));
      chrome.appendChild(bar);
      return;
    }
    if (s === 'sheet') {
      chrome.appendChild(el('i', 'ad-fx', 'fx'));
      chrome.appendChild(el('i', 'ad-ref', 'B2'));
      return;
    }
    if (s === 'mail') {
      const h = el('div', 'ad-mailhead');
      h.appendChild(el('b', null, '週次report の件'));
      h.appendChild(el('span', null, 'sato@example.co.jp'));
      chrome.appendChild(h);
      return;
    }
    if (s === 'terminal') {
      chrome.appendChild(el('i', 'ad-termtitle', 'bash — 80×24'));
      return;
    }
    chrome.hidden = true;
  }

  /** 画面の外枠を作り直し、各パーツへの参照を返す */
  function frame(view) {
    app.textContent = '';
    app.dataset.view = view;
    root.dataset.skin = skin();

    const bar = el('header', 'ad-bar');
    const frameEl = el('div', 'ad-frame');
    const rail = el('aside', 'ad-rail');
    const main = el('section', 'ad-main');
    const chrome = el('div', 'ad-chrome');
    const stage = el('div', 'ad-stage');

    buildRail(rail);
    buildChrome(chrome);
    main.append(chrome, stage);
    frameEl.append(rail, main);
    app.append(bar, frameEl);

    // ひかえめ表示: 画面キーボード・手の図・指ヒントを隠し、計測値を細い status bar にする。
    // 職場で開いていても「タイピング練習」だと一目で分からないようにするための既定。
    root.dataset.discreet = discreet() ? 'on' : 'off';
    const eye = el('button', 'btn btn-ghost btn-sm ad-eye', discreet() ? '□ ひかえめ' : '■ くわしく');
    eye.type = 'button';
    eye.title = 'ひかえめ表示の切り替え';
    eye.setAttribute('aria-pressed', discreet() ? 'true' : 'false');
    eye.addEventListener('click', () => {
      store.set({ discreet: !discreet() });
      root.dataset.discreet = discreet() ? 'on' : 'off';
      if (st.view === 'practice') {
        renderPractice();                       // 枠を組み直してから今の状態で塗り直す
        if (st.session) update(st.session.state);
      } else if (st.view === 'menu') {
        renderMenu();
      }
    });
    bar.appendChild(eye);
    return { bar, stage };
  }

  // -------------------------------------------------------------- メニュー

  function renderMenu() {
    stopSession();
    st.view = 'menu';
    const f = frame('menu');

    f.bar.appendChild(el('span', 'ad-barlabel', '練習メニュー'));
    const right = el('div', 'ad-barright');

    const sel = document.createElement('select');
    sel.className = 'ad-skin';
    sel.setAttribute('aria-label', '画面の見た目');
    SKINS.forEach((s) => {
      const o = document.createElement('option');
      o.value = s;
      o.textContent = SKIN_LABEL[s];
      sel.appendChild(o);
    });
    sel.value = skin();
    sel.addEventListener('change', () => {
      store.set({ skin: sel.value });
      renderMenu();
    });
    right.appendChild(sel);

    const settings = el('button', 'btn btn-ghost btn-sm', '設定');
    settings.type = 'button';
    settings.addEventListener('click', () => navigate('#/settings'));
    const home = el('button', 'btn btn-ghost btn-sm', 'ホーム');
    home.type = 'button';
    home.addEventListener('click', () => navigate('#/'));
    right.append(settings, home);
    f.bar.appendChild(right);

    // 適応練習の解禁進捗
    let p = null;
    try { p = progressOf(lang()); } catch { p = null; }
    const card = el('div', 'card card-tight ad-adapt');
    const head = el('div', 'row-between');
    head.appendChild(el('h2', null, '適応練習'));
    head.appendChild(el('span', 'small muted',
      p ? '解禁 ' + p.unlocked + ' / ' + p.total + ' 文字' : ''));
    card.appendChild(head);

    const bar = el('div', 'bar');
    const fill = el('i');
    fill.style.width = p ? Math.round((p.unlocked / Math.max(1, p.total)) * 100) + '%' : '0%';
    bar.appendChild(fill);
    card.appendChild(bar);

    const info = el('p', 'small muted');
    if (p) {
      info.textContent = '習熟度 ' + Math.round(p.mastery * 100) + '%　'
        + (p.next ? '次に解禁される文字: ' + p.next : 'すべて解禁済みです');
    }
    card.appendChild(info);

    const go = el('button', 'btn btn-primary', '適応練習をはじめる');
    go.type = 'button';
    go.addEventListener('click', () => startLesson('adaptive'));
    card.appendChild(go);
    f.stage.appendChild(card);

    const menu = el('div', 'ad-menu');
    MENU.filter((m) => m.id !== 'adaptive').forEach((m) => {
      const b = el('button', 'btn ad-menu-item');
      b.type = 'button';
      b.appendChild(el('b', null, m.name));
      b.appendChild(el('span', 'small muted', m.note));
      b.addEventListener('click', () => startLesson(m.id));
      menu.appendChild(b);
    });
    f.stage.appendChild(menu);

    const tip = el('p', 'tiny faint',
      'Esc を素早く2回、または Ctrl + . で画面を一時的に隠せます。');
    f.stage.appendChild(tip);
  }

  // ---------------------------------------------------------------- 練習

  function makeLesson(kind) {
    const L = lang();
    if (kind === 'drill') return buildDrillLesson({ lang: L, count: 10 });
    if (kind === 'word') return buildWordLesson({ lang: L, count: 12 });
    if (kind === 'text') return buildTextLesson({ lang: L, count: 6 });
    if (kind === 'biz') return buildTextLesson({ lang: 'ja', tag: 'mail', count: 6 });
    if (kind === 'code') return buildCodeLesson({ count: 8 });
    if (kind === 'timed') return buildAdaptiveLesson({ lang: L, lines: 40 });
    return buildAdaptiveLesson({ lang: L, lines: 8 });
  }

  function startLesson(kind) {
    stopSession();
    let lesson = null;
    try { lesson = makeLesson(kind); } catch { lesson = null; }
    if (!lesson || !lesson.lines || !lesson.lines.length) {
      toast('教材を用意できませんでした');
      renderMenu();
      return;
    }
    st.kind = kind;
    st.lesson = lesson;
    renderPractice();

    const sessionLang = kind === 'code' ? 'en' : kind === 'biz' ? 'ja' : lang();
    st.session = new TypingSession({
      lines: lesson.lines,
      lang: sessionLang,
      mode: 'adult',
      kind,
      timeLimitMs: kind === 'timed' ? 60000 : null,
      onUpdate: update,
      onFinish: showResult,
    });
    st.detach = attachInput(st.session, { onNonInput });
    armBreak();
    st.session.start();
  }

  /** 練習画面の骨格。スキンごとに本文の見せ方だけを変える */
  function renderPractice() {
    st.view = 'practice';
    // 表示切替などで組み直すことがあるので、前の描画物を必ず片付ける
    if (st.kb) { st.kb.destroy(); st.kb = null; }
    if (st.hands) { st.hands.destroy(); st.hands = null; }
    const f = frame('practice');

    const quit = el('button', 'btn btn-ghost btn-sm', 'やめる');
    quit.type = 'button';
    quit.addEventListener('click', renderMenu);
    f.bar.appendChild(quit);

    const pos = el('span', 'ad-barlabel small muted', '');
    f.bar.appendChild(pos);

    const doc = el('div', 'ad-doc');
    const lead = el('div', 'ad-lead');
    lead.hidden = true;
    const line = el('div', 'ad-line typeline');
    line.setAttribute('aria-live', 'off');
    const hint = el('div', 'romaji-hint ad-romaji');

    const s = skin();
    if (s === 'editor') {
      const ed = el('div', 'ad-editor');
      const gutter = el('div', 'ad-gutter');
      for (let i = 1; i <= 6; i++) gutter.appendChild(el('i', null, String(i)));
      const code = el('div', 'ad-code');
      code.appendChild(el('div', 'ad-fakeline', '// 2026-09 更新'));
      code.appendChild(el('div', 'ad-fakeline', 'const rows = data.filter(Boolean);'));
      code.append(lead, line, hint);
      ed.append(gutter, code);
      doc.appendChild(ed);
    } else if (s === 'docs') {
      const paper = el('div', 'ad-paper');
      paper.append(lead, line, hint);
      doc.appendChild(paper);
    } else if (s === 'sheet') {
      lead.className = 'ad-lead ad-sheetlead';
      doc.append(lead, line, hint);
    } else if (s === 'mail') {
      const body = el('div', 'ad-mailbody');
      body.appendChild(el('div', 'ad-fakeline', 'お世話になっております。'));
      body.append(lead, line, hint);
      doc.appendChild(body);
    } else if (s === 'terminal') {
      const term = el('div', 'ad-term');
      term.appendChild(el('div', 'ad-fakeline', '$ git status --short'));
      const row = el('div', 'ad-term-row');
      row.appendChild(el('span', 'ad-prompt', '$'));
      row.appendChild(el('span', 'ad-cmd', 'echo'));
      row.appendChild(line);
      term.append(lead, row, hint);
      doc.appendChild(term);
    } else {
      doc.append(lead, line, hint);
    }
    f.stage.appendChild(doc);

    const metrics = el('div', 'ad-metrics');
    f.stage.appendChild(metrics);

    const prog = el('div', 'bar ad-prog');
    const progFill = el('i');
    prog.appendChild(progFill);
    f.stage.appendChild(prog);

    const handHint = el('div', 'ad-hint tiny faint', '');
    f.stage.appendChild(handHint);

    const kbHost = el('div', 'ad-kb');
    f.stage.appendChild(kbHost);

    const layout = store.settings.layout === 'us' ? 'us' : 'jis';
    if (discreet()) {
      kbHost.hidden = true;                     // ひかえめ表示では何も作らない
    } else if (store.settings.showKeyboard !== false) {
      st.kb = new KeyboardView({
        mount: kbHost, layout, showHands: store.settings.showHands !== false, compact: false,
      });
    } else if (store.settings.showHands !== false) {
      // キーボードを隠していても手の図だけは出す
      st.hands = new HandsView({ mount: kbHost });
    }

    st.ui = { pos, lead, line, hint, metrics, progFill, handHint, layout };
  }

  function update(state) {
    const ui = st.ui;
    if (!ui || st.view !== 'practice') return;
    const line = state.line;
    if (!line) return;

    const lineLang = line.lang || (st.session ? st.session.lang : 'ja');
    const cursorText = state.displayIsTarget
      ? state.display
      : (line.reading || line.target || state.display);

    if (state.displayIsTarget) {
      ui.lead.hidden = true;
      ui.lead.textContent = '';
    } else {
      ui.lead.hidden = false;
      ui.lead.textContent = state.display;
    }

    paintLine(ui.line, cursorText, state.unitIndex, lineLang, state.lastWrong != null);
    paintHint(ui.hint, state, lineLang);

    const m = state.metrics;
    ui.metrics.textContent = '';
    addMetric(ui.metrics, 'WPM', String(Math.round(m.wpm)));
    addMetric(ui.metrics, '正確率', Math.round(m.accuracy * 100) + '%');
    addMetric(ui.metrics, state.remainingMs != null ? '残り' : '経過',
      formatMs(state.remainingMs != null ? state.remainingMs : m.elapsedMs));
    ui.progFill.style.width = Math.round(m.progress * 100) + '%';
    ui.pos.textContent = (state.lineIndex + 1) + ' / ' + state.totalLines;

    const first = state.expected && state.expected.size ? state.expected.values().next().value : null;
    ui.handHint.textContent = handText(ui.layout, first);
    if (st.kb) st.kb.highlight(state.expected);
    if (st.hands && first) {
      const h = handHintFor(ui.layout, first, false);
      st.hands.highlight(h ? h.finger : null, null);
    }
    if (st.lastKey) {
      if (st.kb) st.kb.flash(st.lastKey, state.lastWrong == null);
      st.lastKey = null;
    }
  }

  function addMetric(host, label, value) {
    const wrap = el('span', 'ad-metric');
    wrap.appendChild(el('span', null, label));
    wrap.appendChild(el('b', null, value));
    host.appendChild(wrap);
  }

  /** 出題行を文字 span に分けて描く。表計算スキンだけはセルに分配する */
  function paintLine(host, text, cursorIdx, lineLang, wrong) {
    const groups = [];
    let cur = [];
    const flush = () => { if (cur.length) { groups.push(cur); cur = []; } };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const span = el('span', 'ch', ch);
      if (i < cursorIdx) span.classList.add('done');
      else if (i === cursorIdx) span.classList.add(wrong ? 'bad' : 'cursor');
      else span.classList.add('pending');
      cur.push(span);
      // 英語は空白で、日本語は4文字ごとに区切って「語」のまとまりにする
      if (lineLang === 'en') { if (ch === ' ') flush(); } else if (cur.length >= 4) flush();
    }
    flush();

    // カーソルが入っているまとまりを探す(セル選択枠の位置)
    let curG = Math.max(0, groups.length - 1);
    let acc = 0;
    for (let i = 0; i < groups.length; i++) {
      if (cursorIdx < acc + groups[i].length) { curG = i; break; }
      acc += groups[i].length;
    }

    host.textContent = '';
    if (skin() === 'sheet') {
      // typeline は base.css の .ch.done/.pending/.cursor/.bad を効かせるために残す
      host.className = 'ad-line ad-grid typeline';
      const cols = colsForWidth();
      host.style.setProperty('--cols', String(cols));
      const head = el('div', 'ad-srow');
      head.appendChild(el('i', 'ad-rn', ''));
      for (let ci = 0; ci < cols; ci++) head.appendChild(el('i', 'ad-col', String.fromCharCode(65 + ci)));
      host.appendChild(head);
      // 実データの行数より多めに空行を描き、実際の表計算らしく見せる
      const used = Math.max(1, Math.ceil(groups.length / cols));
      const rows = Math.max(used + 6, 12);
      for (let r = 0; r < rows; r++) {
        const row = el('div', 'ad-srow');
        row.appendChild(el('i', 'ad-rn', String(r + 1)));
        for (let ci = 0; ci < cols; ci++) {
          const cell = el('div', 'ad-cell');
          const gi = r * cols + ci;
          if (gi < groups.length) {
            if (gi === curG) cell.classList.add('is-sel');
            groups[gi].forEach((sp) => cell.appendChild(sp));
          }
          row.appendChild(cell);
        }
        host.appendChild(row);
      }
      return;
    }
    host.className = 'ad-line typeline';
    host.style.removeProperty('--cols');
    groups.forEach((g) => {
      const seg = el('span', 'ad-seg');
      g.forEach((sp) => seg.appendChild(sp));
      host.appendChild(seg);
    });
  }

  function paintHint(host, state, lineLang) {
    host.textContent = '';
    if (lineLang !== 'ja') { host.hidden = true; return; }
    host.hidden = false;
    host.appendChild(el('span', 'done', state.typedRomaji || ''));
    const rest = state.remainingRomaji || '';
    host.appendChild(el('span', 'next', rest.slice(0, 1)));
    host.appendChild(document.createTextNode(rest.slice(1)));
  }

  // ---------------------------------------------------------------- 結果

  function showResult(summary) {
    const meta = st.lesson && st.lesson.meta ? st.lesson.meta : {};
    const lastKind = st.kind;
    stopSession();
    st.view = 'result';
    const f = frame('result');

    f.bar.appendChild(el('span', 'ad-barlabel', '結果 — ' + (KIND_LABEL[lastKind] || '練習')));

    const card = el('div', 'card ad-result');
    const grid = el('div', 'grid-kpi');
    const rows = [
      ['WPM', String(Math.round(summary.wpm))],
      ['正確率', Math.round(summary.accuracy * 100) + '%'],
      ['一貫性', Math.round(summary.consistency * 100) + '%'],
      ['打鍵数', String(summary.keys)],
    ];
    rows.forEach((r) => {
      const k = el('div', 'kpi');
      k.appendChild(el('b', null, r[1]));
      k.appendChild(el('span', null, r[0]));
      grid.appendChild(k);
    });
    card.appendChild(grid);
    card.appendChild(el('hr', 'sep'));

    const unlocked = el('p', 'small');
    unlocked.textContent = meta.newChar
      ? '新しく解禁された文字: ' + meta.newChar
      : '今回の解禁はありません';
    card.appendChild(unlocked);

    let weak = [];
    try { weak = weakestChars(unlockedChars(lang()), 3); } catch { weak = []; }
    const weakLine = el('p', 'small muted');
    weakLine.textContent = weak.length
      ? '弱点キー: ' + weak.join('  ')
      : '弱点キーはまだ判定できません';
    card.appendChild(weakLine);

    if (summary.reward && summary.reward.gained) {
      card.appendChild(el('p', 'tiny faint', '獲得 XP ' + summary.reward.gained));
    }

    const actions = el('div', 'row wrap ad-actions');
    const again = el('button', 'btn btn-primary', 'もう一度');
    again.type = 'button';
    again.addEventListener('click', () => startLesson(lastKind));
    const back = el('button', 'btn', 'メニューへ');
    back.type = 'button';
    back.addEventListener('click', renderMenu);
    actions.append(again, back);
    card.appendChild(actions);

    f.stage.appendChild(card);
    again.focus();
  }

  // -------------------------------------------------------------- パニック

  function iconLink() {
    let link = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
      st.tempIcon = link;
    }
    return link;
  }

  function spoofOn() {
    if (store.settings.spoofTitle === false) return;
    if (st.savedTitle == null) st.savedTitle = document.title;
    document.title = SPOOF_TITLE[skin()] || 'ページ';
    const link = iconLink();
    if (link) {
      if (st.savedIcon == null) st.savedIcon = link.getAttribute('href') || '';
      link.setAttribute('href', BLANK_ICON);
    }
  }

  function spoofOff() {
    if (st.savedTitle != null) { document.title = st.savedTitle; st.savedTitle = null; }
    if (st.tempIcon) {
      if (st.tempIcon.parentNode) st.tempIcon.parentNode.removeChild(st.tempIcon);
      st.tempIcon = null;
      st.savedIcon = null;
      return;
    }
    const link = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    if (link && st.savedIcon != null) link.setAttribute('href', st.savedIcon);
    st.savedIcon = null;
  }

  /** スキンに合わせた「何も起きていない」静止画面 */
  function buildPanicScreen() {
    panicEl.textContent = '';
    const s = skin();
    const inner = el('div', 'panic-inner');
    if (s === 'sheet') {
      const grid = el('div', 'ad-grid');
      const cols = colsForWidth();
      grid.style.setProperty('--cols', String(cols));
      const head = el('div', 'ad-srow');
      head.appendChild(el('i', 'ad-rn', ''));
      for (let ci = 0; ci < cols; ci++) head.appendChild(el('i', 'ad-col', String.fromCharCode(65 + ci)));
      grid.appendChild(head);
      for (let r = 0; r < 14; r++) {
        const row = el('div', 'ad-srow');
        row.appendChild(el('i', 'ad-rn', String(r + 1)));
        for (let ci = 0; ci < cols; ci++) row.appendChild(el('div', 'ad-cell'));
        grid.appendChild(row);
      }
      inner.appendChild(grid);
    } else if (s === 'editor') {
      const ed = el('div', 'ad-editor');
      const gutter = el('div', 'ad-gutter');
      for (let i = 1; i <= 18; i++) gutter.appendChild(el('i', null, String(i)));
      ed.append(gutter, el('div', 'ad-code'));
      inner.appendChild(ed);
    } else if (s === 'docs') {
      inner.appendChild(el('div', 'ad-paper ad-paper-blank'));
    } else if (s === 'mail') {
      inner.appendChild(el('div', 'ad-mailempty', 'メッセージが選択されていません'));
    } else if (s === 'terminal') {
      const term = el('div', 'ad-term');
      const row = el('div', 'ad-term-row');
      row.appendChild(el('span', 'ad-prompt', 'user@host ~ %'));
      row.appendChild(el('i', 'ad-caret'));
      term.appendChild(row);
      inner.appendChild(term);
    }
    panicEl.appendChild(inner);
  }

  function setPanic(on) {
    if (st.panic === on) return;
    st.panic = on;
    if (on) {
      if (st.session && !st.session.finished) {
        st.session.pause();
        st.needResume = true;
      }
      buildPanicScreen();
      panicEl.hidden = false;
      app.hidden = true;
      spoofOn();
    } else {
      panicEl.hidden = true;
      panicEl.textContent = '';
      app.hidden = false;
      spoofOff();
      if (st.needResume) showResume();
    }
    root.dataset.panic = on ? 'on' : 'off';
  }

  /** 復帰しても勝手に再開しない。不意の打鍵で進まないようボタンを押させる */
  function showResume() {
    if (root.querySelector('.ad-resume')) return;
    const veil = el('div', 'ad-resume');
    const card = el('div', 'card ad-resume-card');
    card.appendChild(el('p', 'small muted', '一時停止中です'));
    const go = el('button', 'btn btn-primary', 'つづける');
    go.type = 'button';
    go.addEventListener('click', () => {
      veil.remove();
      st.needResume = false;
      if (st.session && !st.session.finished) st.session.resume();
    });
    card.appendChild(go);
    veil.appendChild(card);
    root.appendChild(veil);
    go.focus();
  }

  function isPanicKey(e) {
    if (e.key === 'Escape') return true;
    return (e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '.' || e.code === 'Period'));
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      const now = Date.now();
      // 500ms 以内の2回目でトグル。1回目だけでは何も起こさない
      if (now - st.escAt <= 500) { st.escAt = 0; setPanic(!st.panic); } else { st.escAt = now; }
      return;
    }
    if (isPanicKey(e)) {
      e.preventDefault();
      setPanic(!st.panic);
    }
  }

  /** パニックキーは session に流さない。それ以外は打鍵フィードバック用に控える */
  function onNonInput(e) {
    if (isPanicKey(e)) return true;
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) st.lastKey = e.key;
    return false;
  }

  function onBlur() { if (store.settings.panicOnBlur) setPanic(true); }
  function onVisibility() { if (store.settings.panicOnBlur && document.hidden) setPanic(true); }
  function onComposition() { toast('半角英数(直接入力)に切り替えてください'); }
  function onResize() {
    if (st.view === 'practice' && st.session) update(st.session.state);
    if (st.panic) buildPanicScreen();
  }
  function onPanicDblClick() { setPanic(false); }

  // ------------------------------------------------------------ 休憩の通知

  function armBreak() {
    const min = Number(store.settings.breakReminder);
    if (!(min > 0) || st.breakShown || st.breakTimer) return;
    st.breakTimer = setTimeout(() => {
      st.breakTimer = null;
      st.breakShown = true;
      toast('そろそろ休憩を');
    }, min * 60000);
  }

  // -------------------------------------------------------------- 後片付け

  function stopSession() {
    if (st.detach) { st.detach(); st.detach = null; }
    if (st.kb) { st.kb.destroy(); st.kb = null; }
    if (st.hands) { st.hands.destroy(); st.hands = null; }
    if (st.session) { st.session.abort(); st.session.destroy(); st.session = null; }
    const veil = root.querySelector('.ad-resume');
    if (veil) veil.remove();
    st.needResume = false;
    st.ui = null;
    st.lastKey = null;
  }

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('compositionstart', onComposition, true);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);
  panicEl.addEventListener('dblclick', onPanicDblClick);

  renderMenu();

  return {
    destroy() {
      stopSession();
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('compositionstart', onComposition, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      panicEl.removeEventListener('dblclick', onPanicDblClick);
      if (st.breakTimer) { clearTimeout(st.breakTimer); st.breakTimer = null; }
      spoofOff();
      st.panic = false;
      root.textContent = '';
      root.classList.remove('adult-root');
      delete root.dataset.skin;
      delete root.dataset.panic;
    },
  };
}
