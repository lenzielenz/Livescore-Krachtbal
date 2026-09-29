import { describe, expect, it } from 'vitest'

import { buildSeasonRecap, type SeasonWeekBucket } from '@/lib/season-recap'
import type { WeekTeamResult } from '@/lib/team-of-the-week'
import type { RecapMatch } from '@/lib/weekly-recap'

const match = (over: Partial<RecapMatch> & { matchId: number; homeGoals: number; awayGoals: number }): RecapMatch => ({
  date: '2026-08-01T14:00:00.000Z',
  reeks: '1NAH',
  home: `Thuis ${over.matchId}`,
  away: `Uit ${over.matchId}`,
  homeTeamId: over.matchId * 10,
  awayTeamId: over.matchId * 10 + 1,
  ...over,
})

const teamResult = (over: Partial<WeekTeamResult> & { teamId: number; teamName: string; goalsFor: number; goalsAgainst: number }): WeekTeamResult => ({
  reeks: '1NAH',
  result: over.goalsFor > over.goalsAgainst ? 'win' : over.goalsFor < over.goalsAgainst ? 'loss' : 'draw',
  ...over,
})

const bucket = (startIso: string, endIso: string, results: RecapMatch[], teamResults: WeekTeamResult[]): SeasonWeekBucket => ({
  startIso,
  endIso,
  results,
  teamResults,
})

describe('buildSeasonRecap', () => {
  it('geeft null bij een seizoen zonder wedstrijden', () => {
    expect(buildSeasonRecap({ seizoen: '2025-2026', results: [], weeks: [] })).toBeNull()
  })

  it('telt wedstrijden en punten over het hele seizoen op', () => {
    const results = [
      match({ matchId: 1, homeGoals: 20, awayGoals: 18 }),
      match({ matchId: 2, homeGoals: 10, awayGoals: 9 }),
    ]
    const r = buildSeasonRecap({ seizoen: '2025-2026', results, weeks: [] })
    expect(r?.matches).toBe(2)
    expect(r?.goals).toBe(57)
    expect(r?.headline).toContain('2 wedstrijden')
    expect(r?.headline).toContain('2025-2026')
  })

  it('bouwt het archief per speelweek, nieuwste eerst, met de ploeg van die week', () => {
    const weeks = [
      bucket(
        '2026-08-03T06:00:00.000Z',
        '2026-08-10T06:00:00.000Z',
        [match({ matchId: 1, homeGoals: 20, awayGoals: 10 })],
        [
          teamResult({ teamId: 1, teamName: 'Klaverken', goalsFor: 20, goalsAgainst: 10 }),
          teamResult({ teamId: 2, teamName: 'Aalter', goalsFor: 10, goalsAgainst: 20 }),
        ],
      ),
      bucket(
        '2026-08-10T06:00:00.000Z',
        '2026-08-17T06:00:00.000Z',
        [match({ matchId: 2, homeGoals: 8, awayGoals: 8 })],
        [
          teamResult({ teamId: 3, teamName: 'Male', goalsFor: 8, goalsAgainst: 8 }),
          teamResult({ teamId: 4, teamName: 'Brugge', goalsFor: 8, goalsAgainst: 8 }),
        ],
      ),
    ]
    const results = weeks.flatMap((w) => w.results)
    const r = buildSeasonRecap({ seizoen: '2025-2026', results, weeks })
    expect(r?.weekends).toBe(2)
    expect(r?.archive.map((w) => w.startIso)).toEqual(['2026-08-10T06:00:00.000Z', '2026-08-03T06:00:00.000Z'])
    expect(r?.archive[1].team?.teamName).toBe('Klaverken')
    // Een gelijkspel levert geen "ploeg van de week" op — niemand won.
    expect(r?.archive[0].team).toBeNull()
  })

  it('slaat lege speelweken in het archief over', () => {
    const weeks = [bucket('2026-08-03T06:00:00.000Z', '2026-08-10T06:00:00.000Z', [], [])]
    const r = buildSeasonRecap({ seizoen: '2025-2026', results: [match({ matchId: 1, homeGoals: 1, awayGoals: 0 })], weeks })
    expect(r?.archive).toHaveLength(0)
  })

  it('licht ook de seizoenstoppers uit via dezelfde highlight-logica', () => {
    const results = [match({ matchId: 1, homeGoals: 30, awayGoals: 5 })]
    const r = buildSeasonRecap({ seizoen: '2025-2026', results, weeks: [] })
    expect(r?.highlights.find((h) => h.key === 'biggest')).toBeTruthy()
  })

  it('geeft standaardstats mee als er geen zijn opgegeven', () => {
    const r = buildSeasonRecap({ seizoen: '2025-2026', results: [match({ matchId: 1, homeGoals: 1, awayGoals: 0 })], weeks: [] })
    expect(r?.stats).toEqual({ visitors: 0, clubs: 0, goalThrows: 0, backThrows: 0, photos: 0, reactions: 0, shouts: 0, predictors: 0, forfaits: 0 })
  })

  it('telt forfaits over het seizoen en laat een forfaitweek geen "ploeg van de week" opleveren', () => {
    const weeks = [
      bucket(
        '2026-08-03T06:00:00.000Z',
        '2026-08-10T06:00:00.000Z',
        [match({ matchId: 1, homeGoals: 30, awayGoals: 0 })],
        [
          teamResult({ teamId: 1, teamName: 'Forfaitwinnaar', goalsFor: 30, goalsAgainst: 0 }),
          teamResult({ teamId: 2, teamName: 'Forfaiteerder', goalsFor: 0, goalsAgainst: 30 }),
        ],
      ),
    ]
    const r = buildSeasonRecap({ seizoen: '2025-2026', results: weeks.flatMap((w) => w.results), weeks })
    expect(r?.stats.forfaits).toBe(1)
    expect(r?.archive[0].team).toBeNull()
  })
})
