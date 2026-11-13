import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { magFactuurZien, onlineBetalen } from '@/lib/facturatie-server'
import { basisUrl } from '@/lib/oauth'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'

// Een factuur online betalen (Mollie): geeft de link naar de betaalpagina. Enkel de staf van de club (of de
// federatie). De betaling komt binnen via de webhook (/api/facturen/mollie), nooit via deze route.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`factuur-online:${clientIp(req)}`, 10, 60_000)) return Response.json({ error: 'Even geduld.' }, { status: 429 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const id = Number((await params).id)
  const f = Number.isSafeInteger(id) ? await payload.findByID({ collection: 'facturen', id, depth: 0, overrideAccess: true }).catch(() => null) : null
  const club = userClubId(user)
  if (!f || !magFactuurZien(user, f as never, isFederationLevel(user), club != null ? Number(club) : null, hasRole(user, 'club-beheerder', 'club-medewerker'))) {
    return Response.json({ error: 'Factuur niet gevonden.' }, { status: 404 })
  }
  const r = await onlineBetalen(payload, id, basisUrl(req))
  return r.ok ? Response.json({ ok: true, url: r.url }) : Response.json({ error: r.error }, { status: r.status })
}
