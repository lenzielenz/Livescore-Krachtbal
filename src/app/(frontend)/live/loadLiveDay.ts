import { buildScoreboards } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'

import type { DayMatch } from './LiveBoard'

const reeksLabel = (v: unknown) => REEKS_OPTIONS.find((o) => o.value === v)?.label ?? (typeof v === 'string' ? v : 'Overig')

function dayBounds(dateStr: string): { start: string; end: string } {
  const start = new Date(`${dateStr}T00:00:00.000`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

// Laadt alle wedstrijden voor één dag + de actueel-live wedstrijden (wanneer je
// naar vandaag kijkt) en berekent voor elk de afgeleide stand. De stand wordt
// GEBATCHT opgebouwd (buildScoreboards: enkele queries voor alle wedstrijden
// samen) i.p.v. per wedstrijd — schaalt naar een vol weekend (100+ wedstrijden).
// Gedeeld door /live en de startpagina.
export async function loadLiveDay(selected: string, today: string): Promise<DayMatch[]> {
  const payload = await getPayloadClient()
  const { start, end } = dayBounds(selected)
  const dayRes = await payload.find({
    collection: 'matches',
    where: { date: { greater_than_equal: start, less_than: end } },
    sort: 'date',
    depth: 0,
    limit: 500,
  })

  // Live wedstrijden altijd tonen wanneer je naar vandaag kijkt — ook al staat hun datum anders.
  const liveRes =
    selected === today
      ? await payload.find({ collection: 'matches', where: { status: { equals: 'live' } }, depth: 0, limit: 100 })
      : { docs: [] as (typeof dayRes)['docs'] }

  const seen = new Set<number>()
  const docs = [...liveRes.docs, ...dayRes.docs].filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })

  const cards = await buildScoreboards(payload, docs)

  const days: DayMatch[] = []
  for (const m of docs) {
    const c = cards.get(m.id)
    if (!c) continue // ontbrekende ploeg → overslaan (zoals voorheen)
    days.push({
      id: m.id,
      reeks: reeksLabel(m.reeks),
      time: new Date(m.date).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
      status: c.status,
      home: { teamId: c.teams.home.id, name: c.teams.home.name, logoUrl: c.teams.home.logoUrl, logoFit: c.teams.home.logoFit, colors: c.teams.home.colors, clubId: c.teams.home.clubId, clubName: c.teams.home.clubName },
      away: { teamId: c.teams.away.id, name: c.teams.away.name, logoUrl: c.teams.away.logoUrl, logoFit: c.teams.away.logoFit, colors: c.teams.away.colors, clubId: c.teams.away.clubId, clubName: c.teams.away.clubName },
      score: c.score,
      crosses: c.crosses,
      timeouts: c.timeouts,
      refereeStops: c.refereeStops,
    })
  }
  return days
}
