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
// 3. Elk vakje zoeken we nog eens lokaal op aan zijn gedrukte kader (tot 4 mm naast de voorspelling): een blad
//    dat niet plat ligt — bol, gevouwen, in de hand — verschuift de vakjes. Vinden we het kader niet, dan zeggen
//    we niets over het vakje (twijfel).
// 4. In elk vakje meten we hoeveel inkt er staat, tegenover het papier net naast het vakje (schaduw op een foto
//    maakt het papier grijs; een vaste drempel zou dat als inkt lezen).
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

/** Hoe donker is dit punt (0 = papier, 1 = zwart), tegenover het papier `wit`. */
const donkerte = (g: Grijs, p: Punt, wit: number) => Math.max(0, Math.min(1, (wit - pix(g, p.x, p.y)) / Math.max(wit, 1)))

/**
 * Zoekt het gedrukte kader van een vakje rond de voorspelde plaats: tot `zoek` mm ernaast en tot ±4° gedraaid. Een
 * blad dat niet plat ligt (bol, een vouw, in de hand) verschuift een vakje een paar mm tegenover wat de vier hoeken
 * voorspellen, en draait het lokaal een beetje. Geeft de beste ligging en hoe zeker het kader gevonden is (fractie
 * van de rand die donker is).
 */
type Ligging = { dx: number; dy: number; hoek: number }

/** Een punt van het vakje (mm, tegenover linksboven) in blad-mm, voor deze ligging (draaien rond het midden). */
function inVak(r: Rect, l: Ligging, p: Punt): Punt {
  const cx = r.b / 2
  const cy = r.h / 2
  const c = Math.cos(l.hoek)
  const s = Math.sin(l.hoek)
  const x = p.x - cx
  const y = p.y - cy
  return { x: r.x + l.dx + cx + x * c - y * s, y: r.y + l.dy + cy + x * s + y * c }
}

function zoekKader(g: Grijs, H: number[], r: Rect, wit: number, drempel: number, zoek = 4): Ligging & { rand: number } {
  // Punten op de rand, met de richting loodrecht op de rand. De lijn is dun (±0,4 mm): per punt kijken we ook tot
  // 0,45 mm ernaast en tellen het donkerste.
  const rand: { p: Punt; n: Punt }[] = []
  const n = 14
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    rand.push(
      { p: { x: t * r.b, y: 0 }, n: { x: 0, y: 1 } },
      { p: { x: t * r.b, y: r.h }, n: { x: 0, y: 1 } },
      { p: { x: 0, y: t * r.h }, n: { x: 1, y: 0 } },
      { p: { x: r.b, y: t * r.h }, n: { x: 1, y: 0 } },
    )
  }
  const NAAST = [0, -0.15, 0.15, -0.3, 0.3, -0.45, 0.45]
  const donkerst = (l: Ligging, e: { p: Punt; n: Punt }) => {
    let d = 0
    for (const o of NAAST) d = Math.max(d, donkerte(g, afbeelden(H, inVak(r, l, { x: e.p.x + o * e.n.x, y: e.p.y + o * e.n.y })), wit))
    return d
  }
  const score = (l: Ligging) => {
    let som = 0
    for (const e of rand) som += donkerst(l, e)
    return som / rand.length
  }
  const GRAAD = Math.PI / 180
  let best = { dx: 0, dy: 0, hoek: 0, s: score({ dx: 0, dy: 0, hoek: 0 }) }
  // Grof: 0,5 mm en 2°; dan fijn rond het beste: 0,1 mm en 0,5°.
  for (const hoek of [-4, -2, 0, 2, 4].map((a) => a * GRAAD)) {
    for (let dy = -zoek; dy <= zoek; dy += 0.5) {
      for (let dx = -zoek; dx <= zoek; dx += 0.5) {
        const s = score({ dx, dy, hoek })
        if (s > best.s) best = { dx, dy, hoek, s }
      }
    }
  }
  const grof = best
  for (let a = -1.5; a <= 1.5; a += 0.5) {
    const hoek = grof.hoek + a * GRAAD
    for (let dy = grof.dy - 0.5; dy <= grof.dy + 0.5; dy += 0.1) {
      for (let dx = grof.dx - 0.5; dx <= grof.dx + 0.5; dx += 0.1) {
        const s = score({ dx, dy, hoek })
        if (s > best.s) best = { dx, dy, hoek, s }
      }
    }
  }
  // Hoeveel van de rand is echt inkt op de gevonden plaats?
  const grens = (wit - drempel) / Math.max(wit, 1)
  let raak = 0
  for (const e of rand) if (donkerst(best, e) > grens) raak++
  return { dx: best.dx, dy: best.dy, hoek: best.hoek, rand: raak / rand.length }
}

/** Hoeveel inkt er binnen in een vakje staat, tegenover het papier net naast het vakje. */
function leesVak(g: Grijs, H: number[], r: Rect): VakLezing & { rand: number } {
  const N = 22
  const papier: number[] = []
  // Papier: een strook 2,5–3 mm buiten het vakje (links, boven en onder; rechts staat de tekst).
  const strook = (l: Ligging) => {
    papier.length = 0
    for (let i = 0; i < 40; i++) {
      const t = i / 39
      papier.push(pix(g, ...xy(afbeelden(H, inVak(r, l, { x: -3, y: t * r.h })))))
      papier.push(pix(g, ...xy(afbeelden(H, inVak(r, l, { x: t * r.b, y: -2.5 })))))
      papier.push(pix(g, ...xy(afbeelden(H, inVak(r, l, { x: t * r.b, y: r.h + 2.5 })))))
    }
    papier.sort((a, b) => a - b)
    return papier[Math.floor(papier.length * 0.6)]!
  }
  const voorspeld: Ligging = { dx: 0, dy: 0, hoek: 0 }
  const k = zoekKader(g, H, r, strook(voorspeld), strook(voorspeld) * 0.62)
  const wit = strook(k)
  const drempel = wit * 0.62
  let donker = 0
  const m = VAKJE_BINNENRAND
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const p = afbeelden(H, inVak(r, k, { x: m + ((r.b - 2 * m) * (i + 0.5)) / N, y: m + ((r.h - 2 * m) * (j + 0.5)) / N }))
      if (pix(g, p.x, p.y) < drempel) donker++
    }
  }
  const inkt = donker / (N * N)
  // Geen duidelijk kader gevonden: dan weten we ook niet zeker wat erin staat.
  const zeker = k.rand >= 0.6
  return {
    aangekruist: !zeker ? null : inkt >= INKT_JA ? true : inkt <= INKT_NEE ? false : null,
    inkt: Math.round(inkt * 1000) / 1000,
    rand: Math.round(k.rand * 100) / 100,
  }
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
  // Controle: de QR moet met de fijne uitlijning op zijn plaats vallen. Binnen 3 mm: de merken kloppen. Tot 10 mm
  // ernaast: het blad ligt niet plat (de QR zit in het midden, waar een bol blad het meest afwijkt) — dan
  // vertrouwen we de merken enkel als het kader van beide vakjes daarna ook echt gevonden wordt.
  const afwijking = fijn
    ? Math.max(
        ...qrHoeken(qr.versie).map((p, i) => {
          const q = afbeelden(fijn, p)
          const echt = [qr.linksboven, qr.rechtsboven, qr.linksonder, qr.rechtsonder][i]!
          return Math.hypot(q.x - echt.x, q.y - echt.y) / pxPerMm
        }),
      )
    : Infinity
  const H = afwijking < 10 ? fijn! : ruw
  const geschikt = leesVak(g, H, VAKJES.geschikt)
  const nietHoger = leesVak(g, H, VAKJES.nietHoger)
  const kaders = geschikt.rand >= 0.6 && nietHoger.rand >= 0.6
  const merken = afwijking < 3 || (afwijking < 10 && kaders)
  const zonderRand = (v: VakLezing & { rand: number }): VakLezing => ({ aangekruist: v.aangekruist, inkt: v.inkt })
  return {
    uitlijning: merken ? 'merken' : 'qr',
    vakjes: { geschikt: zonderRand(geschikt), nietHoger: zonderRand(nietHoger) },
  }
}
