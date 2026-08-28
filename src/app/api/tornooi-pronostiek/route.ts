import { authUser, userClubId } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

type PredEntry = { userId: number; name: string; clubId: number | null; home: number; away: number; at: number }
type MatchDoc = {
  id: number
  status?: string
  home?: string | null
  away?: string | null
  scorePredictions?: PredEntry[] | null
  tournament?: number | { id: number; groep?: string | null }
}

// Pronostiek op een tornooiwedstrijd — bewust supersimpel: uitslag tikken, klaar.
// Zelfde spelregels als de competitie waar het kan: eenmaal doorgegeven staat de voorspelling
// vast, en voorspellen kan enkel vóór de start (tornooimatchen zijn kort — live bijsturen zou
// te makkelijk zijn). Geen weekendlimiet of boosters: dagplezier.
export async function POST(req: Request) {
  const ip = clientIp(req)
  if (!rateLimit(`tprono:${ip}`, 10, 1000)) return Response.json({ error: 'Te veel verzoeken.' }, { status: 429 })

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
    if (!user) return Response.json({ error: 'Log in om mee te spelen.' }, { status: 401 })

    const m = (await payload.findByID({ collection: 'tournament-matches', id: matchId, depth: 0 }).catch(() => null)) as MatchDoc | null
    if (!m || !m.home || !m.away) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
    if (m.status !== 'pending') {
      return Response.json({ error: 'De wedstrijd is al gestart — voorspellen kan niet meer.' }, { status: 409 })
    }

    const userId = Number((user as { id: number }).id)
    const name = String((user as { name?: string; email?: string }).name || (user as { email?: string }).email || 'Supporter')
    const rawClub = userClubId(user)
    const clubId = rawClub != null && Number.isFinite(Number(rawClub)) ? Number(rawClub) : null
    const existing = Array.isArray(m.scorePredictions) ? m.scorePredictions : []
    if (existing.some((p) => Number(p?.userId) === userId)) {
      return Response.json({ error: 'Je hebt al voorspeld voor deze wedstrijd — dat staat vast.' }, { status: 409 })
    }
    const next = [...existing, { userId, name, clubId, home, away, at: Date.now() }]
    await payload.update({ collection: 'tournament-matches', id: matchId, data: { scorePredictions: next }, overrideAccess: true })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

// Eigen voorspellingen van de ingelogde supporter voor een tornooidag (of één tornooi):
// { picks: { [matchId]: { home, away } } }. Andermans tips lekken we nooit vóór de aftrap.
export async function GET(req: Request) {
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    const url = new URL(req.url)
    const groep = url.searchParams.get('groep')?.trim() ?? ''
    const tournament = Number(url.searchParams.get('tournament'))
    let ids: number[] = []
    if (groep) {
      const t = await payload.find({ collection: 'tournaments', where: { groep: { equals: groep } }, depth: 0, limit: 50 })
      ids = t.docs.map((x) => Number((x as { id: number }).id))
    } else if (Number.isFinite(tournament)) {
      ids = [tournament]
    }
    if (ids.length === 0) return Response.json({ picks: {} })
    const res = await payload.find({
      collection: 'tournament-matches',
      where: { tournament: { in: ids } },
      depth: 0,
      limit: 500,
    })
    const userId = Number((user as { id: number }).id)
    const picks: Record<number, { home: number; away: number }> = {}
    for (const d of res.docs as MatchDoc[]) {
      const eigen = (Array.isArray(d.scorePredictions) ? d.scorePredictions : []).find((p) => Number(p?.userId) === userId)
      if (eigen) picks[d.id] = { home: Number(eigen.home), away: Number(eigen.away) }
    }
    return Response.json({ picks })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
