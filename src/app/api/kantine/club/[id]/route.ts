import type { Payload, Where } from 'payload'

import { competitionWhere } from '@/lib/analyse-access'
import { loadAds } from '@/lib/ads'
import { bouwKantineBorden } from '@/lib/kantine-borden'
import { schermVenster, sorteerSchermWedstrijden } from '@/lib/kantine-selectie'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// Openbaar, vaste kantine-feed voor één club: toont AL hun wedstrijden van vandaag (+ alles wat
// live is) tot een week vooruit, plus gisterens eindstand zolang er nog niets nieuws is (zelfde
// venster als het persoonlijke kantinescherm, zie kantine-selectie.ts). De link is stabiel
// (clubId) en blijft heel het seizoen geldig — de inhoud beweegt mee (de ene week 6 matchen, de
// andere 4). Geen login nodig (enkel-lezen, publiek scherm).

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

    const { dagStart, dagEinde, geplandTot } = schermVenster()
    const teamFilter: Where = { or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] }
    const notHidden: Where[] = [{ isDemo: { not_equals: true } }, { analyseOnly: { not_equals: true } }]
    const [dayRes, liveRes] = await Promise.all([
      payload.find({
        collection: 'matches',
        where: { and: [teamFilter, { date: { greater_than_equal: dagStart, less_than: geplandTot } }, ...notHidden] },
        sort: 'date',
        depth: 0,
        limit: 100,
      }),
      payload.find({
        collection: 'matches',
        where: { and: [teamFilter, { status: { equals: 'live' } }, { date: { greater_than_equal: dagStart, less_than: geplandTot } }, ...notHidden] },
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

    // Gebatcht: enkele query's voor álle borden samen i.p.v. een volledige matchstate per
    // wedstrijd (zie kantine-borden.ts).
    const matches = await bouwKantineBorden(payload, docs)
    // De sponsors horen ook op dít scherm: een clubkantine draait vaak op de automatische
    // clublink, niet op de handmatige selectie.
    const ads = await loadAds(payload, 'kantine')
    return Response.json({ matches: sorteerSchermWedstrijden(matches, dagEinde), ads })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
