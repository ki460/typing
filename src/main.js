/**
 * main.js — エントリポイント。
 * 保存データを読み、テーマを適用し、シェル(ルーター)を起動する。
 */
import { store } from './core/store.js';
import { startApp } from './ui/shell.js';

store.load();

// 設定に応じた初期テーマ・文字サイズを先に当てて、ちらつきを防ぐ
const html = document.documentElement;
html.style.setProperty('--scale', String(store.settings.fontScale || 1));
if (store.settings.reduceMotion) html.dataset.motion = 'off';

startApp(document.getElementById('app'));

// オフラインでも使えるようにする(HTTPS / localhost のときだけ登録)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 任意機能なので失敗は無視 */ });
  });
}
