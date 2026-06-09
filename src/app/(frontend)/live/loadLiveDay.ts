import { brusselsDayBoundsUtc, formatTimeBE } from '@/lib/datetime'
import { purgeExpiredDemos } from '@/lib/demo'
import { buildScoreboards } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'

import type { DayMatch } from './LiveBoard'

// Leesbare reeksnaam zonder code-prefix (bv. "1ste Nationale Dames" i.p.v. "1NAD — …").
const reeksLabel = (v: unknown) => reeksNaam(v)

// Dag-grenzen in Belgische tijd (de server draait in UTC) zodat avondwedstrijden op de juiste dag
// vallen.
const dayBounds = (dateStr: string) => brusselsDayBoundsUtc(dateStr)

// Laadt alle wedstrijden voor één dag + de actueel-live wedstrijden (wanneer je
// naar vandaag kijkt) en berekent voor elk de afgeleide stand. De stand wordt
// GEBATCHT opgebouwd (buildScoreboards: enkele queries voor alle wedstrijden
// samen) i.p.v. per wedstrijd — schaalt naar een vol weekend (100+ wedstrijden).
// Gedeeld door /live en de startpagina.
export async function loadLiveDay(selected: string, today: string): Promise<DayMatch[]> {
  const payload = await getPayloadClient()
  // Ruim meteen vervallen demo's op (best-effort) — zo verdwijnen ze ~binnen het uur,
  // ook zonder dat iemand de demo opent.
  await purgeExpiredDemos(payload).catch(() => undefined)
  const { start, end } = dayBounds(selected)
  // Analyse-only én demo-wedstrijden zijn nooit publiek/live zichtbaar.
  const dayRes = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { date: { greater_than_equal: start, less_than: end } },
        { analyseOnly: { not_equals: true } },
        { isDemo: { not_equals: true } },
      ],
    },
    sort: 'date',
    depth: 0,
    limit: 500,
  })

  // Live wedstrijden altijd tonen wanneer je naar vandaag kijkt — ook al staat hun datum anders.
  const liveRes =
    selected === today
      ? await payload.find({
          collection: 'matches',
          where: {
            and: [{ status: { equals: 'live' } }, { analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }],
          },
          depth: 0,
          limit: 100,
        })
      : { docs: [] as (typeof dayRes)['docs'] }

  const seen = new Set<number>()
  const docs = [...liveRes.docs, ...dayRes.docs].filter((m) => {
    if (seen.has(m.id)) return false
    seen.add(m.id)
    return true
  })

  const cards = await buildScoreboards(payload, docs)

  // Auto-live: een geplande wedstrijd waarvan het ingestelde uur al voorbij is, tonen we als "live"
  // (ook al heeft nog niemand ze gestart). Instant-vergelijking → tijdzone-onafhankelijk.
  const now = Date.now()

  const days: DayMatch[] = []
  for (const m of docs) {
    const c = cards.get(m.id)
    if (!c) continue // ontbrekende ploeg → overslaan (zoals voorheen)
    const autoLive = c.status === 'scheduled' && new Date(m.date as string).getTime() <= now
    days.push({
      id: m.id,
      reeks: reeksLabel(m.reeks),
      time: formatTimeBE(m.date),
      status: autoLive ? 'live' : c.status,
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
