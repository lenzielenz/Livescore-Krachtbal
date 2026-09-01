import { FIELD, totalLengthM, veldMaten, type Point, type VeldMaten } from './field'

// Van een bevestigd videovoorstel naar de invoer van één worp.
//
// De video-weg belooft "alles op video berekend": je voert niets in, je bevestigt wat het model
// aandroeg. Maar zolang een bevestigd voorstel enkel een voorstel blijft, blijft de veldkaart
// leeg en klopt er geen enkele statistiek — de rest van het platform leeft van `throws`.
//
// Deze module doet de vertaling, en niets meer dan dat. Hij is bewust puur en klein, want de
// drie plekken waar het stil fout kan gaan zitten hier:
//
//  1. HET ASSENSTELSEL. cv/veld.py spiegelt src/lib/field.ts exact: x over de breedte, y over de
//     volledige lengte inclusief beide doelgebieden, y=0 aan de thuis-achterlijn. De CV levert
//     meters, de engine wil genormaliseerd. Eén keer verkeerd delen en elke landing ligt op een
//     andere plek op het veld — zonder dat er iets crasht.
//  2. DE UITKOMST. De engine leidt die zélf af uit het landingspunt (deriveOutcome): doel, uit,
//     eigen doelgebied. Wij mogen dus nooit een uitkomst meegeven — enkel of de bal gevángen
//     werd, want dát is het enige dat je niet aan de landingsplek ziet.
//  3. WAT NIET OVER MAG. Een voorstel zonder landingspunt kan geen worp worden: dan is er geen
//     plek, en de engine zou er een verzinnen. Zo'n voorstel hoort overgeslagen te worden, mét
//     vermelding — stilzwijgend weglaten is hoe je een wedstrijd van 60 worpen als 41 in de
//     boeken krijgt.

/** Wat er van een cv-event nodig is om er een worp van te maken. */
export type Voorstelworp = {
  videoTimeS: number
  /** De werper-groep uit de videoanalyse (geen rugnummer). */
  werper?: number | null
  eventType: 'worp' | 'vangst' | 'doelpunt' | 'buitenspel'
  worpType?: 'nek' | 'rug' | null
  side?: 'home' | 'away' | null
  rugnummer?: number | null
  xM?: number | null
  yM?: number | null
  /** De bal landde buiten de lijnen: het punt ligt dan bewúst buiten het veld. */
  uitbal?: boolean | null
  verdict?: 'bevestigd' | 'afgewezen' | null
}

/** De velden die recordThrow van ons verwacht (de rest leidt de engine zelf af). */
export type Worpinvoer = {
  type: 'nek' | 'rug'
  /** De werper-groep uit de video; met de toewijzing wordt dat een échte speler. */
  werper: number | null
  point: Point
  tapCount: 1 | 2
  rugnummer: number | null
  side: 'home' | 'away' | null
  videoTimeS: number
}

/** Meters op het veld → genormaliseerd punt. Spiegel van `toMeters` en van cv/veld.py. */
export function naarNorm(
  xM: number,
  yM: number,
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
  maten?: Partial<VeldMaten> | null,
): Point {
  const breedte = veldMaten(maten).breedteM
  const lengte = totalLengthM(goalAreaDepthM, maten)
  return {
    x: breedte > 0 ? xM / breedte : 0,
    y: lengte > 0 ? yM / lengte : 0,
  }
}

/** Ligt dit punt binnen het veld? Buiten zónder uitbal-vlag betekent: de meting deugt niet. */
export function opHetVeld(p: Point, marge = 0.02): boolean {
  return p.x >= -marge && p.x <= 1 + marge && p.y >= -marge && p.y <= 1 + marge
}

/**
 * Is dit een geloofwaardig uitbal-punt?
 *
 * Een uitbal ligt buiten de lijnen, maar niet in een ander dorp: tot een halve veldmaat
 * erbuiten is een gemiste bal, verder is het een kapotte projectie. De grens is ruim genomen —
 * een verre uitworp over de achterlijn kan best tien meter doorschieten.
 */
export function geloofwaardigeUitbal(p: Point): boolean {
  return p.x >= -0.5 && p.x <= 1.5 && p.y >= -0.5 && p.y <= 1.5 && !opHetVeld(p, 0)
}

/**
 * Eén bevestigd voorstel als worp-invoer, of null als het niet overgezet kan worden.
 *
 * Enkel BEVESTIGDE voorstellen komen in aanmerking: een afgewezen voorstel is per definitie
 * geen worp, en een onbeoordeeld voorstel is nog niemands oordeel.
 */
export function worpUitVoorstel(
  v: Voorstelworp,
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
  maten?: Partial<VeldMaten> | null,
): Worpinvoer | null {
  if (v.verdict !== 'bevestigd') return null
  if (typeof v.xM !== 'number' || typeof v.yM !== 'number') return null
  if (!Number.isFinite(v.xM) || !Number.isFinite(v.yM)) return null

  const point = naarNorm(v.xM, v.yM, goalAreaDepthM, maten)
  // Een uitbal ligt bewúst buiten de lijnen: dat punt moet ONGEKLEMD naar de engine, want
  // precies daaruit leidt die 'uit' af (out_side/out_back). Alles daarbuiten blijft de oude
  // regel: buiten het veld zonder uitbal-vlag is een kapotte meting, geen worp.
  const uitbal = v.uitbal === true && geloofwaardigeUitbal(point)
  if (!uitbal && !opHetVeld(point)) return null

  return {
    // Weet het model het worptype niet, dan is 'nek' de gewone worp — en de reviewlaan laat
    // je dat per voorstel corrigeren vóór je overzet.
    type: v.worpType === 'rug' ? 'rug' : 'nek',
    point: uitbal ? point : { x: Math.min(1, Math.max(0, point.x)), y: Math.min(1, Math.max(0, point.y)) },
    // Twee tikken = gevangen. Dat is het enige dat je niet aan de landingsplek kunt zien; doel,
    // uit en eigen doelgebied leidt de engine zelf af.
    tapCount: v.eventType === 'vangst' ? 2 : 1,
    rugnummer: typeof v.rugnummer === 'number' && v.rugnummer >= 0 ? v.rugnummer : null,
    werper: typeof v.werper === 'number' && Number.isFinite(v.werper) ? v.werper : null,
    side: v.side === 'home' || v.side === 'away' ? v.side : null,
    videoTimeS: v.videoTimeS,
  }
}

export type Overzetplan = {
  /** De worpen die overgezet kunnen worden, op videotijd gesorteerd. */
  worpen: Worpinvoer[]
  /** Wat er afvalt en waarom — stilzwijgend weglaten verzint een andere wedstrijd. */
  overgeslagen: { videoTimeS: number; reden: string }[]
}

/**
 * Het plan: welke bevestigde voorstellen worden worpen, en wat valt af?
 *
 * Op videotijd, want dat is de volgorde waarin het gespeeld werd. De engine bouwt de
 * balbezit-keten daaruit op; wij bepalen die niet.
 */
export function maakOverzetplan(
  voorstellen: Voorstelworp[],
  goalAreaDepthM: number = FIELD.defaultGoalAreaDepthM,
  maten?: Partial<VeldMaten> | null,
): Overzetplan {
  const worpen: Worpinvoer[] = []
  const overgeslagen: { videoTimeS: number; reden: string }[] = []

  for (const v of [...voorstellen].sort((a, b) => a.videoTimeS - b.videoTimeS)) {
    if (v.verdict === 'afgewezen') continue
    if (v.verdict !== 'bevestigd') {
      overgeslagen.push({ videoTimeS: v.videoTimeS, reden: 'nog niet beoordeeld' })
      continue
    }
    const w = worpUitVoorstel(v, goalAreaDepthM, maten)
    if (!w) {
      overgeslagen.push({
        videoTimeS: v.videoTimeS,
        reden:
          typeof v.xM === 'number' && typeof v.yM === 'number'
            ? v.uitbal === true
              ? 'uitbal-punt te ver buiten het veld om geloofwaardig te zijn'
              : 'landingspunt valt buiten het veld'
            : 'geen landingspunt (zonder veldkalibratie weet niets waar de bal viel)',
      })
      continue
    }
    worpen.push(w)
  }

  return { worpen, overgeslagen }
}
