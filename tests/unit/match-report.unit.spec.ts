import { describe, it, expect } from 'vitest'

import { buildMatchReport, longestRun, scoreAfterHalf, scorerLines, type ReportGoal, type ReportInput } from '@/lib/match-report'

const goal = (side: 'home' | 'away', half: number, points = 1, playerName?: string, shirtNumber?: number): ReportGoal => ({
  side,
  half,
  gameClock: 0,
  points,
  playerName,
  shirtNumber,
})

const base = (goals: ReportGoal[], score: { home: number; away: number }): ReportInput => ({
  home: 'Sint-Kruis',
  away: 'Assebroek',
  score,
  crosses: { home: 0, away: 0 },
  goals,
})

describe('scoreAfterHalf', () => {
  it('telt enkel de doelpunten tot en met die helft', () => {
    const goals = [goal('home', 1, 2), goal('away', 1), goal('home', 2)]
    expect(scoreAfterHalf(goals, 1)).toEqual({ home: 2, away: 1 })
    expect(scoreAfterHalf(goals, 2)).toEqual({ home: 3, away: 1 })
  })
})

describe('longestRun', () => {
  it('vindt de langste reeks op rij', () => {
    const goals = [goal('home', 1), goal('away', 1), goal('away', 1), goal('away', 1), goal('home', 2)]
    expect(longestRun(goals)).toEqual({ side: 'away', length: 3 })
  })
  it('geen doelpunten → null', () => expect(longestRun([])).toBeNull())
})

describe('scorerLines', () => {
  it('telt per speler op en sorteert op punten', () => {
    const goals = [
      goal('home', 1, 1, 'Jonas', 7),
      goal('home', 1, 2, 'Jonas', 7),
      goal('away', 2, 2, 'Milan', 4),
    ]
    const lines = scorerLines(goals)
    expect(lines[0]).toMatchObject({ name: 'Jonas', goals: 2, points: 3, rug: 1, shirtNumber: 7 })
    expect(lines[1]).toMatchObject({ name: 'Milan', points: 2, rug: 1 })
  })
  it('doelpunten zonder naam tellen niet mee (supporters-modus noteert geen scorer)', () => {
    expect(scorerLines([goal('home', 1)])).toEqual([])
  })
  it('het streepje van het wedstrijdblad is geen speler', () => {
    expect(scorerLines([goal('home', 1, 1, '—', 0), goal('home', 1, 1, '?', 0)])).toEqual([])
  })
})

describe('buildMatchReport', () => {
  it('kiest een kop die bij het verschil past', () => {
    expect(buildMatchReport(base([], { home: 20, away: 20 })).headline).toContain('evenwicht')
    expect(buildMatchReport(base([], { home: 21, away: 20 })).headline).toContain('nipt')
    expect(buildMatchReport(base([], { home: 30, away: 10 })).headline).toContain('overklast')
  })
  it('noemt de ploegen in de juiste rol', () => {
    const r = buildMatchReport(base([], { home: 10, away: 24 }))
    expect(r.headline.startsWith('Assebroek')).toBe(true)
    expect(r.lead).toBe('Sint-Kruis – Assebroek eindigde op 10–24.')
  })
  it('zet reeks en datum in de inleiding', () => {
    const r = buildMatchReport({ ...base([], { home: 1, away: 0 }), reeks: '1ste Nationale Heren', datum: '8/08/2026' })
    expect(r.lead).toContain('(1ste Nationale Heren · 8/08/2026)')
  })
  it('beschrijft een omkeer na de rust', () => {
    const goals = [goal('home', 1, 2), goal('home', 1, 2), goal('away', 2, 2), goal('away', 2, 2), goal('away', 2, 2)]
    const r = buildMatchReport(base(goals, { home: 4, away: 6 }))
    expect(r.paragraphs[0]).toContain('Sint-Kruis ging met een voorsprong de rust in (4–0)')
    expect(r.paragraphs[0]).toContain('draaide Assebroek de wedstrijd alsnog om')
  })
  it('vermeldt een scherpe reeks van vier of meer', () => {
    const goals = [goal('away', 1), goal('away', 1), goal('away', 1), goal('away', 1)]
    const r = buildMatchReport(base(goals, { home: 0, away: 4 }))
    expect(r.paragraphs.join(' ')).toContain('4 doelpunten op rij')
  })
  it('licht de topschutter en de rugworpen eruit', () => {
    const goals = [goal('home', 1, 2, 'Jonas', 7), goal('home', 2, 2, 'Jonas', 7), goal('home', 2, 1, 'Wout', 3)]
    const r = buildMatchReport({ ...base(goals, { home: 5, away: 0 }), crosses: { home: 1, away: 2 } })
    const text = r.paragraphs.join(' ')
    expect(text).toContain('#7 Jonas')
    expect(text).toContain('2 doelpunten voor 4 punten')
    expect(text).toContain('waren er 2 rugworpen')
    expect(text).toContain('3 kruisjes op het bord')
  })
  it('vermeldt de held van de match als er gestemd is', () => {
    const r = buildMatchReport({ ...base([], { home: 1, away: 0 }), mvp: { name: 'Jonas', votes: 12 } })
    expect(r.paragraphs.join(' ')).toContain('held van de match (12 stemmen)')
  })
  it('blijft leesbaar zonder enige data', () => {
    const r = buildMatchReport(base([], { home: 0, away: 0 }))
    expect(r.headline).toBeTruthy()
    expect(r.lead).toBeTruthy()
    expect(r.paragraphs).toEqual([])
  })
})
