// De reclame die af en toe het scherm overneemt.
//
// Ongeveer om de tien minuten schuift er één reclame groot in beeld, blijft een goede vijftien
// seconden staan, en verdwijnt weer. Drie dingen bepalen of dat als sfeer of als ergernis voelt:
//
//   • NIET OP DE KLOK. Precies elke tien minuten wordt een patroon, en een patroon ga je
//     verwachten en wegkijken. Het moment schommelt daarom rond de tien minuten.
//   • NIET TWEE KEER DEZELFDE. Met vier sponsors is dezelfde reclame twee keer na elkaar puur
//     toeval, maar het lijkt op een fout. Zolang er iets anders te kiezen valt, wordt de vorige
//     overgeslagen.
//   • DE SCORE BLIJFT DOORSCHEMEREN. Wie op dat moment net naar het bord kijkt, mag de stand niet
//     kwijt zijn. Dat is een kwestie van opmaak (het scherm dimt in plaats van te verbergen), maar
//     het staat hier omdat het bij de afspraak hoort.
//
// Puur gerekend en met een injecteerbare toevalsbron, zodat het te testen valt zonder vijftien
// minuten te wachten.

/** Hoelang een reclame in beeld blijft. */
export const OVERLAY_MS = 15_000

/** Het midden van de wachttijd tussen twee reclames. */
export const TUSSENTIJD_MS = 10 * 60_000

/** Hoeveel de wachttijd mag schommelen (± deel van de tussentijd). */
export const SPREIDING = 0.2

export type OverlayReclame = { id: number }

/**
 * Hoelang wachten tot de volgende reclame in beeld komt.
 *
 * Rond de tien minuten, met een marge van twintig procent naar beide kanten — genoeg om het
 * onvoorspelbaar te maken, weinig genoeg om te blijven kloppen met "om de tien minuten".
 */
export function volgendeWachttijdMs(random: () => number = Math.random): number {
  const afwijking = (random() * 2 - 1) * SPREIDING
  return Math.round(TUSSENTIJD_MS * (1 + afwijking))
}

/**
 * Welke reclame komt er nu in beeld?
 *
 * Geeft null als er niets te tonen valt. Met meer dan één reclame wordt de vorige overgeslagen,
 * zodat dezelfde nooit twee keer na elkaar verschijnt.
 */
export function kiesReclame<T extends OverlayReclame>(
  reclames: T[],
  vorigeId: number | null,
  random: () => number = Math.random,
): T | null {
  if (reclames.length === 0) return null
  if (reclames.length === 1) return reclames[0]
  const kandidaten = reclames.filter((r) => r.id !== vorigeId)
  const lijst = kandidaten.length > 0 ? kandidaten : reclames
  const i = Math.min(lijst.length - 1, Math.floor(random() * lijst.length))
  return lijst[i]
}
