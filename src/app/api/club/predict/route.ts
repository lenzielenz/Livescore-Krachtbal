import { authUser, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

type PredEntry = { userId: number; name: string; clubId: number | null; home: number; away: number; at: number }

// Eén score-voorspelling van een clublid wegschrijven (upsert per persoon). Enkel vóór de aftrap
// (status 'scheduled') en enkel voor wedstrijden van de eigen club.
export async function POST(req: Request) {
  const ip = clientIp(req)
  if (!rateLimit(`predict:${ip}`, Number(process.env.PREDICT_MAX_PER_SEC) || 10, 1000)) {
    return Response.json({ error: 'Te veel verzoeken.' }, { status: 429 })
  }

  let body: { matchId?: number; home?: number; away?: number }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  const matchId = Number(body.matchId)
  const home = Math.round(Number(body.home))
  const away = Math.round(Number(body.away))
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 199 || away > 199) {
    return Response.json({ error: 'Geef een geldige uitslag (0–199).' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    const rawClub = userClubId(user)
    const clubId = rawClub != null && Number.isFinite(Number(rawClub)) ? Number(rawClub) : null
    if (clubId == null) return Response.json({ error: 'Je account is niet aan een club gekoppeld.' }, { status: 403 })

    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
    if (!match || match.analyseOnly || (match as { isDemo?: boolean }).isDemo) {
      return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
    }
    if (match.status !== 'scheduled') {
      return Response.json({ error: 'Voorspellen kan enkel vóór de aftrap.' }, { status: 409 })
    }
    // De wedstrijd moet in een reeks zitten waar de club in speelt (eigen club- of reeksmatchen).
    const teamsRes = await payload
      .find({ collection: 'teams', where: { club: { equals: clubId } }, depth: 0, limit: 200 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const clubReeksen = new Set(teamsRes.docs.map((t) => String((t as { reeks?: unknown }).reeks ?? '')).filter(Boolean))
    if (!clubReeksen.has(String((match as { reeks?: unknown }).reeks ?? ''))) {
      return Response.json({ error: 'Deze wedstrijd hoort niet bij een reeks van jouw club.' }, { status: 403 })
    }

    const userId = Number((user as { id: number }).id)
    const name = String((user as { name?: string; email?: string }).name || (user as { email?: string }).email || 'Lid')
    const existing = Array.isArray(match.scorePredictions) ? (match.scorePredictions as PredEntry[]) : []
    const next = existing.filter((p) => Number(p?.userId) !== userId)
    next.push({ userId, name, clubId, home, away, at: Date.now() })

    await payload.update({ collection: 'matches', id: matchId, data: { scorePredictions: next }, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
