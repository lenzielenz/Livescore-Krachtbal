// Spelersregistratie: de club voert een lid in, laadt het doktersattest op en dient in; de federatie
// keurt goed of af. Pure logica (geen DB), gedeeld door de clublijst, de federatiewachtrij en de
// server-routes — zodat het icoon achter een naam en wat de server toelaat nooit uiteenlopen.

export type RegistratieStatus = 'concept' | 'ingediend' | 'goedgekeurd' | 'afgekeurd'
export type SoortLid = 'speler' | 'lid'
export type Geslacht = 'm' | 'v'

export const REGISTRATIE_OPTIONS: { label: string; value: RegistratieStatus }[] = [
  { label: 'In voorbereiding (club)', value: 'concept' },
  { label: 'Ingediend bij de federatie', value: 'ingediend' },
  { label: 'Goedgekeurd', value: 'goedgekeurd' },
  { label: 'Afgekeurd', value: 'afgekeurd' },
]

export const SOORT_LID_OPTIONS: { label: string; value: SoortLid }[] = [
  { label: 'Speler (met vergunning)', value: 'speler' },
  { label: 'Gewoon lid (speelt geen wedstrijden)', value: 'lid' },
]

export const GESLACHT_OPTIONS: { label: string; value: Geslacht }[] = [
  { label: 'Man', value: 'm' },
  { label: 'Vrouw', value: 'v' },
]

/** Een medische keuring geldt één seizoen; ouder dan dit = verlopen. */
export const KEURING_GELDIG_DAGEN = 365

/** Vanaf deze leeftijd is een e-mailadres verplicht (instelbaar: Settings.emailVerplichtVanaf). */
export const EMAIL_VERPLICHT_VANAF = 13

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const geldigEmail = (v: unknown): boolean => typeof v === 'string' && EMAIL_RE.test(v.trim())

/** Leeftijd in hele jaren op `nu`. */
export function leeftijd(geboortedatum: string | Date | null | undefined, nu: Date = new Date()): number | null {
  if (!geboortedatum) return null
  const g = new Date(geboortedatum)
  if (Number.isNaN(g.getTime())) return null
  let j = nu.getUTCFullYear() - g.getUTCFullYear()
  if (nu.getUTCMonth() < g.getUTCMonth() || (nu.getUTCMonth() === g.getUTCMonth() && nu.getUTCDate() < g.getUTCDate())) j -= 1
  return j
}

/** Moet dit lid een e-mailadres hebben? Ja vanaf `vanaf` jaar; zonder geboortedatum ook (veilige kant). */
export function emailVerplicht(geboortedatum: string | Date | null | undefined, vanaf: number = EMAIL_VERPLICHT_VANAF, nu: Date = new Date()): boolean {
  const l = leeftijd(geboortedatum, nu)
  return l == null || l >= vanaf
}

export type RegistratieInput = {
  voornaam?: string | null
  achternaam?: string | null
  birthDate?: string | Date | null
  geslacht?: string | null
  email?: string | null
  soortLid?: string | null
  medischeKeuringOp?: string | Date | null
  heeftAttest?: boolean
  registratieStatus?: string | null
  vergunningsstatus?: string | null
  medischAttest?: boolean | null
  actief?: boolean | null
}

const leeg = (v: unknown) => v == null || String(v).trim() === ''

/** Is de keuring (datum) nog geldig op `nu`? Zonder datum: nee. */
export function keuringGeldig(op: string | Date | null | undefined, nu: Date = new Date()): boolean {
  if (!op) return false
  const d = new Date(op)
  if (Number.isNaN(d.getTime())) return false
  const dagen = (nu.getTime() - d.getTime()) / 86_400_000
  return dagen >= -1 && dagen <= KEURING_GELDIG_DAGEN
}

/** Wat ontbreekt er nog voor de club kan indienen? Lege lijst = klaar om in te dienen. */
export function ontbreektVoorIndienen(p: RegistratieInput, nu: Date = new Date(), emailVanaf: number = EMAIL_VERPLICHT_VANAF): string[] {
  const mist: string[] = []
  if (leeg(p.voornaam)) mist.push('voornaam')
  if (leeg(p.achternaam)) mist.push('naam')
  if (leeg(p.birthDate)) mist.push('geboortedatum')
  if (leeg(p.geslacht)) mist.push('geslacht')
  if (!leeg(p.birthDate) && emailVerplicht(p.birthDate, emailVanaf, nu) && !geldigEmail(p.email)) mist.push('e-mailadres')
  // Een gewoon lid speelt niet: geen medische keuring nodig.
  if ((p.soortLid ?? 'speler') !== 'lid') {
    if (!keuringGeldig(p.medischeKeuringOp, nu)) mist.push(p.medischeKeuringOp ? 'geldige keuringsdatum' : 'keuringsdatum')
    if (!p.heeftAttest) mist.push('doktersattest')
  }
  return mist
}

/** Mag de club deze registratie (nog) bewerken en indienen? Niet terwijl de federatie beslist. */
export function clubMagBewerken(status: string | null | undefined): boolean {
  return status !== 'ingediend'
}

/**
 * Speelgerechtigd: één definitie voor de clublijst, de federatie en de opstelling. Een geldige
 * vergunning en medische keuring, actief, en een speler (geen gewoon lid). Het doktersverbod om
 * HOGER te spelen hoort hier niet bij: dat geldt enkel voor een ploeg van een hogere categorie
 * (zie lib/lineup.ts).
 */
export function isSpeelgerechtigd(p: RegistratieInput): boolean {
  return (
    p.vergunningsstatus === 'geldig' &&
    Boolean(p.medischAttest) &&
    p.actief !== false &&
    (p.soortLid ?? 'speler') !== 'lid'
  )
}

export type RegistratieIcoon = { icoon: string; label: string; toon: 'ok' | 'wacht' | 'todo' | 'fout' | 'lid' }

/** Het icoon achter een naam in de clublijst. */
export function registratieIcoon(p: RegistratieInput, nu: Date = new Date(), emailVanaf: number = EMAIL_VERPLICHT_VANAF): RegistratieIcoon {
  if ((p.soortLid ?? 'speler') === 'lid') return { icoon: '👤', label: 'Gewoon lid', toon: 'lid' }
  if (isSpeelgerechtigd(p)) return { icoon: '✅', label: 'Mag spelen', toon: 'ok' }
  if (p.registratieStatus === 'ingediend') return { icoon: '⏳', label: 'Wacht op de federatie', toon: 'wacht' }
  if (p.registratieStatus === 'afgekeurd') return { icoon: '✗', label: 'Afgekeurd door de federatie', toon: 'fout' }
  const mist = ontbreektVoorIndienen(p, nu, emailVanaf)
  if (mist.length) return { icoon: '✎', label: `Nog aanvullen: ${mist.join(', ')}`, toon: 'todo' }
  return { icoon: '📤', label: 'Klaar om in te dienen', toon: 'todo' }
}

/** Volledige naam uit voornaam + naam (de weergavenaam van de speler). */
export function volledigeNaam(voornaam: string, achternaam: string): string {
  return `${voornaam.trim()} ${achternaam.trim()}`.replace(/\s+/g, ' ').trim()
}
