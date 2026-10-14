// De graffitimuur van het virtuele stadion: iedereen van de club spuit er iets op, en alles blijft
// staan (opgeslagen in de databank, dus ook na een update). De muur groeit mee: hoe meer tags, hoe
// langer hij wordt.
//
// Deze module is gedeeld door de server (validatie), de 3D-muur en de spuitbus op je gsm (tekenen).
// Coördinaten zijn in meter op de muur: x van links (0) naar rechts, y van de grond (0) naar boven.

export type Gereedschap = 'spuit' | 'stift' | 'drup'
export type Streek = { t: Gereedschap; k: string; w: number; p: number[] }
export type Tag = { id: number | string; auteur: string; streken: Streek[] }

export const MUUR_H = 4.2
export const MUUR_BASIS = 18
export const MUUR_SEGMENT = 4.5
export const MUUR_MAX = 36
export const TAGS_PER_SEGMENT = 40

/** Kleuren van de spuitbussen (de clubkleuren komen er in de app nog bovenop). */
export const BUSSEN = ['#ffffff', '#111111', '#facc15', '#f97316', '#ef4444', '#ec4899', '#a855f7', '#3b82f6', '#22d3ee', '#22c55e']

const MAX_STREKEN = 160
const MAX_PUNTEN = 9000
const MAX_PER_STREEK = 2400

/** Hoe lang de muur is bij zoveel tags: om de 40 tags komt er een stuk van 4,5 m bij, tot 36 m. */
export function muurLengte(aantalTags: number): number {
  return Math.min(MUUR_MAX, MUUR_BASIS + MUUR_SEGMENT * Math.floor(Math.max(0, aantalTags) / TAGS_PER_SEGMENT))
}

/** Controle van wat een bezoeker wil opspuiten (server). Rondt af op millimeters. */
export function valideerStreken(ruw: unknown, lengte: number): { ok: true; streken: Streek[] } | { ok: false; fout: string } {
  if (!Array.isArray(ruw) || ruw.length === 0) return { ok: false, fout: 'Niets om op de muur te zetten.' }
  if (ruw.length > MAX_STREKEN) return { ok: false, fout: 'Te veel streken in één keer.' }
  const streken: Streek[] = []
  let totaal = 0
  for (const s of ruw) {
    if (!s || typeof s !== 'object') return { ok: false, fout: 'Ongeldige streek.' }
    const { t, k, w, p } = s as Partial<Streek>
    if (t !== 'spuit' && t !== 'stift' && t !== 'drup') return { ok: false, fout: 'Onbekend gereedschap.' }
    if (typeof k !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(k)) return { ok: false, fout: 'Ongeldige kleur.' }
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0.02 || w > 0.8) return { ok: false, fout: 'Ongeldige dikte.' }
    if (!Array.isArray(p) || p.length < 2 || p.length % 2 !== 0 || p.length > MAX_PER_STREEK) return { ok: false, fout: 'Ongeldige punten.' }
    const punten: number[] = []
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i]
      const y = p[i + 1]
      if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, fout: 'Ongeldige punten.' }
      if (x < -0.5 || x > lengte + 0.5 || y < -0.5 || y > MUUR_H + 0.5) return { ok: false, fout: 'Buiten de muur.' }
      punten.push(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000)
    }
    totaal += punten.length / 2
    if (totaal > MAX_PUNTEN) return { ok: false, fout: 'Te veel in één keer — spuit het in twee keer.' }
    streken.push({ t, k: k.toLowerCase(), w: Math.round(w * 1000) / 1000, p: punten })
  }
  return { ok: true, streken }
}

// ---------- tekenen (canvas) ----------

const stempels = new Map<string, HTMLCanvasElement>()
/** Een zachte verfstip van één kleur, één keer getekend en hergebruikt. */
function stempel(kleur: string): HTMLCanvasElement {
  let c = stempels.get(kleur)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, kleur)
  gr.addColorStop(0.45, `${kleur}cc`)
  gr.addColorStop(1, `${kleur}00`)
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  stempels.set(kleur, c)
  return c
}

/** Voorspelbaar toeval per streek, zodat de muur er bij elke bezoeker hetzelfde uitziet. */
function zaadVan(s: Streek): () => number {
  let a = 2166136261
  for (let i = 0; i < Math.min(s.p.length, 12); i++) a = Math.imul(a ^ Math.round(s.p[i] * 1000), 16777619)
  a >>>= 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Teken één streek op een canvas met `ppm` pixels per meter (x0 = links van het canvas in meter).
 * `vervolg`: dit is het volgende stukje van een streek die al getekend is (live spuiten): het
 * beginpunt ligt er dan al (anders krijgt de lijn op elk meetpunt een dikke parel).
 */
export function tekenStreek(g: CanvasRenderingContext2D, s: Streek, ppm: number, x0 = 0, vervolg = false): void {
  const X = (x: number) => (x - x0) * ppm
  const Y = (y: number) => (MUUR_H - y) * ppm
  const r = Math.max(1, s.w * ppm * 0.5)
  if (s.t === 'stift') {
    g.strokeStyle = s.k
    g.lineWidth = r * 2
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(X(s.p[0]), Y(s.p[1]))
    for (let i = 2; i < s.p.length; i += 2) g.lineTo(X(s.p[i]), Y(s.p[i + 1]))
    if (s.p.length === 2) g.lineTo(X(s.p[0]) + 0.1, Y(s.p[1]))
    g.stroke()
    return
  }
  if (s.t === 'drup') {
    // Een verfdruppel die naar beneden loopt, met een bolletje onderaan.
    const xa = X(s.p[0])
    const ya = Y(s.p[1])
    const yb = Y(s.p[s.p.length - 1])
    g.strokeStyle = s.k
    g.lineCap = 'round'
    g.lineWidth = Math.max(1, r * 0.45)
    g.beginPath()
    g.moveTo(xa, ya)
    g.lineTo(xa, yb)
    g.stroke()
    g.fillStyle = s.k
    g.beginPath()
    g.arc(xa, yb, Math.max(1.2, r * 0.42), 0, Math.PI * 2)
    g.fill()
    return
  }
  // Spuitbus: zachte stippen langs het pad (dichter waar je bleef staan), met fijne spatjes.
  const st = stempel(s.k)
  const rnd = zaadVan(s)
  const stip = (x: number, y: number) => {
    g.globalAlpha = 0.16
    g.drawImage(st, x - r, y - r, r * 2, r * 2)
    g.globalAlpha = 0.75
    g.fillStyle = s.k
    for (let k = 0; k < 3; k++) {
      const a = rnd() * Math.PI * 2
      const d = r * (0.55 + rnd() * 0.9)
      const kr = Math.max(0.6, r * 0.05 * (0.5 + rnd()))
      g.fillRect(x + Math.cos(a) * d - kr / 2, y + Math.sin(a) * d - kr / 2, kr, kr)
    }
  }
  let vx = X(s.p[0])
  let vy = Y(s.p[1])
  if (!vervolg) stip(vx, vy)
  for (let i = 2; i < s.p.length; i += 2) {
    const x = X(s.p[i])
    const y = Y(s.p[i + 1])
    const d = Math.hypot(x - vx, y - vy)
    const n = Math.max(1, Math.ceil(d / (r * 0.35)))
    for (let k = 1; k <= n; k++) stip(vx + ((x - vx) * k) / n, vy + ((y - vy) * k) / n)
    vx = x
    vy = y
  }
  g.globalAlpha = 1
}

/** De kale muur: grijze betonplaten met naden, vlekken en een uitnodiging om te spuiten. */
export function tekenMuurBasis(g: CanvasRenderingContext2D, lengte: number, ppm: number, club: { naam: string; primair: string; secundair: string }): void {
  const w = lengte * ppm
  const h = MUUR_H * ppm
  g.fillStyle = '#9ca3af'
  g.fillRect(0, 0, w, h)
  let a = 99
  const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < (w * h) / 900; i++) {
    const v = 120 + Math.floor(rnd() * 60)
    g.fillStyle = `rgba(${v},${v},${v + 4},.25)`
    g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3)
  }
  for (let i = 0; i < lengte / 2; i++) {
    const vx = rnd() * w
    const vy = h * (0.6 + rnd() * 0.4)
    const gr = g.createRadialGradient(vx, vy, 0, vx, vy, ppm * (0.5 + rnd()))
    gr.addColorStop(0, 'rgba(60,60,60,.18)')
    gr.addColorStop(1, 'rgba(60,60,60,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
  }
  // Naden van de betonplaten (om de 1,5 m) en een horizontale voeg.
  g.fillStyle = 'rgba(55,60,68,.55)'
  for (let x = 1.5; x < lengte; x += 1.5) g.fillRect(x * ppm - 1, 0, 2, h)
  g.fillRect(0, h * 0.5, w, 2)
  // Een uitnodiging in sjabloonletters, onderaan links.
  g.fillStyle = 'rgba(17,24,39,.35)'
  g.font = `900 ${Math.round(ppm * 0.28)}px "Courier New", ui-monospace, monospace`
  g.textBaseline = 'bottom'
  g.fillText(`SPUIT HIER JE TAG · ${club.naam.toUpperCase()}`, ppm * 0.4, h - ppm * 0.25)
}
