import { buildMatchState } from '@/lib/match-engine'
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
// naar vandaag kijkt) en bouwt voor elk de afgeleide stand. Gedeeld door /live
// en de startpagina, zodat het publieke wedstrijdoverzicht maar op één plek leeft.
export async function loadLiveDay(selected: string, today: string): Promise<DayMatch[]> {
  const payload = await getPayloadClient()
  const { start, end } = dayBounds(selected)
  const dayRes = await payload.find({
    collection: 'matches',
    where: { date: { greater_than_equal: start, less_than: end } },
    sort: 'date',
    depth: 0,
    limit: 200,
  })

  // Live wedstrijden altijd tonen wanneer je naar vandaag kijkt — ook al staat hun datum anders.
  const liveRes =
    selected === today
      ? await payload.find({ collection: 'matches', where: { status: { equals: 'live' } }, depth: 0, limit: 50 })
      : { docs: [] as (typeof dayRes)['docs'] }

  const seen = new Set<number>()
  const docs = [...liveRes.docs, ...dayRes.docs].filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })

  const days: DayMatch[] = []
  for (const m of docs) {
    try {
      const s = await buildMatchState(payload, m.id)
      days.push({
        id: m.id,
        reeks: reeksLabel(m.reeks),
        time: new Date(m.date).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
        status: s.match.status,
        home: { name: s.teams.home.name, logoUrl: s.teams.home.logoUrl, logoFit: s.teams.home.logoFit, colors: s.teams.home.colors },
        away: { name: s.teams.away.name, logoUrl: s.teams.away.logoUrl, logoFit: s.teams.away.logoFit, colors: s.teams.away.colors },
        score: s.score,
        crosses: s.crosses,
        timeouts: s.timeouts,
        refereeStops: s.refereeStops,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
  }
  return days
}
