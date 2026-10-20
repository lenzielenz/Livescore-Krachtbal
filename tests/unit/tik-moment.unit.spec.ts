import { describe, it, expect } from 'vitest'

import { liveClockSeconds, tikMoment } from '@/lib/simple-match-engine'

describe('tikMoment (offline bewaarde tik krijgt de juiste minuut)', () => {
  const nu = 2_000_000_000_000
  const start = new Date(nu - 600_000).toISOString() // klok liep 10 min geleden aan

  it('gebruikt het moment van het toestel', () => {
    expect(tikMoment(nu - 60_000, start, nu)).toBe(nu - 60_000)
  })
  it('nooit in de toekomst, nooit vóór de laatste klokwijziging', () => {
    expect(tikMoment(nu + 99_000, start, nu)).toBe(nu)
    expect(tikMoment(0, start, nu)).toBe(nu - 600_000)
  })
  it('zonder at: nu', () => {
    expect(tikMoment(undefined, start, nu)).toBe(nu)
  })
  it('de klokstand op dat moment', () => {
    const m = { clockRunning: true, clockUpdatedAt: start, clockSeconds: 30 }
    expect(Math.floor(liveClockSeconds(m, tikMoment(nu - 60_000, start, nu)))).toBe(30 + 540)
  })
})
