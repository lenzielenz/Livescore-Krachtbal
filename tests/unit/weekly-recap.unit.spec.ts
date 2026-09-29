import { describe, it, expect } from 'vitest'

import {
  buildHighlights,
  buildWeeklyRecap,
  positionDeltas,
  previousWeekRange,
  type Climber,
  type RecapMatch,
} from '@/lib/weekly-recap'
import { weekendRange } from '@/lib/pronostiek-weekend'

const match = (over: Partial<RecapMatch> & { matchId: number; homeGoals: number; awayGoals: number }): RecapMatch => ({
  date: '2026-08-01T14:00:00.000Z',
  reeks: '1NAH',
  home: `Thuis ${over.matchId}`,
  away: `Uit ${over.matchId}`,
  homeTeamId: over.matchId * 10,
  awayTeamId: over.matchId * 10 + 1,
  ...over,
})

describe('previousWeekRange', () => {
  it('toont op maandagochtend vóór 08:00 het net afgelopen weekend', () => {
    const prev = previousWeekRange(new Date('2026-09-14T05:53:00.000Z')) // 07:53 in België
    expect(prev.startIso).toBe('2026-09-07T06:00:00.000Z')
    expect(prev.endIso).toBe('2026-09-14T06:00:00.000Z')
  })
  it('levert precies de speelweek vóór de huidige', () => {
    const now = new Date('2026-08-10T09:00:00.000Z') // een maandagochtend
    const prev = previousWeekRange(now)
    const current = weekendRange(now.toISOString())
    expect(prev.endIso).toBe(current.startIso)
    expect(new Date(prev.startIso).getTime()).toBeLessThan(new Date(prev.endIso).getTime())
  })
  it('het venster is precies één week lang', () => {
    const prev = previousWeekRange(new Date('2026-02-11T12:00:00.000Z'))
    const days = (new Date(prev.endIso).getTime() - new Date(prev.startIso).getTime()) / 86_400_000
    expect(days).toBe(7)
  })
})

describe('buildHighlights', () => {
  it('licht de zwaarste zege, de kermis en de thriller eruit', () => {
    const results = [
      match({ matchId: 1, homeGoals: 30, awayGoals: 8 }), // zwaarste zege
      match({ matchId: 2, homeGoals: 26, awayGoals: 25 }), // meeste punten én spannend
      match({ matchId: 3, homeGoals: 12, awayGoals: 11 }),
    ]
    const h = buildHighlights(results)
    expect(h.find((x) => x.key === 'biggest')?.matchId).toBe(1)
    expect(h.find((x) => x.key === 'feast')?.matchId).toBe(2)
    // De kermis was al gekozen — de thriller mag die niet dubbel opvoeren.
    expect(h.filter((x) => x.matchId === 2)).toHaveLength(1)
    expect(h.find((x) => x.key === 'thriller')?.matchId).toBe(3)
  })
  it('een krappe zege is geen "zwaarste zege"', () => {
    const h = buildHighlights([match({ matchId: 1, homeGoals: 12, awayGoals: 10 })])
    expect(h.some((x) => x.key === 'biggest')).toBe(false)
  })
  it('gelijkspel krijgt eigen tekst', () => {
    const h = buildHighlights([match({ matchId: 1, homeGoals: 14, awayGoals: 14 })])
    expect(h.find((x) => x.key === 'thriller')?.text).toContain('niemand die won')
  })
  it('lege week → geen highlights', () => expect(buildHighlights([])).toEqual([]))
  it('een forfait (30–0) telt niet mee als "zwaarste zege" of "meeste doelpunten"', () => {
    const h = buildHighlights([
      match({ matchId: 1, homeGoals: 30, awayGoals: 0 }), // forfait — geen prestatie
      match({ matchId: 2, homeGoals: 12, awayGoals: 11 }),
    ])
    expect(h.every((x) => x.matchId !== 1)).toBe(true)
  })
  it('enkel forfaits in de week → geen highlights', () => {
    expect(buildHighlights([match({ matchId: 1, homeGoals: 0, awayGoals: 30 })])).toEqual([])
  })
})

describe('positionDeltas', () => {
  it('rekent klimmen en zakken uit', () => {
    const before = [{ teamId: 1 }, { teamId: 2 }, { teamId: 3 }]
    const after = [{ teamId: 3 }, { teamId: 1 }, { teamId: 2 }]
    const d = positionDeltas(before, after)
    expect(d.get(3)).toEqual({ from: 3, to: 1, delta: 2 })
    expect(d.get(2)).toEqual({ from: 2, to: 3, delta: -1 })
  })
  it('een nieuwe ploeg telt niet als klimmer', () => {
    expect(positionDeltas([{ teamId: 1 }], [{ teamId: 9 }, { teamId: 1 }]).has(9)).toBe(false)
  })
})

describe('buildWeeklyRecap', () => {
  const climbers: Climber[] = [
    { teamId: 1, teamName: 'A', reeks: '1NAH', from: 5, to: 2, delta: 3 },
    { teamId: 2, teamName: 'B', reeks: '1NAH', from: 2, to: 4, delta: -2 },
  ]
  it('telt wedstrijden en punten en houdt enkel de klimmers', () => {
    const r = buildWeeklyRecap({
      startIso: '2026-08-03T06:00:00.000Z',
      endIso: '2026-08-10T06:00:00.000Z',
      results: [match({ matchId: 1, homeGoals: 20, awayGoals: 18 }), match({ matchId: 2, homeGoals: 10, awayGoals: 9 })],
      team: null,
      players: [],
      climbers,
    })
    expect(r.matches).toBe(2)
    expect(r.goals).toBe(57)
    expect(r.climbers).toHaveLength(1)
    expect(r.climbers[0].teamName).toBe('A')
    expect(r.headline).toContain('2 wedstrijden')
  })
  it('sorteert de uitslagen chronologisch', () => {
    const r = buildWeeklyRecap({
      startIso: 'a',
      endIso: 'b',
      results: [
        match({ matchId: 2, homeGoals: 1, awayGoals: 0, date: '2026-08-02T14:00:00.000Z' }),
        match({ matchId: 1, homeGoals: 1, awayGoals: 0, date: '2026-08-01T14:00:00.000Z' }),
      ],
      team: null,
      players: [],
      climbers: [],
    })
    expect(r.results.map((m) => m.matchId)).toEqual([1, 2])
  })
  it('een lege week geeft een nette recap zonder ruis', () => {
    const r = buildWeeklyRecap({ startIso: 'a', endIso: 'b', results: [], team: null, players: [], climbers: [] })
    expect(r.matches).toBe(0)
    expect(r.headline).toContain('zonder wedstrijden')
    expect(r.push.body).toContain('Geen wedstrijden')
  })
  it('geeft het aantal wedstrijden van de vorige week door voor het verschil', () => {
    const r = buildWeeklyRecap({ startIso: 'a', endIso: 'b', results: [], team: null, players: [], climbers: [], previousMatches: 50 })
    expect(r.previousMatches).toBe(50)
  })
  it('valt terug op null als de vorige week niet kon worden opgehaald', () => {
    const r = buildWeeklyRecap({ startIso: 'a', endIso: 'b', results: [], team: null, players: [], climbers: [] })
    expect(r.previousMatches).toBeNull()
  })
  it('telt forfaits (30–0) apart, los van de andere statistieken', () => {
    const r = buildWeeklyRecap({
      startIso: 'a',
      endIso: 'b',
      results: [
        match({ matchId: 1, homeGoals: 30, awayGoals: 0 }),
        match({ matchId: 2, homeGoals: 0, awayGoals: 30 }),
        match({ matchId: 3, homeGoals: 20, awayGoals: 18 }),
      ],
      team: null,
      players: [],
      climbers: [],
    })
    expect(r.stats.forfaits).toBe(2)
    expect(r.matches).toBe(3)
  })
  it('telt automatisch geïmporteerde wedstrijden niet mee bij "manueel"', () => {
    const r = buildWeeklyRecap({
      startIso: 'a',
      endIso: 'b',
      results: [
        match({ matchId: 1, homeGoals: 20, awayGoals: 18 }),
        match({ matchId: 2, homeGoals: 10, awayGoals: 9, autoImported: true }),
        match({ matchId: 3, homeGoals: 5, awayGoals: 5, autoImported: true }),
      ],
      team: null,
      players: [],
      climbers: [],
    })
    expect(r.matches).toBe(3)
    expect(r.matchesManual).toBe(1)
  })
})
