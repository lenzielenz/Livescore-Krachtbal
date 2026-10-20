// Het seizoen van één club, voor de clubpagina (/club/seizoen): per ploeg de plaats in de reeks,
// punten, doelsaldo en de vorm, en over alle ploegen heen de topscorers en wie het meest speelde.
// Puur — de pagina haalt de stand (lib/reeks-standings.ts), de scorers (lib/superstars.ts) en de
// deelnames (lib/speler-deelname.ts) op. Alles afgeleid uit de gespeelde wedstrijden.

import type { StandingRow, StandingsMatch } from './standings'

export type Uitslag = 'W' | 'G' | 'V'

export type PloegSeizoenInput = {
  id: number
  naam: string
  reeks: string
  /** De volledige stand van de reeks, gesorteerd (plaats 1 eerst). */
  stand: StandingRow[]
  /** De gespeelde wedstrijden van de reeks (voor de vorm). */
  wedstrijden: StandingsMatch[]
}

export type PloegSeizoen = {
  id: number
  naam: string
  reeks: string
  plaats: number | null
  van: number
  rij: StandingRow | null
  /** De laatste vijf uitslagen, oudste eerst. */
  vorm: Uitslag[]
}

export type ClubSpeler = { id: number; naam: string; ploeg: string; doelpunten: number; punten: number; rugworpen: number; gespeeld: number }

export type ClubSeizoen = {
  ploegen: PloegSeizoen[]
  totaal: { gespeeld: number; gewonnen: number; gelijk: number; verloren: number; voor: number; tegen: number; winstPct: number }
  topscorers: ClubSpeler[]
  meestGespeeld: ClubSpeler[]
}

export function vormVan(teamId: number, wedstrijden: StandingsMatch[], aantal = 5): Uitslag[] {
  const eigen = wedstrijden
    .filter((m) => m.homeId === teamId || m.awayId === teamId)
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
    .slice(-aantal)
  return eigen.map((m) => {
    const voor = m.homeId === teamId ? m.homeGoals : m.awayGoals
    const tegen = m.homeId === teamId ? m.awayGoals : m.homeGoals
    return voor > tegen ? 'W' : voor < tegen ? 'V' : 'G'
  })
}

export function clubSeizoen(ploegen: PloegSeizoenInput[], spelers: ClubSpeler[], top = 10): ClubSeizoen {
  const uit: PloegSeizoen[] = ploegen.map((p) => {
    const i = p.stand.findIndex((r) => r.teamId === p.id)
    // Nog niet gespeeld = geen plaats (anders staat een ploeg zonder wedstrijden "1ste").
    const rij = i >= 0 && p.stand[i].played > 0 ? p.stand[i] : null
    return { id: p.id, naam: p.naam, reeks: p.reeks, plaats: rij ? i + 1 : null, van: p.stand.length, rij, vorm: vormVan(p.id, p.wedstrijden) }
  })
  const t = { gespeeld: 0, gewonnen: 0, gelijk: 0, verloren: 0, voor: 0, tegen: 0, winstPct: 0 }
  for (const p of uit) {
    if (!p.rij) continue
    t.gespeeld += p.rij.played
    t.gewonnen += p.rij.won
    t.gelijk += p.rij.drawn
    t.verloren += p.rij.lost
    t.voor += p.rij.goalsFor
    t.tegen += p.rij.goalsAgainst
  }
  t.winstPct = t.gespeeld ? Math.round((t.gewonnen / t.gespeeld) * 100) : 0
  const topscorers = spelers
    .filter((s) => s.doelpunten > 0)
    .sort((a, b) => b.doelpunten - a.doelpunten || b.punten - a.punten || a.naam.localeCompare(b.naam))
    .slice(0, top)
  const meestGespeeld = spelers
    .filter((s) => s.gespeeld > 0)
    .sort((a, b) => b.gespeeld - a.gespeeld || b.doelpunten - a.doelpunten || a.naam.localeCompare(b.naam))
    .slice(0, top)
  return { ploegen: uit, totaal: t, topscorers, meestGespeeld }
}
