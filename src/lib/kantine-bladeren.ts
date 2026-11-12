// Hoe de borden van het kantinescherm over bladen verdeeld worden.
//
// Het raster hangt in een venster met `overflow: hidden` van precies één schermhoogte. Passen niet
// alle wedstrijden erin, dan schuiven we per blad door in plaats van ze te proppen — een bord dat
// half afgeknipt is, is op een tv van vijf meter ver waardeloos.
//
// Deze rekensom staat apart omdat ze twee kanten heeft die allebei fout kunnen gaan: te véél
// borden op een blad (afgeknipt) en te wéinig rijen gevuld (halfleeg scherm met minuscule borden).
// Als los stukje logica is ze te testen zonder browser.

/**
 * Onder deze hoogte is een bord van op afstand niet meer te lezen — dan liever bladeren.
 *
 * Was 168: op een gewone tv (met de aftelling bovenaan en de uitslagenbalk onderaan) bleef er
 * zo maar plaats voor één rij van drie borden met reusachtige logo's. Met 130 passen er twee
 * rijen, zes borden per blad, en de logo's schalen mee met de bordhoogte (KantineScreen).
 */
export const MIN_BORD_H = 130
/**
 * Meer rijen dan dit op één blad oogt op een liggende tv niet meer in balans: drie rijen van drie
 * borden worden smalle stroken met de logo's tegen de rand. Twee rijen (zes borden) en dan
 * bladeren leest rustiger. Geldt enkel voor brede rasters; op een smal scherm (één of twee
 * kolommen) zou het te veel bladeren betekenen.
 */
export const MAX_RIJEN_BREED = 2
/** Tussenruimte tussen de borden; moet gelijk lopen met de `gap` van `.kt-grid-screen`. */
export const BLAD_GAT = 14

export interface BladIndeling {
  /** Rijen op één blad. */
  rijenPerBlad: number
  /** Borden op één blad. */
  perBlad: number
  /** Aantal bladen waar het scherm doorheen schuift. */
  bladen: number
  /** Exacte hoogte van één rij, of 0 zolang het venster niet gemeten is. */
  rijH: number
}

const heel = (v: unknown, min: number): number => {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n > min ? n : min
}

/**
 * Verdeel `aantal` borden over bladen die elk exact in `vensterH` passen.
 *
 * Zolang het venster nog niet gemeten is (`vensterH` 0) blijft alles op één blad staan met
 * rijhoogte 0: het component valt dan terug op de CSS-verdeling, zodat het eerste frame niet leeg
 * is en er nog geen bolletjes staan te knipperen voor een indeling die zo weer verandert.
 */
export function bladIndeling(opts: { aantal: number; cols: number; vensterH: number }): BladIndeling {
  const aantal = heel(opts.aantal, 0)
  const cols = heel(opts.cols, 1)
  const vensterH = heel(opts.vensterH, 0)
  const rijenNodig = Math.max(1, Math.ceil(aantal / cols))

  if (vensterH <= 0) {
    return { rijenPerBlad: rijenNodig, perBlad: Math.max(1, aantal), bladen: 1, rijH: 0 }
  }

  const rijenPast = Math.max(1, Math.floor((vensterH + BLAD_GAT) / (MIN_BORD_H + BLAD_GAT)))
  // Nooit méér rijen verdelen dan er écht staan. Anders krijgt één rij borden de hoogte van een
  // vol scherm gedeeld door vier toebedeeld en blijft de rest van de tv zwart — en omdat een tegel
  // `overflow: hidden` heeft, worden de logo's en de ploegnamen er dan ook nog eens afgeknipt.
  // Twee live wedstrijden op een tv is het gewone geval; die horen het scherm te vullen.
  const maxRijen = cols >= 3 ? MAX_RIJEN_BREED : Infinity
  const rijenPerBlad = Math.min(rijenPast, rijenNodig, maxRijen)
  const perBlad = Math.max(1, cols * rijenPerBlad)
  const bladen = Math.max(1, Math.ceil(aantal / perBlad))
  // `rijenPerBlad` rijen plus hun tussenruimtes vullen het venster precies.
  const rijH = (vensterH - (rijenPerBlad - 1) * BLAD_GAT) / rijenPerBlad
  return { rijenPerBlad, perBlad, bladen, rijH }
}
