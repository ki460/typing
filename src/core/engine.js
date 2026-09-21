/**
 * engine.js — タイピング実行エンジン。
 *
 * 1 セッション = 複数 Line。1 打鍵ごとに matcher へ流し、正誤・コンボ・
 * 速度/正確率/一貫性を計算して onUpdate を呼ぶ。計測は「最初の打鍵」から始まり、
 * pause 中は進まない。終了時に store.finishSession() で記録と報酬を得る。
 * attachInput() は keydown から printable 1 文字だけを拾って session に流す。
 */
import { createMatcher } from './romaji.js';
import { store, recordKeystroke, finishSession } from './store.js';

const MAX_INTERVAL = 2000; // 外れ値(考え込み)の丸め上限

/** 平均・標準偏差から変動係数を求め、一貫性 0..1 に変換する */
function consistencyOf(intervals) {
  if (intervals.length < 2) return 1;
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  if (mean <= 0) return 1;
  const varSum = intervals.reduce((a, b) => a + (b - mean) * (b - mean), 0);
  const sd = Math.sqrt(varSum / intervals.length);
  return Math.max(0, Math.min(1, 1 - sd / mean));
}

function round1(n) {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}

export class TypingSession {
  constructor(opts) {
    const o = opts || {};
    this.lines = Array.isArray(o.lines) ? o.lines.slice() : [];
    this.lang = o.lang || store.settings.lang || 'ja';
    this.mode = o.mode || store.settings.mode || 'adult';
    this.kind = o.kind || 'practice';
    this.strict = o.strict === undefined ? store.settings.strict !== false : !!o.strict;
    this.timeLimitMs = o.timeLimitMs == null ? null : o.timeLimitMs;
    this.onUpdate = typeof o.onUpdate === 'function' ? o.onUpdate : null;
    this.onLineDone = typeof o.onLineDone === 'function' ? o.onLineDone : null;
    this.onFinish = typeof o.onFinish === 'function' ? o.onFinish : null;

    // 行ごとに matcher を先に用意する。合計打鍵数は進捗表示に使う
    this._matchers = this.lines.map((l) => createMatcher(l.lang || this.lang, l.target));
    this._plannedKeys = this._matchers.reduce((a, m) => a + (m.totalKeys || 0), 0);

    this.lineIndex = 0;
    this.correct = 0;
    this.errors = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.lastWrong = null;
    this.finished = false;
    this.perLine = [];

    this._kanaUnits = 0;      // 確定かな数(kpm 用)
    this._doneKeys = 0;       // 完了した行の打鍵数(進捗用)
    this._intervals = [];
    this._log = [];           // 現在行で matcher を進めた文字列(backspace 用)
    this._lineStats = { keys: 0, errors: 0, startedAt: null };

    this._startedAt = null;
    this._pausedAt = null;
    this._paused = false;
    this._lastCorrectAt = null;
    this._lastCorrectChar = null;
    this._timer = null;
    this._summary = null;
    this._destroyed = false;
    this._aborted = false;
  }

  // ------------------------------------------------------------ 時間まわり

  _elapsed() {
    if (this._startedAt == null) return 0;
    const end = this._paused && this._pausedAt != null ? this._pausedAt : Date.now();
    return Math.max(0, end - this._startedAt);
  }

  _beginTiming() {
    if (this._startedAt != null) return;
    this._startedAt = Date.now();
    if (this._lineStats.startedAt == null) this._lineStats.startedAt = this._startedAt;
    this._startTimer(); // 時間制限が無くても経過時間表示のために回す
  }

  _startTimer() {
    if (this._timer != null) return;
    this._timer = setInterval(() => {
      if (this._paused || this.finished) return;
      const left = this._remainingMs();
      if (left != null && left <= 0) {
        this.finish();
        return;
      }
      if (this.onUpdate) this.onUpdate(this.state);
    }, 100);
  }

  _stopTimer() {
    if (this._timer != null) { clearInterval(this._timer); this._timer = null; }
  }

  _remainingMs() {
    if (this.timeLimitMs == null) return null;
    return Math.max(0, this.timeLimitMs - this._elapsed());
  }

  // ---------------------------------------------------------------- 制御

  start() {
    // 計測は最初の打鍵から。ここではタイマーを動かさない
    this.finished = false;
    if (this.lines.length === 0) {
      this.finished = true;
      return;
    }
    if (this.onUpdate) this.onUpdate(this.state);
  }

  pause() {
    if (this._paused || this.finished) return;
    this._paused = true;
    this._pausedAt = Date.now();
    if (this.onUpdate) this.onUpdate(this.state);
  }

  resume() {
    if (!this._paused || this.finished) return;
    const gap = Date.now() - (this._pausedAt == null ? Date.now() : this._pausedAt);
    // 止まっていた分だけ開始時刻を後ろへずらし、経過時間を据え置く
    if (this._startedAt != null) this._startedAt += gap;
    if (this._lastCorrectAt != null) this._lastCorrectAt += gap;
    if (this._lineStats.startedAt != null) this._lineStats.startedAt += gap;
    this._paused = false;
    this._pausedAt = null;
    if (this.onUpdate) this.onUpdate(this.state);
  }

  abort() {
    if (this.finished) return;
    this.finished = true;
    this._aborted = true;
    this._stopTimer();
  }

  destroy() {
    this._destroyed = true;
    this._stopTimer();
    this.onUpdate = null;
    this.onLineDone = null;
    this.onFinish = null;
  }

  // ---------------------------------------------------------------- 入力

  get _matcher() { return this._matchers[this.lineIndex] || null; }

  _expectedSet() {
    const m = this._matcher;
    return m ? m.expected() : new Set();
  }

  /** 誤打時に「本来押すべきだった代表文字」を決める */
  _representative() {
    const m = this._matcher;
    if (!m) return null;
    const rest = m.remaining();
    if (rest && rest.length) return rest[0];
    const it = m.expected().values().next();
    return it.done ? null : it.value;
  }

  _result(lineDone, finished) {
    return {
      ok: this._lastOk === true,
      expected: this._expectedSet(),
      lineDone: !!lineDone,
      finished: !!finished,
      combo: this.combo,
    };
  }

  input(ch) {
    if (this.finished || this._paused || this._destroyed) {
      this._lastOk = false;
      return this._result(false, this.finished);
    }
    const m = this._matcher;
    if (!m) {
      this._lastOk = false;
      return this._result(false, this.finished);
    }
    this._beginTiming();

    const now = Date.now();
    const before = m.unitIndex;
    const res = m.feed(ch);
    let lineDone = false;

    if (res.ok) {
      this._lastOk = true;
      this.correct++;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this.lastWrong = null;
      this._lineStats.keys++;
      this._kanaUnits += Math.max(0, m.unitIndex - before);
      this._log.push({ ch, correct: true });
      if (this._lastCorrectAt != null) {
        const gap = Math.min(now - this._lastCorrectAt, MAX_INTERVAL);
        this._intervals.push(gap);
        recordKeystroke({ expected: ch, ok: true, ms: gap, prev: this._lastCorrectChar });
      }
      // 最初の打鍵は間隔が測れないので記録しない
      this._lastCorrectAt = now;
      this._lastCorrectChar = ch;
      lineDone = res.done;
    } else {
      this._lastOk = false;
      this.errors++;
      this.combo = 0;
      this.lastWrong = ch;
      this._lineStats.errors++;
      const rep = this._representative();
      recordKeystroke({ expected: rep, ok: false, ms: null, prev: this._lastCorrectChar });
      if (!this.strict && rep != null) {
        // 誤りとして記録した上で 1 文字ぶん強制的に前へ進める
        const b2 = m.unitIndex;
        const forced = m.feed(rep);
        if (forced.ok) {
          this._log.push({ ch: rep, correct: false });
          this._kanaUnits += Math.max(0, m.unitIndex - b2);
          this._lineStats.keys++;
          // 飛ばした文字を次の間隔計算の基準にする。
          // 更新しないと、実際には打たれていない連接が bigram 統計に混ざる。
          this._lastCorrectAt = now;
          this._lastCorrectChar = rep;
          lineDone = forced.done;
        }
      }
    }

    if (lineDone) this._completeLine();
    if (this.onUpdate && !this.finished) this.onUpdate(this.state);
    return this._result(lineDone, this.finished);
  }

  /** 現在行を終え、次行へ。全行終わったら finish() */
  _completeLine(skipped) {
    const idx = this.lineIndex;
    const line = this.lines[idx];
    const startedAt = this._lineStats.startedAt;
    this.perLine.push({
      index: idx,
      target: line ? line.target : '',
      keys: this._lineStats.keys,
      errors: this._lineStats.errors,
      ms: startedAt == null ? 0 : Math.max(0, Date.now() - startedAt),
      skipped: !!skipped,
    });
    this._doneKeys += this._matchers[idx] ? this._matchers[idx].totalKeys || 0 : 0;
    this.lineIndex++;
    this._log = [];
    this._lineStats = { keys: 0, errors: 0, startedAt: this._startedAt == null ? null : Date.now() };

    const done = this.lineIndex >= this.lines.length;
    if (this.onLineDone) this.onLineDone(this.state, idx);
    if (done) {
      this.finished = true;
      this.finish();
    }
  }

  skipLine() {
    if (this.finished || this._destroyed) return;
    this._completeLine(true);
    if (this.onUpdate && !this.finished) this.onUpdate(this.state);
  }

  /** strict=false のときだけ意味を持つ。matcher を作り直して打鍵を再生する */
  backspace() {
    if (this.strict || this.finished || this._paused || this._destroyed) return;
    if (this._log.length === 0) return;
    const line = this.lines[this.lineIndex];
    const old = this._matcher;
    if (!line || !old) return;
    const removed = this._log.pop();
    const m = createMatcher(line.lang || this.lang, line.target);
    for (const e of this._log) m.feed(e.ch);
    this._kanaUnits -= Math.max(0, old.unitIndex - m.unitIndex);
    this._matchers[this.lineIndex] = m;
    if (removed.correct && this.correct > 0) this.correct--;
    if (this._lineStats.keys > 0) this._lineStats.keys--;
    this.combo = 0;
    this.lastWrong = null;
    if (this.onUpdate) this.onUpdate(this.state);
  }

  // ---------------------------------------------------------------- 集計

  get metrics() {
    const elapsedMs = this._elapsed();
    const mins = elapsedMs / 60000;
    const keys = this.correct + this.errors;
    const cpm = mins > 0 ? this.correct / mins : 0;
    const typedNow = this._matcher ? (this._matcher.typed || '').length : 0;
    const progress = this._plannedKeys > 0
      ? Math.max(0, Math.min(1, (this._doneKeys + typedNow) / this._plannedKeys))
      : (this.finished ? 1 : 0);
    return {
      wpm: round1(mins > 0 ? this.correct / 5 / mins : 0),
      cpm: round1(cpm),
      kpm: round1(this.lang === 'ja' ? (mins > 0 ? this._kanaUnits / mins : 0) : cpm),
      accuracy: keys > 0 ? this.correct / keys : 1,
      consistency: consistencyOf(this._intervals),
      elapsedMs,
      keys,
      correct: this.correct,
      errors: this.errors,
      progress,
    };
  }

  get state() {
    const line = this.lines[this.lineIndex] || null;
    const m = this._matcher;
    return {
      lineIndex: this.lineIndex,
      totalLines: this.lines.length,
      line,
      display: line ? line.display : '',
      displayIsTarget: !!line && line.display === line.target,
      unitIndex: m ? m.unitIndex : 0,
      typedRomaji: m ? m.typed || '' : '',
      remainingRomaji: m ? m.remaining() : '',
      expected: this._expectedSet(),
      lastWrong: this.lastWrong,
      combo: this.combo,
      maxCombo: this.maxCombo,
      metrics: this.metrics,
      remainingMs: this._remainingMs(),
      running: this._startedAt != null && !this._paused && !this.finished,
      finished: this.finished,
    };
  }

  /** 記録して終了。二重呼び出しでも同じ Summary を返す */
  finish() {
    if (this._summary) return this._summary;
    const met = this.metrics;
    this.finished = true;
    this._stopTimer();

    const keys = met.correct + met.errors;
    const acc = keys > 0 ? met.correct / keys : 1;
    const rec = {
      mode: this.mode,
      lang: this.lang,
      kind: this.kind,
      durationMs: met.elapsedMs,
      keys,
      errors: met.errors,
      acc,
      wpm: met.wpm,
      cpm: met.cpm,
      consistency: met.consistency,
    };
    let reward = null;
    try { reward = finishSession(rec); } catch { reward = null; }

    this._summary = {
      ...met,
      accuracy: acc,
      keys,
      mode: this.mode,
      lang: this.lang,
      kind: this.kind,
      durationMs: met.elapsedMs,
      reward,
      maxCombo: this.maxCombo,
      perLine: this.perLine.slice(),
    };
    if (this.onFinish) this.onFinish(this._summary);
    return this._summary;
  }
}

/** キー入力を session に流し込む。IME を避けるため keydown で拾う */
export function attachInput(session, opts) {
  const o = opts || {};
  const handler = (e) => {
    if (typeof o.onNonInput === 'function' && o.onNonInput(e) === true) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      session.backspace();
      return;
    }
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      session.input(e.key);
    }
    // Escape などは呼び出し側に任せる
  };
  document.addEventListener('keydown', handler, false);

  // --- タッチ端末向け: 隠し textarea に焦点を当てて OS のソフトキーボードを出す。
  // 物理キーボードでは keydown 側で preventDefault するのでここは発火しない。
  const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  let sink = null;
  const onPointerDown = (e) => {
    // ボタンなどの操作対象をタップしたときは焦点を奪わない
    if (e.target && typeof e.target.closest === 'function'
      && e.target.closest('button, a, input, select, textarea, [tabindex]')) return;
    try { sink.focus({ preventScroll: true }); } catch { /* 失敗しても実害なし */ }
  };
  const onSinkInput = () => {
    const v = sink.value;
    sink.value = '';
    for (const ch of v) {
      if (ch === '\n' || ch === '\r') continue;
      session.input(ch);
    }
  };
  if (coarse && typeof document !== 'undefined' && document.body) {
    sink = document.createElement('textarea');
    sink.className = 'key-sink';
    sink.setAttribute('aria-hidden', 'true');
    sink.setAttribute('autocorrect', 'off');
    sink.setAttribute('autocapitalize', 'off');
    sink.autocomplete = 'off';
    sink.spellcheck = false;
    document.body.appendChild(sink);
    sink.addEventListener('input', onSinkInput);
    document.addEventListener('pointerdown', onPointerDown, true);
    try { sink.focus({ preventScroll: true }); } catch { /* 失敗しても実害なし */ }
  }

  return () => {
    document.removeEventListener('keydown', handler, false);
    if (sink) {
      document.removeEventListener('pointerdown', onPointerDown, true);
      sink.removeEventListener('input', onSinkInput);
      sink.remove();
      sink = null;
    }
  };
}

/** ミリ秒を "1:23" 形式にする */
export function formatMs(ms) {
  const total = Math.max(0, Math.round((ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m + ':' + String(s).padStart(2, '0');
}

/** 正確率と速度から★0〜3 を決める。子供モードの評価に使う */
export function gradeOf(metrics) {
  const acc = metrics && Number.isFinite(metrics.accuracy) ? metrics.accuracy : 0;
  const wpm = metrics && Number.isFinite(metrics.wpm) ? metrics.wpm : 0;
  const target = (store.settings && store.settings.targetWpm) || 50;
  let stars = 1;
  if (acc < 0.7) stars = 0;
  else if (acc >= 0.95 && wpm >= target * 0.8) stars = 3;
  else if (acc >= 0.9) stars = 2;
  const labels = ['もういちど', 'クリア', 'じょうず', 'かんぺき'];
  return { stars, label: labels[stars] };
}
