import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Same-origin proxy voor een externe afbeelding (logo-URL), zodat de admin er in de browser de
// pixels van kan uitlezen (clubkleuren afleiden) zonder canvas-CORS-taint. Enkel voor federatie/
// admin (zij beheren clubs), enkel http(s), enkel afbeeldingen, met een grootte- en tijdslimiet.
const MAX_BYTES = 6 * 1024 * 1024

export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!isFederationLevel(user)) {
    return new Response('Geen toegang.', { status: user ? 403 : 401 })
  }

  const raw = new URL(req.url).searchParams.get('url') ?? ''
  let target: URL
  try {
    target = new URL(raw)
  } catch {
    return new Response('Ongeldige URL.', { status: 400 })
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return new Response('Enkel http(s).', { status: 400 })
  }
  // Eenvoudige SSRF-rem: geen localhost/interne hosts.
  const host = target.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local') || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
    return new Response('Interne host niet toegelaten.', { status: 400 })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(target.toString(), { signal: controller.signal, redirect: 'follow' })
    if (!res.ok) return new Response('Afbeelding niet gevonden.', { status: 502 })
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return new Response('Geen afbeelding.', { status: 415 })
    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) return new Response('Afbeelding te groot.', { status: 413 })
    return new Response(buf, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch {
    return new Response('Ophalen mislukt.', { status: 502 })
  } finally {
    clearTimeout(timeout)
  }
}
