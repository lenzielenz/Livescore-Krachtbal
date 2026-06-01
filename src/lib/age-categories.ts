// Leeftijdscategorie & speelgerechtigdheid — exacte logica uit LEEFTIJDSCATEGORIE-SPEC.md.
// Bron: RCVK §4.6. Eén bron van waarheid voor categorie-indeling en hoger/lager-spelen.
//
// DECISION: de codebase gebruikt 'senioren' als bovenste rung (zie lib/categories.ts);
// de spec schrijft 'senior'. We volgen de codebase-naam 'senioren' overal.

import type { Category } from './categories'

// Volledige leeftijdsladder, laag → hoog. Bevat de jeugdcategorieën U6/U8/U10 die (nog)
// geen eigen ploegcategorie hebben, maar wel nodig zijn om de leeftijd van een lid te bepalen.
export const AGE_CATEGORIES = [
  'U6',
  'U8',
  'U10',
  'U12',
  'U14',
  'U16',
  'U18',
  'U20',
  'senioren',
] as const

export type AgeCategory = (typeof AGE_CATEGORIES)[number]

/** Peiljaar P = startjaar seizoen (N) + 1. (LEEFTIJDSCATEGORIE-SPEC §2) */
export function peiljaar(seasonStartYear: number): number {
  return seasonStartYear + 1
}

/**
 * Eigen categorie uit geboortejaar t.o.v. peiljaar P.
 * leeftijdOpPeildatum = P − geboortejaar. (LEEFTIJDSCATEGORIE-SPEC §3)
 */
export function eigenCategorie(geboortejaar: number, peiljaarP: number): AgeCategory {
  const leeftijd = peiljaarP - geboortejaar
  if (leeftijd < 6) return 'U6'
  if (leeftijd <= 7) return 'U8'
  if (leeftijd <= 9) return 'U10'
  if (leeftijd <= 11) return 'U12'
  if (leeftijd <= 13) return 'U14'
  if (leeftijd <= 15) return 'U16'
  if (leeftijd <= 17) return 'U18'
  if (leeftijd <= 19) return 'U20'
  return 'senioren'
}

/** Categorie afgeleid uit een geboortedatum (ISO-string of Date) + seizoen-startjaar. */
export function categorieVoorGeboortedatum(
  birthDate: string | Date | null | undefined,
  seasonStartYear: number,
): AgeCategory | null {
  if (!birthDate) return null
  const d = birthDate instanceof Date ? birthDate : new Date(birthDate)
  if (Number.isNaN(d.getTime())) return null
  return eigenCategorie(d.getUTCFullYear(), peiljaar(seasonStartYear))
}

export type SpeelgerechtigdResultaat = 'OK' | 'WARN_VERBOD' | 'BLOCK_TE_HOOG' | 'BLOCK'

/**
 * Mag een speler met categorie `spelerCat` opgesteld worden in een ploeg van `ploegCat`?
 * (LEEFTIJDSCATEGORIE-SPEC §4)
 * - eigen categorie → OK
 * - één hoger → OK, tenzij doktersverbod → WARN_VERBOD
 * - twee of meer hoger → BLOCK_TE_HOOG
 * - lager dan eigen → BLOCK (nooit)
 */
export function magSpelen(
  spelerCat: AgeCategory,
  ploegCat: AgeCategory,
  hogerVerbod: boolean,
): SpeelgerechtigdResultaat {
  const verschil = AGE_CATEGORIES.indexOf(ploegCat) - AGE_CATEGORIES.indexOf(spelerCat)
  if (verschil < 0) return 'BLOCK' // lager → nooit
  if (verschil === 0) return 'OK' // eigen categorie
  if (verschil === 1) return hogerVerbod ? 'WARN_VERBOD' : 'OK' // één hoger
  return 'BLOCK_TE_HOOG' // twee of meer hoger
}

/** Mapt een ploegcategorie (Category uit lib/categories) op de leeftijdsladder. */
export function ageCategoryOf(category: Category): AgeCategory {
  return category as AgeCategory
}
