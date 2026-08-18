// Balgewicht per categorie en geslacht — bron: KVKBF reglement 01072025, §3.
//
// Heren : U8/U10 800 g · U12 1 kg · U14 2 kg · U16/U18 3 kg · U20/senioren 4 kg
// Dames : U8/U10 800 g · U12/U14/U16 1 kg · U18/U20/senioren 2 kg
//
// Het geslacht zit in de reekscode: nationale/landelijke/regionale dames dragen een D
// (1NAD, LD, RDA…), jeugdmeisjes een M (U18M, U16MA…). U12 is gemengd, maar heeft voor
// beide hetzelfde gewicht — daar hoeft niets afgeleid te worden.

import type { Category } from './categories'

export type Geslacht = 'heren' | 'dames'

const HEREN: Record<Category, number> = {
  U12: 1,
  U14: 2,
  U16: 3,
  U18: 3,
  U20: 4,
  senioren: 4,
}

const DAMES: Record<Category, number> = {
  U12: 1,
  U14: 1,
  U16: 1,
  U18: 2,
  U20: 2,
  senioren: 2,
}

/** Leidt het geslacht af uit de reekscode; null wanneer de reeks niets prijsgeeft (U12, beker…). */
export function geslachtVanReeks(reeks: unknown): Geslacht | null {
  if (typeof reeks !== 'string' || !reeks) return null
  // Jeugd: U18M / U16MA / U14M → meisjes, U18J / U16J / U14JB → jongens.
  const jeugd = /^U\d{2}([JM])/.exec(reeks)
  if (jeugd) return jeugd[1] === 'M' ? 'dames' : 'heren'
  // Senioren: 1NAD / LD / RDA / RDB → dames; 1NAH / LH / RHA / 2NAHB → heren.
  if (/^(?:\d?NA|L|R)D/.test(reeks)) return 'dames'
  if (/^(?:\d?NA|L|R)H/.test(reeks)) return 'heren'
  return null
}

/**
 * Voorgeschreven balgewicht in kg. Zonder bruikbare reeks vallen we terug op heren — dat is het
 * zwaarste geval, dus de scheidsrechter wordt nooit een té lichte bal aangeraden.
 */
export function balgewichtKg(category: Category, reeks?: unknown): number {
  return (geslachtVanReeks(reeks) === 'dames' ? DAMES : HEREN)[category] ?? 4
}

/** Leesbaar, bv. "4 kg" of "800 g". */
export function balgewichtLabel(category: Category, reeks?: unknown): string {
  const kg = balgewichtKg(category, reeks)
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg} kg`
}
