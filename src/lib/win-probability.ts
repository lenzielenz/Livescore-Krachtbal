// Live winstkans voor een krachtbalwedstrijd.
//
// Krachtbal speelt 2 helften; doelpunten zijn +1 (nekworp) of +2 (rugworp) en gelijkspel kan.
// We modelleren de nog te scoren punten per ploeg als een samengesteld Poisson-proces: in de
// resterende tijd t (min) verwacht elke ploeg ~ ratePerMin·t punten. Het verschil in nog te
// scoren punten D = (thuis − uit) is bij benadering Normaal(0, σ²) met
//   σ² = 2 · ratePerMin · t · K
// waarbij K = E[v²]/E[v] uit de nek/rug-mix (≈1.46). De einduitslag-marge M = lead + D is dan
// Normaal(lead, σ²). Met continuïteitscorrectie (marges zijn geheel) volgt de winstkans uit de
// normale CDF. Bij t→0 klapt de kans samen op de huidige uitslag.
//
// Pure module zonder imports — testbaar en bruikbaar in een client-component zonder serverkost.

export interface WinProbInput {
  scoreHome: number
  scoreAway: number
  /** Verstreken speeltijd (seconden, beide helften samen). */
  elapsedSec: number
  /** Totale speeltijd (seconden) = 2 × helftduur. */
  totalSec: number
  /** Verwachte punten per ploeg per minuut (getuned per reekstype). */
  ratePerMin: number
}

export interface WinProb {
  /** Kans dat de thuisploeg wint (0..1). */
  home: number
  /** Kans op gelijkspel (0..1). */
  draw: number
  /** Kans dat de uitploeg wint (0..1). */
  away: number
  /** Verwachte eindstand bij gelijkblijvend tempo. */
  expHome: number
  expAway: number
}

/** Spreidingsfactor K = E[v²]/E[v] voor de nek(1)/rug(2)-mix (~70/30). */
const K = 1.46

/** Totale speeltijd (sec) uit de helftduur (sec). */
export function totalSecondsFor(halfSeconds: number): number {
  return Math.max(0, halfSeconds) * 2
}

/** Standaard verwachte punten/ploeg/min per reekstype (tunebaar; later evt. uit historiek). */
export const BASE_RATE_PER_MIN: Record<'nationaal' | 'landelijk' | 'jeugd', number> = {
  nationaal: 0.55,
  landelijk: 0.5,
  jeugd: 0.45,
}

/** Normale verdelingsfunctie Φ(z) — Abramowitz & Stegun 26.2.17 (|fout| < 7.5e-8). */
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2)
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}

export function winProbability(input: WinProbInput): WinProb {
  const { scoreHome, scoreAway, ratePerMin } = input
  const lead = scoreHome - scoreAway
  const remainingMin = Math.max(0, input.totalSec - input.elapsedSec) / 60
  const expHome = Math.round(scoreHome + ratePerMin * remainingMin)
  const expAway = Math.round(scoreAway + ratePerMin * remainingMin)

  const variance = 2 * Math.max(0, ratePerMin) * remainingMin * K
  const sigma = Math.sqrt(variance)

  // Geen tijd of geen spreiding meer: de huidige stand is de uitslag.
  if (sigma <= 1e-9) {
    if (lead > 0) return { home: 1, draw: 0, away: 0, expHome, expAway }
    if (lead < 0) return { home: 0, draw: 0, away: 1, expHome, expAway }
    return { home: 0, draw: 1, away: 0, expHome, expAway }
  }

  const home = 1 - normCdf((0.5 - lead) / sigma)
  const away = normCdf((-0.5 - lead) / sigma)
  const draw = Math.max(0, 1 - home - away)
  // Hernormaliseer zodat de drie kansen exact tot 1 sommeren.
  const sum = home + draw + away || 1
  return { home: home / sum, draw: draw / sum, away: away / sum, expHome, expAway }
}
