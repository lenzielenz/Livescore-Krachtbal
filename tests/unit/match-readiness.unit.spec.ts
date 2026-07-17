import { describe, it, expect } from 'vitest'

import { computeReadiness, countLineup, LINEUP_MIN, missingSteps } from '@/lib/match-readiness'

const lineup = (n: number) => Array.from({ length: n }, (_, i) => ({ player: i + 1 }))

describe('countLineup', () => {
  it('telt enkel regels met een gekoppelde speler', () => {
    expect(countLineup(lineup(4))).toBe(4)
    expect(countLineup([{ player: 1 }, { player: null }, {}])).toBe(1)
    expect(countLineup(undefined)).toBe(0)
    expect(countLineup('geen array')).toBe(0)
  })
})

describe('computeReadiness', () => {
  const full = { homeLineup: lineup(LINEUP_MIN), awayLineup: lineup(LINEUP_MIN) }

  it('klaar wanneer beide opstellingen vol én SR akkoord', () => {
    const r = computeReadiness({ ...full, refereeAkkoord: true, isDemo: false })
    expect(r.ready).toBe(true)
    expect(missingSteps(r)).toEqual([])
  })

  it('niet klaar zonder SR-akkoord', () => {
    const r = computeReadiness({ ...full, refereeAkkoord: false, isDemo: false })
    expect(r.ready).toBe(false)
    expect(missingSteps(r)).toEqual(['akkoord scheidsrechter'])
  })

  it('niet klaar bij onvolledige opstelling', () => {
    const r = computeReadiness({
      homeLineup: lineup(LINEUP_MIN - 1),
      awayLineup: lineup(0),
      refereeAkkoord: true,
      isDemo: false,
    })
    expect(r.ready).toBe(false)
    expect(r.homeOk).toBe(false)
    expect(missingSteps(r)).toEqual(['opstelling thuis', 'opstelling uit'])
  })

  it('demo is altijd klaar, ook zonder opstelling of akkoord', () => {
    const r = computeReadiness({ homeLineup: [], awayLineup: [], refereeAkkoord: false, isDemo: true })
    expect(r.ready).toBe(true)
    expect(r.isDemo).toBe(true)
  })

  it('supporters-wedstrijd is altijd klaar, ook zonder opstelling of akkoord — geen stappen', () => {
    const r = computeReadiness({ homeLineup: [], awayLineup: [], refereeAkkoord: false, isDemo: false, supportersMode: true })
    expect(r.ready).toBe(true)
    expect(r.supportersMode).toBe(true)
    expect(missingSteps(r)).toEqual([])
  })

  it('analysewedstrijd: klaar met opstellingen, zonder SR-akkoord — en SR nooit als ontbrekend gemeld', () => {
    const klaar = computeReadiness({ ...full, refereeAkkoord: false, isDemo: false, analyseOnly: true })
    expect(klaar.ready).toBe(true)
    expect(missingSteps(klaar)).toEqual([])

    const leeg = computeReadiness({ homeLineup: [], awayLineup: [], refereeAkkoord: false, isDemo: false, analyseOnly: true })
    expect(leeg.ready).toBe(false)
    // Enkel de opstellingen ontbreken — geen "akkoord scheidsrechter" voor analyse.
    expect(missingSteps(leeg)).toEqual(['opstelling thuis', 'opstelling uit'])
  })
})
