import { userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

// Een clublid "claimt" (of geeft vrij) een wedstrijd als verantwoordelijke voor zíjn kant
// (thuis of bezoek). Zo ziet de hele club wie welke wedstrijd waar doet.
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
  const release = body.release === true

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

    const field = side === 'home' ? 'homeCoach' : 'awayCoach'
    await payload.update({
      collection: 'matches',
      id: matchId,
      data: { [field]: release ? null : user.id },
      overrideAccess: true,
    })
    return Response.json({ ok: true, side, coachId: release ? null : user.id })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
