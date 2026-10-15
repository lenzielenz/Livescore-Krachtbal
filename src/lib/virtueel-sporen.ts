// Sporen in het virtuele stadion: wat bezoekers (vooral de jeugd) achterlaten voor wie na hen komt
// kijken. Een eendje in het zwembad, verf in het water, popcorn, gelopen meters op de loopband, je
// naam op een cinemazetel, een highscore in de gameroom, de stand van een tactiekbord, en de
// gouden krachtballen die je overal in het stadion kan vinden.
//
// Zoals de rest van het platform (event-sourcing): elke handeling is één onveranderlijk record;
// totalen, ranglijsten en "de laatste" worden altijd hieruit afgeleid, nooit apart bijgehouden.
// Deze module is puur: validatie (server) en samenvatten (server en client).

import { artikelVan, maakKast, type Kast, type Outfit } from './virtueel-fanshop'
import { BAL_IDS, werpAfstand, type BalId } from './virtueel-superstar'
import { leesTactiek, type Tactiek } from './virtueel-tactiek'

// aankoop/outfit: de fanshop (virtueel-fanshop.ts); kluis: de kluis in de kelder openen (als je alle
// gouden ballen hebt, voor de sleutel van de helikopter); werp: een worp bij Superstar.
export const SPOOR_SOORTEN = ['eend', 'verf', 'popcorn', 'loopband', 'zetel', 'doelworp', 'bord', 'vondst', 'aankoop', 'outfit', 'kluis', 'werp'] as const
export type SpoorSoort = (typeof SPOOR_SOORTEN)[number]

export const EEND_KLEUREN = ['#facc15', '#f97316', '#ec4899', '#22c55e', '#3b82f6', '#ffffff'] as const
export const VERF_KLEUREN = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'] as const
export const ZETELS = 60
export const GOUDEN_BALLEN = 12
export const BORDEN = ['kleedkamer', 'kelder'] as const
export type BordId = (typeof BORDEN)[number]

/** Hoeveel keer per minuut iemand iets mag achterlaten (tegen spam). */
export const TEMPO: Record<SpoorSoort, number> = { eend: 8, verf: 6, popcorn: 20, loopband: 6, zetel: 10, doelworp: 10, bord: 20, vondst: 40, aankoop: 20, outfit: 30, kluis: 5, werp: 20 }

const geheel = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
const tussen01 = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? Math.round(v * 1000) / 1000 : null)

export type SpoorWaarde =
  | { u: number; v: number; kleur: string } // eend: plek in het bad (0–1) en kleur
  | { kleur: string } // verf
  | Record<string, never> // popcorn
  | { meter: number } // loopband
  | { nr: number } // zetel, vondst
  | { score: number } // doelworp
  | { id: BordId; tactiek: Tactiek } // bord
  | { id: string } // aankoop
  | { outfit: Partial<Outfit> } // outfit (wat je bezit, controleert de server apart)
  | { bal: BalId; kracht: number; hoek: number; afstand: number } // werp

/** Controleer wat een bezoeker wil achterlaten; geeft de opgeschoonde waarde of een foutmelding. */
export function valideerSpoor(soort: unknown, ruw: unknown): { ok: true; soort: SpoorSoort; waarde: SpoorWaarde } | { ok: false; fout: string } {
  if (typeof soort !== 'string' || !(SPOOR_SOORTEN as readonly string[]).includes(soort)) return { ok: false, fout: 'Onbekend spoor.' }
  const s = soort as SpoorSoort
  const w = (ruw && typeof ruw === 'object' ? ruw : {}) as Record<string, unknown>
  switch (s) {
    case 'eend': {
      const u = tussen01(w.u)
      const v = tussen01(w.v)
      const kleur = typeof w.kleur === 'string' && (EEND_KLEUREN as readonly string[]).includes(w.kleur) ? w.kleur : null
      if (u == null || v == null || !kleur) return { ok: false, fout: 'Dat eendje landt niet in het bad.' }
      return { ok: true, soort: s, waarde: { u, v, kleur } }
    }
    case 'verf': {
      const kleur = typeof w.kleur === 'string' && (VERF_KLEUREN as readonly string[]).includes(w.kleur) ? w.kleur : null
      return kleur ? { ok: true, soort: s, waarde: { kleur } } : { ok: false, fout: 'Onbekende kleur.' }
    }
    case 'popcorn':
      return { ok: true, soort: s, waarde: {} }
    case 'loopband': {
      // 20 seconden lopen: zelfs heel snel tikken haalt geen 400 m.
      const meter = geheel(w.meter, 1, 400)
      return meter != null ? { ok: true, soort: s, waarde: { meter } } : { ok: false, fout: 'Ongeldige afstand.' }
    }
    case 'zetel': {
      const nr = geheel(w.nr, 0, ZETELS - 1)
      return nr != null ? { ok: true, soort: s, waarde: { nr } } : { ok: false, fout: 'Die zetel bestaat niet.' }
    }
    case 'vondst': {
      const nr = geheel(w.nr, 0, GOUDEN_BALLEN - 1)
      return nr != null ? { ok: true, soort: s, waarde: { nr } } : { ok: false, fout: 'Die bal bestaat niet.' }
    }
    case 'doelworp': {
      const score = geheel(w.score, 0, 99)
      return score != null ? { ok: true, soort: s, waarde: { score } } : { ok: false, fout: 'Ongeldige score.' }
    }
    case 'bord': {
      const id = typeof w.id === 'string' && (BORDEN as readonly string[]).includes(w.id) ? (w.id as BordId) : null
      if (!id || !w.tactiek || typeof w.tactiek !== 'object') return { ok: false, fout: 'Ongeldig bord.' }
      return { ok: true, soort: s, waarde: { id, tactiek: leesTactiek(w.tactiek) } }
    }
    case 'aankoop': {
      const id = typeof w.id === 'string' && artikelVan(w.id) ? w.id : null
      return id ? { ok: true, soort: s, waarde: { id } } : { ok: false, fout: 'Dat verkopen we hier niet.' }
    }
    case 'outfit':
      return w.outfit && typeof w.outfit === 'object' ? { ok: true, soort: s, waarde: { outfit: w.outfit as Partial<Outfit> } } : { ok: false, fout: 'Ongeldige outfit.' }
    case 'kluis':
      return { ok: true, soort: s, waarde: {} }
    case 'werp': {
      // De afstand rekent de server zelf uit, uit kracht en hoek (een client kan geen afstand opgeven).
      const bal = typeof w.bal === 'string' && (BAL_IDS as string[]).includes(w.bal) ? (w.bal as BalId) : null
      const kracht = tussen01(w.kracht)
      const hoek = typeof w.hoek === 'number' && Number.isFinite(w.hoek) && w.hoek >= 10 && w.hoek <= 70 ? Math.round(w.hoek * 10) / 10 : null
      if (!bal || kracht == null || hoek == null) return { ok: false, fout: 'Ongeldige worp.' }
      return { ok: true, soort: s, waarde: { bal, kracht, hoek, afstand: werpAfstand(bal, kracht, hoek) } }
    }
  }
}

export type Spoor = { id: number | string; soort: SpoorSoort; waarde: SpoorWaarde; naam: string; auteur: number | string | null; wanneer: string }

export type Sporenstaat = {
  eenden: { id: number | string; u: number; v: number; kleur: string; naam: string }[]
  verf: string[]
  popcorn: { totaal: number; laatste: string | null }
  loopband: { meter: number; top: { naam: string; meter: number }[] }
  zetels: Record<number, string>
  doelworp: { naam: string; score: number }[]
  borden: Partial<Record<BordId, Tactiek>>
  /** Wie alle gouden ballen vond (de eerste eerst), en welke ballen deze bezoeker al heeft. */
  vondsten: { kampioenen: string[]; mijn: number[] }
  /** Van wie kijkt: je kast (muntjes, kledij, outfit) en of je de sleutel van de helikopter hebt. */
  mij: Kast & { sleutel: boolean }
}

export const MAX_EENDEN = 120

/**
 * Leid de toestand af uit de sporen (oudste eerst). `ik` = de bezoeker die kijkt (voor zijn eigen
 * gevonden ballen), of null.
 */
export function vatSporenSamen(sporen: Spoor[], ik: number | string | null): Sporenstaat {
  const staat: Sporenstaat = {
    eenden: [],
    verf: [],
    popcorn: { totaal: 0, laatste: null },
    loopband: { meter: 0, top: [] },
    zetels: {},
    doelworp: [],
    borden: {},
    vondsten: { kampioenen: [], mijn: [] },
    mij: { ...maakKast(0, [], []), sleutel: false },
  }
  const aankopen: string[] = []
  const outfits: Partial<Outfit>[] = []
  let kluis = false
  const lopers = new Map<string, number>()
  const besten = new Map<string, number>()
  const gevonden = new Map<string, { naam: string; nrs: Set<number> }>()
  const mijn = new Set<number>()
  for (const s of sporen) {
    const w = s.waarde as Record<string, unknown>
    switch (s.soort) {
      case 'eend':
        staat.eenden.push({ id: s.id, u: w.u as number, v: w.v as number, kleur: w.kleur as string, naam: s.naam })
        break
      case 'verf':
        staat.verf.push(w.kleur as string)
        break
      case 'popcorn':
        staat.popcorn.totaal++
        staat.popcorn.laatste = s.naam
        break
      case 'loopband':
        staat.loopband.meter += w.meter as number
        lopers.set(s.naam, (lopers.get(s.naam) ?? 0) + (w.meter as number))
        break
      case 'zetel':
        staat.zetels[w.nr as number] = s.naam
        break
      case 'doelworp':
        besten.set(s.naam, Math.max(besten.get(s.naam) ?? 0, w.score as number))
        break
      case 'bord':
        staat.borden[w.id as BordId] = w.tactiek as Tactiek
        break
      case 'vondst': {
        const sleutel = String(s.auteur ?? s.naam)
        const g = gevonden.get(sleutel) ?? { naam: s.naam, nrs: new Set<number>() }
        const voor = g.nrs.size
        g.nrs.add(w.nr as number)
        gevonden.set(sleutel, g)
        if (voor < GOUDEN_BALLEN && g.nrs.size === GOUDEN_BALLEN) staat.vondsten.kampioenen.push(g.naam)
        if (ik != null && s.auteur != null && String(s.auteur) === String(ik)) mijn.add(w.nr as number)
        break
      }
      case 'aankoop':
      case 'outfit':
      case 'kluis':
        if (ik == null || s.auteur == null || String(s.auteur) !== String(ik)) break
        if (s.soort === 'aankoop') aankopen.push(w.id as string)
        else if (s.soort === 'outfit') outfits.push(w.outfit as Partial<Outfit>)
        else kluis = true
        break
    }
  }
  staat.eenden = staat.eenden.slice(-MAX_EENDEN)
  staat.verf = staat.verf.slice(-6)
  staat.loopband.top = [...lopers].map(([naam, meter]) => ({ naam, meter })).sort((a, b) => b.meter - a.meter).slice(0, 5)
  staat.doelworp = [...besten].map(([naam, score]) => ({ naam, score })).sort((a, b) => b.score - a.score).slice(0, 10)
  staat.vondsten.mijn = [...mijn].sort((a, b) => a - b)
  // De sleutel: de kluis gaat pas open als je alle gouden ballen hebt.
  staat.mij = { ...maakKast(mijn.size, aankopen, outfits), sleutel: kluis && mijn.size >= GOUDEN_BALLEN }
  return staat
}

/** Een lege toestand (voor er iets geladen is). */
export const legeSporen = (): Sporenstaat => vatSporenSamen([], null)

/** De kleur van het water: een mengsel van de laatste verfkleuren (de recentste weegt het zwaarst). */
export function waterKleur(verf: string[], basis = '#38bdf8'): string {
  if (!verf.length) return basis
  let r = 0
  let g = 0
  let b = 0
  let som = 0
  verf.forEach((k, i) => {
    const gewicht = i + 1
    r += parseInt(k.slice(1, 3), 16) * gewicht
    g += parseInt(k.slice(3, 5), 16) * gewicht
    b += parseInt(k.slice(5, 7), 16) * gewicht
    som += gewicht
  })
  const hex = (n: number) => Math.round(n / som).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
