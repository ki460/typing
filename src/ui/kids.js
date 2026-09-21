/**
 * kids.js — こどもモード（契約 2.8）。
 * 「マップ」「プレイ」「けっか」の3画面を、同じ .kids-scope の中で差し替える。
 * ステージの★は store.course('kids').cleared に、デイリーミッションの受け取り済みは
 * store.profile.kidsDaily に保存する。出題は generator.buildStageLesson、
 * 打鍵の処理は engine.TypingSession、音は audio.js、紙吹雪は canvas に自前描画。
 * 外部リンク・広告・課金導線は一切置かない。
 */
import { TypingSession, attachInput, formatMs, gradeOf } from '../core/engine.js';
import { buildStageLesson } from '../core/generator.js';
import { KeyboardView, HandsView, handHintFor } from '../core/keyboard.js';
import { store, levelFromXp, xpForLevel, todayKey } from '../core/store.js';
import { sfx } from '../core/audio.js';

const STAGES = 24;        // すごろくのマスの数
const COLS = 4;           // マップ 1 行あたりのマス数
const BOSS_TIME_MS = 60000;
const COMBO_FULL = 20;    // コンボゲージが満タンになる連続数
const PET_SLOTS = 20;     // ずかんの枠（store のプール数に合わせる）
const PET_STEP = 600;     // なかまが 1 ひき ふえる打鍵数（store と同じ）

const BOSS_FACES = ['🐲', '👹', '🦖', '🐙', '👾'];
const STAGE_FACES = ['🌱', '🍀', '🌸', '⭐', '🍎', '🐟', '☁️', '🚀'];

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

function pct(v) {
  const n = Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

/** base.css の .bar を作り、外枠と中身の両方を返す */
function makeBar(cls) {
  const root = el('div', 'bar ' + cls);
  const fill = document.createElement('i');
  root.appendChild(fill);
  return { root, fill };
}

function chip(face, text) {
  const c = el('span', 'badge kids-chip');
  c.append(el('span', 'kids-chip-face', face));
  c.append(el('span', null, text));
  return c;
}

function bossFace(stage) {
  return BOSS_FACES[(Math.floor(stage / 5) - 1 + BOSS_FACES.length) % BOSS_FACES.length];
}

function stageFace(stage) {
  return STAGE_FACES[(stage - 1) % STAGE_FACES.length];
}

function motionOff() {
  if (store.settings.reduceMotion) return true;
  try {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return true;
  }
}

// ------------------------------------------------------------------ 本体

export function mount(root, ctx) {
  const go = (ctx && ctx.navigate) || (() => {});
  const say = (ctx && ctx.toast) || (() => {});
  const ask = (ctx && ctx.modal) || null;

  const scope = el('div', 'kids-scope');
  root.appendChild(scope);

  const timers = new Set();
  let disposers = [];
  let raf = 0;
  let breakFrom = Date.now();   // この時刻からの経過で「やすもう」を出す
  let soundReady = false;

  sfx.enabled = store.settings.sound !== false;

  function later(fn, ms) {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  }

  function clearScreen() {
    disposers.forEach((f) => { try { f(); } catch { /* 片付けの失敗で全体を止めない */ } });
    disposers = [];
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    scope.textContent = '';
  }

  /** AudioContext は最初のユーザー操作でしか解禁できない */
  function wakeSound() {
    sfx.enabled = store.settings.sound !== false;
    if (soundReady) return;
    soundReady = true;
    sfx.init();
  }

  // ------------------------------------------------- 進捗とミッションの計算

  function course() { return store.course('kids'); }
  function starsOf(stage) { return Number(course().cleared[stage] || 0); }
  function isOpen(stage) { return stage <= 1 || starsOf(stage - 1) > 0; }

  function firstOpenStage() {
    for (let s = 1; s <= STAGES; s++) if (starsOf(s) <= 0) return isOpen(s) ? s : Math.max(1, s - 1);
    return STAGES;
  }

  /** 独自キー。日付が変わったら作り直す */
  function daily() {
    const p = store.profile;
    const day = todayKey();
    if (!p.kidsDaily || p.kidsDaily.date !== day) p.kidsDaily = { date: day, claimed: [], stages: 0 };
    if (!Array.isArray(p.kidsDaily.claimed)) p.kidsDaily.claimed = [];
    return p.kidsDaily;
  }

  function bestAccToday() {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const t0 = from.getTime();
    let best = 0;
    const list = Array.isArray(store.profile.sessions) ? store.profile.sessions : [];
    for (const s of list) {
      if (s.t >= t0 && s.keys >= 20 && Number.isFinite(s.acc)) best = Math.max(best, s.acc);
    }
    return Math.round(best * 100);
  }

  function missions() {
    const kd = daily();
    const d = store.profile.daily[todayKey()] || { keys: 0 };
    return [
      { id: 'keys', face: '⌨️', name: 'きょう 300かい うつ', now: d.keys || 0, goal: 300, xp: 30, unit: 'かい' },
      { id: 'acc', face: '🎯', name: 'せいかくりつ 95% いじょう', now: bestAccToday(), goal: 95, xp: 40, unit: '%' },
      { id: 'stage', face: '🚩', name: 'ステージを 1つ クリア', now: kd.stages || 0, goal: 1, xp: 30, unit: 'こ' },
    ];
  }

  /** 達成ぶんのボーナス XP を 1 日 1 回だけ足す */
  function claimMissions() {
    const kd = daily();
    let gained = 0;
    for (const m of missions()) {
      if (m.now >= m.goal && !kd.claimed.includes(m.id)) { kd.claimed.push(m.id); gained += m.xp; }
    }
    if (gained > 0) {
      store.profile.xp += gained;
      store.save();
      say('ミッション たっせい！ +' + gained + ' XP');
    }
  }

  // ------------------------------------------------------------ マップ画面

  function topBar() {
    const p = store.profile;
    const lv = levelFromXp(p.xp);
    const cur = xpForLevel(lv);
    const next = xpForLevel(lv + 1);
    const ratio = next > cur ? (p.xp - cur) / (next - cur) : 1;

    const head = el('header', 'card card-tight kids-top');
    const line = el('div', 'row-between');
    line.append(el('span', 'kids-level', '⭐ レベル ' + lv));
    const back = btn('btn btn-ghost btn-sm', 'もどる');
    back.setAttribute('aria-label', 'さいしょの がめんに もどる');
    back.addEventListener('click', () => { wakeSound(); go('#/'); });
    line.append(back);
    head.append(line);

    const xb = makeBar('kids-xp');
    xb.fill.style.width = pct(ratio) + '%';
    head.append(xb.root);
    head.append(el('p', 'tiny muted', p.xp + ' / ' + next + ' XP'));

    const chips = el('div', 'row wrap kids-chips');
    chips.append(chip('🔥', (p.streak || 0) + ' 日れんぞく'));
    chips.append(chip('🐣', (p.pets ? p.pets.length : 0) + ' ひき'));
    chips.append(chip('⌨️', (p.totalKeys || 0).toLocaleString('ja-JP') + ' かい'));
    const book = btn('btn btn-sm kids-book-btn', '📖 ずかん');
    book.addEventListener('click', () => { wakeSound(); openBook(); });
    chips.append(book);
    head.append(chips);
    return head;
  }

  function missionCard() {
    const kd = daily();
    const card = el('section', 'card kids-missions');
    card.append(el('h2', 'kids-h2', 'きょうの ミッション'));
    const list = el('div', 'kids-mission-list');
    for (const m of missions()) {
      const done = m.now >= m.goal;
      const item = el('div', 'kids-mission' + (done ? ' is-done' : ''));
      const head = el('div', 'row-between kids-mission-head');
      head.append(el('span', 'kids-mission-name', m.face + ' ' + m.name));
      head.append(el('span', 'kids-mission-num mono', Math.min(m.now, m.goal) + ' / ' + m.goal));
      item.append(head);
      const b = makeBar('kids-mission-bar');
      b.fill.style.width = pct(m.now / m.goal) + '%';
      item.append(b.root);
      const note = done
        ? (kd.claimed.includes(m.id) ? 'できた！ +' + m.xp + ' XP' : 'できた！')
        : 'あと ' + Math.max(0, m.goal - m.now) + ' ' + m.unit;
      item.append(el('p', 'tiny muted', note));
      list.append(item);
    }
    card.append(list);
    return card;
  }

  function stageButton(stage, focus) {
    const boss = stage % 5 === 0;
    const open = isOpen(stage);
    const stars = starsOf(stage);
    const b = btn('kids-stage'
      + (boss ? ' is-boss' : '')
      + (open ? '' : ' is-lock')
      + (stage === focus ? ' is-focus' : ''));
    // 一マスごとに上下へずらして、すごろくの道のように見せる
    b.style.setProperty('--dy', (stage % 2 ? -10 : 10) + 'px');
    b.append(el('span', 'kids-stage-face', open ? (boss ? bossFace(stage) : stageFace(stage)) : '🔒'));
    b.append(el('span', 'kids-stage-no', String(stage)));
    const st = el('span', 'kids-stage-stars');
    for (let i = 0; i < 3; i++) st.append(el('span', 'kids-star' + (i < stars ? ' is-on' : ''), '★'));
    b.append(st);
    b.disabled = !open;
    b.setAttribute('aria-label', 'ステージ ' + stage + (boss ? ' ボス' : '')
      + (open ? '、ほし ' + stars + 'こ' : '、まだ あかないよ'));
    b.addEventListener('click', () => { wakeSound(); startStage(stage); });
    return b;
  }

  function mapCard(focus) {
    const wrap = el('section', 'card kids-map-card');
    wrap.append(el('h2', 'kids-h2', 'ステージ マップ'));
    const map = el('div', 'kids-map');
    for (let r = 0; r * COLS < STAGES; r++) {
      const row = el('div', 'kids-map-row' + (r % 2 ? ' is-rev' : ''));
      for (let c = 0; c < COLS; c++) {
        const s = r * COLS + c + 1;
        if (s > STAGES) break;
        row.append(stageButton(s, focus));
      }
      map.append(row);
    }
    wrap.append(map);
    wrap.append(el('p', 'tiny muted', '★は せいかくさと はやさで きまるよ。5の ばいすうは ボスだ！'));
    return wrap;
  }

  function showMap(focus) {
    clearScreen();
    claimMissions();
    const page = el('div', 'page kids-page');
    page.append(topBar());
    page.append(missionCard());
    page.append(mapCard(focus || firstOpenStage()));
    scope.append(page);
    const target = page.querySelector('.is-focus');
    if (target && target.scrollIntoView) {
      try { target.scrollIntoView({ block: 'center' }); } catch { /* 古いブラウザは無視 */ }
    }
  }

  function openBook() {
    if (!ask) return;
    const p = store.profile;
    const pets = Array.isArray(p.pets) ? p.pets : [];
    const body = el('div', 'kids-book');
    const grid = el('div', 'kids-pet-grid');
    const total = Math.max(PET_SLOTS, pets.length);
    for (let i = 0; i < total; i++) {
      const pet = pets[i];
      const cell = el('div', 'kids-pet' + (pet ? '' : ' is-unknown'));
      cell.append(el('span', 'kids-pet-face', pet ? pet.e : '？'));
      cell.append(el('span', 'kids-pet-name', pet ? pet.n : 'まだ ひみつ'));
      grid.append(cell);
    }
    body.append(grid);
    const rest = PET_STEP - ((p.petProgress || 0) % PET_STEP);
    body.append(el('p', 'small muted', 'あと ' + rest + ' かい うつと、あたらしい なかまが でてくるよ。'));
    ask({ title: '📖 なかま ずかん', body, actions: [{ label: 'とじる', value: true, variant: 'primary' }] });
  }

  // ---------------------------------------------------------- プレイ画面

  function startStage(stage) {
    clearScreen();
    const lang = store.settings.lang === 'en' ? 'en' : 'ja';
    const boss = stage % 5 === 0;

    let lesson = null;
    try { lesson = buildStageLesson({ stage, lang }); } catch { lesson = null; }
    if (!lesson || !Array.isArray(lesson.lines) || lesson.lines.length === 0) {
      say('もんだいが つくれなかったよ');
      showMap(stage);
      return;
    }
    const totalLines = lesson.lines.length;

    const page = el('div', 'page kids-page kids-play');

    const top = el('div', 'row-between kids-play-top');
    const quit = btn('btn btn-ghost btn-sm', '← やめる');
    quit.addEventListener('click', () => { session.abort(); showMap(stage); });
    top.append(quit);
    top.append(el('span', 'kids-play-title', 'ステージ ' + stage + (boss ? '（ボス）' : '')));
    const timeEl = el('span', 'kids-time mono', '0:00');
    top.append(timeEl);
    page.append(top);

    // レベルと XP バー（契約 2.8: プレイ中も見えること）
    const xpRow = el('div', 'row kids-play-xp');
    const lvEl = el('span', 'kids-play-lv', '');
    const xpBar = makeBar('kids-xp');
    const xpWrap = el('div', 'grow');
    xpWrap.append(xpBar.root);
    xpRow.append(lvEl);
    xpRow.append(xpWrap);
    page.append(xpRow);
    const paintXp = () => {
      const xp = store.profile.xp || 0;
      const lv = levelFromXp(xp);
      const cur = xpForLevel(lv);
      const next = xpForLevel(lv + 1);
      const pct = next > cur ? ((xp - cur) / (next - cur)) * 100 : 0;
      lvEl.textContent = '⭐ レベル ' + lv;
      xpBar.fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    };
    paintXp();

    let hp = null;
    let hpText = null;
    if (boss) {
      const bossBox = el('div', 'card card-tight kids-boss');
      const row = el('div', 'row');
      row.append(el('span', 'kids-boss-face', bossFace(stage)));
      const info = el('div', 'grow');
      const head = el('div', 'row-between');
      head.append(el('span', 'kids-boss-name', 'ボスの たいりょく'));
      hpText = el('span', 'mono tiny', '100%');
      head.append(hpText);
      info.append(head);
      hp = makeBar('kids-hp');
      hp.fill.style.width = '100%';
      info.append(hp.root);
      row.append(info);
      bossBox.append(row);
      page.append(bossBox);
    }

    const card = el('section', 'card kids-target-card');
    const readEl = el('p', 'kids-reading muted small');
    const targetEl = el('div', 'typeline kids-target');
    targetEl.setAttribute('aria-live', 'off');
    const romaEl = el('p', 'romaji-hint kids-romaji');
    card.append(readEl);
    card.append(targetEl);
    card.append(romaEl);
    page.append(card);

    const comboBox = el('div', 'kids-combo');
    comboBox.dataset.level = '0';
    const comboHead = el('div', 'row-between');
    comboHead.append(el('span', 'kids-combo-label', 'コンボ'));
    const comboNum = el('span', 'kids-combo-num mono', '×0');
    comboHead.append(comboNum);
    comboBox.append(comboHead);
    const combo = makeBar('kids-combo-bar');
    comboBox.append(combo.root);
    page.append(comboBox);

    const meta = el('div', 'row-between kids-play-meta small muted');
    const lineEl = el('span', null, '1 / ' + totalLines);
    const accEl = el('span', 'mono', '100%');
    meta.append(lineEl);
    meta.append(accEl);
    page.append(meta);

    const hintEl = el('p', 'kids-finger-hint', '');
    page.append(hintEl);

    let kb = null;
    let hands = null;
    if (store.settings.showKeyboard !== false) {
      const kbHost = el('div', 'kids-kb');
      page.append(kbHost);
      kb = new KeyboardView({
        mount: kbHost, layout: store.settings.layout === 'us' ? 'us' : 'jis',
        kidsLabels: true, compact: true, showHands: false,
      });
    }
    if (store.settings.showHands !== false) {
      const handsHost = el('div', 'kids-hands');
      page.append(handsHost);
      hands = new HandsView({ mount: handsHost, kids: true });
    }

    scope.append(page);

    let lastCorrect = 0;
    let lastErrors = 0;
    let lastTick = -1;
    let lastKey = '';

    function shake() {
      card.classList.remove('shake');
      void card.offsetWidth;   // アニメーションを最初から再生させるための再計算
      card.classList.add('shake');
      later(() => card.classList.remove('shake'), 260);
    }

    function paint(state) {
      const m = state.metrics;
      const dErr = m.errors - lastErrors;
      const dOk = m.correct - lastCorrect;
      lastErrors = m.errors;
      lastCorrect = m.correct;

      if (dErr > 0) {
        sfx.error();
        shake();
        if (kb && state.lastWrong) kb.flash(state.lastWrong, false);
      } else if (dOk > 0) {
        const ch = state.typedRomaji ? state.typedRomaji[state.typedRomaji.length - 1] : '';
        sfx.key();
        if (kb && ch) kb.flash(ch, true);
        if (state.combo > 0 && state.combo % 5 === 0) sfx.combo(Math.floor(state.combo / 5));
      }

      // 出題は「実際に打つ文字列」を大きく出す。ja なら かな、en なら単語
      const text = lang === 'ja' ? (state.line ? state.line.target : '') : state.display;
      const cur = lang === 'ja' ? state.unitIndex : (state.typedRomaji || '').length;
      const key = state.lineIndex + '/' + cur + '/' + (state.lastWrong ? 1 : 0);
      if (key !== lastKey) {
        lastKey = key;
        targetEl.textContent = '';
        [...text].forEach((c, i) => {
          let cls = 'ch pending';
          if (i < cur) cls = 'ch done';
          else if (i === cur) cls = state.lastWrong ? 'ch cursor bad' : 'ch cursor';
          targetEl.append(el('span', cls, c));
        });
      }

      const rest = state.remainingRomaji || '';
      if (lang === 'ja') {
        romaEl.textContent = '';
        romaEl.append(el('span', 'done', state.typedRomaji || ''));
        if (rest) {
          romaEl.append(el('span', 'next', rest[0]));
          if (rest.length > 1) romaEl.append(el('span', null, rest.slice(1)));
        }
      }
      const disp = state.line ? state.line.display : '';
      readEl.textContent = disp && disp !== text ? disp : '';

      comboNum.textContent = '×' + state.combo;
      combo.fill.style.width = pct(Math.min(1, state.combo / COMBO_FULL)) + '%';
      comboBox.dataset.level = String(
        state.combo >= COMBO_FULL ? 3 : state.combo >= 10 ? 2 : state.combo >= 5 ? 1 : 0,
      );

      if (state.remainingMs != null) {
        timeEl.textContent = formatMs(state.remainingMs);
        timeEl.classList.toggle('is-hurry', state.remainingMs <= 10000);
        const sec = Math.ceil(state.remainingMs / 1000);
        if (sec <= 5 && sec !== lastTick) { lastTick = sec; sfx.tick(); }
      } else {
        timeEl.textContent = formatMs(m.elapsedMs);
      }
      if (hp) {
        hp.fill.style.width = pct(1 - m.progress) + '%';
        hpText.textContent = pct(1 - m.progress) + '%';
      }

      lineEl.textContent = Math.min(state.lineIndex + 1, totalLines) + ' / ' + totalLines;
      accEl.textContent = pct(m.accuracy) + '%';

      if (kb) kb.highlight(state.expected);
      const nextCh = rest ? rest[0] : '';
      const hint = nextCh ? handHintFor(store.settings.layout === 'us' ? 'us' : 'jis', nextCh, true) : null;
      if (hands) hands.highlight(hint ? hint.finger : null);
      hintEl.textContent = hint ? hint.label + ' で うとう' : '';
    }

    const session = new TypingSession({
      lines: lesson.lines,
      lang,
      mode: 'kids',
      kind: boss ? 'kids-boss' : 'kids-stage',
      strict: store.settings.strict !== false,
      timeLimitMs: boss ? BOSS_TIME_MS : null,
      onUpdate: paint,
      onFinish: (sum) => showResult(stage, sum, totalLines),
    });

    const detach = attachInput(session, {
      onNonInput: (e) => {
        if (e.key === 'Escape') { e.preventDefault(); session.abort(); showMap(stage); return true; }
        return false;
      },
    });

    disposers.push(detach);
    disposers.push(() => { if (!session.finished) session.abort(); session.destroy(); });
    if (kb) disposers.push(() => kb.destroy());
    if (hands) disposers.push(() => hands.destroy());

    session.start();
  }

  // ---------------------------------------------------------- けっか画面

  function showResult(stage, sum, totalLines) {
    clearScreen();
    const boss = stage % 5 === 0;
    const cleared = Array.isArray(sum.perLine) && sum.perLine.length >= totalLines;
    const grade = gradeOf(sum);
    const stars = cleared ? grade.stars : 0;

    if (cleared && stars > 0) {
      const c = course();
      if (stars > Number(c.cleared[stage] || 0)) c.cleared[stage] = stars;
      c.unlocked = Math.max(Number(c.unlocked || 0), Math.min(STAGES, stage + 1));
      const kd = daily();
      kd.stages = (kd.stages || 0) + 1;
      store.save();
    }

    const reward = sum.reward || { gained: 0, levelUp: false, level: levelFromXp(store.profile.xp), newBadges: [], newPets: [] };
    const quiet = motionOff();

    const page = el('div', 'page kids-page kids-result');

    const title = cleared
      ? (boss ? 'ボスに かった！' : 'ステージ ' + stage + ' クリア！')
      : 'まけちゃった、もういちど！';
    page.append(el('h1', 'kids-result-title', title));
    page.append(el('p', 'kids-result-sub muted', cleared ? grade.label : 'じかんぎれ。つぎは きっと できる！'));

    const starRow = el('div', 'kids-result-stars');
    const starEls = [];
    for (let i = 0; i < 3; i++) {
      const s = el('span', 'kids-big-star', '★');
      starEls.push(s);
      starRow.append(s);
    }
    page.append(starRow);

    const kpis = el('section', 'card kids-kpis grid-kpi');
    const facts = [
      ['うった かず', String(sum.keys)],
      ['せいかくりつ', pct(sum.accuracy) + '%'],
      ['じかん', formatMs(sum.durationMs)],
      ['さいだい コンボ', '×' + (sum.maxCombo || 0)],
    ];
    facts.forEach(([k, v]) => {
      const box = el('div', 'kpi');
      box.append(el('b', null, v));
      box.append(el('span', null, k));
      kpis.append(box);
    });
    page.append(kpis);

    const rewards = el('div', 'kids-rewards');
    page.append(rewards);

    const xpCard = el('section', 'card kids-xp-card is-hidden');
    xpCard.append(el('h2', 'kids-h2', '+' + (reward.gained || 0) + ' XP'));
    const lv = levelFromXp(store.profile.xp);
    const cur = xpForLevel(lv);
    const next = xpForLevel(lv + 1);
    const xb = makeBar('kids-xp');
    xb.fill.style.width = pct(next > cur ? (store.profile.xp - cur) / (next - cur) : 1) + '%';
    xpCard.append(xb.root);
    xpCard.append(el('p', 'tiny muted', 'レベル ' + lv + '　' + store.profile.xp + ' / ' + next + ' XP'));
    rewards.append(xpCard);

    const blocks = [xpCard];

    if (reward.levelUp) {
      const up = el('section', 'card kids-levelup is-hidden');
      up.append(el('span', 'kids-levelup-face', '🎉'));
      up.append(el('h2', 'kids-h2', 'レベル ' + reward.level + ' に なった！'));
      rewards.append(up);
      blocks.push(up);
    }

    const newPets = Array.isArray(reward.newPets) ? reward.newPets : [];
    if (newPets.length) {
      const box = el('section', 'card kids-newpets is-hidden');
      box.append(el('h2', 'kids-h2', 'あたらしい なかま！'));
      const row = el('div', 'row wrap');
      newPets.forEach((p) => {
        const one = el('div', 'kids-pet');
        one.append(el('span', 'kids-pet-face', p.e));
        one.append(el('span', 'kids-pet-name', p.n));
        row.append(one);
      });
      box.append(row);
      rewards.append(box);
      blocks.push(box);
    }

    const newBadges = Array.isArray(reward.newBadges) ? reward.newBadges : [];
    if (newBadges.length) {
      const box = el('section', 'card kids-newbadges is-hidden');
      box.append(el('h2', 'kids-h2', 'あたらしい メダル！'));
      const row = el('div', 'row wrap');
      newBadges.forEach((b) => row.append(chip('🏅', b.name)));
      box.append(row);
      rewards.append(box);
      blocks.push(box);
    }

    // 健全性。やめさせるのではなく「そろそろ やすもう」と一度だけ伝える
    const minutes = store.settings.breakReminder;
    if (minutes > 0 && Date.now() - breakFrom >= minutes * 60000) {
      const box = el('section', 'card kids-break');
      box.append(el('span', 'kids-break-face', '👀'));
      box.append(el('h2', 'kids-h2', 'そろそろ めを やすめよう！'));
      box.append(el('p', 'small muted', minutes + 'ぷん いじょう れんしゅうしたよ。とおくを みて ひとやすみ。'));
      const close = btn('btn btn-sm', 'とじる');
      close.addEventListener('click', () => { breakFrom = Date.now(); box.remove(); });
      box.append(close);
      page.append(box);
    }

    const actions = el('div', 'row wrap kids-actions');
    const nextStage = stage + 1;
    if (cleared && stars > 0 && nextStage <= STAGES) {
      const nx = btn('btn btn-primary btn-lg', 'つぎへ →');
      nx.addEventListener('click', () => { wakeSound(); startStage(nextStage); });
      actions.append(nx);
    }
    const again = btn('btn btn-lg', 'もういちど');
    again.addEventListener('click', () => { wakeSound(); startStage(stage); });
    actions.append(again);
    const toMap = btn('btn btn-ghost btn-lg', 'マップへ');
    toMap.addEventListener('click', () => { wakeSound(); showMap(cleared ? Math.min(STAGES, nextStage) : stage); });
    actions.append(toMap);
    page.append(actions);

    const cv = el('canvas', 'kids-confetti');
    cv.setAttribute('aria-hidden', 'true');
    page.append(cv);

    scope.append(page);

    // ★ → 報酬カード の順に見せる。動きを減らす設定のときは一気に出す
    const step = quiet ? 0 : 420;
    starEls.forEach((s, i) => {
      if (i >= stars) return;
      later(() => { s.classList.add('is-on'); sfx.star(); }, step * (i + 1));
    });
    blocks.forEach((b, i) => {
      later(() => {
        b.classList.remove('is-hidden');
        if (b === xpCard && reward.levelUp) sfx.levelUp();
        if (b.classList.contains('kids-newpets')) sfx.hatch();
      }, step * (stars + i + 1));
    });
    if (cleared && stars > 0) {
      later(() => { sfx.clear(); confetti(cv); }, step * Math.max(1, stars));
    }
  }

  /** 紙吹雪。色は CSS 変数から読み、2 秒で消える */
  function confetti(canvas) {
    if (motionOff()) return;
    const g = canvas.getContext ? canvas.getContext('2d') : null;
    if (!g) return;
    const cs = getComputedStyle(canvas);
    const colors = ['--kids-c1', '--kids-c2', '--kids-c3', '--kids-c4', '--kids-c5']
      .map((n) => (cs.getPropertyValue(n) || '').trim())
      .filter(Boolean);
    if (!colors.length) return;

    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 320;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.scale(dpr, dpr);

    const bits = [];
    for (let i = 0; i < 90; i++) {
      bits.push({
        x: Math.random() * w,
        y: -20 - Math.random() * h * 0.5,
        vx: (Math.random() - 0.5) * 70,
        vy: 110 + Math.random() * 150,
        size: 5 + Math.random() * 7,
        a: Math.random() * Math.PI,
        va: (Math.random() - 0.5) * 7,
        c: colors[i % colors.length],
      });
    }

    const t0 = performance.now();
    let prev = t0;
    const step = (now) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      g.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.a += b.va * dt;
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.a);
        g.fillStyle = b.c;
        g.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
        g.restore();
      }
      if (now - t0 < 2000) raf = requestAnimationFrame(step);
      else { g.clearRect(0, 0, w, h); raf = 0; }
    };
    raf = requestAnimationFrame(step);
  }

  showMap(firstOpenStage());

  return {
    destroy() {
      clearScreen();
      if (scope.parentNode) scope.parentNode.removeChild(scope);
    },
  };
}
