import { describe, expect, it } from 'vitest'

import { weekendZaterdag } from '@/app/(frontend)/live/loadLiveDay'

describe('weekendZaterdag', () => {
  it('blijft op zaterdag zelf staan', () => {
    expect(weekendZaterdag('2026-09-26')).toBe('2026-09-26') // za
  })
  it('springt van zondag terug naar haar eigen zaterdag', () => {
    expect(weekendZaterdag('2026-09-27')).toBe('2026-09-26') // zo → za ervoor
  })
  it('springt van een weekdag vooruit naar het eerstvolgende weekend', () => {
    expect(weekendZaterdag('2026-09-21')).toBe('2026-09-26') // ma
    expect(weekendZaterdag('2026-09-22')).toBe('2026-09-26') // di
    expect(weekendZaterdag('2026-09-25')).toBe('2026-09-26') // vr
  })
})
