import { MERKEN, midden, QR, QR_MARGE, type Rect, VAKJE_BINNENRAND, VAKJES, type Vakje } from './medische-kaart-layout'

// Het medisch attest lezen uit een foto (pure rekenwerk op grijswaarden; geen sharp, geen databank).
//
// 1. De QR (al gevonden door jsQR) ligt op een gekende plaats op het blad: zijn vier hoeken geven een eerste,
//    ruwe uitlijning (blad-mm → beeldpixels). Ruw: van een QR van 3 cm naar een hoek 28 cm verder vergroot elke
//    pixel afwijking.
// 2. Daarom zoeken we de vier zwarte hoekmerken niet op één voorspelde plek, maar over de hele foto: elk vol,
//    ongeveer vierkant zwart vlak van de verwachte grootte is een kandidaat. Per hoek nemen we de kandidaat die het
//    dichtst bij de voorspelling ligt. Met de vier merken rekenen we de uitlijning opnieuw uit over het hele blad
//    (nauwkeurig tot in de onderste hoeken, ook bij een scheve foto).
// 3. In elk aankruisvakje meten we hoeveel inkt er staat, tegenover het papier net naast het vakje (schaduw op
//    een foto maakt het papier grijs; een vaste drempel zou dat als inkt lezen).
//
// Wat we niet zeker weten, zeggen we: `aangekruist: null` = twijfel, een mens kijkt na.

export type Punt = { x: number; y: number }
export type Grijs = { data: Uint8Array | Uint8ClampedArray; b: number; h: number }
export type QrLigging = { linksboven: Punt; rechtsboven: Punt; linksonder: Punt; rechtsonder: Punt; versie: number }

export type VakLezing = { aangekruist: boolean | null; inkt: number }
export type AttestLezing = { uitlijning: 'merken' | 'qr'; vakjes: Record<Vakje, VakLezing> }

/** Drempels voor de inkt in een vakje (fractie van het binnenvlak). Een kruisje met balpen: ±12–30 %. */
export const INKT_JA = 0.08
export const INKT_NEE = 0.035

// ── Homografie (vier punten → vier punten) ──────────────────────────────────────────────────────────

/** De 3×3-matrix (h33 = 1) die `van[i]` op `naar[i]` afbeeldt. Null als de punten ontaard zijn. */
export function homografie(van: Punt[], naar: Punt[]): number[] | null {
  const A: number[][] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = van[i]!
    const { x: u, y: v } = naar[i]!
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  }
  // Gauss-eliminatie met spilkeuze op het 8×9-stelsel.
  for (let k = 0; k < 8; k++) {
    let spil = k
    for (let r = k + 1; r < 8; r++) if (Math.abs(A[r]![k]!) > Math.abs(A[spil]![k]!)) spil = r
    if (Math.abs(A[spil]![k]!) < 1e-12) return null
    ;[A[k], A[spil]] = [A[spil]!, A[k]!]
    for (let r = 0; r < 8; r++) {
      if (r === k) continue
      const f = A[r]![k]! / A[k]![k]!
      for (let c = k; c < 9; c++) A[r]![c]! -= f * A[k]![c]!
    }
  }
  const h = A.map((rij, i) => rij[8]! / rij[i]!)
  return [...h, 1]
}

export function afbeelden(H: number[], p: Punt): Punt {
  const w = H[6]! * p.x + H[7]! * p.y + H[8]!
  return { x: (H[0]! * p.x + H[1]! * p.y + H[2]!) / w, y: (H[3]! * p.x + H[4]! * p.y + H[5]!) / w }
}

// ── Hulp ────────────────────────────────────────────────────────────────────────────────────────────

const pix = (g: Grijs, x: number, y: number): number => {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= g.b || yi >= g.h) return 255
  return g.data[yi * g.b + xi]!
}

/** Otsu-drempel over het hele beeld: scheidt inkt van papier. */
export function otsu(g: Grijs): number {
  const hist = new Array<number>(256).fill(0)
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]!]!++
  const n = g.data.length
  let som = 0
  for (let t = 0; t < 256; t++) som += t * hist[t]!
  let somB = 0
  let wB = 0
  let best = 0
  let drempel = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!
    if (!wB) continue
    const wF = n - wB
    if (!wF) break
    somB += t * hist[t]!
    const mB = somB / wB
    const mF = (som - somB) / wF
    const tussen = wB * wF * (mB - mF) ** 2
    if (tussen > best) {
      best = tussen
      drempel = t
    }
  }
  return drempel
}

/** De vier hoeken (blad-mm) van het QR-symbool zelf, zonder de stille rand. */
function qrHoeken(versie: number): Punt[] {
  const n = 17 + 4 * versie
  const mod = QR.b / (n + 2 * QR_MARGE)
  const x0 = QR.x + QR_MARGE * mod
  const y0 = QR.y + QR_MARGE * mod
  const z = n * mod
  return [
    { x: x0, y: y0 },
    { x: x0 + z, y: y0 },
    { x: x0, y: y0 + z },
    { x: x0 + z, y: y0 + z },
  ]
}

type Vlek = { x: number; y: number; z: number }

/**
 * Alle volle, ongeveer vierkante donkere vlakken van ongeveer de grootte van een hoekmerk (zijde tussen
 * `zMin` en `zMax` pixels): verbonden donkere pixels (union-find), met hun zwaartepunt. Letters, lijnen en de
 * QR vallen af: te klein, te langgerekt, of niet vol (de zoekpatronen van een QR zijn ringen).
 */
export function merkKandidaten(g: Grijs, drempel: number, zMin: number, zMax: number): Vlek[] {
  const { b, h } = g
  const ouder = new Int32Array(b * h).fill(-1)
  const wortel = (i: number): number => {
    while (ouder[i] !== i) {
      ouder[i] = ouder[ouder[i]!]!
      i = ouder[i]!
    }
    return i
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      const i = y * b + x
      if (g.data[i]! >= drempel) continue
      ouder[i] = i
      const links = x > 0 && ouder[i - 1]! >= 0 ? wortel(i - 1) : -1
      const boven = y > 0 && ouder[i - b]! >= 0 ? wortel(i - b) : -1
      if (links >= 0) ouder[i] = links
      if (boven >= 0) {
        if (links >= 0 && links !== boven) ouder[boven] = links
        else if (links < 0) ouder[i] = boven
      }
    }
  }
  const stats = new Map<number, { n: number; sx: number; sy: number; x0: number; y0: number; x1: number; y1: number }>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < b; x++) {
      const i = y * b + x
      if (ouder[i]! < 0) continue
      const r = wortel(i)
      const s = stats.get(r)
      if (!s) stats.set(r, { n: 1, sx: x, sy: y, x0: x, y0: y, x1: x, y1: y })
      else {
        s.n++
        s.sx += x
        s.sy += y
        if (x < s.x0) s.x0 = x
        if (x > s.x1) s.x1 = x
        if (y < s.y0) s.y0 = y
        if (y > s.y1) s.y1 = y
      }
    }
  }
  const uit: Vlek[] = []
  for (const s of stats.values()) {
    const bb = s.x1 - s.x0 + 1
    const hh = s.y1 - s.y0 + 1
    const z = Math.sqrt(s.n)
    // Een scheef vierkant vult zijn omhullende rechthoek minder: tot 45° is dat de helft.
    if (z < zMin || z > zMax || bb / hh > 1.6 || hh / bb > 1.6 || s.n / (bb * hh) < 0.48) continue
    uit.push({ x: s.sx / s.n, y: s.sy / s.n, z })
  }
  return uit
}

/** Hoeveel inkt er binnen in een vakje staat, tegenover het papier net naast het vakje. */
function leesVak(g: Grijs, H: number[], r: Rect): VakLezing {
  const N = 22
  const papier: number[] = []
  // Papier: een strook 2,5–3 mm buiten het vakje (links, boven en onder; rechts staat de tekst).
  for (let i = 0; i < 40; i++) {
    const t = i / 39
    papier.push(pix(g, ...xy(afbeelden(H, { x: r.x - 3, y: r.y + t * r.h }))))
    papier.push(pix(g, ...xy(afbeelden(H, { x: r.x + t * r.b, y: r.y - 2.5 }))))
    papier.push(pix(g, ...xy(afbeelden(H, { x: r.x + t * r.b, y: r.y + r.h + 2.5 }))))
  }
  papier.sort((a, b) => a - b)
  const wit = papier[Math.floor(papier.length * 0.6)]!
  const drempel = wit * 0.62
  let donker = 0
  const m = VAKJE_BINNENRAND
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const p = afbeelden(H, { x: r.x + m + ((r.b - 2 * m) * (i + 0.5)) / N, y: r.y + m + ((r.h - 2 * m) * (j + 0.5)) / N })
      if (pix(g, p.x, p.y) < drempel) donker++
    }
  }
  const inkt = donker / (N * N)
  return { aangekruist: inkt >= INKT_JA ? true : inkt <= INKT_NEE ? false : null, inkt: Math.round(inkt * 1000) / 1000 }
}
const xy = (p: Punt): [number, number] => [p.x, p.y]

/**
 * Leest het attest: uitlijnen op de QR en de hoekmerken, dan de aankruisvakjes. Null als zelfs de ruwe
 * uitlijning niet lukt.
 */
export function leesAttest(g: Grijs, qr: QrLigging): AttestLezing | null {
  const ruw = homografie(qrHoeken(qr.versie), [qr.linksboven, qr.rechtsboven, qr.linksonder, qr.rechtsonder])
  if (!ruw) return null
  // De verwachte zijde van een merk in pixels (uit de ruwe uitlijning, rond de QR: daar is ze betrouwbaar).
  const a = afbeelden(ruw, { x: QR.x, y: QR.y })
  const b = afbeelden(ruw, { x: QR.x + QR.b, y: QR.y })
  const pxPerMm = Math.hypot(b.x - a.x, b.y - a.y) / QR.b
  const z = MERKEN[0]!.b * pxPerMm
  const kandidaten = z >= 4 ? merkKandidaten(g, otsu(g), z * 0.6, z * 1.6) : []
  // Per hoek de kandidaat het dichtst bij de voorspelling, binnen een ruime straal (een vijfde van het blad).
  const straal = 0.2 * Math.hypot(g.b, g.h)
  const gevonden: Punt[] = []
  const gebruikt = new Set<Vlek>()
  for (const m of MERKEN) {
    const c = afbeelden(ruw, midden(m))
    let best: Vlek | null = null
    let bestD = straal
    for (const k of kandidaten) {
      const d = Math.hypot(k.x - c.x, k.y - c.y)
      if (d < bestD && !gebruikt.has(k)) {
        best = k
        bestD = d
      }
    }
    if (!best) break
    gebruikt.add(best)
    gevonden.push(best)
  }
  const fijn = gevonden.length === 4 ? homografie(MERKEN.map(midden), gevonden) : null
  // Controle: de QR moet met de fijne uitlijning op zijn plaats vallen; zo niet, vertrouwen we de merken niet.
  const klopt = fijn && qrHoeken(qr.versie).every((p, i) => {
    const q = afbeelden(fijn, p)
    const echt = [qr.linksboven, qr.rechtsboven, qr.linksonder, qr.rechtsonder][i]!
    return Math.hypot(q.x - echt.x, q.y - echt.y) < 3 * pxPerMm
  })
  const H = klopt ? fijn! : ruw
  return {
    uitlijning: klopt ? 'merken' : 'qr',
    vakjes: { geschikt: leesVak(g, H, VAKJES.geschikt), nietHoger: leesVak(g, H, VAKJES.nietHoger) },
  }
}
