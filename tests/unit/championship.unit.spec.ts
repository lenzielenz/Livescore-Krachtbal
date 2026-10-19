import { describe, it, expect } from 'vitest'

import { clinchStatus, openDuels, titelBoodschap, titelKansen } from '@/lib/championship'
import type { StandingRow } from '@/lib/standings'

const row = (teamId: number, points: number): StandingRow => ({
  teamId,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  forfaits: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  diff: 0,
  points,
})

describe('clinchStatus', () => {
  it('is kampioen wanneer geen enkele tegenstander nog kan bijbenen', () => {
    // Leider 40 ptn, 0 resterend; rivaal 30 ptn met 2 resterend -> max 38 < 40.
    const standings = [row(1, 40), row(2, 30), row(3, 28)]
    const remaining = new Map([
      [1, 0],
      [2, 2],
      [3, 2],
    ])
    const s = clinchStatus(standings, remaining, 1)!
    expect(s.clinched).toBe(true)
    expect(s.pointsToClinch).toBe(0)
    expect(s.leading).toBe(true)
  })

  it('berekent het aantal zeges tot de titel wanneer nog niet zeker', () => {
    // Leider 30 ptn met 3 resterend, rivaal 26 ptn met 3 resterend -> rivaal haalt max 26+12 = 38.
    // Een verlies levert de leider nog 2 punten op: 30 + 6 = 36 is er al, elke zege is +2 extra.
    // Met 1 zege staat het 38-38 (geen beslissing), met 2 zeges 40 > 38.
    const standings = [row(1, 30), row(2, 26)]
    const remaining = new Map([
      [1, 3],
      [2, 3],
    ])
    const s = clinchStatus(standings, remaining, 1)!
    expect(s.clinched).toBe(false)
    expect(s.winsToClinch).toBe(2)
    expect(s.pointsToClinch).toBe(10) // 3 wedstrijden: 2 zeges (8) + 1 verlies (2)
    expect(s.leading).toBe(true)
  })

  it('rekent een verlies van de leider als 2 punten, niet als 0', () => {
    // Leider 30, nog 2 te spelen -> minstens 34. Rivaal 24 met 2 te spelen -> max 32. Al zeker,
    // ook al verliest de leider alles. De oude berekening ("verlies = 0") vroeg nog 1 zege.
    const standings = [row(1, 30), row(2, 24)]
    const remaining = new Map([
      [1, 2],
      [2, 2],
    ])
    expect(clinchStatus(standings, remaining, 1)!.clinched).toBe(true)
  })

  it('telt een zege tegen de rivaal dubbel mee wanneer ze nog tegen elkaar spelen', () => {
    // Leider 16, rivaal 14, elk nog 2 wedstrijden: allebei tegen elkaar.
    const standings = [row(1, 16), row(2, 14)]
    const remaining = new Map([
      [1, 2],
      [2, 2],
    ])
    // Zonder te weten wie tegen wie speelt: 1 zege geeft 22-22, pas 2 zeges beslissen.
    expect(clinchStatus(standings, remaining, 1)!.winsToClinch).toBe(2)
    // Met de kalender: één zege van de leider tegen de rivaal geeft 22-20 -> 1 zege volstaat.
    const ctx = {
      fixtures: [
        { homeId: 1, awayId: 2 },
        { homeId: 2, awayId: 1 },
      ],
      results: [],
    }
    const s = clinchStatus(standings, remaining, 1, ctx)!
    expect(s.winsToClinch).toBe(1)
    expect(s.clinched).toBe(false)
  })

  it('laat de wedstrijden van rivalen onderling buiten beschouwing', () => {
    // Rivaal 2 en 3 spelen nog tegen elkaar, maar elk van hen kan afzonderlijk nog alles winnen.
    // Voor de leider verandert er dus niets tot dat duel gespeeld is.
    const standings = [row(1, 30), row(2, 26), row(3, 26)]
    const remaining = new Map([
      [1, 3],
      [2, 3],
      [3, 3],
    ])
    const zonder = clinchStatus(standings, remaining, 1)!
    const met = clinchStatus(standings, remaining, 1, {
      fixtures: [{ homeId: 2, awayId: 3 }],
      results: [],
    })!
    expect(met.winsToClinch).toBe(zonder.winsToClinch)
  })

  it('beslist een gelijke stand met het onderling resultaat als de leider al twee keer won', () => {
    // Leider 20 (niets meer te spelen), rivaal 16 met nog 1 wedstrijd -> kan 20 halen.
    const standings = [row(1, 20), row(2, 16)]
    const remaining = new Map([
      [1, 0],
      [2, 1],
    ])
    const g = (homeId: number, awayId: number, homeGoals: number, awayGoals: number) => ({ homeId, awayId, homeGoals, awayGoals, forfait: 'none' as const })
    // Zonder onderling resultaat blijft het open.
    expect(clinchStatus(standings, remaining, 1)!.clinched).toBe(false)
    // Leider won beide duels (4+4 tegen 2+2): bij 20-20 wint de leider het onderling resultaat.
    const gewonnen = { fixtures: [], results: [g(1, 2, 10, 5), g(2, 1, 5, 10)] }
    expect(clinchStatus(standings, remaining, 1, gewonnen)!.clinched).toBe(true)
    // Eén zege en één verlies: onderling gelijk -> niet beslist.
    const gelijk = { fixtures: [], results: [g(1, 2, 10, 5), g(2, 1, 10, 5)] }
    expect(clinchStatus(standings, remaining, 1, gelijk)!.clinched).toBe(false)
  })

  it('houdt rekening met een nog te spelen duel bij het onderling resultaat', () => {
    // Leider 20, rivaal 18, nog één duel te spelen. Verliest de leider dat, dan staat het 22-22.
    // Hij won het eerste duel, maar wint de rivaal het tweede, dan staat het onderling gelijk
    // (6-6) -> niet beslist.
    const standings = [row(1, 20), row(2, 18)]
    const remaining = new Map([
      [1, 1],
      [2, 1],
    ])
    const ctx = {
      fixtures: [{ homeId: 2, awayId: 1 }],
      results: [{ homeId: 1, awayId: 2, homeGoals: 10, awayGoals: 5, forfait: 'none' as const }],
    }
    expect(clinchStatus(standings, remaining, 1, ctx)!.clinched).toBe(false)
  })

  it('geeft pointsToClinch null als het wiskundig nog niet te verzekeren valt', () => {
    // Leider 20 met 1 resterend (max +4); rivaal 19 met 3 resterend -> max 31. Nodig 12 > 4.
    const standings = [row(1, 20), row(2, 19)]
    const remaining = new Map([
      [1, 1],
      [2, 3],
    ])
    const s = clinchStatus(standings, remaining, 1)!
    expect(s.clinched).toBe(false)
    expect(s.pointsToClinch).toBeNull()
  })

  it('kampioen op het einde van het seizoen (geen resterende wedstrijden) bovenaan', () => {
    const standings = [row(1, 34), row(2, 32)]
    const remaining = new Map([
      [1, 0],
      [2, 0],
    ])
    const s = clinchStatus(standings, remaining, 1)!
    expect(s.clinched).toBe(true)
  })
})

describe('titelBoodschap', () => {
  const status = (over: Partial<ReturnType<typeof clinchStatus>> = {}) => ({
    rank: 1,
    points: 30,
    remaining: 3,
    clinched: false,
    leading: true,
    pointsToClinch: 9,
    winsToClinch: 3,
    ...over,
  })

  it('meldt de kampioen', () => {
    const m = titelBoodschap({ status: status({ clinched: true, winsToClinch: 0, pointsToClinch: 0 }), ploegNaam: 'Sint-Gillis', reeksLabel: '1ste Nationale Heren', teamsInTable: 8 })
    expect(m).toEqual({ text: 'Sint-Gillis is wiskundig kampioen van 1ste Nationale Heren.', clinched: true })
  })

  it('meldt hoeveel zeges de leider nog nodig heeft', () => {
    const m = titelBoodschap({ status: status(), ploegNaam: 'Sint-Gillis', reeksLabel: 'Landelijke Dames', teamsInTable: 8 })
    expect(m?.clinched).toBe(false)
    expect(m?.text).toBe('Sint-Gillis leidt en heeft nog 3 zeges nodig om de titel te verzekeren.')
  })

  it('gebruikt enkelvoud bij één zege', () => {
    const m = titelBoodschap({ status: status({ winsToClinch: 1, pointsToClinch: 4 }), ploegNaam: 'Sint-Gillis', reeksLabel: 'LH', teamsInTable: 8 })
    expect(m?.text).toContain('nog 1 zege nodig')
  })

  it('zwijgt wanneer de titel nog niet te verzekeren valt (begin seizoen)', () => {
    const m = titelBoodschap({ status: status({ winsToClinch: null, pointsToClinch: null }), ploegNaam: 'Sint-Gillis', reeksLabel: 'LH', teamsInTable: 8 })
    expect(m).toBeNull()
  })

  it('zwijgt zonder leider, zonder status of bij één ploeg in de stand', () => {
    expect(titelBoodschap({ status: status(), ploegNaam: null, reeksLabel: 'LH', teamsInTable: 8 })).toBeNull()
    expect(titelBoodschap({ status: null, ploegNaam: 'X', reeksLabel: 'LH', teamsInTable: 8 })).toBeNull()
    expect(titelBoodschap({ status: status({ clinched: true }), ploegNaam: 'X', reeksLabel: 'LH', teamsInTable: 1 })).toBeNull()
  })

  it('zwijgt wanneer de leider niets meer te spelen heeft maar (nog) geen kampioen is', () => {
    const m = titelBoodschap({ status: status({ remaining: 0 }), ploegNaam: 'X', reeksLabel: 'LH', teamsInTable: 8 })
    expect(m).toBeNull()
  })
})

describe('titelKansen', () => {
  const r = (teamId: number, won: number, drawn: number, lost: number): StandingRow => ({
    ...row(teamId, won * 4 + drawn * 3 + lost * 2),
    played: won + drawn + lost,
    won,
    drawn,
    lost,
  })
  /** Dubbele competitie (heen en terug) tussen alle ploegen. */
  const kalender = (ids: number[]) => ids.flatMap((h) => ids.filter((a) => a !== h).map((a) => ({ homeId: h, awayId: a })))
  // De stand uit 2de Nationale Heren na zes speeldagen: de leider staat 2 punten voor.
  const stand = [r(1, 6, 0, 0), r(2, 5, 0, 1), r(3, 4, 1, 1), r(4, 4, 0, 2), r(5, 4, 0, 2), r(6, 4, 0, 2), r(7, 2, 0, 4), r(8, 2, 0, 4)]
  const ids = stand.map((x) => x.teamId)
  const ctx = { fixtures: kalender(ids).slice(0, 40), results: [] }

  it('sommeert tot 1 en is deterministisch', () => {
    const k = titelKansen(stand, ctx)
    const som = [...k.values()].reduce((s, x) => s + x, 0)
    expect(som).toBeCloseTo(1, 6)
    expect(titelKansen(stand, ctx)).toEqual(k)
  })

  it('geeft de leider met een kleine voorsprong een echte kans, maar geen zekerheid', () => {
    const k = titelKansen(stand, ctx)
    const leider = k.get(1) ?? 0
    expect(leider).toBeGreaterThan(k.get(2) ?? 0)
    expect(leider).toBeLessThan(0.85)
    // Met nog een half seizoen te gaan maken ook de achtervolgers een kans.
    expect(k.get(2) ?? 0).toBeGreaterThan(0.05)
  })

  it('kampioen = 100% wanneer niemand nog kan bijhalen', () => {
    const k = titelKansen([r(1, 10, 0, 0), r(2, 2, 0, 8)], { fixtures: [{ homeId: 1, awayId: 2 }], results: [] })
    expect(k.get(1)).toBe(1)
  })

  it('beslist gelijke punten met het onderling resultaat', () => {
    // A en B staan gelijk en zijn even sterk; B won het onderlinge duel. Elk speelt nog tegen C:
    // winnen ze allebei, dan wint B de titel op het onderling resultaat.
    const results = [{ homeId: 2, awayId: 1, homeGoals: 20, awayGoals: 10, forfait: 'none' as const }]
    const stand = [r(1, 2, 0, 1), r(2, 2, 0, 1), r(3, 0, 0, 2)]
    const k = titelKansen(stand, { fixtures: [{ homeId: 1, awayId: 3 }, { homeId: 2, awayId: 3 }], results })
    expect(k.get(2) ?? 0).toBeGreaterThan(k.get(1) ?? 0)
  })
})

describe('openDuels', () => {
  it('geeft de duels met rivalen chronologisch', () => {
    const ctx = {
      fixtures: [
        { homeId: 3, awayId: 1, date: '2027-03-13T14:00:00.000Z' },
        { homeId: 1, awayId: 2, date: '2026-11-07T14:00:00.000Z' },
        { homeId: 1, awayId: 9, date: '2026-10-24T14:00:00.000Z' },
      ],
      results: [],
    }
    expect(openDuels(ctx, 1, new Set([2, 3]))).toEqual([
      { tegenstanderId: 2, date: '2026-11-07T14:00:00.000Z' },
      { tegenstanderId: 3, date: '2027-03-13T14:00:00.000Z' },
    ])
  })
})

describe('titelBoodschap met titelkans', () => {
  const status = (winsToClinch: number | null, over: Partial<ReturnType<typeof clinchStatus>> = {}) => ({
    rank: 1, points: 24, remaining: 16, clinched: false, leading: true, pointsToClinch: 0, winsToClinch, ...over,
  })
  const kansen = {
    eigen: 0.412,
    favoriet: { naam: 'D&W Koekelare', kans: 0.236 },
    naaste: { naam: 'D&W Koekelare', punten: 22 },
    duels: ['D&W Koekelare (za 7 nov.)', 'Avanti Lissewege (za 21 nov.)', 'KBK Temse (za 13 mrt.)'],
  }

  it('legt de voorsprong uit, geeft de kans en noemt de duels met de rivalen', () => {
    const m = titelBoodschap({ status: status(14), ploegNaam: 'KBC St. Michiels A', reeksLabel: '2NAH', teamsInTable: 12, kansen })
    expect(m?.text).toBe(
      'KBC St. Michiels A leidt met 2 punten voor D&W Koekelare: na één nederlaag kan D&W Koekelare gelijkkomen. ' +
        'Titelkans ± 41%, D&W Koekelare ± 24%. ' +
        'Nog te spelen tegen D&W Koekelare (za 7 nov.), Avanti Lissewege (za 21 nov.) en KBK Temse (za 13 mrt.).',
    )
  })

  it('telt de nederlagen die de voorsprong kosten', () => {
    const m = titelBoodschap({ status: status(14), ploegNaam: 'X', reeksLabel: 'LH', teamsInTable: 12, kansen: { ...kansen, naaste: { naam: 'Y', punten: 19 }, duels: [] } })
    expect(m?.text).toMatch(/^X leidt met 5 punten voor Y: na 3 nederlagen kan Y erover\. Titelkans/)
  })

  it('verkiest het exacte aantal zeges dicht bij de meet', () => {
    const m = titelBoodschap({ status: status(2), ploegNaam: 'X', reeksLabel: 'LH', teamsInTable: 12, kansen })
    expect(m?.text).toBe('X leidt en heeft nog 2 zeges nodig om de titel te verzekeren.')
  })

  it('noemt voor een achtervolger de favoriet, en zwijgt zonder kans', () => {
    const s = status(null, { rank: 3, points: 21, leading: false })
    const m = titelBoodschap({ status: s, ploegNaam: 'Avanti Lissewege', reeksLabel: '2NAH', teamsInTable: 12, achterstand: 3, kansen: { ...kansen, eigen: 0.12, favoriet: { naam: 'KBC St. Michiels A', kans: 0.41 }, naaste: null, duels: [] } })
    expect(m?.text).toBe('Avanti Lissewege staat 3e op 3 punten. Titelkans ± 12%, favoriet is KBC St. Michiels A (± 41%).')
    expect(titelBoodschap({ status: s, ploegNaam: 'X', reeksLabel: '2NAH', teamsInTable: 12, achterstand: 9, kansen: { ...kansen, eigen: 0.004 } })).toBeNull()
  })
})

describe('titelBoodschap voor een ploeg die niet leidt', () => {
  const status = (over: Partial<ReturnType<typeof clinchStatus>> = {}) => ({
    rank: 2, points: 20, remaining: 17, clinched: false, leading: false, pointsToClinch: 0, winsToClinch: 15, ...over,
  })
  const kansen = { eigen: 0.3, favoriet: { naam: 'KBC Male', kans: 0.35 }, naaste: null, duels: [] }

  it('deelt de leiding bij gelijke punten', () => {
    const m = titelBoodschap({ status: status(), ploegNaam: 'KBC St. Michiels', reeksLabel: '1NH', teamsInTable: 12, achterstand: 0, kansen })
    expect(m?.text).toBe('KBC St. Michiels deelt de leiding. Titelkans ± 30%, favoriet is KBC Male (± 35%).')
  })

  it('noemt plaats en achterstand', () => {
    const m = titelBoodschap({ status: status({ rank: 3, points: 18 }), ploegNaam: 'KBK Ichtegem', reeksLabel: '1NH', teamsInTable: 12, achterstand: 2, kansen })
    expect(m?.text).toMatch(/^KBK Ichtegem staat 3e op 2 punten\. Titelkans ± 30%/)
    const een = titelBoodschap({ status: status({ winsToClinch: 2 }), ploegNaam: 'X', reeksLabel: '1NH', teamsInTable: 12, achterstand: 1 })
    expect(een?.text).toBe('X staat 2e op 1 punt en heeft nog 2 zeges nodig om de titel te verzekeren.')
  })

  it('zwijgt als de ploeg de titel niet meer zelf kan afdwingen', () => {
    expect(titelBoodschap({ status: status({ winsToClinch: null }), ploegNaam: 'X', reeksLabel: '1NH', teamsInTable: 12, achterstand: 9 })).toBeNull()
  })
})
