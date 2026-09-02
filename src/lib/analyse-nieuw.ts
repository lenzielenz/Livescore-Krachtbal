// Wat er naar de server gaat wanneer je een nieuwe analysewedstrijd aanmaakt.
//
// Er zijn twee wegen naar hetzelfde eindpunt: een wedstrijd uit de échte kalender overnemen
// (datum, reeks en ploegnamen komen dan mee) of er zelf een samenstellen. Allebei moeten ze de
// gekozen MODUS meesturen — manueel aantekenen of alles uit de video.
//
// Dat ging mis: de kalenderweg stuurde enkel het wedstrijdnummer mee. Wie bovenaan "alles uit de
// video" aanduidde en daarna een wedstrijd uit de agenda koos, kreeg een wedstrijd die op de
// server als 'manueel' werd weggeschreven — de standaardwaarde. Daarna wees alles hem naar de
// aantekentafel en was het videoplatform onbereikbaar, terwijl hij net gekozen had om niets met
// de hand te doen.
//
// Eén functie voor allebei de knoppen, zodat een veld niet meer aan één kant kan wegvallen.

export type AnalyseModus = 'manueel' | 'video'

export type NieuweAnalyseKeuze =
  /** Overgenomen uit de competitiekalender: de server leest daar datum, reeks en affiche uit. */
  | { bron: 'kalender'; fromMatch: number; modus: AnalyseModus }
  /** Zelf samengesteld uit je eigen analyse-ploegen. */
  | { bron: 'zelf'; reeks: string; homeTeam: number; awayTeam: number; date: string; modus: AnalyseModus }

/** De body voor POST /api/analyse/match. */
export function nieuweAnalyseBody(keuze: NieuweAnalyseKeuze): Record<string, unknown> {
  if (keuze.bron === 'kalender') {
    return { fromMatch: keuze.fromMatch, modus: keuze.modus }
  }
  return {
    reeks: keuze.reeks,
    homeTeam: keuze.homeTeam,
    awayTeam: keuze.awayTeam,
    date: keuze.date,
    modus: keuze.modus,
  }
}
