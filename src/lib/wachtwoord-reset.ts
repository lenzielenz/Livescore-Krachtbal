import { formatDateTimeBE } from './datetime'
// Wachtwoord vergeten: de regels rond een eenmalige herstellink.
//
// Er gaat bewust géén mail de deur uit. Een beheerder maakt de link aan in het accountbeheer
// en geeft ze zelf door (WhatsApp, telefoon, in de kantine) — zo blijft de flow werken op een
// installatie zonder mailconfiguratie, en hoeft niemand een mailbox te hebben die hij niet
// meer kan openen. Wat de beheerder NIET doet: een wachtwoord voor iemand anders kiezen. De
// gebruiker zet zijn eigen wachtwoord via de link; de beheerder ziet het nooit.
//
// De token zelf komt van Payload (crypto.randomBytes(20) → 40 hex-tekens, bewaard als
// resetPasswordToken met een vervaldatum). Deze module bevat enkel de pure regels eromheen,
// zodat ze te testen zijn zonder database: hoe lang een link geldig is, hoe ze eruitziet, en
// wat een geldig wachtwoord is.

/**
 * Hoe lang een herstellink bruikbaar blijft.
 *
 * Payload's standaard is één uur. Dat is kort voor deze weg: de beheerder maakt de link vaak
 * 's avonds aan en de gebruiker leest het bericht pas de volgende ochtend. Een dag is lang
 * genoeg om dat op te vangen en kort genoeg om een doorgestuurd bericht niet weken later nog
 * bruikbaar te laten zijn. De vervaldatum staat ook in het scherm, zodat de beheerder weet
 * wat hij belooft.
 */
export const HERSTEL_GELDIG_MS = 24 * 60 * 60 * 1000

/** Minimale wachtwoordlengte — zelfde eis als bij registreren en bij wachtwoord wijzigen. */
export const MIN_WACHTWOORD = 8

/**
 * Een herstel-token uit de URL lezen.
 *
 * Payload maakt er 40 hex-tekens van. Streng zijn scheelt een rondje naar de database voor
 * elke geknutselde link, en houdt rommel uit de logs.
 */
export function geldigeToken(ruw: unknown): string | null {
  const t = typeof ruw === 'string' ? ruw.trim() : ''
  return /^[a-f0-9]{20,128}$/i.test(t) ? t : null
}

/** Is dit wachtwoord bruikbaar? Geeft de reden terug als het niet deugt (voor het scherm). */
export function wachtwoordFout(wachtwoord: unknown): string | null {
  if (typeof wachtwoord !== 'string' || wachtwoord.length < MIN_WACHTWOORD) {
    return `Kies een wachtwoord van minstens ${MIN_WACHTWOORD} tekens.`
  }
  // Payload hasht met bcrypt-achtige lengtes; een absurd lange invoer is geen wachtwoord maar
  // een poging om de server te laten zwoegen.
  if (wachtwoord.length > 200) return 'Dat wachtwoord is te lang (max. 200 tekens).'
  return null
}

/**
 * De volledige herstellink die de beheerder doorgeeft.
 *
 * `basis` is de publieke URL van de site (PUBLIC_SERVER_URL). Ontbreekt die, dan geven we een
 * pad terug in plaats van een halve URL met 'undefined' erin: de beheerder plakt er zelf het
 * domein voor, en het scherm zegt dat erbij.
 */
export function herstelLink(token: string, basis?: string | null): string {
  const pad = `/wachtwoord-herstellen?token=${encodeURIComponent(token)}`
  const schoon = (basis ?? '').trim().replace(/\/+$/, '')
  return schoon ? `${schoon}${pad}` : pad
}

/** Wanneer deze link vervalt, als tijdstip. */
export function vervaltOp(nu: number, geldigMs: number = HERSTEL_GELDIG_MS): Date {
  return new Date(nu + geldigMs)
}

/**
 * De vervaldatum in mensentaal, voor het beheerscherm.
 *
 * Bewust in de Belgische notatie en zonder seconden: het is een geheugensteun voor wie de link
 * doorgeeft ("dit is morgenvroeg nog geldig"), geen contract op de seconde.
 */
export function vervalTekst(vervalt: Date): string {
  return formatDateTimeBE(vervalt, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}
