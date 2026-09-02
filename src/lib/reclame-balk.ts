// De reclamebalk onderaan het kantinescherm: hoe ze zich aanpast aan wat erin zit.
//
// Het aantal reclames ligt niet vast — vandaag drie sponsors, volgend seizoen twintig. Een balk
// die daar niet op reageert gaat twee kanten uit die allebei fout zijn: met weinig reclames staat
// er een gapend gat en springt de lus zichtbaar terug, met veel reclames raast alles voorbij of
// kruipt het zo traag dat niemand het nog ziet.
//
// Dus twee knoppen, allebei afgeleid uit het aantal:
//
//   • HERHALINGEN — hoe vaak de lijst achter elkaar geplakt wordt. Een lus is pas naadloos als de
//     strook minstens twee schermbreedtes lang is: je schuift precies één helft op en begint
//     opnieuw. Met drie reclames zijn daar meer kopieën voor nodig dan met twintig.
//   • DUUR — niet vast, maar afgeleid van de lengte. Zo passeert elke reclame met dezelfde
//     snelheid, of er nu drie of dertig in de balk staan. Dát is wat "rustig" leest.
//
// Puur gerekend, zonder DOM: het scherm zet er enkel de uitkomst op.

/** Breedte die één tegel ongeveer inneemt (px). Vaste maat: elke reclame krijgt evenveel ruimte. */
export const TEGEL_PX = 260

/** Hoe snel de balk schuift (px per seconde). Traag genoeg om te lezen, snel genoeg om te leven. */
export const SNELHEID_PX_S = 55

/** Onder deze lengte staat de balk stil — schuiven met één reclame is enkel onrustig. */
export const MIN_VOOR_LUS = 2

export type BalkOpstelling = {
  /** Hoe vaak de lijst achter elkaar geplakt wordt (minstens 1). */
  herhalingen: number
  /** Hoelang één volledige omloop duurt, in seconden. 0 = staat stil. */
  duurSec: number
  /** Schuift de balk? Bij één reclame niet. */
  loop: boolean
}

/**
 * De opstelling van de balk voor `aantal` reclames op een scherm van `schermPx` breed.
 *
 * `schermPx` mag ontbreken (server-render): dan rekenen we met een gewone tv-breedte. Het scherm
 * mag het achteraf bijstellen zodra het zijn eigen breedte kent.
 */
export function balkOpstelling(aantal: number, schermPx = 1920): BalkOpstelling {
  const n = Math.max(0, Math.floor(aantal))
  if (n === 0) return { herhalingen: 1, duurSec: 0, loop: false }
  if (n < MIN_VOOR_LUS) return { herhalingen: 1, duurSec: 0, loop: false }

  // Genoeg kopieën om twee schermbreedtes te vullen: dat is de voorwaarde voor een lus zonder
  // zichtbare sprong. (De strook wordt in het scherm nog één keer verdubbeld voor de animatie.)
  const perRonde = n * TEGEL_PX
  const nodig = Math.max(1, Math.ceil((schermPx * 2) / Math.max(1, perRonde)))
  const herhalingen = Math.min(12, nodig)

  // Duur volgt de lengte, zodat de snelheid constant blijft.
  const strookPx = perRonde * herhalingen
  const duurSec = Math.max(20, Math.round(strookPx / SNELHEID_PX_S))
  return { herhalingen, duurSec, loop: true }
}
