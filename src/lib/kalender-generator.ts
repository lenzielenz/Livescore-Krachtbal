// Kalender opmaken voor één reeks: iedereen speelt één keer thuis en één keer uit tegen iedereen
// (heen- en terugronde). Pure logica — de route /api/federatie/kalender maakt er wedstrijden van.
//
// Methode: de klassieke "cirkel" (round robin). Eén ploeg staat vast, de rest draait één plaats per
// speeldag. Bij een oneven aantal komt er een "vrij" bij: wie daartegen loot, is die speeldag vrij.
// De terugronde is de heenronde met thuis en uit omgedraaid.

import { brusselsWallUtc, shiftDateStr } from './datetime'
import { leesThuis } from './kalender-planner'

export type KalenderPloeg = { id: number; naam: string; thuisUur?: string | null; thuisdag?: 'za' | 'zo' | null }
export type KalenderWedstrijd = { speeldag: number; datum: string; thuis: number; uit: number; aftrapUtc: string }
export type KalenderOpties = {
  /** Eerste speeldag, YYYY-MM-DD (Brusselse datum). */
  start: string
  /** Dagen tussen twee speeldagen (standaard 7: elk weekend). */
  interval?: number
  /** Data (YYYY-MM-DD) waarop niet gespeeld wordt: de speeldag schuift door naar de volgende datum. */
  vrij?: string[]
  /** Aftrapuur als de thuisploeg geen vast thuisuur heeft. */
  standaardUur?: string
  /** Enkel heenronde (bv. een korte reeks); standaard heen en terug. */
  enkelHeen?: boolean
}

const UUR = /^([01]?\d|2[0-3]):([0-5]\d)$/

/** De paringen per speeldag (zonder data): [thuis, uit][] per ronde. */
export function roundRobin(ids: number[], enkelHeen = false): [number, number][][] {
  if (ids.length < 2) return []
  const VRIJ = -1
  const lijst = ids.length % 2 === 0 ? [...ids] : [...ids, VRIJ]
  const n = lijst.length
  const heen: [number, number][][] = []
  // Thuis speelt wie tot nu toe het minst thuis speelde; bij gelijkheid wie vorige speeldag uit
  // was. Zo blijft iedereen binnen één wedstrijd van de helft, en speelt niemand lang na elkaar thuis.
  const thuisTel = new Map<number, number>()
  const vorigeThuis = new Map<number, boolean>()
  let draai = lijst.slice(1)
  for (let r = 0; r < n - 1; r++) {
    const rij = [lijst[0], ...draai]
    const ronde: [number, number][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = rij[i]
      const b = rij[n - 1 - i]
      if (a === VRIJ || b === VRIJ) continue
      const ta = thuisTel.get(a) ?? 0
      const tb = thuisTel.get(b) ?? 0
      const aThuis = ta !== tb ? ta < tb : vorigeThuis.get(a) === vorigeThuis.get(b) ? r % 2 === 0 : !vorigeThuis.get(a)
      const [thuis, uit] = aThuis ? [a, b] : [b, a]
      thuisTel.set(thuis, (thuisTel.get(thuis) ?? 0) + 1)
      vorigeThuis.set(thuis, true)
      vorigeThuis.set(uit, false)
      ronde.push([thuis, uit])
    }
    heen.push(ronde)
    draai = [draai[draai.length - 1], ...draai.slice(0, -1)]
  }
  if (enkelHeen) return heen
  const terug = heen.map((ronde) => ronde.map(([a, b]) => [b, a] as [number, number]))
  return [...heen, ...terug]
}

/** Volledige kalender met data en aftrapuren. */
export function maakKalender(ploegen: KalenderPloeg[], o: KalenderOpties): KalenderWedstrijd[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.start)) throw new Error('Kies een geldige startdatum.')
  const interval = o.interval && o.interval > 0 ? o.interval : 7
  const vrij = new Set(o.vrij ?? [])
  const standaard = UUR.test(o.standaardUur ?? '') ? (o.standaardUur as string) : '14:00'
  const perId = new Map(ploegen.map((p) => [p.id, p]))
  const rondes = roundRobin(
    ploegen.map((p) => p.id),
    o.enkelHeen,
  )

  const uit: KalenderWedstrijd[] = []
  let datum = o.start
  rondes.forEach((ronde, r) => {
    // Een vrije datum (feestdag, beker, tornooi) schuift deze en alle volgende speeldagen op.
    let veiligheid = 0
    while (vrij.has(datum) && veiligheid++ < 200) datum = shiftDateStr(datum, interval)
    for (const [thuis, tegen] of ronde) {
      // "16:00", maar ook "za 16:00" / "zo 11:00" zoals de reeksindeling het thuisuur bewaart: de dag
      // telt dan mee (zondag = de dag na de speeldag, als die op zaterdag valt).
      const p = perId.get(thuis)
      const { dag, uur } = leesThuis({ thuisdag: p?.thuisdag ?? null, thuisUur: p?.thuisUur ?? null }, { dag: 'za', uur: standaard })
      const [hh, mm] = uur.split(':').map(Number)
      const isZaterdag = new Date(`${datum}T12:00:00Z`).getUTCDay() === 6
      const speeldatum = dag === 'zo' && isZaterdag ? shiftDateStr(datum, 1) : datum
      const [y, m, d] = speeldatum.split('-').map(Number)
      uit.push({ speeldag: r + 1, datum: speeldatum, thuis, uit: tegen, aftrapUtc: brusselsWallUtc(y, m, d, hh, mm).toISOString() })
    }
    datum = shiftDateStr(datum, interval)
  })
  return uit
}
