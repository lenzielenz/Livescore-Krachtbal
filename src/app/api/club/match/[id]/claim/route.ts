import { userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

// Een clublid beheert wie verantwoordelijk is voor zíjn kant (thuis/bezoek) van een wedstrijd.
// Acties:
//   - claim   : neem een nog vrije wedstrijd (zet jezelf als verantwoordelijke)
//   - release : geef je eigen claim vrij
//   - request : vraag om de claim van iemand anders over te nemen (beleefde aanvraag)
//   - approve : (huidige verantwoordelijke) keur de overname-aanvraag goed → de aanvrager neemt over
//   - deny    : (huidige verantwoordelijke) weiger de aanvraag
//   - cancel  : (aanvrager) trek je eigen aanvraag in
// Backwards compatible: { release: true } blijft werken als de actie 'release'.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldig match-id' }, { status: 400 })

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    /* lege body = claimen */
  }
  const action: string = body.release === true ? 'release' : typeof body.action === 'string' ? body.action : 'claim'

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    const clubId = userClubId(user)
    if (clubId == null) return Response.json({ error: 'Je account is niet aan een club gekoppeld.' }, { status: 403 })

    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
    if (!match) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })

    const homeClub = rel((match.homeTeam as { club?: unknown } | null)?.club)
    const awayClub = rel((match.awayTeam as { club?: unknown } | null)?.club)
    const side = Number(homeClub) === Number(clubId) ? 'home' : Number(awayClub) === Number(clubId) ? 'away' : null
    if (!side) return Response.json({ error: 'Deze wedstrijd hoort niet bij jouw club.' }, { status: 403 })

    const coachField = side === 'home' ? 'homeCoach' : 'awayCoach'
    const takeoverField = side === 'home' ? 'homeTakeover' : 'awayTakeover'
    const me = Number(user.id)
    const coachId = rel(match[coachField as keyof typeof match])
    const takeoverId = rel(match[takeoverField as keyof typeof match])

    let data: Record<string, unknown>
    switch (action) {
      case 'release':
        // Vrijgeven: ook een openstaande aanvraag mee wissen.
        data = { [coachField]: null, [takeoverField]: null }
        break
      case 'claim':
        if (coachId != null && coachId !== me) {
          return Response.json({ error: 'Al geclaimd — vraag om over te nemen.' }, { status: 409 })
        }
        data = { [coachField]: me, [takeoverField]: null }
        break
      case 'request':
        if (coachId == null) {
          // Niemand claimde het → gewoon meteen claimen.
          data = { [coachField]: me, [takeoverField]: null }
        } else if (coachId === me) {
          return Response.json({ error: 'Je hebt deze al.' }, { status: 409 })
        } else {
          data = { [takeoverField]: me }
        }
        break
      case 'approve':
        if (coachId !== me) return Response.json({ error: 'Enkel de huidige verantwoordelijke kan dit goedkeuren.' }, { status: 403 })
        if (takeoverId == null) return Response.json({ error: 'Geen openstaande aanvraag.' }, { status: 409 })
        data = { [coachField]: takeoverId, [takeoverField]: null }
        break
      case 'deny':
        if (coachId !== me) return Response.json({ error: 'Enkel de huidige verantwoordelijke kan dit weigeren.' }, { status: 403 })
        data = { [takeoverField]: null }
        break
      case 'cancel':
        if (takeoverId !== me) return Response.json({ error: 'Geen eigen aanvraag om in te trekken.' }, { status: 409 })
        data = { [takeoverField]: null }
        break
      default:
        return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
    }

    await payload.update({ collection: 'matches', id: matchId, data, overrideAccess: true })
    return Response.json({ ok: true, side })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
