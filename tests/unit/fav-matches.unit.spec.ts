import { describe, it, expect } from 'vitest'

import {
  agendaLinkVoor,
  leesBewaard,
  nogTeSpelen,
  wisselBewaard,
  type BewaardeWedstrijd,
} from '@/lib/fav-matches'

const w = (id: number, date: string): BewaardeWedstrijd => ({
  id,
  home: `Thuis ${id}`,
  away: `Uit ${id}`,
  date,
  reeks: '1ste Nationale Dames',
})

describe('leesBewaard', () => {
  it('leest een bewaard lijstje', () => {
    const lijst = [w(1, '2026-09-12T15:00:00.000Z')]
    expect(leesBewaard(JSON.stringify(lijst))).toEqual(lijst)
  })

  it('overleeft rommel in de opslag i.p.v. te crashen', () => {
    expect(leesBewaard(null)).toEqual([])
    expect(leesBewaard('geen json')).toEqual([])
    expect(leesBewaard('{"niet":"een lijst"}')).toEqual([])
    expect(leesBewaard('[null, 3, "x"]')).toEqual([])
    expect(leesBewaard('[{"id":"abc"}]')).toEqual([])
  })

  it('gooit dubbels eruit en vult ontbrekende velden aan', () => {
    const uit = leesBewaard('[{"id":1},{"id":1},{"id":2,"home":"A","away":"B","date":"x"}]')
    expect(uit.map((x) => x.id)).toEqual([1, 2])
    expect(uit[0]).toEqual({ id: 1, home: '—', away: '—', date: '', reeks: null })
  })
})

describe('wisselBewaard', () => {
  it('zet erbij en haalt eruit', () => {
    const leeg: BewaardeWedstrijd[] = []
    const een = wisselBewaard(leeg, w(1, '2026-09-12T15:00:00.000Z'))
    expect(een).toHaveLength(1)
    expect(wisselBewaard(een, w(1, '2026-09-12T15:00:00.000Z'))).toEqual([])
  })

  it('houdt het lijstje op datum gesorteerd', () => {
    let lijst: BewaardeWedstrijd[] = []
    lijst = wisselBewaard(lijst, w(2, '2026-10-01T15:00:00.000Z'))
    lijst = wisselBewaard(lijst, w(1, '2026-09-12T15:00:00.000Z'))
    expect(lijst.map((x) => x.id)).toEqual([1, 2])
  })
})

describe('nogTeSpelen', () => {
  const nu = new Date('2026-09-12T18:00:00.000Z').getTime()

  it('houdt komende wedstrijden bij', () => {
    expect(nogTeSpelen([w(1, '2026-09-19T15:00:00.000Z')], nu).map((x) => x.id)).toEqual([1])
  })

  it('laat een wedstrijd die nu bezig is staan', () => {
    expect(nogTeSpelen([w(1, '2026-09-12T17:00:00.000Z')], nu)).toHaveLength(1)
  })

  it('laat wat ruim voorbij is vallen', () => {
    expect(nogTeSpelen([w(1, '2026-09-05T15:00:00.000Z')], nu)).toEqual([])
  })

  it('houdt een wedstrijd zonder bruikbare datum bij i.p.v. ze stil te laten verdwijnen', () => {
    expect(nogTeSpelen([w(1, '')], nu)).toHaveLength(1)
  })
})

describe('agendaLinkVoor', () => {
  it('bundelt het hele lijstje in één agenda-bestand', () => {
    const link = agendaLinkVoor([w(1, '2026-09-12T15:00:00.000Z'), w(4, '2026-10-01T15:00:00.000Z')])
    expect(link).toBe('/api/agenda/ics?matches=1,4&name=Mijn%20wedstrijden')
  })

  it('geeft niets terug bij een leeg lijstje', () => {
    expect(agendaLinkVoor([])).toBeNull()
  })
})
