// Service worker voor Krachtbal Live — offline app-shell.
// Strategie:
//  - Navigaties (HTML): network-first → cache → /offline. Zo werken eerder bezochte pagina's offline.
//  - Statische assets (_next/static, fonts, afbeeldingen): cache-first (immutable, gehashte namen).
//  - API (/api/*) en externe oorsprong: nooit cachen (dynamisch; de aantekentafel heeft een eigen
//    offline-wachtrij voor mutaties).

const CACHE = 'kb-cache-v1'
const OFFLINE_URL = '/offline'
const PRECACHE = ['/', OFFLINE_URL, '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      await cache.addAll(PRECACHE).catch(() => {})
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return // mutaties nooit cachen
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // externe (bv. open-meteo) ongemoeid laten
  if (url.pathname.startsWith('/api/')) return // dynamische API + SSE: nooit cachen
  if (url.pathname.startsWith('/admin')) return // Payload-admin: door de browser laten afhandelen

  // Navigaties: vers proberen, anders uit de cache, anders de offline-pagina.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req)
          const cache = await caches.open(CACHE)
          cache.put(req, fresh.clone()).catch(() => {})
          return fresh
        } catch {
          const cache = await caches.open(CACHE)
          return (await cache.match(req)) || (await cache.match(OFFLINE_URL)) || Response.error()
        }
      })(),
    )
    return
  }

  // Statische assets: cache-first.
  const isStatic =
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:js|css|woff2?|ttf|png|jpe?g|svg|webp|gif|ico)$/.test(url.pathname)
  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const cached = await cache.match(req)
        if (cached) return cached
        try {
          const fresh = await fetch(req)
          cache.put(req, fresh.clone()).catch(() => {})
          return fresh
        } catch {
          return cached || Response.error()
        }
      })(),
    )
    return
  }

  // Overige GET's: netwerk met cache-fallback.
  event.respondWith(fetch(req).catch(() => caches.match(req)))
})
