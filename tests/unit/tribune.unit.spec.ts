import { describe, it, expect } from 'vitest'

import { isTribuneOpen, TRIBUNE_GRACE_MS } from '@/lib/tribune'

describe('isTribuneOpen', () => {
  const now = Date.parse('2026-06-07T12:00:00.000Z')

  it('staat open tijdens een live wedstrijd', () => {
    expect(isTribuneOpen('live', null, null, now)).toBe(true)
  })

  it('is gesloten vóór de wedstrijd (gepland, geen datum)', () => {
    expect(isTribuneOpen('scheduled', null, null, now)).toBe(false)
  })

  it('staat open op de speeldag zelf, vóór de aftrap', () => {
    expect(isTribuneOpen('scheduled', null, '2026-06-07T18:00:00.000Z', now)).toBe(true)
  })

  it('is gesloten vóór de speeldag zelf', () => {
    expect(isTribuneOpen('scheduled', null, '2026-06-08T18:00:00.000Z', now)).toBe(false)
  })

  it('blijft open tot 1 uur na het einde', () => {
    const finishedAt = new Date(now - 59 * 60 * 1000).toISOString()
    expect(isTribuneOpen('finished', finishedAt, null, now)).toBe(true)
  })

  it('sluit vanaf 1 uur na het einde', () => {
    const finishedAt = new Date(now - TRIBUNE_GRACE_MS - 1000).toISOString()
    expect(isTribuneOpen('finished', finishedAt, null, now)).toBe(false)
  })

  it('is gesloten als de eindtijd onbekend is', () => {
    expect(isTribuneOpen('finished', null, null, now)).toBe(false)
  })
})
