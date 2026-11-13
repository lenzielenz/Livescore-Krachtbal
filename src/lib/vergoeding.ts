// Scheidsrechter-vergoedingen — bedragen van de officiële KVKBF-formulieren.
// Eén bron van waarheid voor de kwitantie (formulier_2) en het forfait-onkostenblad (formulier_3).
//
// De km-vergoeding is één tarief voor beide (formulier_2 van de federatie: € 0,4452 / km). De federatie past
// het aan in de instellingen (Settings.kmTarief); lees het met `kmTarief(payload)` (lib/vergoeding-data.ts)
// en geef het mee. Zonder instelling geldt KM_TARIEF_STANDAARD.

/** Wedstrijdvergoeding per wedstrijd (beide formulieren). */
export const VERGOEDING_PER_WEDSTRIJD = 13

/** Km-vergoeding als de federatie niets instelde (formulier_2, seizoen 2026-2027). */
export const KM_TARIEF_STANDAARD = 0.4452

/** Een bruikbaar km-tarief: een getal tussen 0 en 5 euro, anders het standaardtarief. */
export function geldigKmTarief(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n > 0 && n < 5 ? n : KM_TARIEF_STANDAARD
}

/** "€0,4452" — het tarief met vier decimalen, zoals op het formulier. */
export function formatKmTarief(perKm: number): string {
  return `€${perKm.toFixed(4).replace('.', ',')}`
}

/** Maximaal aantal auto's dat op het forfait-onkostenblad vergoed wordt. */
export const FORFAIT_MAX_AUTOS = 2

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export type VergoedingBerekening = {
  aantalWedstrijden: number
  km: number
  wedstrijdvergoeding: number
  kmVergoeding: number
  totaal: number
  /** Het gebruikte km-tarief (€/km). */
  perKm: number
}

function bereken(aantalWedstrijden: number, km: number, perKm: number): VergoedingBerekening {
  const n = Math.max(0, Math.floor(aantalWedstrijden))
  const afstand = Math.max(0, km)
  const wedstrijdvergoeding = round2(n * VERGOEDING_PER_WEDSTRIJD)
  const kmVergoeding = round2(afstand * perKm)
  return {
    aantalWedstrijden: n,
    km: afstand,
    wedstrijdvergoeding,
    kmVergoeding,
    totaal: round2(wedstrijdvergoeding + kmVergoeding),
    perKm,
  }
}

/** Kwitantie scheidsrechter: aantal wedstrijden × €13 + km × km-tarief. */
export function berekenKwitantie(aantalWedstrijden: number, km: number, perKm: number = KM_TARIEF_STANDAARD): VergoedingBerekening {
  return bereken(aantalWedstrijden, km, geldigKmTarief(perKm))
}

/** Forfait-onkostenblad: aantal wedstrijden × €13 + km × km-tarief (hetzelfde tarief). */
export function berekenForfait(aantalWedstrijden: number, km: number, perKm: number = KM_TARIEF_STANDAARD): VergoedingBerekening {
  return bereken(aantalWedstrijden, km, geldigKmTarief(perKm))
}

const euroFmt = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' })

export function formatEuro(n: number): string {
  return euroFmt.format(n)
}
