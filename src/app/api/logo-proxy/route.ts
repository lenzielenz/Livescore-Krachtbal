import type { NextRequest } from 'next/server'

// Haalt een (extern) clublogo server-side op en serveert het terug vanaf onze eigen origin. Zo kan
// de deelkaart het logo als data-URL inladen zonder CORS-/taint-problemen (externe logo's hebben
// vaak geen CORS-headers, waardoor een directe fetch in de browser faalt).
export const dynamic = 'force-dynamic'

function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1' || h.endsWith('.local') || h.endsWith('.internal')) return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    if (a === 10 || a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  return false
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url')
  if (!raw) return new Response('missing url', { status: 400 })
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return new Response('bad url', { status: 400 })
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return new Response('bad scheme', { status: 400 })
  if (isBlockedHost(u.hostname)) return new Response('blocked', { status: 400 })

  try {
    const upstream = await fetch(u.href, { redirect: 'follow', signal: AbortSignal.timeout(8000) })
    if (!upstream.ok) return new Response('upstream error', { status: 502 })
    const ct = upstream.headers.get('content-type') ?? 'application/octet-stream'
    if (!ct.startsWith('image/')) return new Response('not an image', { status: 415 })
    const buf = await upstream.arrayBuffer()
    return new Response(buf, {
      status: 200,
      headers: { 'content-type': ct, 'cache-control': 'public, max-age=86400, immutable' },
    })
  } catch {
    return new Response('fetch failed', { status: 502 })
  }
}
