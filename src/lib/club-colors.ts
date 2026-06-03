// Clubkleuren: twee tinten per club (primair + secundair) waarop de live-weergaven
// hun stijl bouwen. De kleuren worden automatisch uit het logo afgeleid (in de admin,
// op een canvas) en kunnen daar handmatig bijgesteld worden. Server-side gebruiken we
// ze enkel als gevalideerde hex-strings; de pixel-analyse hieronder draait in de browser.

export type ClubColors = { primary: string; secondary: string }

// Standaard-accenten wanneer een club nog geen kleuren heeft: thuis = groen, uit = blauw.
export const DEFAULT_HOME_COLOR = '#06d6a0'
export const DEFAULT_AWAY_COLOR = '#4cc9f0'

const HEX_RE = /^#?[0-9a-fA-F]{6}$/

// Maakt een nette `#rrggbb`-string of `null` als de invoer geen geldige hexkleur is.
export function normalizeHex(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  if (!HEX_RE.test(s)) return null
  return (s.startsWith('#') ? s : `#${s}`).toLowerCase()
}

// Bouwt een ClubColors uit twee (mogelijk lege) databasevelden. Geeft `null` als er
// geen geldige primaire kleur is, zodat de weergave op de standaardkleuren terugvalt.
export function clubColorsFrom(primary: unknown, secondary: unknown): ClubColors | null {
  const p = normalizeHex(typeof primary === 'string' ? primary : null)
  if (!p) return null
  const s = normalizeHex(typeof secondary === 'string' ? secondary : null)
  return { primary: p, secondary: s ?? p }
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// Relatieve luminantie (WCAG) van een hexkleur, 0 (zwart) … 1 (wit).
export function relativeLuminance(hex: string): number {
  const h = normalizeHex(hex)
  if (!h) return 0
  const ch = (i: number) => {
    let c = parseInt(h.slice(i, i + 2), 16) / 255
    c = c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    return c
  }
  return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5)
}

// Dwingt een (mogelijk donkere) clubkleur tot iets dat LEESBAAR is als tekst/cijfer op het
// donkere paneel: lichter maken tot ~3:1 contrast t.o.v. het paneel (AUDIT §1). Voorkomt dat een
// navy/zwart/donkerrood crest de score, klok of ploegnaam onzichtbaar maakt op de zaal-tv.
// `panelLum` ≈ luminantie van het donkere paneel (#0f2d1e ≈ 0.02).
export function readableOnDark(hex: string | null | undefined, panelLum = 0.02): string {
  const h = normalizeHex(hex ?? '')
  if (!h) return DEFAULT_HOME_COLOR
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  let guard = 0
  while ((relativeLuminance(rgbToHex(r, g, b)) + 0.05) / (panelLum + 0.05) < 3 && guard++ < 16) {
    r = Math.min(255, r + 20)
    g = Math.min(255, g + 20)
    b = Math.min(255, b + 20)
  }
  return rgbToHex(r, g, b)
}

// Kies leesbare INKT (tekstkleur) op een gevulde clubkleur-achtergrond (bv. doelpunt-pil):
// donkere inkt op een lichte achtergrond, witte inkt op een donkere.
export function inkOn(hex: string | null | undefined): string {
  return relativeLuminance(hex ?? '') > 0.4 ? '#06140d' : '#ffffff'
}

// Verzadiging (0–255) van een RGB-kleur — onderscheidt levendige kleuren van grijstinten.
function saturation(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b)
}

// Kwadratische afstand tussen twee RGB-kleuren — om duidelijk verschillende tinten te kiezen.
function dist2(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

type Bucket = { r: number; g: number; b: number; count: number }

// Haalt twee prominente kleuren uit ruwe RGBA-pixels (canvas getImageData).
// Negeert (semi)transparante en zeer lichte/witte pixels (typische logo-achtergrond),
// kiest de meest voorkomende levendige kleur als primair en een duidelijk afwijkende
// kleur als secundair. Valt terug op grijstinten als het logo nauwelijks kleur heeft.
export function colorsFromPixels(data: Uint8ClampedArray): ClubColors | null {
  const buckets = new Map<number, Bucket>()
  const STEP = 24

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 125) continue
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    // Bijna-witte achtergrond overslaan zodat het logo zelf telt.
    if (r > 240 && g > 240 && b > 240) continue
    const key = (Math.round(r / STEP) << 16) | (Math.round(g / STEP) << 8) | Math.round(b / STEP)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.r += r
      bucket.g += g
      bucket.b += b
      bucket.count++
    } else {
      buckets.set(key, { r, g, b, count: 1 })
    }
  }

  if (buckets.size === 0) return null

  const list = [...buckets.values()].map((bk) => ({
    rgb: [bk.r / bk.count, bk.g / bk.count, bk.b / bk.count] as [number, number, number],
    count: bk.count,
    sat: saturation(bk.r / bk.count, bk.g / bk.count, bk.b / bk.count),
  }))

  const byCount = [...list].sort((a, b) => b.count - a.count)
  const vivid = byCount.filter((c) => c.sat >= 38)

  // Primair: meest voorkomende levendige kleur, anders gewoon de meest voorkomende.
  const primary = (vivid[0] ?? byCount[0]).rgb

  // Secundair: meest voorkomende kleur die duidelijk verschilt van het primaire.
  // Eerst tussen levendige kleuren zoeken, daarna in de volledige lijst.
  const MIN_DIST = 60 * 60
  const secondary =
    vivid.find((c) => dist2(c.rgb, primary) > MIN_DIST)?.rgb ??
    byCount.find((c) => dist2(c.rgb, primary) > MIN_DIST)?.rgb ??
    primary

  return {
    primary: rgbToHex(primary[0], primary[1], primary[2]),
    secondary: rgbToHex(secondary[0], secondary[1], secondary[2]),
  }
}
