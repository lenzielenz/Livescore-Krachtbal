// Gedeelde SSE-infrastructuur (AUDIT-2026-06.md §2/§6).
//
// PROBLEEM dat dit oplost: vroeger draaide ELKE verbinding z'n eigen setInterval die de DB
// pollde (buildMatchState + buildTimeline ≈ 15 queries / 1.5 s). Met N kijkers werd dat
// N×15 queries/1.5 s — een finale met duizenden telefoons legde de Postgres-pool plat.
//
// OPLOSSING: één gedeelde poller per sleutel (bv. "match:42"), die naar alle abonnees fan-out.
// Dat klapt de DB-kost terug naar 15 queries/1.5 s per wedstrijd, ongeacht het publiek.
// Voor échte multi-instance schaal hoort dit later achter Redis pub/sub te zitten.

type Frame = { id: number; data: unknown }
type Sub = (frame: Frame) => void

type Hub = {
  subs: Set<Sub>
  last: string
  lastId: number
  timer: ReturnType<typeof setInterval> | null
  poll: () => Promise<unknown>
}

const hubs = new Map<string, Hub>()

async function tick(key: string) {
  const h = hubs.get(key)
  if (!h) return
  let data: unknown
  try {
    data = await h.poll()
  } catch {
    // Transiënte DB-fout of (tijdelijk) verdwenen wedstrijd → deze tick overslaan, niet crashen.
    return
  }
  const s = JSON.stringify(data)
  if (s === h.last) return
  h.last = s
  h.lastId += 1
  const frame: Frame = { id: h.lastId, data }
  for (const cb of h.subs) {
    try {
      cb(frame)
    } catch {
      /* een kapotte subscriber mag de andere niet breken */
    }
  }
}

/**
 * Abonneer op de gedeelde stream voor `key`. Start de poller als die nog niet loopt en stuurt
 * meteen de laatst bekende frame (zodat een nieuwe/herverbonden client niet 1.5 s in het duister zit).
 * Retourneert een unsubscribe-functie die de poller stopt zodra de laatste abonnee weg is.
 */
export function subscribe(
  key: string,
  poll: () => Promise<unknown>,
  cb: Sub,
  intervalMs = 1500,
): () => void {
  let h = hubs.get(key)
  if (!h) {
    h = { subs: new Set(), last: '', lastId: 0, timer: null, poll }
    hubs.set(key, h)
    h.timer = setInterval(() => void tick(key), intervalMs)
    void tick(key) // directe eerste poll
  }
  h.subs.add(cb)
  if (h.last) cb({ id: h.lastId, data: JSON.parse(h.last) })

  return () => {
    const hub = hubs.get(key)
    if (!hub) return
    hub.subs.delete(cb)
    if (hub.subs.size === 0) {
      if (hub.timer) clearInterval(hub.timer)
      hubs.delete(key)
    }
  }
}

// ── Per-IP verbindingslimiet (DoS-rem; voorkomt dat één client duizenden streams opent) ──

const perIp = new Map<string, number>()
const MAX_CONNECTIONS_PER_IP = 12

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'onbekend'
}

/** Probeer een verbindingsslot te claimen; false = limiet bereikt (→ 429). */
export function acquireConnection(ip: string): boolean {
  const n = perIp.get(ip) ?? 0
  if (n >= MAX_CONNECTIONS_PER_IP) return false
  perIp.set(ip, n + 1)
  return true
}

export function releaseConnection(ip: string): void {
  const n = perIp.get(ip) ?? 1
  if (n <= 1) perIp.delete(ip)
  else perIp.set(ip, n - 1)
}

// ── Eenvoudige per-sleutel fixed-window rate limit (anti-misbruik op publieke endpoints) ──

const buckets = new Map<string, { count: number; reset: number }>()

/** True = toegestaan, false = limiet bereikt. `key` is meestal "react:<ip>". */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || now > b.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  if (b.count >= max) return false
  b.count += 1
  return true
}

/** Headers die SSE betrouwbaar door Railway/Cloudflare/nginx krijgen (geen buffering). */
export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Cruciaal: zonder dit bufferen reverse-proxies de stream en komen scores in bursts aan
  // (werkt lokaal, faalt in prod). Zie AUDIT §6.
  'X-Accel-Buffering': 'no',
} as const
