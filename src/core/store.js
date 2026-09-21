/**
 * store.js — 学習プロファイルの永続化と統計。
 * すべて localStorage。サーバ送信なし・アカウント不要・広告なし。
 */

const KEY = 'ttt.profile.v1';
const SETTINGS_KEY = 'ttt.settings.v1';

/** 指数移動平均。サンプルが少ないうちは新しい値を強く効かせる。 */
function ema(prev, value, n) {
  if (prev == null || !Number.isFinite(prev)) return value;
  const alpha = Math.max(0.12, 1 / Math.max(2, n));
  return prev * (1 - alpha) + value * alpha;
}

export function todayKey(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

function emptyProfile() {
  return {
    v: 1,
    createdAt: Date.now(),
    keys: {},        // char -> {n, err, ms, best}
    bigrams: {},     // "ab" -> {n, ms}
    courses: {},     // courseId -> {unlocked:[...], level, cleared:{}, }
    sessions: [],    // 直近の記録(最大400)
    daily: {},       // 'YYYY-MM-DD' -> {ms, keys, sessions}
    xp: 0,
    streak: 0,
    lastDay: null,
    badges: [],
    pets: [],
    petProgress: 0,
    totalKeys: 0,
    kidsDaily: null, // 子供モードのデイリーミッション受領状況 {date, claimed:[]}
  };
}

export const DEFAULT_SETTINGS = {
  mode: null,              // 'adult' | 'kids'
  lang: 'ja',              // 'ja' | 'en'
  layout: 'jis',           // 'jis' | 'us'
  targetWpm: 50,
  strict: true,            // 誤打時に先へ進めない(強制訂正)
  showKeyboard: true,
  showHands: true,
  sound: true,
  order: 'balanced',       // 'balanced'(頻度＋運指) | 'homerow'(伝統的)
  skin: 'editor',          // 大人モードの擬態スキン
  panicOnBlur: false,      // 画面から離れたら自動で隠す
  spoofTitle: true,
  reduceMotion: false,
  breakReminder: 20,       // 分。0 で無効
  fontScale: 1,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    return { ...structuredClone(fallback), ...JSON.parse(raw) };
  } catch {
    return structuredClone(fallback);
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / privacy mode */ }
}

export const store = {
  profile: emptyProfile(),
  settings: { ...DEFAULT_SETTINGS },
  _listeners: new Set(),

  load() {
    this.profile = read(KEY, emptyProfile());
    this.settings = read(SETTINGS_KEY, DEFAULT_SETTINGS);
    return this;
  },
  save() {
    write(KEY, this.profile);
    write(SETTINGS_KEY, this.settings);
    this._listeners.forEach((f) => f(this));
  },
  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },

  set(patch) { Object.assign(this.settings, patch); this.save(); },

  course(id) {
    if (!this.profile.courses[id]) this.profile.courses[id] = { unlocked: 0, cleared: {}, best: {} };
    return this.profile.courses[id];
  },

  /** 目標 WPM から 1 打鍵あたりの目標ミリ秒を求める (1 WPM = 5 打鍵/分) */
  targetMs() { return 60000 / (this.settings.targetWpm * 5); },

  reset() {
    this.profile = emptyProfile();
    this.save();
  },

  exportJSON() {
    return JSON.stringify({ profile: this.profile, settings: this.settings }, null, 2);
  },

  importJSON(text) {
    const data = JSON.parse(text);
    if (data.profile) this.profile = { ...emptyProfile(), ...data.profile };
    if (data.settings) this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    this.save();
  },
};

// ------------------------------------------------------------------ 統計更新

/** 1 打鍵の記録を取り込む */
export function recordKeystroke({ expected, ok, ms, prev }) {
  if (!expected) return;
  const p = store.profile;
  const k = (p.keys[expected] ||= { n: 0, err: 0, ms: null, best: null });
  if (ok) {
    k.n++;
    // 2 秒超は「考えていた/止まっていた」とみなし外れ値として丸める
    const capped = Math.min(ms, 2000);
    k.ms = ema(k.ms, capped, k.n);
    if (k.best == null || capped < k.best) k.best = capped;
    if (prev) {
      const bg = (p.bigrams[prev + expected] ||= { n: 0, ms: null });
      bg.n++;
      bg.ms = ema(bg.ms, capped, bg.n);
    }
    p.totalKeys++;
  } else {
    k.err++;
  }
}

/** キーの習熟度 0..1。速度と正確性の両方を満たして 1 に近づく */
export function mastery(char, targetMs = store.targetMs()) {
  const k = store.profile.keys[char];
  if (!k || k.n < 4) return 0;
  const acc = k.n / (k.n + k.err);
  const speed = k.ms == null ? 0 : Math.min(1, targetMs / k.ms);
  const conf = Math.min(1, k.n / 24);            // サンプル数による信頼度
  const accScore = Math.max(0, (acc - 0.80) / 0.17); // 80%→0, 97%→1
  return Math.max(0, Math.min(1, speed * 0.45 + Math.min(1, accScore) * 0.35 + conf * 0.20));
}

export function isLearned(char, targetMs = store.targetMs()) {
  const k = store.profile.keys[char];
  if (!k || k.n < 10) return false;
  const acc = k.n / (k.n + k.err);
  return acc >= 0.92 && k.ms != null && k.ms <= targetMs * 1.25;
}

/** 弱点スコア(大きいほど練習が必要) */
export function weakness(char, targetMs = store.targetMs()) {
  const k = store.profile.keys[char];
  if (!k || k.n < 3) return 1.4;                  // 未知のキーは優先的に出す
  const acc = k.n / (k.n + k.err);
  const slow = k.ms == null ? 1 : Math.max(0, (k.ms - targetMs) / targetMs);
  return Math.min(4, 0.15 + Math.min(2, slow) + (1 - acc) * 6);
}

/** 遅い連接(ビッグラム)を上位 n 件返す */
export function worstBigrams(n = 8, minSamples = 6) {
  return Object.entries(store.profile.bigrams)
    .filter(([, v]) => v.n >= minSamples && v.ms != null)
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, n)
    .map(([k, v]) => ({ pair: k, ms: Math.round(v.ms), n: v.n }));
}

// ------------------------------------------------------- セッション記録 / XP

/** 速度バッジの条件: 一定以上の打鍵数と時間を伴った WPM であること */
const sustained = (wpm) => (s) => s.wpm >= wpm && s.keys >= 120 && s.durationMs >= 20000;

const BADGES = [
  { id: 'first', name: 'はじめの一歩', need: (p) => p.sessions.length >= 1 },
  { id: 'keys1k', name: '1,000打', need: (p) => p.totalKeys >= 1000 },
  { id: 'keys10k', name: '10,000打', need: (p) => p.totalKeys >= 10000 },
  { id: 'keys50k', name: '50,000打', need: (p) => p.totalKeys >= 50000 },
  { id: 'acc98', name: '正確さの達人', need: (p) => p.sessions.some((s) => s.acc >= 0.98 && s.keys >= 120) },
  { id: 'acc100', name: 'ノーミス', need: (p) => p.sessions.some((s) => s.acc === 1 && s.keys >= 80) },
  // 速度バッジは十分な試行量を伴うときだけ。数打鍵の瞬発で全部取れてしまわないように
  { id: 'wpm30', name: '30 WPM', need: (p) => p.sessions.some(sustained(30)) },
  { id: 'wpm50', name: '50 WPM', need: (p) => p.sessions.some(sustained(50)) },
  { id: 'wpm70', name: '70 WPM', need: (p) => p.sessions.some(sustained(70)) },
  { id: 'streak3', name: '3日れんぞく', need: (p) => p.streak >= 3 },
  { id: 'streak7', name: '1週間れんぞく', need: (p) => p.streak >= 7 },
  { id: 'streak30', name: '1か月れんぞく', need: (p) => p.streak >= 30 },
];

export function levelFromXp(xp) {
  // ゆるやかな二次曲線。序盤は速く上がり、後半は伸びしろを残す
  return Math.floor((Math.sqrt(1 + (8 * xp) / 60) - 1) / 2) + 1;
}
export function xpForLevel(lv) { return Math.round((60 * (lv - 1) * lv) / 2); }

export function finishSession(rec) {
  const p = store.profile;
  const day = todayKey();
  if (p.lastDay !== day) {
    const y = todayKey(new Date(Date.now() - 86400000));
    p.streak = p.lastDay === y ? p.streak + 1 : 1;
    p.lastDay = day;
  }
  const d = (p.daily[day] ||= { ms: 0, keys: 0, sessions: 0 });
  d.ms += rec.durationMs; d.keys += rec.keys; d.sessions++;

  p.sessions.push({ t: Date.now(), ...rec });
  if (p.sessions.length > 400) p.sessions = p.sessions.slice(-400);

  // XP: 打鍵数 × 精度^2(精度を強く重み付けして「速く雑に」を防ぐ)
  const gained = Math.round(rec.keys * Math.pow(rec.acc, 2) * 0.8) + (rec.acc >= 0.98 ? 15 : 0);
  const before = levelFromXp(p.xp);
  p.xp += gained;
  const after = levelFromXp(p.xp);

  p.petProgress += rec.keys;
  const newPets = [];
  while (p.petProgress >= 600) { p.petProgress -= 600; newPets.push(p.pets.length); p.pets.push(pickPet(p.pets.length)); }

  const newBadges = [];
  for (const b of BADGES) {
    if (!p.badges.includes(b.id) && b.need(p)) { p.badges.push(b.id); newBadges.push(b); }
  }
  store.save();
  return { gained, levelUp: after > before, level: after, newBadges, newPets: newPets.map((i) => p.pets[i]) };
}

const PET_POOL = [
  { e: '🐣', n: 'ぴよすけ' }, { e: '🐤', n: 'こっこ' }, { e: '🦊', n: 'きつね丸' },
  { e: '🐸', n: 'けろ太' }, { e: '🐙', n: 'たこハチ' }, { e: '🦕', n: 'ながくん' },
  { e: '🐬', n: 'るかい' }, { e: '🦉', n: 'ほうちゃん' }, { e: '🐝', n: 'ぶんぶん' },
  { e: '🦄', n: 'ゆにこ' }, { e: '🐉', n: 'りゅうお' }, { e: '🦈', n: 'さめぞう' },
  { e: '🐧', n: 'ぺんた' }, { e: '🐢', n: 'かめきち' }, { e: '🦁', n: 'らいおん王' },
  { e: '🐼', n: 'ぱんだ' }, { e: '🦅', n: 'そらたか' }, { e: '👾', n: 'ばぐぞう' },
  { e: '🤖', n: 'ろぼ丸' }, { e: '🌟', n: 'ほしのこ' },
];
function pickPet(i) {
  // 後半ほどレアが出る。完全ランダムではなく「必ず新種が出る」保証つき
  const pool = PET_POOL;
  const idx = i < pool.length ? i : Math.floor(Math.random() * pool.length);
  return { ...pool[idx], at: Date.now() };
}

export { BADGES };
