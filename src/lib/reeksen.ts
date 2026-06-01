// Competitiereeksen (niveaus) van de KVKBF — bron: krachtbal.be/rangschikking.php.
// Eén bron van waarheid voor de reeks-keuze in de admin (Wedstrijden + Ploegen).
// De volgorde (hoog → laag) telt mee voor de beker-voorgift: 3 ptn per reeksverschil, max 6
// (WEDSTRIJDBLAD-PROMPT). Codes zoals "1NAH" = 1ste Nationale Heren.
//
// NB: de federatie past de indeling jaarlijks aan; deze lijst dekt de hoofdreeksen. Sub-poules
// (bv. "2NHA 1-2-3") kunnen later toegevoegd worden of via een aparte poule-aanduiding.

export const REEKS_OPTIONS = [
  // Nationaal
  { label: '1NAH — 1ste Nationale Heren', value: '1NAH' },
  { label: '1NAHB — 1ste Nationale Heren Beloften', value: '1NAHB' },
  { label: '1NAD — 1ste Nationale Dames', value: '1NAD' },
  { label: '2NAH — 2de Nationale Heren', value: '2NAH' },
  { label: '2NAHB — 2de Nationale Heren Beloften', value: '2NAHB' },
  // Landelijk
  { label: 'LH — Landelijke Heren', value: 'LH' },
  { label: 'LD — Landelijke Dames', value: 'LD' },
  // Regionaal
  { label: 'RHA — Regionale Heren A', value: 'RHA' },
  { label: 'RHB — Regionale Heren B', value: 'RHB' },
  { label: 'RDA — Regionale Dames A', value: 'RDA' },
  { label: 'RDB — Regionale Dames B', value: 'RDB' },
  // Jeugd
  { label: 'U18J — U18 Jongens', value: 'U18J' },
  { label: 'U18M — U18 Meisjes', value: 'U18M' },
  { label: 'U16J — U16 Jongens', value: 'U16J' },
  { label: 'U16M — U16 Meisjes', value: 'U16M' },
  { label: 'U14J — U14 Jongens', value: 'U14J' },
  { label: 'U14M — U14 Meisjes', value: 'U14M' },
  { label: 'U12 — U12', value: 'U12' },
  // Overig
  { label: 'Recreatief', value: 'recreatief' },
  { label: 'Beker', value: 'beker' },
  { label: 'Andere', value: 'andere' },
] as const

export type Reeks = (typeof REEKS_OPTIONS)[number]['value']

/** Rangorde voor beker-voorgift (lager getal = hogere reeks). Enkel de geordende
 * competitiereeksen; 'beker'/'recreatief'/'andere' krijgen geen rang (null). */
const REEKS_RANG: Partial<Record<Reeks, number>> = {
  '1NAH': 1,
  '1NAHB': 1,
  '1NAD': 1,
  '2NAH': 2,
  '2NAHB': 2,
  LH: 3,
  LD: 3,
  RHA: 4,
  RHB: 4,
  RDA: 4,
  RDB: 4,
}

// De reeks bepaalt de categorie (leeftijdsniveau) — die volgt automatisch, dus de admin
// hoeft de categorie niet apart te kiezen.
import type { Category } from './categories'

const REEKS_CATEGORIE: Record<Reeks, Category> = {
  '1NAH': 'senioren',
  '1NAHB': 'senioren',
  '1NAD': 'senioren',
  '2NAH': 'senioren',
  '2NAHB': 'senioren',
  LH: 'senioren',
  LD: 'senioren',
  RHA: 'senioren',
  RHB: 'senioren',
  RDA: 'senioren',
  RDB: 'senioren',
  U18J: 'U18',
  U18M: 'U18',
  U16J: 'U16',
  U16M: 'U16',
  U14J: 'U14',
  U14M: 'U14',
  U12: 'U12',
  recreatief: 'senioren',
  beker: 'senioren',
  andere: 'senioren',
}

/** Categorie (leeftijdsniveau) die hoort bij een reeks. */
export function reeksCategorie(reeks: Reeks): Category {
  return REEKS_CATEGORIE[reeks]
}

/** Beker-voorgift: 3 ptn per reeksverschil, max 6 (WEDSTRIJDBLAD-PROMPT). */
export function voorgiftPunten(reeksA: Reeks, reeksB: Reeks): number {
  const a = REEKS_RANG[reeksA]
  const b = REEKS_RANG[reeksB]
  if (a == null || b == null) return 0
  return Math.min(6, Math.abs(a - b) * 3)
}
