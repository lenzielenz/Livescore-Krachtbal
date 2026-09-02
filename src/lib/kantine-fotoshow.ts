// De nabeschouwing op het kantinescherm: wat er te zien is nadat álle wedstrijden gespeeld zijn.
//
// Twee dingen willen om beurten in beeld. De **ereplaats** (de kampioenen en alle uitslagen) is
// waarom mensen na afloop nog naar het scherm kijken; de **foto's** van de supporters zijn waarom
// ze blijven kijken. Eén van de twee permanent tonen is telkens het verkeerde antwoord: alleen de
// uitslagen is een dood scherm, alleen foto's en niemand weet nog wie gewonnen heeft.
//
// Vandaar een vaste beurtrol: ereplaats, dan een handvol foto's, dan weer de ereplaats. Wie
// binnenkomt ziet dus nooit lang op de uitslagen te moeten wachten, en de foto's blijven
// doorlopen zolang de tv aanstaat.
//
// Deze module is bewust puur: geen tijd, geen DOM, geen netwerk. Het scherm telt enkel een teller
// op; wélk beeld daarbij hoort, wordt hier beslist en is dus te testen.

/** Eén beeld in de beurtrol. `index` wijst in de fotolijst van die dag. */
export type NaStap = { soort: 'ereplaats' } | { soort: 'foto'; index: number }

/** Hoeveel foto's er tussen twee ereplaatsen passeren (minder als er minder foto's zijn). */
export const FOTOS_PER_RONDE = 6

/** Hoelang de ereplaats blijft staan: lang genoeg om alle uitslagen echt te lezen. */
export const ERE_MS = 18_000
/** Hoelang één foto blijft staan. */
export const FOTO_MS = 7_000

/**
 * Welk beeld hoort bij stap `n` van de beurtrol?
 *
 * De teller loopt gewoon op (0, 1, 2, …) en herhaalt zichzelf nooit exact: na elke ronde foto's
 * gaat hij verder in de lijst, zodat álle foto's aan de beurt komen in plaats van telkens
 * dezelfde eerste zes.
 */
export function naStap(n: number, aantalFotos: number, perRonde: number = FOTOS_PER_RONDE): NaStap {
  if (aantalFotos <= 0) return { soort: 'ereplaats' }
  // Nooit meer foto's per ronde dan er zijn: met drie foto's en een ronde van zes zag je er
  // telkens twee dubbel voordat de uitslagen terugkwamen.
  const per = Math.max(1, Math.min(Math.floor(perRonde), aantalFotos))
  const cyclus = per + 1
  const stap = Math.max(0, Math.floor(n))
  const pos = stap % cyclus
  if (pos === 0) return { soort: 'ereplaats' }
  const ronde = Math.floor(stap / cyclus)
  return { soort: 'foto', index: (ronde * per + (pos - 1)) % aantalFotos }
}

/** Hoelang stap `n` in beeld blijft. */
export function duurVan(stap: NaStap): number {
  return stap.soort === 'ereplaats' ? ERE_MS : FOTO_MS
}

/**
 * Welke foto komt ná deze stap? Het scherm laadt die alvast in — zonder dat zie je bij elke
 * wissel eerst een leeg vlak.
 */
export function volgendeFoto(n: number, aantalFotos: number, perRonde: number = FOTOS_PER_RONDE): number | null {
  const volgend = naStap(n + 1, aantalFotos, perRonde)
  return volgend.soort === 'foto' ? volgend.index : null
}
