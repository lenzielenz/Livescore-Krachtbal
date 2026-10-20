import { userClubId, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { inschrijvingOpslaan, type InschrijvingInvoer } from '@/lib/inschrijving'
import { getPayloadClient } from '@/lib/payload-client'

// De club bewaart of dient haar inschrijving in (vanuit /club/inschrijving). Zie lib/inschrijving.ts.
//   POST { ronde, ploegen[], aantalVelden, onbeschikbaar[], wensen, indienen, club? (enkel federatie) }
export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as (InschrijvingInvoer & { ronde?: unknown; club?: unknown; indienen?: unknown }) | null
  if (!body) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  const club = isFederationLevel(user) && body.club != null ? Number(body.club) : Number(userClubId(user))
  const ronde = Number(body.ronde)
  if (!Number.isFinite(club) || !Number.isFinite(ronde)) return Response.json({ error: 'Club of ronde ontbreekt.' }, { status: 400 })
  try {
    const r = await inschrijvingOpslaan(payload, user, ronde, club, body, body.indienen === true)
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
