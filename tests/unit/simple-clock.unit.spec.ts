import { describe, it, expect, vi, afterEach } from 'vitest'

import { liveClockSeconds } from '@/lib/simple-match-engine'

describe('liveClockSeconds', () => {
  afterEach(() => vi.useRealTimers())

  it('geeft de basis terug wanneer de klok stilstaat', () => {
    expect(liveClockSeconds({ clockRunning: false, clockSeconds: 120, clockUpdatedAt: null })).toBe(120)
  })

  it('telt de verstreken tijd erbij terwijl de klok loopt', () => {
    const now = Date.parse('2026-06-07T20:43:00.000Z')
    vi.useFakeTimers().setSystemTime(now)
    // Klok gestart op 0, 90 s geleden → ~90 s live (minuut 1).
    const startedAgo = new Date(now - 90_000).toISOString()
    const live = liveClockSeconds({ clockRunning: true, clockSeconds: 0, clockUpdatedAt: startedAgo })
    expect(Math.floor(live)).toBe(90)
    expect(Math.floor(live / 60)).toBe(1)
  })

  it('telt verder vanaf een vastgezette basis na een pauze', () => {
    const now = Date.parse('2026-06-07T20:43:00.000Z')
    vi.useFakeTimers().setSystemTime(now)
    const startedAgo = new Date(now - 30_000).toISOString()
    const live = liveClockSeconds({ clockRunning: true, clockSeconds: 600, clockUpdatedAt: startedAgo })
    expect(Math.floor(live)).toBe(630)
  })

  it('gaat nooit onder de basis (negatieve drift)', () => {
    const now = Date.parse('2026-06-07T20:43:00.000Z')
    vi.useFakeTimers().setSystemTime(now)
    const future = new Date(now + 10_000).toISOString()
    expect(liveClockSeconds({ clockRunning: true, clockSeconds: 300, clockUpdatedAt: future })).toBe(300)
  })
})
