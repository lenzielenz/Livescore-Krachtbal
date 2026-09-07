import type { Payload } from 'payload'

import type { ClubColors } from './club-colors'
import { formatTimeBE } from './datetime'
import type { LogoFit } from './logo-fit'
import { buildScoreboards } from './match-engine'
import { reeksNaam } from './reeksen'

// Wedstrijddocumenten omzetten in borden voor het kantinescherm — GEBATCHT.
//
// Alle kantine-feeds (de centrale selectie, de vaste clublink en de persoonlijke schermen) deden
// dit met `buildMatchState` PER wedstrijd. Dat zijn ~10 query's per bord, sequentieel: een club
// met een dozijn ploegen kwam op een speeldag vlot aan honderden round-trips naar Postgres, en de
// tv bleef ondertussen wit. Het publieke live-bord liep tegen exact hetzelfde probleem aan en loste
// het op met `buildScoreboards` (enkele query's voor álle wedstrijden samen) — deze module doet
// hetzelfde voor de kantine, zodat de drie feeds er niet elk een eigen versie van hebben.
//
// Wat een bord nodig heeft is precies wat buildScoreboards teruggeeft: status, stand en de twee
// ploegen met hun logo en kleuren. De klok, de opstelling en het balbezit binnen een bord komen
// daarna via SSE binnen (zie Tile in KantineBoard.tsx), dus die hoeven hier niet mee.

export type KantineBordPloeg = {
  name: string
  logoUrl: string | null
  logoFit?: LogoFit | null
  colors?: ClubColors | null
}

/** Eén wedstrijdbord op het kantinescherm. */
export type KantineBord = {
  id: number
  reeks: string
  time: string
  /** Het échte aanvangsuur (ISO) — het aftellen naar de volgende wedstrijd heeft dat nodig. */
  date: string | null
  status: string
  home: KantineBordPloeg
  away: KantineBordPloeg
  score: { home: number; away: number }
}

/** Wat we van een wedstrijddocument gebruiken (een `find` met depth 0 levert dit allemaal). */
export type KantineBordBron = {
  id: number
  reeks?: unknown
  date?: unknown
  homeTeam?: unknown
  awayTeam?: unknown
  status?: string | null
  currentHalf?: number | null
  simpleScore?: unknown
  scoreTrust?: unknown
}

/**
 * Bouw de borden voor het kantinescherm uit een lijst wedstrijddocumenten. De volgorde van `docs`
 * blijft behouden; een wedstrijd met een ontbrekende ploeg valt weg (één kapotte rij mag het scherm
 * niet leegmaken).
 */
export async function bouwKantineBorden(payload: Payload, docs: KantineBordBron[]): Promise<KantineBord[]> {
  if (docs.length === 0) return []
  const cards = await buildScoreboards(payload, docs as Parameters<typeof buildScoreboards>[1])

  const borden: KantineBord[] = []
  for (const m of docs) {
    const c = cards.get(m.id)
    if (!c) continue
    borden.push({
      id: m.id,
      reeks: reeksNaam(m.reeks),
      time: typeof m.date === 'string' ? formatTimeBE(m.date) : '',
      date: typeof m.date === 'string' ? m.date : null,
      status: c.status,
      home: {
        name: c.teams.home.name,
        logoUrl: c.teams.home.logoUrl,
        logoFit: c.teams.home.logoFit,
        colors: c.teams.home.colors,
      },
      away: {
        name: c.teams.away.name,
        logoUrl: c.teams.away.logoUrl,
        logoFit: c.teams.away.logoFit,
        colors: c.teams.away.colors,
      },
      score: c.score,
    })
  }
  return borden
}
