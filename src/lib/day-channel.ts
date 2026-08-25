import type { Payload } from 'payload'

import { brusselsDayBoundsUtc, dateStrBE } from './datetime'
import { buildScoreboards } from './match-engine'
import { MATCH_ASSUMED_DONE_MS } from './simple-score'
import { subscribe } from './sse-hub'

// ── Live-bord dat zichzelf bijwerkt ───────────────────────────────────────────────────────────
//
// De wedstrijdpagina had al een live-verbinding, maar het BORD (de dagoverzichten op / en /live)
// niet: wie daar bleef staan, zag een bevroren stand tot hij ververste. Precies daar staan de
// meeste supporters, dus dat is de plek waar "vlot de scores zien" telt.
//
// Zelfde aanpak als het match-kanaal: ÉÉN gedeelde poller per dag (sse-hub.ts), fan-out naar alle
// kijkers. Duizend telefoons op een drukke zaterdag kosten dus evenveel databankwerk als één.
// Er gaat bewust enkel het VERANDERLIJKE deel over de lijn (stand, status, kruisjes, time-outs) —
// namen, logo's en kleuren staan al op het scherm en veranderen niet tijdens een wedstrijd.

export interface LiveScore {
  id: number
  status: string
  /** Aftrap ruim voorbij zonder notatie: gespeeld, maar zonder uitslag. */
  awaitingResult: boolean
  score: { home: number; away: number }
  crosses?: { home: number; away: number }
  timeouts?: { home: number; away: number }
  refereeStops?: number
}

/** Hoe vaak de gedeelde poller kijkt. Trager dan het match-kanaal (1,5 s): op een bord met tien
 *  wedstrijden tegelijk is elke paar seconden ruim snel genoeg, en het scheelt databankwerk. */
export const DAY_POLL_MS = 5000

/** De veranderlijke stand van alle wedstrijden op één dag (plus wat elders live is). */
export async function loadLiveScores(payload: Payload, selected: string): Promise<LiveScore[]> {
  const today = dateStrBE()
  const { start, end } = brusselsDayBoundsUtc(selected)
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
    overrideAccess: true,
  })

  // Kijk je naar vandaag, dan horen ook wedstrijden erbij die nú live zijn met een andere datum
  // (een avondmatch die over middernacht loopt) — net als op het bord zelf.
  const liveRes =
    selected === today
      ? await payload.find({
          collection: 'matches',
          where: {
            and: [{ status: { equals: 'live' } }, { analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }],
          },
          depth: 0,
          limit: 100,
          overrideAccess: true,
        })
      : { docs: [] as (typeof dayRes)['docs'] }

  const seen = new Set<number>()
  const docs = [...liveRes.docs, ...dayRes.docs].filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
  const cards = await buildScoreboards(payload, docs)

  const now = Date.now()
  const uit: LiveScore[] = []
  for (const m of docs) {
    const c = cards.get(m.id)
    if (!c) continue
    const kickoff = new Date(m.date as string).getTime()
    const autoLive = c.status === 'scheduled' && kickoff <= now && now - kickoff < MATCH_ASSUMED_DONE_MS
    uit.push({
      id: m.id,
      status: autoLive ? 'live' : c.status,
      awaitingResult: c.status === 'scheduled' && now - kickoff >= MATCH_ASSUMED_DONE_MS,
      score: c.score,
      crosses: c.crosses,
      timeouts: c.timeouts,
      refereeStops: c.refereeStops,
    })
  }
  return uit
}

/**
 * Sluit aan op het gedeelde dagkanaal. Geeft een unsubscribe-functie terug; die stopt de poller
 * zodra de laatste kijker weg is.
 */
export function joinDay(
  payload: Payload,
  selected: string,
  send: (event: string, data: unknown, id?: number) => void,
): () => void {
  return subscribe(
    `day:${selected}`,
    () => loadLiveScores(payload, selected),
    (frame) => send('scores', frame.data, frame.id),
    DAY_POLL_MS,
  )
}
