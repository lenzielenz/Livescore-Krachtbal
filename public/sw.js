// Service worker voor Krachtbal Live — offline app-shell.
// Strategie:
//  - Navigaties (HTML): network-first → cache → /offline. Zo werken eerder bezochte pagina's offline.
//  - Statische assets (_next/static, fonts, afbeeldingen): cache-first (immutable, gehashte namen).
//  - API (/api/*) en externe oorsprong: nooit cachen (dynamisch; de aantekentafel heeft een eigen
//    offline-wachtrij voor mutaties).

const CACHE = 'kb-cache-v3'
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
  //
  // Persoonlijke pagina's (voor een ingelogde bezoeker gerenderd) gaan NIET in de cache, en
  // worden er ook nooit uit geserveerd. Anders gebeurt dit: tijdens een uitrol is de server een
  // halve minuut weg, de fetch mislukt, en je krijgt een oude kopie te zien waarop je uitgelogd
  // staat — terwijl je sessie gewoon nog geldig is. Dat is wat "een update logt me af" bleek te
  // zijn. De server markeert zulke pagina's met een kopje (zie src/middleware.ts); de worker kan
  // de sessiecookie zelf niet lezen, want die is httpOnly.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        try {
          const fresh = await fetch(req)
          if (fresh.headers.get('x-kb-prive') === '1') {
            // Ooit als openbare pagina bewaard, nu persoonlijk: die oude kopie mag niet blijven
            // rondslingeren om straks als "de" pagina geserveerd te worden.
            cache.delete(req).catch(() => {})
          } else {
            cache.put(req, fresh.clone()).catch(() => {})
          }
          return fresh
        } catch {
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

// ── Web push: toon de binnenkomende melding ──────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Krachtbal Live'
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag, // zelfde tag → vervangt een vorige melding i.p.v. te stapelen
    renotify: Boolean(data.tag),
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// Tik op de melding → bestaand tabblad focussen, anders een nieuw openen op de doel-URL.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if (client.url.includes(target) && 'focus' in client) return client.focus()
      }
      if (all[0] && 'focus' in all[0]) {
        await all[0].focus()
        if ('navigate' in all[0]) return all[0].navigate(target).catch(() => {})
        return
      }
      return self.clients.openWindow(target)
    })(),
  )
})
