/**
 * audio.js — 効果音。外部アセットを一切使わず WebAudio で合成する。
 * AudioContext は init() が最初に呼ばれたとき(＝ユーザー操作の中)で生成し、
 * 自動再生ポリシーを回避する。init() 前の呼び出しは黙って何もしない。
 * store.settings.sound が false か sfx.enabled が false なら全メソッド no-op。
 * 音源は OscillatorNode + GainNode のみ。1 音は 120ms 以内で必ず stop() する。
 */
import { store } from './store.js';

// マスター音量は控えめに固定する(職場や子供の耳を考えて上げない)
const MASTER_GAIN = 0.22;
// 連打で音が割れないよう、key() の同時発音数はここまで
const KEY_VOICE_MAX = 8;
// ペンタトニック(C D E G A)の半音オフセット
const PENTATONIC = [0, 2, 4, 7, 9];
const C5 = 523.25;

let ctx = null;
let master = null;
let userEnabled = true;
let keyVoices = 0;

/** 半音差から周波数を求める */
function hz(base, semitones) {
  return base * Math.pow(2, semitones / 12);
}

/** 実際に鳴らせる状態か。init() 前・設定オフ・非対応ブラウザでは false */
function live() {
  return Boolean(ctx && master) && userEnabled && store.settings.sound !== false;
}

/** タブ復帰などで suspended に落ちていたら黙って起こす */
function ensureRunning() {
  try {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  } catch { /* 再開できなくても鳴らないだけ */ }
}

/**
 * 1 音を鳴らす。dur は秒(最大 0.12)。delay で同一グループ内の発音位置をずらす。
 * freqTo を渡すと dur をかけてその周波数へ滑らせる。
 */
function tone({ freq, type = 'sine', dur = 0.08, gain = 0.05, delay = 0, freqTo = null, onDone = null }) {
  if (!live()) return false;
  try {
    const d = Math.min(0.12, Math.max(0.01, dur));
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (freqTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + d);
    // 立ち上がりを 4ms 取ってプチッというクリックノイズを避ける
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0005, gain), t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(g);
    g.connect(master);
    osc.onended = () => {
      try { osc.disconnect(); g.disconnect(); } catch { /* 解放済み */ }
      if (onDone) onDone();
    };
    osc.start(t0);
    osc.stop(t0 + d + 0.01);
    return true;
  } catch {
    if (onDone) onDone();
    return false;
  }
}

/** 複数音をまとめて鳴らす(和音・アルペジオ用) */
function chord(notes) {
  if (!live()) return;
  ensureRunning();
  for (const n of notes) tone(n);
}

export const sfx = {
  /** 鳴る状態かどうか。設定の sound が false なら常に false */
  get enabled() { return userEnabled && store.settings.sound !== false; },
  set enabled(v) { userEnabled = Boolean(v); },

  /** 初回のユーザー操作から呼ぶ。2 回目以降は resume() だけ行う */
  init() {
    try {
      if (ctx) { ensureRunning(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;                       // 非対応ブラウザでは無音のまま動かす
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
      ensureRunning();
    } catch {
      ctx = null;
      master = null;
    }
  },

  /** 打鍵。ごく短いクリック */
  key() {
    if (!live() || keyVoices >= KEY_VOICE_MAX) return;
    ensureRunning();
    keyVoices += 1;
    const started = tone({
      freq: 1650, type: 'triangle', dur: 0.025, gain: 0.04,
      freqTo: 1200, onDone: () => { keyVoices = Math.max(0, keyVoices - 1); },
    });
    if (!started) keyVoices = Math.max(0, keyVoices - 1);
  },

  /** ミス。低く濁った 2 音(短 2 度) */
  error() {
    chord([
      { freq: 146.8, type: 'square', dur: 0.11, gain: 0.05 },
      { freq: 155.6, type: 'square', dur: 0.11, gain: 0.045 },
    ]);
  },

  /** コンボ上昇。n が増えるほどペンタトニックを上がり、上限でオクターブ上に折り返す */
  combo(n) {
    const i = Math.max(1, Math.floor(n || 1)) - 1;
    const step = i % PENTATONIC.length;
    const oct = Math.floor(i / PENTATONIC.length) % 3;   // 3 オクターブで一周
    chord([{ freq: hz(C5, PENTATONIC[step] + oct * 12), type: 'triangle', dur: 0.09, gain: 0.06 }]);
  },

  /** レベルアップ。上昇アルペジオ 4 音 */
  levelUp() {
    chord([0, 4, 7, 12].map((s, i) => ({
      freq: hz(C5, s), type: 'triangle', dur: 0.1, gain: 0.07, delay: i * 0.075,
    })));
  },

  /** クリア。明るい 3 和音 */
  clear() {
    chord([0, 4, 7].map((s, i) => ({
      freq: hz(C5, s), type: 'sine', dur: 0.11, gain: 0.07, delay: i * 0.012,
    })));
  },

  /** ★獲得。きらっとした高音 1 音 */
  star() {
    chord([{ freq: hz(C5, 24), type: 'sine', dur: 0.1, gain: 0.06, freqTo: hz(C5, 31) }]);
  },

  /** ふ化。ぽんと低め→高めへ滑る */
  hatch() {
    chord([{ freq: 220, type: 'triangle', dur: 0.11, gain: 0.08, freqTo: 660 }]);
  },

  /** 時報。ごく短い点音 */
  tick() {
    chord([{ freq: 1050, type: 'square', dur: 0.02, gain: 0.035 }]);
  },
};
