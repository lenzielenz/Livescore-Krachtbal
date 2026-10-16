import { describe, expect, it } from 'vitest'

import {
  balOp,
  boogHoogte,
  heatKleur,
  passenNetwerk,
  positieOp,
  score,
  somHeat,
  tijdLabel,
  veldLijnen,
  worpBoog,
  type AppData,
} from '@/lib/app-analyse-veld'

// Het rekenwerk achter de interactieve analyse (3D-arena, tactiekbord, spelers).
//
// Aanleiding: "ik wil dat alles visueel en interactief online staat … ook in 3D, inzoomen,
// uitzoomen … samen met de heatmaps en waar iedereen naar werpt en vangt."

const veld = { lengte: 46, breedte: 14, doellijn_a: 10, doellijn_b: 36, vwl_a: 14, vwl_b: 32, middenlijn: 23, raster: 0.5 }

const data: AppData = {
  veld,
  duur_s: 30,
  ploegen: [
    { id: 0, naam: 'A', thuis: true },
    { id: 1, naam: 'B', thuis: false },
  ],
  spelers: {
    'T0-S1': { id: 'T0-S1', naam: 'Jan', rugnummer: 7, team: 0, pad: [[0, 10, 7], [1, 12, 7], [5, 12, 9]], heat: [[0, 2], [1, 0]] },
    'T0-S2': { id: 'T0-S2', naam: 'Piet', rugnummer: 9, team: 0, pad: [[0, 20, 3], [1, 20, 5]], heat: [[2, 0], [0, 4]] },
  },
  worpen: [
    { team: 0, punten: 2, tijd_s: 10, vluchttijd: 1, tophoogte: 4, opzetplaats: { x: 20, y: 7 }, landingspunt: { x: 40, y: 7 }, uitkomst: 'goal' },
    { team: 1, punten: 0, tijd_s: 15, vluchttijd: 1, tophoogte: 3, opzetplaats: { x: 30, y: 7 }, landingspunt: { x: 20, y: 7 }, uitkomst: 'caught' },
    { team: 1, punten: 1, uitkomst: 'goal' },
  ],
  passen: [
    { team: 0, van: 'T0-S1', naar: 'T0-S2' },
    { team: 0, van: 'T0-S2', naar: 'T0-S1' },
    { team: 1, van: 'x', naar: 'y' },
  ],
  balpad: [[0, 10, 7, 'vast'], [0.5, 10.2, 7, 'vast'], [20, null, null, 'kwijt']],
}

describe('veld en score', () => {
  it('kent elke lijn van het veld', () => {
    const l = veldLijnen(veld)
    expect(l.filter((x) => x.soort === 'doel').map((x) => x.x)).toEqual([10, 36])
    expect(l.find((x) => x.soort === 'midden')?.x).toBe(23)
    expect(l.filter((x) => x.soort === 'vwl')).toHaveLength(2)
  })

  it('telt de punten per kant', () => {
    expect(score(data)).toEqual({ thuis: 2, uit: 1 })
  })

  it('schrijft tijden als minuten en seconden', () => {
    expect(tijdLabel(75.4)).toBe('1:15')
    expect(tijdLabel(75.44, true)).toBe('1:15.4')
    expect(tijdLabel(null)).toBe('–')
  })
})

describe('worpbogen', () => {
  it('vertrekt op werphoogte, landt op de grond en haalt de gemeten top', () => {
    expect(boogHoogte(0, 4)).toBeCloseTo(2)
    expect(boogHoogte(1, 4)).toBeCloseTo(0)
    expect(boogHoogte(0.5, 4)).toBeCloseTo(4)
  })

  it('volgt de lijn van werpplaats naar landing; een gevangen bal eindigt op handhoogte', () => {
    const goal = worpBoog(data.worpen![0], 10)
    expect(goal[0]).toEqual([20, 7, 2])
    expect(goal[10][0]).toBeCloseTo(40)
    expect(goal[10][2]).toBeCloseTo(0)
    const vangst = worpBoog(data.worpen![1], 10)
    expect(vangst[10][2]).toBeCloseTo(1.4)
    expect(worpBoog(data.worpen![2])).toEqual([])
  })
})

describe('herhaling', () => {
  it('interpoleert een speler tussen twee punten van zijn pad', () => {
    expect(positieOp(data.spelers!['T0-S1'].pad, 0.5)).toEqual({ x: 11, y: 7 })
    expect(positieOp(data.spelers!['T0-S1'].pad, 9)).toBeNull()
  })

  it('springt over een gat in het pad in plaats van door de lucht te glijden', () => {
    expect(positieOp(data.spelers!['T0-S1'].pad, 1.5)).toEqual({ x: 12, y: 7 })
  })

  it('zet de bal op de boog tijdens een worp, anders op het balpad', () => {
    const lucht = balOp(data, 10.5)
    expect(lucht?.x).toBeCloseTo(30)
    expect(lucht?.h).toBeCloseTo(4)
    expect(balOp(data, 0.4)).toEqual({ x: 10.2, y: 7, h: 1.1 })
    expect(balOp(data, 20)).toBeNull()
  })
})

describe('heatmaps en passen', () => {
  it('telt heatmaps op voor een hele ploeg', () => {
    const { raster, max } = somHeat([data.spelers!['T0-S1'].heat, data.spelers!['T0-S2'].heat])
    expect(raster).toEqual([[2, 2], [1, 4]])
    expect(max).toBe(4)
  })

  it('kleurt koud doorzichtig en warm rood', () => {
    expect(heatKleur(0)[3]).toBe(0)
    const heet = heatKleur(1)
    expect(heet[0]).toBeGreaterThan(200)
    expect(heet[3]).toBeGreaterThan(200)
  })

  it('bouwt het passennetwerk van één ploeg op de gemiddelde plaatsen', () => {
    const n = passenNetwerk(data, 0)
    expect(n.knopen.map((k) => k.id).sort()).toEqual(['T0-S1', 'T0-S2'])
    expect(n.lijnen).toEqual([{ van: 'T0-S1', naar: 'T0-S2', n: 2 }])
    expect(n.knopen.find((k) => k.id === 'T0-S2')?.plek).toEqual({ x: 20, y: 4 })
  })
})
