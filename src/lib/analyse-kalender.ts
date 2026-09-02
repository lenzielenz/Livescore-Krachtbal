// De volgorde van de kalenderlijst waarin je een wedstrijd kiest om te analyseren.
//
// Chronologisch klinkt logisch, maar dat is het hier niet: de lijst loopt van maanden terug tot
// maanden vooruit, en wat je zoekt ligt bijna altijd dicht bij vandaag — de wedstrijd van
// afgelopen weekend, of die van volgende week. Chronologisch zet die precies in het midden, met
// tientallen andere ervoor.
//
// Dus: dichtst bij vandaag eerst. Wie verder terug moet, scrollt door; wie de laatste wedstrijd
// zoekt, vindt ze bovenaan.

export type KalenderRij = { date: string | null }

const tijd = (d: string | null): number | null => {
  if (!d) return null
  const t = new Date(d).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * Sorteer op afstand tot `nu`, dichtstbij eerst. Wedstrijden zonder datum sluiten achteraan aan,
 * in hun oorspronkelijke volgorde. Geeft een nieuwe lijst terug.
 */
export function dichtstBijEerst<T extends KalenderRij>(rijen: T[], nu: number = Date.now()): T[] {
  return rijen
    .map((rij, i) => ({ rij, i, t: tijd(rij.date) }))
    .sort((a, b) => {
      if (a.t == null && b.t == null) return a.i - b.i
      if (a.t == null) return 1
      if (b.t == null) return -1
      const verschil = Math.abs(a.t - nu) - Math.abs(b.t - nu)
      // Even ver weg (een wedstrijd even lang geleden als eentje even ver vooruit)? Dan eerst de
      // gespeelde: dát is degene die je wil analyseren.
      return verschil !== 0 ? verschil : a.t - b.t
    })
    .map((x) => x.rij)
}
