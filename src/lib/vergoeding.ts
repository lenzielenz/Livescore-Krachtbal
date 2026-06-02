// Scheidsrechter-vergoedingen — bedragen rechtstreeks van de officiële KVKBF-formulieren.
// Eén bron van waarheid voor de kwitantie (formulier_2) en het forfait-onkostenblad (formulier_3).
//
// LET OP: de km-vergoeding verschilt bewust per formulier (zo staat het gedrukt):
//   - Kwitantie scheidsrechter: € 0,4327 / km
//   - Onkostenblad forfait:     € 0,4259 / km

/** Wedstrijdvergoeding per wedstrijd (beide formulieren). */
export const VERGOEDING_PER_WEDSTRIJD = 13

/** Km-vergoeding op de kwitantie (formulier_2). */
export const KWITANTIE_PER_KM = 0.4327

/** Km-vergoeding op het forfait-onkostenblad (formulier_3). */
export const FORFAIT_PER_KM = 0.4259

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
  }
}

/** Kwitantie scheidsrechter: aantal wedstrijden × €13 + km × €0,4327. */
export function berekenKwitantie(aantalWedstrijden: number, km: number): VergoedingBerekening {
  return bereken(aantalWedstrijden, km, KWITANTIE_PER_KM)
}

/** Forfait-onkostenblad: aantal wedstrijden × €13 + km × €0,4259. */
export function berekenForfait(aantalWedstrijden: number, km: number): VergoedingBerekening {
  return bereken(aantalWedstrijden, km, FORFAIT_PER_KM)
}

const euroFmt = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' })

export function formatEuro(n: number): string {
  return euroFmt.format(n)
}
