// Van een tik op het scherm naar een pixel in het videobeeld — en terug.
//
// Waarom dit een eigen module is: hier zit de hele nauwkeurigheid van de kalibratie in. Een
// video van 1920 px breed staat op een telefoon in een vak van pakweg 350 CSS-pixels. Eén
// schermpixel is dan 5,5 beeldpixels, en een duim raakt het scherm op zo'n 10 pixels
// nauwkeurig: elke tik zit er dus al gauw 55 beeldpixels naast, nog vóór je scheef mikt. Ver
// van de camera is dat zomaar een halve meter op het veld, en die fout zit daarna in élke
// gemeten landing.
//
// De oplossing is niet "beter mikken" maar vergroten: het beeld uitvergroot tonen en op dát
// vergrote beeld tikken. Bij een vergroting van 6× is één schermpixel nog 0,9 beeldpixels.
//
// Puur rekenwerk, geen React: zo valt de omrekening te testen zonder browser. Staat ze scheef,
// dan zit élk punt ernaast en is er in het scherm niets van te zien.

/** Het beeld waarop aangeduid wordt (de echte videoresolutie). */
export type Beeldmaat = { breedte: number; hoogte: number }

/** Het vak op het scherm waarin dat beeld getekend staat (CSS-pixels). */
export type Vak = { breedte: number; hoogte: number }

/** Een positie binnen het vak, in CSS-pixels vanaf de linkerbovenhoek. */
export type Schermpunt = { x: number; y: number }

/** Een pixel in het videobeeld. */
export type Beeldpunt = { x: number; y: number }

/** Hoe ver mag je van het beeld af zoomen, en hoe diep erin. */
export const MIN_ZOOM = 1
export const MAX_ZOOM = 12

/**
 * Hoeveel beeldpixels bestrijkt één schermpixel?
 *
 * Dit getal ís de haalbare nauwkeurigheid: bij 5,5 kun je nooit preciezer dan ± 5,5 px mikken,
 * hoe stil je hand ook is. Kleiner dan 1 betekent dat je subpixel kunt aanwijzen — dan is je
 * hand de beperking en niet meer het scherm.
 */
export function beeldPerScherm(beeld: Beeldmaat, vak: Vak, zoom = 1): number {
  if (!(vak.breedte > 0) || !(beeld.breedte > 0) || !(zoom > 0)) return 0
  return beeld.breedte / (vak.breedte * zoom)
}

/** De zoom die nodig is om één schermpixel op hoogstens `doel` beeldpixels te krijgen. */
export function nodigeZoom(beeld: Beeldmaat, vak: Vak, doel = 1): number {
  const ruw = beeldPerScherm(beeld, vak, 1)
  if (!(ruw > 0) || !(doel > 0)) return MIN_ZOOM
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.ceil(ruw / doel)))
}

export function klem(waarde: number, laag: number, hoog: number): number {
  return Math.min(hoog, Math.max(laag, waarde))
}

/**
 * Het zichtbare venster op het beeld bij deze zoom en dit middelpunt.
 *
 * Het middelpunt ligt in beeldpixels. Het venster wordt binnen het beeld gehouden: naar de rand
 * toe schuift het mee in plaats van buiten het beeld te wijzen, anders kijk je naar zwart
 * terwijl je denkt dat je de hoek van het veld ziet.
 */
export function venster(
  beeld: Beeldmaat,
  zoom: number,
  midden: Beeldpunt,
): { x: number; y: number; breedte: number; hoogte: number } {
  const z = klem(zoom, MIN_ZOOM, MAX_ZOOM)
  const breedte = beeld.breedte / z
  const hoogte = beeld.hoogte / z
  const x = klem(midden.x - breedte / 2, 0, Math.max(0, beeld.breedte - breedte))
  const y = klem(midden.y - hoogte / 2, 0, Math.max(0, beeld.hoogte - hoogte))
  return { x, y, breedte, hoogte }
}

/**
 * Waar in het beeld raakte deze tik?
 *
 * `vak` is de afmeting van het element waarin het venster getekend staat; `punt` de positie van
 * de vinger of muis binnen dat element. Bij zoom 1 is dit de gewone omrekening; bij hogere zoom
 * telt alleen het zichtbare venster mee.
 */
export function naarBeeld(
  punt: Schermpunt,
  vak: Vak,
  beeld: Beeldmaat,
  zoom = 1,
  midden?: Beeldpunt,
): Beeldpunt {
  if (!(vak.breedte > 0) || !(vak.hoogte > 0)) return { x: 0, y: 0 }
  const v = venster(beeld, zoom, midden ?? { x: beeld.breedte / 2, y: beeld.hoogte / 2 })
  return {
    x: klem(v.x + (punt.x / vak.breedte) * v.breedte, 0, beeld.breedte),
    y: klem(v.y + (punt.y / vak.hoogte) * v.hoogte, 0, beeld.hoogte),
  }
}

/** Omgekeerd: waar staat deze beeldpixel op het scherm? (Voor het tekenen van gezette punten.) */
export function naarScherm(
  beeldpunt: Beeldpunt,
  vak: Vak,
  beeld: Beeldmaat,
  zoom = 1,
  midden?: Beeldpunt,
): Schermpunt {
  const v = venster(beeld, zoom, midden ?? { x: beeld.breedte / 2, y: beeld.hoogte / 2 })
  return {
    x: ((beeldpunt.x - v.x) / v.breedte) * vak.breedte,
    y: ((beeldpunt.y - v.y) / v.hoogte) * vak.hoogte,
  }
}

/**
 * De CSS om een uitsnede van het beeld schermvullend te tonen, met background-position.
 *
 * Vergroten met `background-size` in plaats van met een canvas: geen tweede kopie van het beeld
 * in het geheugen (het is een data-URL van een heel frame), en de browser schaalt het zelf. Bij
 * hoge zoom wil je nét geen gladstrijking — anders verdwijnt de lijn die je zoekt in de
 * interpolatie — vandaar `image-rendering: pixelated` in de stijl van het element zelf.
 */
export function vensterStijl(
  beeld: Beeldmaat,
  zoom: number,
  midden: Beeldpunt,
): { backgroundSize: string; backgroundPosition: string } {
  const v = venster(beeld, zoom, midden)
  const z = klem(zoom, MIN_ZOOM, MAX_ZOOM)
  // Hoeveel procent van de "overschietende" breedte moet er links buiten beeld vallen. Bij
  // zoom 1 valt er niets buiten beeld en is de deler 0 — dan is 0% de enige zinnige waarde.
  const overX = beeld.breedte - v.breedte
  const overY = beeld.hoogte - v.hoogte
  return {
    backgroundSize: `${z * 100}% ${z * 100}%`,
    backgroundPosition: `${overX > 0 ? (v.x / overX) * 100 : 0}% ${overY > 0 ? (v.y / overY) * 100 : 0}%`,
  }
}

// Hoe snel volgt het dradenkruis je vinger? Een grote veeg is "ik reis naar de andere hoek"
// en volgt één op één; kleine stapjes zijn "ik leg het precies goed" en gaan trager, zodat je
// trilling gedeeld wordt. Zonder dit tóónt de loep wel dat je ernaast zit maar kun je het niet
// rechtzetten: één schermpixel duimtrilling blijft anders vijf beeldpixels.
export const TRAAG_PX = 2
export const SNEL_PX = 14
export const FIJNSTE_WINST = 1 / 3

/**
 * De verhouding waarmee een vingerverplaatsing doorwerkt op het dradenkruis.
 *
 * `afstandPx` is hoeveel schermpixels de vinger sinds de vorige melding bewoog. Traag = fijn,
 * snel = één op één, en daartussen glijdt het over.
 */
export function richtwinst(afstandPx: number): number {
  const d = Math.abs(afstandPx)
  if (d <= TRAAG_PX) return FIJNSTE_WINST
  if (d >= SNEL_PX) return 1
  const deel = (d - TRAAG_PX) / (SNEL_PX - TRAAG_PX)
  return FIJNSTE_WINST + deel * (1 - FIJNSTE_WINST)
}

/**
 * Hoe nauwkeurig is dit aanduiden, uitgedrukt in meters op het veld?
 *
 * `meterPerPixel` komt van de server (de precisie-berekening bij het bewaren): hoeveel meter
 * één beeldpixel waard is op het slechtste deel van het veld. Zo wordt een abstract getal
 * ("5,5 beeldpixels per schermpixel") iets waar je een gevoel bij hebt: "een halve meter".
 */
export function nauwkeurigheidM(
  beeld: Beeldmaat,
  vak: Vak,
  zoom: number,
  meterPerPixel: number | null | undefined,
  vingerPx = 8,
): number | null {
  if (!meterPerPixel || !(meterPerPixel > 0)) return null
  const perScherm = beeldPerScherm(beeld, vak, zoom)
  if (!(perScherm > 0)) return null
  return perScherm * vingerPx * meterPerPixel
}
