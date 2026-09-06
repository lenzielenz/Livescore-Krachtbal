// Service worker voor Krachtbal Live — offline app-shell.
// Strategie:
//  - Navigaties (HTML): network-first → cache → /offline. Zo werken eerder bezochte pagina's offline.
//  - Statische assets (_next/static, fonts, afbeeldingen): cache-first (immutable, gehashte namen).
//  - API (/api/*) en externe oorsprong: nooit cachen (dynamisch; de aantekentafel heeft een eigen
//    offline-wachtrij voor mutaties).

// v4: de vorige versie kon een bewaarde ÓPENBARE kopie tonen aan iemand die intussen ingelogd
// was — dan sta je na een uitrol plots op een scherm met "Inloggen". Het versienummer ophogen
// gooit die oude kopieën in één keer weg.
//
// v5 (2026-09-06): kantine- en tornooischermen kregen die behandeling ten onrechte óók. Wie zijn
// scherm instelt op de kantine-tv, doet dat ingelogd, dus die tv droeg een sessie — en dus werd
// de schermpagina nooit bewaard én bij een uitrol vervangen door de offline-pagina. Voor een tv
// aan de muur die niemand bedient is dat het verschil tussen "de stand hangt er" en "er hangt
// een foutmelding". Zulke pagina's zijn openbaar (de feed hangt aan een id in de URL, niet aan
// een sessie) en horen gewoon bewaard te worden.
const CACHE = 'kb-cache-v5'
const OFFLINE_URL = '/offline'
const PRECACHE = ['/', OFFLINE_URL, '/manifest.webmanifest', '/icon.svg']
// Hier onthoudt de worker of deze bezoeker ingelogd is. Niet uit nieuwsgierigheid: de
// sessiecookie is httpOnly en dus onleesbaar voor de worker, terwijl hij die kennis wél nodig
// heeft om te weten of een bewaarde kopie nog klopt. De server zegt het bij elke paginalading
// met een kopje (zie src/middleware.ts); hier blijft het antwoord staan tot het volgende bezoek.
const SESSIE_SLEUTEL = '/__kb-sessie'

// Schermpagina's: een tv aan de muur, nooit iets persoonlijks. Spiegelt `isSchermPagina` in
// src/lib/prive-pagina.ts — wijzig je de ene, wijzig dan de andere (schermpagina.unit.spec.ts
// bewaakt dat ze gelijk blijven).
function isSchermPagina(pathname) {
  if (pathname === '/kantine/scherm' || pathname.startsWith('/kantine/scherm/')) return true
  if (pathname.startsWith('/kantine/club/')) return true
  if (/^\/tornooi\/[^/]+\/kantine\/?$/.test(pathname)) return true
  if (/^\/tornooi\/groep\/[^/]+\/kantine\/?$/.test(pathname)) return true
  if (pathname === '/cast-tv' || pathname.startsWith('/cast-tv/')) return true
  return false
}

async function onthoudSessie(cache, ingelogd) {
  await cache.put(SESSIE_SLEUTEL, new Response(ingelogd ? '1' : '0')).catch(() => {})
}

async function wasIngelogd(cache) {
  const r = await cache.match(SESSIE_SLEUTEL).catch(() => null)
  if (!r) return false
  return (await r.text().catch(() => '')) === '1'
}

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
          const prive = fresh.headers.get('x-kb-prive') === '1'
          // Elke paginalading vertelt opnieuw of deze bezoeker een sessie heeft. Zo weet de
          // worker het ook straks nog, wanneer de server even weg is.
          onthoudSessie(cache, prive).catch(() => {})
          if (prive && !isSchermPagina(url.pathname)) {
            // Ooit als openbare pagina bewaard, nu persoonlijk: die oude kopie mag niet blijven
            // rondslingeren om straks als "de" pagina geserveerd te worden.
            cache.delete(req).catch(() => {})
          } else {
            cache.put(req, fresh.clone()).catch(() => {})
          }
          return fresh
        } catch {
          // De server is even weg (een uitrol duurt een halve minuut). Voor een ingelogde
          // bezoeker is een bewaarde kopie hier altijd een ópenbare kopie — met "Inloggen"
          // erop. Die tonen is de fout die "een update logt me af" heet: je sessie is nog
          // perfect geldig, maar het scherm zegt iets anders. Dan liever eerlijk zijn.
          // Een schermpagina is openbaar: de bewaarde kopie hoort bij niemand in het
          // bijzonder, dus die mag hier wél getoond worden. Dat is precies het geval waar het
          // om draait — de tv in de kantine moet een uitrol doorstaan zonder dat iemand er
          // naartoe loopt.
          if ((await wasIngelogd(cache)) && !isSchermPagina(url.pathname)) {
            return (await cache.match(OFFLINE_URL)) || Response.error()
          }
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
