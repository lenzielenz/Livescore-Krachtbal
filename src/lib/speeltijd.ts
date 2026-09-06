// Tot wanneer loopt DEZE helft?
//
// Het reglement laat de klok stilvallen bij elke time-out en bij een scheidsrechter-onderbreking
// (KRACHTBAL-REGLEMENT §7 en §8.1). Aan de aantekentafel loopt de klok gewoon door — dat is een
// bewuste vereenvoudiging (zie docs/REGELS-CONFORMITEIT.md §2.6): in plaats van te pauzeren
// schuift de doeltijd van de helft één minuut op per gevraagde onderbreking. Netto komt het op
// hetzelfde neer, en wie aantekent hoeft de klok niet te bedienen.
//
// Het publieke scorebord rekende dit al zo ("speelt tot minuut X"); deze module haalt die formule
// uit de opmaak zodat het scorebord en de aantekentafel niet uit elkaar kunnen groeien.
//
// De onderbrekingen tellen PER HELFT: buildMatchState filtert time-outs en scheidsrechter-minuten
// op de lopende helft, dus na de rust valt de doeltijd vanzelf terug op de kale basisduur. Dat is
// ook precies wat de tafel verwacht — nieuwe helft, tellers op nul.

/** Eén gevraagde onderbreking = één minuut (reglement §8.1). */
export const ONDERBREKING_SECONDEN = 60

export interface Onderbrekingen {
  /** Time-outs van beide ploegen in de lopende helft (max. 2 per ploeg). */
  timeouts: { home: number; away: number }
  /** Scheidsrechter-minuten in de lopende helft — geen quotum, telt wél mee. */
  refereeStops: number
}

const heel = (v: unknown): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Hoeveel minuten er in deze helft bijkomen. */
export function extraMinuten(o: Onderbrekingen): number {
  return heel(o?.timeouts?.home) + heel(o?.timeouts?.away) + heel(o?.refereeStops)
}

/** De doeltijd van deze helft in seconden: basisduur + één minuut per onderbreking. */
export function doelSeconden(basisSeconden: number, o: Onderbrekingen): number {
  return heel(basisSeconden) + extraMinuten(o) * ONDERBREKING_SECONDEN
}

/** Tot welke minuut deze helft loopt — de vorm die het scorebord toont. */
export function speeltTotMinuut(basisSeconden: number, o: Onderbrekingen): number {
  return Math.round(heel(basisSeconden) / 60) + extraMinuten(o)
}
