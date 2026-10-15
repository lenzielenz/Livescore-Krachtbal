// Samen in het virtuele stadion: supporters van dezelfde club die tegelijk rondlopen, zien elkaar.
// Elke bezoeker stuurt geregeld waar hij is; de server houdt per club enkel de laatste plek van
// iedereen bij, in het geheugen (geen databank), en vergeet je zodra je even niets meer stuurde.
// Wie kijkt, krijgt de lijst via de gedeelde SSE-hub (één poller per club, zie sse-hub.ts).
//
// Enkel ingelogde leden van de club; je naam is je voornaam, je figuur draagt je outfit.
// (Eén instantie: voor meerdere servers hoort dit, net als de hub, achter Redis pub/sub.)

import { ARTIKELEN, KLEDIJ_SOORTEN, type Outfit } from './virtueel-fanshop'

export type Plek = { x: number; y: number; z: number; yaw: number; verdiep: number; vliegt: boolean }
export type Aanwezige = Plek & { id: string; naam: string; outfit: Partial<Outfit>; t: number }

/** Na hoeveel ms stilte je uit de lijst verdwijnt. */
export const VERGEET_NA = 8000
/** Hoeveel bezoekers we hoogstens tonen (per club). */
export const MAX_AANWEZIG = 40

const getal = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 100) / 100 : null

/** Een plek opschonen (wat een client stuurt, kan alles zijn). */
export function leesPlek(ruw: unknown): Plek | null {
  const w = (ruw && typeof ruw === 'object' ? ruw : {}) as Record<string, unknown>
  const x = getal(w.x, -600, 600)
  const y = getal(w.y, -20, 250)
  const z = getal(w.z, -600, 600)
  const yaw = getal(w.yaw, -100, 100)
  const verdiep = typeof w.verdiep === 'number' && [-1, 0, 1, 2].includes(w.verdiep) ? w.verdiep : null
  if (x == null || y == null || z == null || yaw == null || verdiep == null) return null
  return { x, y, z, yaw, verdiep, vliegt: w.vliegt === true }
}

/** Een outfit opschonen: enkel bestaande artikelen van de juiste soort. */
export function leesKledij(ruw: unknown): Partial<Outfit> {
  const w = (ruw && typeof ruw === 'object' ? ruw : {}) as Record<string, unknown>
  const uit: Partial<Outfit> = {}
  for (const s of KLEDIJ_SOORTEN) {
    const id = w[s]
    if (typeof id === 'string' && ARTIKELEN.some((a) => a.id === id && a.soort === s)) uit[s] = id
  }
  return uit
}

type Club = Map<string, Aanwezige>
const clubs = new Map<string, Club>()

/** Zet (of werk bij) waar iemand is. */
export function meld(club: string, wie: { id: string; naam: string; outfit: Partial<Outfit> }, plek: Plek, nu = Date.now()): void {
  let c = clubs.get(club)
  if (!c) clubs.set(club, (c = new Map()))
  c.set(wie.id, { ...plek, id: wie.id, naam: wie.naam, outfit: wie.outfit, t: nu })
}

/** Iemand vertrekt (de pagina dicht). */
export function vertrek(club: string, id: string): void {
  clubs.get(club)?.delete(id)
}

/** Wie er nu is (de recentste eerst, oude meldingen vergeten). */
export function aanwezig(club: string, nu = Date.now()): Aanwezige[] {
  const c = clubs.get(club)
  if (!c) return []
  for (const [id, a] of c) if (nu - a.t > VERGEET_NA) c.delete(id)
  if (c.size === 0) clubs.delete(club)
  return [...c.values()].sort((a, b) => b.t - a.t).slice(0, MAX_AANWEZIG)
}

/** Voor de tests: alles vergeten. */
export function vergeetAlles(): void {
  clubs.clear()
}

// ---------- wie komt er binnen, wie vertrekt (voor de meldingen bij de kijker) ----------

/** Pas na zoveel ms weg melden we dat iemand vertrok (een herlaadbeurt of een haperende gsm telt niet). */
export const WEG_NA = 15000

export type AanwezigGeheugen = { begonnen: boolean; gezien: Map<string, { naam: string; wegSinds: number | null }> }
export const nieuwGeheugen = (): AanwezigGeheugen => ({ begonnen: false, gezien: new Map() })

/**
 * Vergelijk de nieuwe lijst met wat je al zag. `alHier` = wie er al was toen je zelf binnenkwam
 * (enkel de eerste keer), `binnen` = wie er nu bij komt, `weg` = wie al een tijd weg is.
 */
export function volgAanwezigen(g: AanwezigGeheugen, lijst: Aanwezige[], ik: string | null, nu = Date.now()): { alHier: string[]; binnen: string[]; weg: string[] } {
  const anderen = lijst.filter((a) => a.id !== ik)
  const alHier: string[] = []
  const binnen: string[] = []
  const weg: string[] = []
  for (const a of anderen) {
    const oud = g.gezien.get(a.id)
    if (!oud) (g.begonnen ? binnen : alHier).push(a.naam)
    g.gezien.set(a.id, { naam: a.naam, wegSinds: null })
  }
  const ids = new Set(anderen.map((a) => a.id))
  for (const [id, o] of g.gezien) {
    if (ids.has(id)) continue
    if (o.wegSinds == null) o.wegSinds = nu
    else if (nu - o.wegSinds > WEG_NA) {
      weg.push(o.naam)
      g.gezien.delete(id)
    }
  }
  g.begonnen = true
  return { alHier, binnen, weg }
}

/** "An", "An en Bo", "An, Bo en Cas" (en bij veel: "An, Bo, Cas en 3 anderen"). */
export function namen(lijst: string[]): string {
  if (lijst.length <= 1) return lijst[0] ?? ''
  if (lijst.length > 4) return `${lijst.slice(0, 3).join(', ')} en ${lijst.length - 3} anderen`
  return `${lijst.slice(0, -1).join(', ')} en ${lijst[lijst.length - 1]}`
}
