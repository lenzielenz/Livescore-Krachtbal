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

/** Leesbare reeksnaam zonder de code-prefix, bv. "2de Nationale Heren" i.p.v. "2NAH — 2de Nationale Heren". */
export function reeksNaam(value: unknown): string {
  const opt = REEKS_OPTIONS.find((o) => o.value === value)
  if (opt) return opt.label.split('—').pop()!.trim()
  return typeof value === 'string' && value ? value : 'Overig'
}

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

// Reglement §6.8/§8.1: U16-MEISJES spelen met het SENIOR-worpaantal (3 vanaf eigen helft, 2 op
// tegenhelft) i.p.v. het jeugd-aantal (4/3) — al houden ze wél de jeugd-speelduur (2×20).
// Omdat de categorie ('U16') geen geslacht kent, leiden we dit af uit de reeks (die het wél kent).
const SENIOR_THROW_YOUTH: ReadonlySet<string> = new Set(['U16M'])
export function reeksUsesSeniorThrows(reeks: unknown): boolean {
  return typeof reeks === 'string' && SENIOR_THROW_YOUTH.has(reeks)
}

// Reekstype bepaalt de speelduur én welke officials vereist zijn (Wedstrijdblad_invullen.pdf).
export type ReeksType = 'jeugd' | 'landelijk' | 'nationaal'

const NATIONAAL: ReadonlySet<Reeks> = new Set<Reeks>(['1NAH', '1NAHB', '1NAD', '2NAH', '2NAHB'])
const JEUGD_2X20: ReadonlySet<Reeks> = new Set<Reeks>(['U12', 'U14J', 'U14M', 'U16J', 'U16M'])

export function reeksType(reeks: Reeks): ReeksType {
  if (NATIONAAL.has(reeks)) return 'nationaal'
  if (JEUGD_2X20.has(reeks)) return 'jeugd' // U12/U14/U16 → 2×20 min
  return 'landelijk' // LH/LD/REG/RRL/U18 → 2×25 min
}

/** Helftduur (sec) strikt afgeleid uit de reeks: jeugd (U12/U14/U16) 2×20, rest 2×25. */
export function reeksHalfDurationSeconds(reeks: Reeks): number {
  return (reeksType(reeks) === 'jeugd' ? 20 : 25) * 60
}

/** Korte omschrijving van de vereiste officials per reekstype (voor de scheidsrechter). */
export function vereisteOfficialsTekst(reeks: Reeks): string {
  switch (reeksType(reeks)) {
    case 'jeugd':
      return 'Thuis levert: aantekenaar + tijdopnemer, grensrechter (mag 2× dezelfde persoon) en terreinafgevaardigde (geen andere functie). Bezoekers: minstens 4 spelers + 1 coach (U18+).'
    case 'nationaal':
      return 'Thuis: aantekenaar/scorer + terreinafgevaardigde + 1 grensrechter + coach. Bezoekers: tijdopnemer + grensrechter + coach (coach mag kapitein zijn).'
    default:
      return 'Best minstens 5 personen aanwezig; coach telt niet als noodzakelijke official. Een coach mag geen grensrechter zijn (Art. 25).'
  }
}

/** Beker-voorgift: 3 ptn per reeksverschil, max 6 (WEDSTRIJDBLAD-PROMPT). */
export function voorgiftPunten(reeksA: Reeks, reeksB: Reeks): number {
  const a = REEKS_RANG[reeksA]
  const b = REEKS_RANG[reeksB]
  if (a == null || b == null) return 0
  return Math.min(6, Math.abs(a - b) * 3)
}
