// Service worker: guarda o app (não os dados) para abrir sem internet.
// Os dados offline ficam na cópia local do app; chamadas ao Apps Script nunca passam por cache.
const VERSAO = 'cf-v1.2.1';
const ARQUIVOS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/ui.js', 'js/store.js', 'js/auth.js', 'js/demo.js',
  'js/core/format.js', 'js/core/csv.js', 'js/core/model.js', 'js/core/importer.js', 'js/core/plan.js', 'js/core/receber.js', 'js/core/extrato.js',
  'js/screens/graf.js', 'js/screens/inicio.js', 'js/screens/lancamentos.js', 'js/screens/importar.js',
  'js/screens/orcamento.js', 'js/screens/plano.js', 'js/screens/patrimonio.js', 'js/screens/ajustes.js', 'js/screens/receber.js', 'js/screens/extrato.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com') || url.hostname === 'accounts.google.com') return;
  if (url.origin === location.origin) {
    // Rede primeiro (pega atualizações), cache se estiver offline.
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSAO).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (url.hostname.includes('fonts.g')) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(VERSAO).then(x => x.put(e.request, c)); return res; })));
  }
});
