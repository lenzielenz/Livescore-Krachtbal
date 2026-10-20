import { describe, expect, it } from 'vitest'

import { clubSeizoen, vormVan, type ClubSpeler } from '@/lib/club-seizoen'
import { computeStandings, type StandingsMatch } from '@/lib/standings'

const m = (homeId: number, awayId: number, homeGoals: number, awayGoals: number, date: string): StandingsMatch => ({ homeId, awayId, homeGoals, awayGoals, forfait: 'none', date })

describe('clubSeizoen', () => {
  const wedstrijden = [m(1, 2, 12, 8, '2026-09-05'), m(3, 1, 10, 10, '2026-09-12'), m(1, 3, 6, 9, '2026-09-19'), m(2, 3, 11, 7, '2026-09-26')]
  const stand = computeStandings(wedstrijden, [1, 2, 3])

  it('vorm: laatste uitslagen van de ploeg, oudste eerst', () => {
    expect(vormVan(1, wedstrijden)).toEqual(['W', 'G', 'V'])
    expect(vormVan(1, wedstrijden, 2)).toEqual(['G', 'V'])
  })

  it('plaats, totalen en topscorers van de club', () => {
    const spelers: ClubSpeler[] = [
      { id: 10, naam: 'An', ploeg: 'Heren', doelpunten: 7, punten: 9, rugworpen: 2, gespeeld: 3 },
      { id: 11, naam: 'Bo', ploeg: 'Heren', doelpunten: 0, punten: 0, rugworpen: 0, gespeeld: 2 },
      { id: 12, naam: 'Cas', ploeg: 'Heren', doelpunten: 9, punten: 10, rugworpen: 1, gespeeld: 3 },
    ]
    const s = clubSeizoen([{ id: 1, naam: 'Heren', reeks: 'RHA', stand, wedstrijden }], spelers)
    expect(s.ploegen[0].van).toBe(3)
    expect(s.ploegen[0].plaats).toBe(stand.findIndex((r) => r.teamId === 1) + 1)
    expect(s.totaal).toMatchObject({ gespeeld: 3, gewonnen: 1, gelijk: 1, verloren: 1, voor: 28, tegen: 27, winstPct: 33 })
    expect(s.topscorers.map((x) => x.naam)).toEqual(['Cas', 'An'])
    expect(s.meestGespeeld.map((x) => x.naam)).toEqual(['Cas', 'An', 'Bo'])
  })

  it('een ploeg die nog niet speelde, krijgt geen plaats', () => {
    const s = clubSeizoen([{ id: 4, naam: 'U14', reeks: 'U14', stand: computeStandings([], [4, 5]), wedstrijden: [] }], [])
    expect(s.ploegen[0]).toMatchObject({ plaats: null, rij: null, van: 2 })
  })

  it('een ploeg zonder wedstrijden', () => {
    const s = clubSeizoen([{ id: 9, naam: 'U14', reeks: 'U14', stand: [], wedstrijden: [] }], [])
    expect(s.ploegen[0]).toMatchObject({ plaats: null, rij: null, vorm: [] })
    expect(s.totaal.winstPct).toBe(0)
  })
})
