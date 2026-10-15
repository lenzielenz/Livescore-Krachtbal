import { userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { rateLimit } from '@/lib/sse-hub'
import { leesKledij, leesPlek, meld, vertrek } from '@/lib/virtueel-aanwezig'

export const dynamic = 'force-dynamic'

// Samen in het virtuele stadion (zie lib/virtueel-aanwezig.ts).
//  POST   { plek, outfit }  → "hier ben ik" (enkel ingelogd, in het stadion van je EIGEN club,
//                             hoogstens een paar keer per seconde).
//  DELETE                   → "ik ben weg" (bij het sluiten van de pagina).
// De lijst zelf komt via de stream: GET /api/virtueel/aanwezig/stream.

const voornaam = (u: Record<string, unknown>) => {
  const n = typeof u.name === 'string' ? u.name.trim() : ''
  if (n) return n.split(/\s+/)[0].slice(0, 20)
  const e = typeof u.email === 'string' ? u.email.split('@')[0] : ''
  return (e || 'Supporter').slice(0, 20)
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const club = userClubId(user)
  if (club == null) return Response.json({ error: 'Geen club.' }, { status: 403 })
  if (!rateLimit(`aanwezig:${user.id}`, 8, 2000)) return Response.json({ ok: false }, { status: 429 })
  let body: { plek?: unknown; outfit?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  const plek = leesPlek(body.plek)
  if (!plek) return Response.json({ error: 'Ongeldige plek.' }, { status: 400 })
  meld(String(club), { id: String(user.id), naam: voornaam(user as Record<string, unknown>), outfit: leesKledij(body.outfit) }, plek)
  return Response.json({ ok: true })
}

export async function DELETE(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ ok: true })
  const club = userClubId(user)
  if (club != null) vertrek(String(club), String(user.id))
  return Response.json({ ok: true })
}
