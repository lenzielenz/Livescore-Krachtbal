// Virtueel krachtbal: een wedstrijdfragment dat uit video gereconstrueerd werd (positie van elke
// speler en van de bal, ~30 keer per seconde), om in 3D af te spelen en zelf door te lopen.
//
// De reconstructie zelf gebeurt buiten dit platform; hier komt enkel het resultaat binnen, als
// statisch bestand in public/virtueel/<slug>.json (kolommen in base64, zie decodeer). Deze module
// is puur: decoderen, een positie op een willekeurig tijdstip opvragen (interpolatie), waar de bal
// is (in de handen van een speler of in de lucht) en welke ploeg balbezit heeft. De 3D-weergave
// zit in src/app/(frontend)/virtueel/[slug]/VirtueelViewer.tsx.

export type Veld = { length_m: number; width_m: number; goal_a: number; goal_b: number }
export type Ploeg = { id: number; naam: string; thuis: boolean; tenue: string[] }

export type Reconstructie = {
  versie: number
  duur_s: number
  veld: Veld
  ploegen: Ploeg[]
  kolommen: {
    n: number
    woorden: { ent: string[]; fase: (string | null)[]; track: (string | null)[] }
    t: string
    soort: string
    ent: string
    team: string
    x: string
    y: string
    z: string
    fase: string
    track: string
  }
}

/** Eén fragment in de catalogus van /virtueel. */
export type VirtueelFragment = {
  slug: string
  titel: string
  datum: string
  plaats: string
  beschrijving: string
}

export const FRAGMENTEN: VirtueelFragment[] = [
  {
    slug: '2026-10-07-sint-michiels',
    titel: 'Oefenpot in Sint-Michiels',
    datum: '2026-10-07',
    plaats: 'Sint-Michiels',
    beschrijving: '41 seconden spel, rood tegen grijs: elke worp, vangst en loopbeweging, gereconstrueerd uit één gsm-video.',
  },
]

export const fragment = (slug: string) => FRAGMENTEN.find((f) => f.slug === slug) ?? null

export type BalFase = 'held' | 'arc' | 'flight' | 'ground' | null

/** Het pad van één speler of van de bal, gesorteerd op tijd. Ontbrekende metingen zijn weggelaten. */
export type Spoor = {
  id: string
  bal: boolean
  team: number | null
  /** Het volgnummer (track) van deze speler in de meting — de bal verwijst ernaar als houder. */
  track: string | null
  t: Float64Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
  fase: BalFase[]
  houder: (string | null)[]
}

const ONTBREEKT = -32768

function bytes(b64: string): Uint8Array {
  const s = atob(b64)
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u
}

/** Zet de base64-kolommen om in één spoor per speler en één voor de bal. */
export function decodeer(r: Reconstructie): Spoor[] {
  const k = r.kolommen
  const t = new Int32Array(bytes(k.t).buffer)
  const soort = bytes(k.soort)
  const ent = new Uint16Array(bytes(k.ent).buffer)
  const team = new Int8Array(bytes(k.team).buffer)
  const x = new Int16Array(bytes(k.x).buffer)
  const y = new Int16Array(bytes(k.y).buffer)
  const z = new Int16Array(bytes(k.z).buffer)
  const fase = bytes(k.fase)
  const track = new Uint16Array(bytes(k.track).buffer)

  const rijen = new Map<string, number[]>()
  for (let i = 0; i < k.n; i++) {
    if (x[i] === ONTBREEKT || y[i] === ONTBREEKT) continue
    const id = k.woorden.ent[ent[i]]
    const lijst = rijen.get(id) ?? []
    lijst.push(i)
    rijen.set(id, lijst)
  }
  // De meting levert de bal twee keer: ruw ('ball') en als afgewerkte baan met fases en houder
  // ('bal-baan'). Die laatste is wat we tonen; de ruwe enkel als er geen baan is.
  if (rijen.has('bal-baan')) rijen.delete('ball')

  const sporen: Spoor[] = []
  for (const [id, ix] of rijen) {
    ix.sort((a, b) => t[a] - t[b])
    const isBal = soort[ix[0]] === 1
    const tracks = new Map<string, number>()
    if (!isBal) for (const i of ix) {
      const w = k.woorden.track[track[i]]
      if (w) tracks.set(w, (tracks.get(w) ?? 0) + 1)
    }
    sporen.push({
      id,
      bal: isBal,
      team: team[ix[0]] < 0 ? null : team[ix[0]],
      track: [...tracks.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      t: Float64Array.from(ix, (i) => t[i] / 1000),
      x: Float32Array.from(ix, (i) => x[i] / 100),
      y: Float32Array.from(ix, (i) => y[i] / 100),
      z: Float32Array.from(ix, (i) => (z[i] === ONTBREEKT ? 0 : z[i] / 100)),
      fase: ix.map((i) => (isBal ? ((k.woorden.fase[fase[i]] ?? null) as BalFase) : null)),
      houder: ix.map((i) => (isBal ? (k.woorden.track[track[i]] ?? null) : null)),
    })
  }
  return sporen.sort((a, b) => Number(a.bal) - Number(b.bal) || a.id.localeCompare(b.id, 'nl', { numeric: true }))
}

/** Langer dan dit zonder meting = niet in beeld (bv. de speler liep even uit het camerabeeld). */
export const MAX_GAT_S = 1.0

/** Laatste index met t[i] <= tijd, of -1. */
function index(sp: Spoor, tijd: number): number {
  let lo = 0
  let hi = sp.t.length - 1
  if (hi < 0 || tijd < sp.t[0]) return -1
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1
    if (sp.t[m] <= tijd) lo = m
    else hi = m - 1
  }
  return lo
}

export type Stand = { x: number; y: number; z: number; fase: BalFase; houder: string | null; i: number }

/** Positie op `tijd` (seconden), lineair tussen twee metingen. Null als de speler niet in beeld is. */
export function op(sp: Spoor, tijd: number): Stand | null {
  const i = index(sp, tijd)
  if (i < 0) return null
  const laatste = sp.t.length - 1
  if (i === laatste) return tijd - sp.t[i] <= 0.1 ? { x: sp.x[i], y: sp.y[i], z: sp.z[i], fase: sp.fase[i], houder: sp.houder[i], i } : null
  const gat = sp.t[i + 1] - sp.t[i]
  if (gat > MAX_GAT_S) return tijd - sp.t[i] <= 0.1 ? { x: sp.x[i], y: sp.y[i], z: sp.z[i], fase: sp.fase[i], houder: sp.houder[i], i } : null
  const a = gat > 0 ? (tijd - sp.t[i]) / gat : 0
  return {
    x: sp.x[i] + (sp.x[i + 1] - sp.x[i]) * a,
    y: sp.y[i] + (sp.y[i + 1] - sp.y[i]) * a,
    z: sp.z[i] + (sp.z[i + 1] - sp.z[i]) * a,
    fase: sp.fase[i],
    houder: sp.houder[i],
    i,
  }
}

/** Snelheid (m/s) rond `tijd`, over een venster van ±0.25 s: zo trilt de looprichting niet. */
export function snelheid(sp: Spoor, tijd: number): { vx: number; vy: number } {
  const a = op(sp, tijd - 0.25)
  const b = op(sp, tijd + 0.25)
  if (!a || !b) return { vx: 0, vy: 0 }
  return { vx: (b.x - a.x) / 0.5, vy: (b.y - a.y) / 0.5 }
}

/** Hoogte van de bal in de handen. */
export const HANDHOOGTE = 1.15

export type BalStand = { x: number; y: number; z: number; fase: BalFase; houder: Spoor | null }

/**
 * Waar de bal is: in de handen van zijn houder (vóór de speler, op handhoogte) of op zijn eigen
 * gemeten plek in de lucht of op de grond.
 */
export function balOp(sporen: Spoor[], tijd: number): BalStand | null {
  const bal = sporen.find((s) => s.bal)
  if (!bal) return null
  const s = op(bal, tijd)
  if (!s) return null
  if (s.fase === 'held' && s.houder) {
    const houder = sporen.find((p) => !p.bal && p.track === s.houder) ?? null
    const h = houder ? op(houder, tijd) : null
    if (houder && h) {
      const v = snelheid(houder, tijd)
      const len = Math.hypot(v.vx, v.vy)
      const dx = len > 0.3 ? (v.vx / len) * 0.3 : 0
      const dy = len > 0.3 ? (v.vy / len) * 0.3 : 0
      return { x: h.x + dx, y: h.y + dy, z: HANDHOOGTE, fase: 'held', houder }
    }
  }
  return { x: s.x, y: s.y, z: Math.max(0.15, s.z), fase: s.fase, houder: null }
}

/** Welke ploeg heeft de bal (of had hem het laatst vast)? Null vóór de eerste vangst. */
export function bezitOp(sporen: Spoor[], tijd: number): number | null {
  const bal = sporen.find((s) => s.bal)
  if (!bal) return null
  for (let i = index(bal, tijd); i >= 0; i--) {
    if (bal.fase[i] !== 'held' || !bal.houder[i]) continue
    const houder = sporen.find((p) => !p.bal && p.track === bal.houder[i])
    if (houder) return houder.team
  }
  return null
}

/** Het balspoor van de laatste `duur` seconden, als lijst punten (voor de lichtstreep). */
export function balSpoor(sporen: Spoor[], tijd: number, duur = 2, stap = 1 / 30): { x: number; y: number; z: number }[] {
  const uit: { x: number; y: number; z: number }[] = []
  for (let t = Math.max(0, tijd - duur); t <= tijd + 1e-9; t += stap) {
    const b = balOp(sporen, t)
    if (b) uit.push({ x: b.x, y: b.y, z: b.z })
    else uit.length = 0
  }
  return uit
}

/** Tenuekleuren uit de wedstrijdinstellingen. */
export const TENUE: Record<string, string> = {
  rood: '#e5484d', wit: '#eef2f6', zwart: '#3f3f46', grijs: '#a1a1aa', blauw: '#3b82f6', lichtblauw: '#7dd3fc', groen: '#22c55e',
  geel: '#facc15', oranje: '#f97316', paars: '#a855f7', roze: '#f472b6', bordeaux: '#9f1239', marine: '#1e3a8a', navy: '#1e3a8a',
}

/** Eén kleur per ploeg uit haar tenue, zonder dat beide ploegen dezelfde krijgen. */
export function ploegKleuren(ploegen: Ploeg[]): Record<number, string> {
  const uit: Record<number, string> = {}
  const reserve = ['#73d8c6', '#ef937f']
  for (const p of ploegen) {
    const vrij = p.tenue.map((n) => TENUE[n.toLowerCase()]).find((c) => c && !Object.values(uit).includes(c))
    uit[p.id] = vrij ?? reserve[p.id % 2]
  }
  return uit
}
