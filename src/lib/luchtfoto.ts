// Van een luchtfoto naar veldmeters.
//
// Waarvoor dit dient. De kalibratie hangt aan de witte lijnen van het veld, en die zijn niet
// altijd de waarheid: een terrein dat geen nette rechthoek is, lijnen die half onder spelers of
// modder liggen, of een camera die zo pant dat ze uit beeld gaan. Dan wil je je kunnen vastzetten
// aan iets dat blijft staan — de hoek van de omheining, een verlichtingspaal, de hoek van de
// kantine. Alleen: van zulke punten kent niemand de veldcoördinaten uit het hoofd.
//
// Een luchtfoto lost dat op. Je duidt de VIER HOEKEN van het veld aan op de foto (die ken je: dat
// is de rechthoek waarvan we breedte en lengte al weten), en daarmee ligt de hele foto vast in
// veldmeters. Elk punt dat je daarna aantikt — ook ver buiten het veld — heeft dan meteen zijn
// coördinaten.
//
// De wiskunde is één homografie tussen twee vlakken, opgelost uit vier puntenparen. Puur, zonder
// DOM en zonder opencv, zodat het te testen valt en in de browser kan draaien.
//
// (Bronbeeld: voor Vlaanderen zijn de orthofoto's van Geopunt / Digitaal Vlaanderen open data en
// bruikbaar. Beeldmateriaal van Google mag je hier niet voor overtrekken — hun voorwaarden staan
// dat niet toe.)

export type Punt2 = { x: number; y: number }

/** Een hoek van het veld zoals aangeduid op de foto, met de veldcoördinaat die erbij hoort. */
export type Hoekpaar = { foto: Punt2; veld: Punt2 }

/** 3×3-matrix, rijen van drie. */
export type Matrix3 = [number[], number[], number[]]

/**
 * Los een 8×8-stelsel op met Gauss-eliminatie en gedeeltelijke pivotering.
 *
 * Zonder pivotering klapt dit om zodra een pivot bijna nul is — en dat gebeurt echt: duid je de
 * hoeken aan in een volgorde waarbij twee rijen sterk op elkaar lijken, dan staat er een piepklein
 * getal op de diagonaal en spat de oplossing uiteen in onzin die er wél uitziet als een matrix.
 */
function losOp(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((rij, i) => [...rij, b[i]])

  for (let kolom = 0; kolom < n; kolom += 1) {
    let beste = kolom
    for (let r = kolom + 1; r < n; r += 1) {
      if (Math.abs(m[r][kolom]) > Math.abs(m[beste][kolom])) beste = r
    }
    if (Math.abs(m[beste][kolom]) < 1e-12) return null // ontaard: geen unieke oplossing
    ;[m[kolom], m[beste]] = [m[beste], m[kolom]]

    for (let r = 0; r < n; r += 1) {
      if (r === kolom) continue
      const f = m[r][kolom] / m[kolom][kolom]
      if (f === 0) continue
      for (let k = kolom; k <= n; k += 1) m[r][k] -= f * m[kolom][k]
    }
  }
  // De diagonaal staat na de eliminatie op rij[i]; delen door de rechterkolom geeft de oplossing.
  return m.map((rij, i) => rij[n] / rij[i])
}

/**
 * De homografie die vier bronpunten op vier doelpunten legt.
 *
 * Geeft null wanneer de punten dat niet vastleggen — drie op één rechte, of twee die samenvallen.
 * Dat is geen randgeval maar het gewone gevolg van slordig aanduiden, en het moet zichtbaar
 * mislukken in plaats van een matrix te verzinnen.
 */
export function homografieUitVier(bron: Punt2[], doel: Punt2[]): Matrix3 | null {
  if (bron.length !== 4 || doel.length !== 4) return null
  const a: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = bron[i]
    const { x: u, y: v } = doel[i]
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  const h = losOp(a, b)
  if (!h || h.some((w) => !Number.isFinite(w))) return null
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ]
}

/** Pas een homografie toe op één punt. Null wanneer het punt op de horizon valt (w ≈ 0). */
export function pasToe(h: Matrix3, p: Punt2): Punt2 | null {
  const w = h[2][0] * p.x + h[2][1] * p.y + h[2][2]
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null
  return {
    x: (h[0][0] * p.x + h[0][1] * p.y + h[0][2]) / w,
    y: (h[1][0] * p.x + h[1][1] * p.y + h[1][2]) / w,
  }
}

/**
 * De veldcoördinaat van een punt op de luchtfoto, gegeven de vier aangeduide veldhoeken.
 *
 * Dit is de hele functie waar het om draait: je tikt de hoek van de omheining aan en krijgt
 * "(-2,4 m, -1,8 m)" terug — een coördinaat die je nergens hoeft op te meten.
 */
export function veldCoordinaatVan(fotoPunt: Punt2, hoeken: Hoekpaar[]): Punt2 | null {
  if (hoeken.length !== 4) return null
  const h = homografieUitVier(
    hoeken.map((p) => p.foto),
    hoeken.map((p) => p.veld),
  )
  return h ? pasToe(h, fotoPunt) : null
}

/**
 * De vier veldhoeken in vaste volgorde, voor een veld van `breedte` × `lengte` meter.
 *
 * De volgorde is de volgorde waarin het scherm ze laat aanduiden; hij ligt hier vast zodat de
 * uitleg op het scherm en de wiskunde niet uit elkaar kunnen lopen.
 */
export function veldHoeken(breedte: number, lengte: number): { naam: string; veld: Punt2 }[] {
  return [
    { naam: 'Thuis links', veld: { x: 0, y: 0 } },
    { naam: 'Thuis rechts', veld: { x: breedte, y: 0 } },
    { naam: 'Uit rechts', veld: { x: breedte, y: lengte } },
    { naam: 'Uit links', veld: { x: 0, y: lengte } },
  ]
}

/** Netjes afgerond op centimeters — meer precisie suggereert een nauwkeurigheid die er niet is. */
export function afgerond(p: Punt2): Punt2 {
  return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }
}
