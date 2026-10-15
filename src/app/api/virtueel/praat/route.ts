import { userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { rateLimit } from '@/lib/sse-hub'
import { aanwezig } from '@/lib/virtueel-aanwezig'
import { isRoep, meldGebeurtenis } from '@/lib/virtueel-praat'

export const dynamic = 'force-dynamic'

// Supporterspraat (zie lib/virtueel-praat.ts).
//  POST { roep, aan? } → roep een van de vaste supportersberichten, aan iedereen van je club die in
//                        het stadion is, of aan één supporter die er nu is. Enkel ingelogd, enkel
//                        in je eigen club, hoogstens één bericht per twee seconden. Geen vrije tekst.
// De berichten komen bij de anderen binnen via GET /api/virtueel/aanwezig/stream.

const voornaam = (u: Record<string, unknown>) => {
  const n = typeof u.name === 'string' ? u.name.trim() : ''
  if (n) return n.split(/\s+/)[0].slice(0, 20)
  const e = typeof u.email === 'string' ? u.email.split('@')[0] : ''
  return (e || 'Supporter').slice(0, 20)
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om mee te roepen.' }, { status: 401 })
  const club = userClubId(user)
  if (club == null) return Response.json({ error: 'Geen club.' }, { status: 403 })
  if (!rateLimit(`praat:${user.id}`, 1, 2000) || !rateLimit(`praat-min:${user.id}`, 15, 60_000)) {
    return Response.json({ error: 'Even op adem komen — roep zo opnieuw.' }, { status: 429 })
  }
  let body: { roep?: unknown; aan?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  if (!isRoep(body.roep)) return Response.json({ error: 'Kies een van de supportersberichten.' }, { status: 400 })
  // Aan één supporter: die moet er nu zijn (in je eigen club).
  let aan: { id: string; naam: string } | null = null
  if (body.aan != null) {
    const a = aanwezig(String(club)).find((x) => x.id === String(body.aan) && x.id !== String(user.id))
    if (!a) return Response.json({ error: 'Die supporter is niet (meer) in het stadion.' }, { status: 409 })
    aan = { id: a.id, naam: a.naam }
  }
  const g = meldGebeurtenis(String(club), { soort: 'roep', van: String(user.id), vanNaam: voornaam(user as Record<string, unknown>), roep: body.roep, ...(aan ? { aan: aan.id, aanNaam: aan.naam } : {}) })
  return Response.json({ ok: true, id: g.id }, { status: 201 })
}
