import { describe, it, expect } from 'vitest'

import { clinchStatus, titelBoodschap } from '@/lib/championship'
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
    const m = titelBoodschap({ status: status({ clinched: true, winsToClinch: 0, pointsToClinch: 0 }), leaderName: 'Sint-Gillis', reeksLabel: '1ste Nationale Heren', teamsInTable: 8 })
    expect(m).toEqual({ text: 'Sint-Gillis is wiskundig kampioen van 1ste Nationale Heren.', clinched: true })
  })

  it('meldt hoeveel zeges de leider nog nodig heeft', () => {
    const m = titelBoodschap({ status: status(), leaderName: 'Sint-Gillis', reeksLabel: 'Landelijke Dames', teamsInTable: 8 })
    expect(m?.clinched).toBe(false)
    expect(m?.text).toBe('Sint-Gillis leidt en heeft nog 3 zeges nodig om de titel te verzekeren.')
  })

  it('gebruikt enkelvoud bij één zege', () => {
    const m = titelBoodschap({ status: status({ winsToClinch: 1, pointsToClinch: 4 }), leaderName: 'Sint-Gillis', reeksLabel: 'LH', teamsInTable: 8 })
    expect(m?.text).toContain('nog 1 zege nodig')
  })

  it('zwijgt wanneer de titel nog niet te verzekeren valt (begin seizoen)', () => {
    const m = titelBoodschap({ status: status({ winsToClinch: null, pointsToClinch: null }), leaderName: 'Sint-Gillis', reeksLabel: 'LH', teamsInTable: 8 })
    expect(m).toBeNull()
  })

  it('zwijgt zonder leider, zonder status of bij één ploeg in de stand', () => {
    expect(titelBoodschap({ status: status(), leaderName: null, reeksLabel: 'LH', teamsInTable: 8 })).toBeNull()
    expect(titelBoodschap({ status: null, leaderName: 'X', reeksLabel: 'LH', teamsInTable: 8 })).toBeNull()
    expect(titelBoodschap({ status: status({ clinched: true }), leaderName: 'X', reeksLabel: 'LH', teamsInTable: 1 })).toBeNull()
  })

  it('zwijgt wanneer de leider niets meer te spelen heeft maar (nog) geen kampioen is', () => {
    const m = titelBoodschap({ status: status({ remaining: 0 }), leaderName: 'X', reeksLabel: 'LH', teamsInTable: 8 })
    expect(m).toBeNull()
  })
})
