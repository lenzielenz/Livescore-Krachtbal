// Superstar: afstandwerpen in de kelder van het virtuele stadion. Je kiest een krachtbal aan de
// tafel, bouwt kracht op en laat op het juiste moment los, en kiest je werphoek. De afstand rekent
// de server zelf uit (uit kracht en hoek), met echte ballistiek: elke bal heeft een eigen
// topsnelheid, zo afgesteld dat een perfecte worp precies het record haalt.

export const BALLEN = [
  { id: '800g', gram: 800, label: '800 g', kleur: '#f97316', naam: 'oranje', record: 17 },
  { id: '1kg', gram: 1000, label: '1 kg', kleur: '#facc15', naam: 'geel', record: 19 },
  { id: '2kg', gram: 2000, label: '2 kg', kleur: '#dc2626', naam: 'rood', record: 22 },
  { id: '3kg', gram: 3000, label: '3 kg', kleur: '#2563eb', naam: 'blauw', record: 27 },
  { id: '4kg', gram: 4000, label: '4 kg', kleur: '#f8fafc', naam: 'wit', record: 26 },
] as const

export type BalId = (typeof BALLEN)[number]['id']
export const BAL_IDS = BALLEN.map((b) => b.id) as BalId[]
export const balVan = (id: BalId) => BALLEN.find((b) => b.id === id)!

/** De baan: 30 m, met een witte lijn om de meter. */
export const BAAN_LENGTE = 30
/** Op welke hoogte de bal je hand verlaat (m). */
export const LOSLAAT_HOOGTE = 2.0
const G = 9.81

/** Hoe ver een bal vliegt bij snelheid v (m/s) en hoek (graden), losgelaten op LOSLAAT_HOOGTE. */
export function vliegAfstand(v: number, hoekGraden: number): number {
  const a = (hoekGraden * Math.PI) / 180
  const vx = v * Math.cos(a)
  const vy = v * Math.sin(a)
  const t = (vy + Math.sqrt(vy * vy + 2 * G * LOSLAAT_HOOGTE)) / G
  return vx * t
}

/** De beste werphoek (graden) voor deze loslaathoogte (iets minder dan 45°). */
export const BESTE_HOEK = (() => {
  let beste = 45
  let max = 0
  for (let h = 30; h <= 50; h += 0.1) {
    const d = vliegAfstand(15, h)
    if (d > max) {
      max = d
      beste = h
    }
  }
  return Math.round(beste * 10) / 10
})()

/** De topsnelheid van een bal: perfecte kracht onder de beste hoek = precies het record. */
export function topsnelheid(id: BalId): number {
  const doel = balVan(id).record
  let lo = 1
  let hi = 40
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    if (vliegAfstand(mid, BESTE_HOEK) < doel) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * De afstand van een worp. `kracht` 0–1 (1 = je liet perfect los op de top van je zwaai), `hoek`
 * in graden (10–70). Een slappe worp haalt nog altijd wat: de snelheid gaat van 40 % tot 100 %.
 * Afgerond op de centimeter, nooit verder dan het record.
 */
export function werpAfstand(id: BalId, kracht: number, hoek: number): number {
  const k = Math.min(1, Math.max(0, kracht))
  const h = Math.min(70, Math.max(10, hoek))
  const v = topsnelheid(id) * (0.4 + 0.6 * k)
  const d = Math.min(balVan(id).record, vliegAfstand(v, h))
  return Math.round(d * 100) / 100
}

/** Hoe snel de krachtmeter op en neer gaat (s per heen-en-terug): hoe zwaarder, hoe lastiger. */
export function meterTempo(id: BalId): number {
  return { '800g': 1.6, '1kg': 1.45, '2kg': 1.2, '3kg': 1.0, '4kg': 0.85 }[id]
}

export type Worp = { naam: string; club: string | null; bal: BalId; afstand: number; wanneer: string; auteur: number | string | null }
export type SuperstarStand = { per: Record<BalId, { naam: string; club: string | null; afstand: number }[]>; mijn: Partial<Record<BalId, number>>; totaal: number }

/** Het klassement per bal: de beste worp van elke werper (top 10), en je eigen besten. */
export function superstarStand(worpen: Worp[], ik: number | string | null, top = 10): SuperstarStand {
  const per = Object.fromEntries(BAL_IDS.map((b) => [b, [] as { naam: string; club: string | null; afstand: number }[]])) as SuperstarStand['per']
  const besten = new Map<string, { naam: string; club: string | null; afstand: number; bal: BalId }>()
  const mijn: SuperstarStand['mijn'] = {}
  for (const w of worpen) {
    const sleutel = `${w.bal}:${w.auteur ?? w.naam}`
    const oud = besten.get(sleutel)
    if (!oud || w.afstand > oud.afstand) besten.set(sleutel, { naam: w.naam, club: w.club, afstand: w.afstand, bal: w.bal })
    if (ik != null && w.auteur != null && String(w.auteur) === String(ik)) mijn[w.bal] = Math.max(mijn[w.bal] ?? 0, w.afstand)
  }
  for (const b of besten.values()) per[b.bal].push({ naam: b.naam, club: b.club, afstand: b.afstand })
  for (const id of BAL_IDS) per[id] = per[id].sort((a, b) => b.afstand - a.afstand).slice(0, top)
  return { per, mijn, totaal: worpen.length }
}
