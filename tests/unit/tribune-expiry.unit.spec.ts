import { describe, it, expect } from 'vitest'

import { tribuneExpiresAt, TRIBUNE_GRACE_MS } from '@/lib/tribune'

const HALF = 25 * 60 // 25 min

describe('tribuneExpiresAt', () => {
  it('afgelopen: exact één uur na finishedAt', () => {
    const finishedAt = '2026-06-15T20:00:00.000Z'
    const exp = tribuneExpiresAt({ status: 'finished', finishedAt }, HALF)
    expect(exp).toBe(new Date(finishedAt).getTime() + TRIBUNE_GRACE_MS)
  })

  it('live: schat het einde uit de aftrap + 1u', () => {
    const date = '2026-06-15T19:00:00.000Z'
    const now = new Date('2026-06-15T19:10:00.000Z').getTime()
    const exp = tribuneExpiresAt({ status: 'live', date }, HALF, now)
    const estEnd = new Date(date).getTime() + HALF * 2 * 1000 + HALF * 0.6 * 1000
    expect(exp).toBe(estEnd + TRIBUNE_GRACE_MS)
  })

  it('live maar al langer bezig dan de schatting: minstens nu + 1u', () => {
    const date = '2026-06-15T17:00:00.000Z'
    const now = new Date('2026-06-15T20:00:00.000Z').getTime()
    const exp = tribuneExpiresAt({ status: 'live', date }, HALF, now)
    expect(exp).toBe(now + TRIBUNE_GRACE_MS)
  })

  it('geen datum/eindtijd → terugval nu + 1u', () => {
    const now = 1_000_000
    expect(tribuneExpiresAt({ status: 'scheduled' }, HALF, now)).toBe(now + TRIBUNE_GRACE_MS)
  })
})
