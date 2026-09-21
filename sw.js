/**
 * sw.js — オフライン用サービスワーカー。
 * install で本体ファイルを個別にキャッシュし(欠けたファイルがあっても失敗しない)、
 * activate で旧バージョンのキャッシュを捨てる。
 * fetch は same-origin の GET のみ network-first で扱い、失敗したらキャッシュ、
 * それも無ければ index.html を返す(SPA なのでハッシュ経路はすべて index.html)。
 */
const VERSION = 'kaede-typing-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/icon.svg',
  './assets/css/base.css',
  './assets/css/shell.css',
  './assets/css/keyboard.css',
  './assets/css/adult.css',
  './assets/css/kids.css',
  './assets/css/stats.css',
  './src/main.js',
  './src/core/romaji.js',
  './src/core/store.js',
  './src/core/curriculum.js',
  './src/core/generator.js',
  './src/core/engine.js',
  './src/core/keyboard.js',
  './src/core/audio.js',
  './src/data/layouts.js',
  './src/data/content.js',
  './src/data/ja.js',
  './src/data/en.js',
  './src/data/code.js',
  './src/ui/shell.js',
  './src/ui/adult.js',
  './src/ui/kids.js',
  './src/ui/stats.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // addAll は1つでも 404 だと全部巻き戻るので、個別に add して結果を無視する
    await Promise.allSettled(ASSETS.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      // 正常応答だけ保存する(opaque や 404 は残さない)
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const shell = await caches.match('./index.html');
      if (shell) return shell;
      return new Response('オフラインです', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
