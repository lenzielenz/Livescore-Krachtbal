// Worpstatistiek uit de videovoorstellen: hoe ver werpt iemand, en naar links of naar rechts?
//
// De metingen bestonden al per worp (afstandM en richtingGraden op elk cv-event) maar nergens
// als leesbaar geheel. Deze module aggregeert ze per werper — vóór het overzetten, dus op de
// voorstellen zelf: dat is precies het moment waarop een coach wil zien wie waar werpt.
//
// De richting vraagt één vertaalslag. richtingGraden staat in VELD-assen (0° = naar de uitkant,
// +90° = rechterzijlijn — zie cv-naar-worp.ts), maar "werpt hij links of rechts" gaat over de
// wérper: wie richting thuiskant werpt en naar veld-links uitwijkt, gooit naar zíjn rechts.
// Welke helft een ploeg aanvalt weet de video niet (dat is engine-domein), maar de worp zelf
// verraadt zijn voorwaartse richting — daarop spiegelen we, niet op de ploeg.
//
// Puur: geen database, geen React.

/** Binnen zoveel graden van recht vooruit telt een worp als "midden". */
export const KANT_DREMPEL_GRADEN = 15

/**
 * De richting t.o.v. de werper zelf, in graden: 0 = recht vooruit, positief = naar zíjn rechts.
 *
 * De voorwaartse as is de helft waar de worp heen ging: |veldgraden| ≤ 90 is een worp naar de
 * uitkant (de werper kijkt mee met de veldas, zijn rechts ís veld-rechts); |veldgraden| > 90 is
 * een worp naar de thuiskant (de werper staat omgekeerd, zijn rechts is veld-links).
 */
export function relatieveRichting(veldGraden: number): number {
  const g = ((veldGraden + 180) % 360 + 360) % 360 - 180
  if (Math.abs(g) <= 90) return g
  return g > 0 ? -(180 - g) : 180 + g
}

/** Links, midden of rechts — vanuit de werper gezien. */
export function worpKant(veldGraden: number | null | undefined): 'links' | 'midden' | 'rechts' | null {
  if (veldGraden == null || !Number.isFinite(veldGraden)) return null
  const relatief = relatieveRichting(veldGraden)
  if (relatief < -KANT_DREMPEL_GRADEN) return 'links'
  if (relatief > KANT_DREMPEL_GRADEN) return 'rechts'
  return 'midden'
}

/** Wat er van een voorstel nodig is om worpstatistiek te tellen. */
export type Worpmeting = {
  werper?: number | null
  verdict?: 'bevestigd' | 'afgewezen' | null
  afstandM?: number | null
  richtingGraden?: number | null
  uitbal?: boolean | null
}

export type Worpstats = {
  worpen: number
  /** Waarvan met een gemeten afstand (een uitbal heeft er reglementair geen). */
  metAfstand: number
  gemAfstandM: number | null
  maxAfstandM: number | null
  /** Kant vanuit de werper gezien; samen ≤ worpen (zonder richting valt een worp buiten de telling). */
  links: number
  midden: number
  rechts: number
  uitballen: number
}

/** De statistiek over een reeks metingen (bv. alle worpen van één speler). */
export function telWorpstats(metingen: Worpmeting[]): Worpstats {
  const bruikbaar = metingen.filter((m) => m.verdict !== 'afgewezen')
  const afstanden = bruikbaar
    .map((m) => m.afstandM)
    .filter((a): a is number => typeof a === 'number' && Number.isFinite(a))
  const stats: Worpstats = {
    worpen: bruikbaar.length,
    metAfstand: afstanden.length,
    gemAfstandM: afstanden.length
      ? Math.round((afstanden.reduce((s, a) => s + a, 0) / afstanden.length) * 10) / 10
      : null,
    maxAfstandM: afstanden.length ? Math.max(...afstanden) : null,
    links: 0,
    midden: 0,
    rechts: 0,
    uitballen: bruikbaar.filter((m) => m.uitbal === true).length,
  }
  for (const m of bruikbaar) {
    const kant = worpKant(m.richtingGraden)
    if (kant) stats[kant]++
  }
  return stats
}

/** Dezelfde telling, maar per werper-volgnummer (voorstellen zonder werper vallen erbuiten). */
export function worpstatsPerWerper(metingen: Worpmeting[]): Map<number, Worpstats> {
  const perWerper = new Map<number, Worpmeting[]>()
  for (const m of metingen) {
    if (typeof m.werper !== 'number' || !Number.isFinite(m.werper)) continue
    const lijst = perWerper.get(m.werper) ?? []
    lijst.push(m)
    perWerper.set(m.werper, lijst)
  }
  const uit = new Map<number, Worpstats>()
  for (const [werper, lijst] of perWerper) uit.set(werper, telWorpstats(lijst))
  return uit
}
