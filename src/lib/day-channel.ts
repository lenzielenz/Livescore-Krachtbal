import type { Payload } from 'payload'

import { brusselsDayBoundsUtc, dateStrBE, shiftDateStr } from './datetime'
import { buildScoreboards } from './match-engine'
import { viewerCountFor } from './match-channel'
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
  /** Kijkers nu op de wedstrijdpagina zelf (hetzelfde "oogje" als op het scorebord) — een
   *  goedkope in-memory lookup (viewerCountFor), geen extra verbinding per bordkaart. */
  viewers?: number
}

/** Hoe vaak de gedeelde poller kijkt. Trager dan het match-kanaal (1,5 s): op een bord met tien
 *  wedstrijden tegelijk is elke paar seconden ruim snel genoeg, en het scheelt databankwerk. */
export const DAY_POLL_MS = 5000

/** De veranderlijke stand van alle wedstrijden in een [start, end)-venster (plus wat elders live
 *  is, wanneer `includeLive`). Gedeeld door loadLiveScores (één dag) en loadLiveScoresWeekend
 *  (za+zo) hieronder. */
async function scoresForRange(payload: Payload, start: string, end: string, includeLive: boolean): Promise<LiveScore[]> {
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

  // Horen ook wedstrijden bij die NÚ live zijn met een andere datum (een avondmatch die over
  // middernacht loopt) — net als op het bord zelf.
  const liveRes = includeLive
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
    const status = autoLive ? 'live' : c.status
    // Enkel de moeite waard voor wat nu live is — geplande/afgelopen wedstrijden hebben toch
    // nooit een actief kanaal (viewerCountFor geeft dan sowieso 0 terug). Expliciet 0 meesturen
    // (niet `undefined`): JSON.stringify laat undefined-velden gewoon weg, dus een client die ooit
    // een hoger aantal zag zou dat badge nooit meer zien verdwijnen als de kijker wegvalt.
    uit.push({
      id: m.id,
      status,
      awaitingResult: c.status === 'scheduled' && now - kickoff >= MATCH_ASSUMED_DONE_MS,
      score: c.score,
      crosses: c.crosses,
      timeouts: c.timeouts,
      refereeStops: c.refereeStops,
      viewers: status === 'live' ? viewerCountFor(m.id) : 0,
    })
  }
  return uit
}

/** De veranderlijke stand van alle wedstrijden op één dag (plus wat elders live is). */
export async function loadLiveScores(payload: Payload, selected: string): Promise<LiveScore[]> {
  const today = dateStrBE()
  const { start, end } = brusselsDayBoundsUtc(selected)
  return scoresForRange(payload, start, end, selected === today)
}

/** Zelfde als loadLiveScores, maar voor een heel weekend (zaterdag + zondag) ineens — voedt de
 *  weekend-weergave van het bord, die anders geen live-updates zou krijgen voor de zondag. */
export async function loadLiveScoresWeekend(payload: Payload, zaterdag: string): Promise<LiveScore[]> {
  const today = dateStrBE()
  const zondag = shiftDateStr(zaterdag, 1)
  const { start } = brusselsDayBoundsUtc(zaterdag)
  const { end } = brusselsDayBoundsUtc(zondag)
  return scoresForRange(payload, start, end, today >= zaterdag && today <= zondag)
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

/** Zelfde als joinDay, maar op het gedeelde weekendkanaal (za+zo) — voor de weekend-weergave. */
export function joinWeekend(
  payload: Payload,
  zaterdag: string,
  send: (event: string, data: unknown, id?: number) => void,
): () => void {
  return subscribe(
    `weekend:${zaterdag}`,
    () => loadLiveScoresWeekend(payload, zaterdag),
    (frame) => send('scores', frame.data, frame.id),
    DAY_POLL_MS,
  )
}
