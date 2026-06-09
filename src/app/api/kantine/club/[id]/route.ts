import type { Payload, Where } from 'payload'

import { competitionWhere } from '@/lib/analyse-access'
import { brusselsDayBoundsUtc, dateStrBE, formatTimeBE } from '@/lib/datetime'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'

export const dynamic = 'force-dynamic'

// Openbaar, vaste kantine-feed voor één club: toont AL hun wedstrijden van vandaag (+ alles wat
// live is), dynamisch. De link is stabiel (clubId) en blijft heel het seizoen geldig — de inhoud
// beweegt mee (de ene week 6 matchen, de andere 4). Geen login nodig (enkel-lezen, publiek scherm).
const reeksLabel = (v: unknown) => REEKS_OPTIONS.find((o) => o.value === v)?.label ?? (typeof v === 'string' ? v : 'Overig')

async function clubTeamIds(payload: Payload, clubId: number): Promise<number[]> {
  const res = await payload.find({ collection: 'teams', where: { and: [{ club: { equals: clubId } }, competitionWhere()] }, depth: 0, limit: 300 }).catch(() => null)
  return (res?.docs ?? []).map((t) => Number(t.id)).filter((n) => Number.isFinite(n))
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const clubId = Number(id)
  if (!Number.isFinite(clubId)) return Response.json({ error: 'Ongeldig id' }, { status: 400 })
  try {
    const payload = await getPayloadClient()
    const teamIds = await clubTeamIds(payload, clubId)
    if (teamIds.length === 0) return Response.json({ matches: [] })

    const { start, end } = brusselsDayBoundsUtc(dateStrBE())
    const teamFilter: Where = { or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] }
    const notHidden: Where[] = [{ isDemo: { not_equals: true } }, { analyseOnly: { not_equals: true } }]
    const [dayRes, liveRes] = await Promise.all([
      payload.find({
        collection: 'matches',
        where: { and: [teamFilter, { date: { greater_than_equal: start, less_than: end } }, ...notHidden] },
        sort: 'date',
        depth: 0,
        limit: 100,
      }),
      payload.find({
        collection: 'matches',
        where: { and: [teamFilter, { status: { equals: 'live' } }, ...notHidden] },
        depth: 0,
        limit: 50,
      }),
    ])

    const seen = new Set<number>()
    const docs = [...liveRes.docs, ...dayRes.docs].filter((m) => {
      if (seen.has(m.id)) return false
      seen.add(m.id)
      return true
    })

    const matches = []
    for (const m of docs) {
      try {
        const s = await buildMatchState(payload, m.id)
        matches.push({
          id: m.id,
          reeks: reeksLabel(m.reeks),
          time: formatTimeBE(m.date as string),
          status: s.match.status,
          home: { name: s.teams.home.name, logoUrl: s.teams.home.logoUrl, logoFit: s.teams.home.logoFit, colors: s.teams.home.colors },
          away: { name: s.teams.away.name, logoUrl: s.teams.away.logoUrl, logoFit: s.teams.away.logoFit, colors: s.teams.away.colors },
          score: s.score,
        })
      } catch {
        // ontbrekende ploeg → overslaan
      }
    }
    return Response.json({ matches })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
