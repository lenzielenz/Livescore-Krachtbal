// Vereiste officials-functies per reekstype + naam/voornaam-validatie (Wedstrijdblad_invullen.pdf).
// Eén bron van waarheid, gedeeld door het scheidsrechterscherm, de collection-hook en het indienen.
//
// Bron (samengevat van het blad):
// - Officials zijn altijd met **volledige naam + voornaam** leesbaar (minimum categorie U18).
// - Jeugd (U12/U14/U16): thuis levert aantekenaar + tijdopnemer, grensrechter en terreinafgevaardigde.
// - Landelijk (LH/LD/REG/U18): coach telt niet als noodzakelijke official; kern = aantekenaar +
//   tijdopnemer + minstens één grensrechter.
// - Nationaal (1N/2N): thuis = aantekenaar + terreinafgevaardigde + grensrechter + coach;
//   bezoekers = tijdopnemer + grensrechter + coach.
// - Een coach mag geen grensrechter zijn (Art. 25).

import { reeksType, type Reeks, type ReeksType } from './reeksen'

export const OFFICIAL_FUNCTIE_KEYS = [
  'aantekenaar',
  'tijdopnemer',
  'grensrechterThuis',
  'grensrechterUit',
  'terreinafgevaardigde',
  'coachThuis',
  'coachUit',
] as const

export type OfficialFunctie = (typeof OFFICIAL_FUNCTIE_KEYS)[number]

export type OfficialsData = Partial<Record<OfficialFunctie, string | null | undefined>>

export const OFFICIAL_LABELS: Record<OfficialFunctie, string> = {
  aantekenaar: 'Aantekenaar / scorer',
  tijdopnemer: 'Tijdopnemer',
  grensrechterThuis: 'Grensrechter (thuis)',
  grensrechterUit: 'Grensrechter (uit)',
  terreinafgevaardigde: 'Terreinafgevaardigde',
  coachThuis: 'Coach (thuis)',
  coachUit: 'Coach (uit)',
}

// Welke functies verplicht ingevuld moeten zijn, per reekstype.
const REQUIRED_BY_TYPE: Record<ReeksType, OfficialFunctie[]> = {
  jeugd: ['aantekenaar', 'tijdopnemer', 'grensrechterThuis', 'terreinafgevaardigde'],
  landelijk: ['aantekenaar', 'tijdopnemer', 'grensrechterThuis'],
  nationaal: [
    'aantekenaar',
    'terreinafgevaardigde',
    'grensrechterThuis',
    'coachThuis',
    'tijdopnemer',
    'grensrechterUit',
    'coachUit',
  ],
}

/** De functies die voor deze reeks verplicht ingevuld moeten zijn. */
export function requiredOfficials(reeks: Reeks): OfficialFunctie[] {
  return REQUIRED_BY_TYPE[reeksType(reeks)]
}

/**
 * Een official wordt met **naam + voornaam** genoteerd: minstens twee woorden van elk ≥2 tekens.
 * (Eén enkel woord zoals "Janssens" volstaat niet.)
 */
export function isVolledigeNaam(value: string | null | undefined): boolean {
  if (!value) return false
  const woorden = value.trim().split(/\s+/).filter((w) => w.replace(/[.\-']/g, '').length >= 2)
  return woorden.length >= 2
}

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/** Status van één officials-veld, voor directe feedback in het formulier (✓ of wat er schort). */
export type OfficialFieldStatus = 'leeg' | 'ok' | 'onvolledig' | 'conflict'

export function officialFieldStatus(key: OfficialFunctie, officials: OfficialsData): OfficialFieldStatus {
  const waarde = officials[key]
  if (!waarde || !waarde.trim()) return 'leeg'
  if (!isVolledigeNaam(waarde)) return 'onvolledig'
  // Art. 25: een coach mag geen grensrechter zijn (aan dezelfde kant).
  if (key === 'coachThuis' && norm(waarde) === norm(officials.grensrechterThuis)) return 'conflict'
  if (key === 'coachUit' && norm(waarde) === norm(officials.grensrechterUit)) return 'conflict'
  return 'ok'
}

export type OfficialsValidation = { ok: boolean; errors: string[] }

/**
 * Valideert het officials-blok tegen de reeks-vereisten:
 * - verplichte functies aanwezig,
 * - elke ingevulde official met volledige naam + voornaam,
 * - coach is niet tegelijk grensrechter (Art. 25).
 */
export function validateOfficials(reeks: Reeks, officials: OfficialsData): OfficialsValidation {
  const errors: string[] = []
  const required = new Set(requiredOfficials(reeks))

  for (const key of OFFICIAL_FUNCTIE_KEYS) {
    const waarde = officials[key]
    const ingevuld = Boolean(waarde && waarde.trim())
    if (required.has(key) && !ingevuld) {
      errors.push(`${OFFICIAL_LABELS[key]} is verplicht voor deze reeks.`)
      continue
    }
    if (ingevuld && !isVolledigeNaam(waarde)) {
      errors.push(`${OFFICIAL_LABELS[key]}: noteer de volledige naam én voornaam.`)
    }
  }

  // Art. 25: een coach mag geen grensrechter zijn (aan dezelfde kant).
  if (officials.coachThuis && norm(officials.coachThuis) === norm(officials.grensrechterThuis)) {
    errors.push('De coach (thuis) mag niet tegelijk grensrechter zijn (Art. 25).')
  }
  if (officials.coachUit && norm(officials.coachUit) === norm(officials.grensrechterUit)) {
    errors.push('De coach (uit) mag niet tegelijk grensrechter zijn (Art. 25).')
  }

  return { ok: errors.length === 0, errors }
}
