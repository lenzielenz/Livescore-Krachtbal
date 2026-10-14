import { describe, expect, it } from 'vitest'

import {
  bouwVerhaal,
  dagSamenvatting,
  doelUitTijdlijn,
  kortVerhaal,
  leidingWissels,
  MAX_BERICHTEN,
  type VerhaalInput,
} from '@/lib/kantine-dagverhaal'
import type { TimelineItem } from '@/lib/match-engine'

// Het verhaal achter elke uitslag op het kantinescherm: verloop, topschutter, held van de match,
// en wat de tribune zei. Alles afgeleid uit bestaande data — hier de pure opbouw.

let n = 0
const doel = (side: 'home' | 'away', half: number, gameClock: number, label: string): TimelineItem => ({
  id: `t${++n}`,
  kind: 'goal',
  half,
  gameClock,
  side,
  label,
})

describe('doelUitTijdlijn', () => {
  it('leest punten, rugnummer en naam uit een gewoon doelpunt', () => {
    expect(doelUitTijdlijn(doel('home', 1, 120, 'Doelpunt +2 #7 Jens Peeters'))).toEqual({
      half: 1,
      gameClock: 120,
      side: 'home',
      points: 2,
      playerName: 'Jens Peeters',
      shirtNumber: 7,
    })
  })

  it('kent een snelscore-doelpunt zonder scorer', () => {
    expect(doelUitTijdlijn(doel('away', 2, 30, 'Doelpunt +1'))?.playerName).toBeNull()
  })

  it('geeft een eigen doelpunt geen scorer aan de ploeg die het punt krijgt', () => {
    const g = doelUitTijdlijn(doel('away', 1, 10, 'Doelpunt +1 (eigen doelpunt #4 Wout)'))
    expect(g?.playerName).toBeNull()
    expect(g?.points).toBe(1)
  })

  it('negeert alles wat geen doelpunt is', () => {
    expect(doelUitTijdlijn({ kind: 'cross', half: 1, gameClock: 1, side: 'home', label: 'Kruisje' })).toBeNull()
  })
})

describe('leidingWissels', () => {
  it('telt enkel echte wissels, een gelijke stand ertussen niet', () => {
    const golf = [0, 1, 0, -1, -2, 1, 1].map((diff, t) => ({ t, diff }))
    expect(leidingWissels(golf)).toBe(2)
  })
  it('is nul bij een wedstrijd van één kant', () => {
    expect(leidingWissels([0, 1, 2, 3].map((diff, t) => ({ t, diff })))).toBe(0)
  })
})

describe('kortVerhaal', () => {
  it('houdt hele zinnen tot het maximum, en minstens één', () => {
    expect(kortVerhaal('Eerste zin. Tweede zin. Derde zin.', 25)).toBe('Eerste zin. Tweede zin.')
    expect(kortVerhaal('Een hele lange eerste zin die al over het maximum gaat.', 10)).toBe(
      'Een hele lange eerste zin die al over het maximum gaat.',
    )
  })
})

const basis = (over: Partial<VerhaalInput> = {}): VerhaalInput => ({
  matchId: 1,
  home: 'KBC St. Michiels A',
  away: 'KBK Temse',
  reeks: '2de Nationale Heren',
  score: { home: 5, away: 3 },
  tijdlijn: [],
  halfSeconds: 1500,
  berichten: [],
  kudos: {},
  kijkers: null,
  mvp: null,
  ...over,
})

describe('bouwVerhaal', () => {
  it('bouwt kop, golf, topschutter en reeks uit de tijdlijn', () => {
    const tijdlijn = [
      doel('away', 1, 100, 'Doelpunt +1 #9 Bart'),
      doel('home', 1, 300, 'Doelpunt +2 #7 Jens'),
      doel('home', 1, 600, 'Doelpunt +1 #7 Jens'),
      doel('home', 2, 200, 'Doelpunt +2 #11 Senne'),
      doel('away', 2, 900, 'Doelpunt +1 #9 Bart'),
    ]
    const v = bouwVerhaal(basis({ tijdlijn }))
    expect(v.kop).toContain('KBC St. Michiels A')
    expect(v.golf.map((p) => p.diff)).toEqual([0, -1, 1, 2, 4, 3])
    expect(v.leidingWissels).toBe(1)
    expect(v.topscorer).toEqual({ naam: 'Jens', side: 'home', punten: 3 })
    expect(v.langsteReeks).toEqual({ side: 'home', lengte: 3 })
    expect(v.duur).toBe(3000)
  })

  it('heeft geen golf voor een uitslag zonder doelpunten in de tijdlijn (bv. geïmporteerd)', () => {
    const v = bouwVerhaal(basis())
    expect(v.golf).toEqual([])
    expect(v.leidingWissels).toBe(0)
    expect(v.kop).toBeTruthy()
  })

  it('neemt de laatste berichten (oudste eerst), zonder e-mailadressen als naam, en kort lange teksten in', () => {
    const berichten = [
      ...Array.from({ length: MAX_BERICHTEN + 2 }, (_, i) => ({ name: `Fan ${i}`, text: `Bericht ${i}`, at: i })),
      { name: 'iemand@voorbeeld.be', text: 'x'.repeat(300), at: 999 },
      { name: 'Leeg', text: '   ', at: 1000 },
    ]
    const v = bouwVerhaal(basis({ berichten }))
    expect(v.berichten).toHaveLength(MAX_BERICHTEN)
    // De laatste zes, oudste eerst: het nieuwste bericht (met het e-mailadres) staat achteraan.
    const laatste = v.berichten[MAX_BERICHTEN - 1]
    expect(laatste.naam).toBe('Supporter')
    expect(laatste.tekst.length).toBeLessThanOrEqual(140)
    expect(v.berichten[0].tekst).toBe('Bericht 3')
    expect(v.berichten.some((b) => b.naam === 'Leeg')).toBe(false)
  })

  it('sorteert de reacties en telt ze op', () => {
    const v = bouwVerhaal(basis({ kudos: { clap: 4, fire: 9, onbekend: 50, heart: 0 } }))
    expect(v.kudos).toEqual([
      { soort: 'fire', aantal: 9 },
      { soort: 'clap', aantal: 4 },
    ])
    expect(v.kudosTotaal).toBe(13)
  })

  it('laat een held zonder stemmen en een "reeks" van één doelpunt weg', () => {
    const v = bouwVerhaal(
      basis({ tijdlijn: [doel('home', 1, 1, 'Doelpunt +1'), doel('away', 1, 2, 'Doelpunt +1')], mvp: { naam: 'X', side: 'home', stemmen: 0 } }),
    )
    expect(v.mvp).toBeNull()
    expect(v.langsteReeks).toBeNull()
  })
})

describe('dagSamenvatting', () => {
  it('telt de dag op en kiest de opvallendste wedstrijden', () => {
    const tijdlijnA = [doel('home', 1, 1, 'Doelpunt +2 #7 Jens'), doel('away', 1, 2, 'Doelpunt +2 #9 Bart'), doel('away', 1, 3, 'Doelpunt +2 #9 Bart'), doel('home', 2, 1, 'Doelpunt +2 #7 Jens'), doel('home', 2, 2, 'Doelpunt +2 #7 Jens')]
    const a = bouwVerhaal(basis({ matchId: 1, score: { home: 6, away: 4 }, tijdlijn: tijdlijnA, kudos: { clap: 3 }, berichten: [{ name: 'A', text: 'Hup!', at: 1 }] }))
    const b = bouwVerhaal(basis({ matchId: 2, score: { home: 2, away: 12 }, kudos: { fire: 20 } }))
    const s = dagSamenvatting(
      [
        { matchId: 1, score: { home: 6, away: 4 } },
        { matchId: 2, score: { home: 2, away: 12 } },
      ],
      [a, b],
      5,
    )
    expect(s).toMatchObject({ wedstrijden: 2, doelpunten: 24, berichten: 1, kudos: 23, fotos: 5 })
    expect(s.grootsteZege).toEqual({ matchId: 2, verschil: 10 })
    expect(s.spannendste).toEqual({ matchId: 1, wissels: 2 })
    expect(s.topscorer).toEqual({ naam: 'Jens', matchId: 1, punten: 6 })
    expect(s.meesteKudos).toEqual({ matchId: 2, aantal: 20 })
  })
})
