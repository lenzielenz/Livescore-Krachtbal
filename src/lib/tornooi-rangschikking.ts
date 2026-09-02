// De rangschikkingen van een hele tornooidag, per categorie naast elkaar.
//
// Op een tornooidag lopen er meerdere reeksen door elkaar. Wie de stand van "zijn" categorie
// wilde zien, moest die reeks eerst opzoeken en aanklikken — en voor de volgende weer terug. Dit
// bundelt ze: één pagina met alle standen, in dezelfde volgorde als op de dagpagina.
//
// De stand zelf komt uit `computeStandings` (winst 4, gelijkspel 3, verlies 2) — dezelfde functie
// als op de reekspagina, zodat er nooit twee verschillende waarheden kunnen ontstaan.

import { computeStandings, type Standing } from './tournament'

export type RangschikkingMatch = {
  tournamentId: number
  home: string | null
  away: string | null
  status: string
  winner: 'home' | 'away' | null
  score: { home: number; away: number }
}

export type RangschikkingReeks = {
  id: number
  naam: string
  format: string
  champion: string | null
}

export type ReeksStand = {
  id: number
  naam: string
  /** Leeg bij een bekerschema: daar bestaat geen rangschikking, wel een winnaar. */
  stand: Standing[]
  /** Is dit een bekerschema (dus geen ronde-tegen-ronde)? */
  beker: boolean
  champion: string | null
  /** Is er al iets gespeeld? Anders staat iedereen op nul en zegt de tabel nog niets. */
  gespeeld: boolean
}

/**
 * De stand per reeks van een tornooidag.
 *
 * De ploegen komen uit de wedstrijden zelf en niet uit een aparte lijst: bij een tornooi worden
 * ploegen soms hernoemd of herloot, en dan is de affiche de enige bron die zeker klopt.
 */
export function standenVanDag(reeksen: RangschikkingReeks[], matches: RangschikkingMatch[]): ReeksStand[] {
  return reeksen.map((r) => {
    const eigen = matches.filter((m) => m.tournamentId === r.id)
    const ploegen = [...new Set(eigen.flatMap((m) => [m.home, m.away]).filter((n): n is string => Boolean(n)))]
    const beker = r.format !== 'roundrobin'
    return {
      id: r.id,
      naam: r.naam,
      beker,
      champion: r.champion,
      gespeeld: eigen.some((m) => m.status === 'finished'),
      stand: beker ? [] : computeStandings(eigen, ploegen),
    }
  })
}
