import { describe, expect, it } from 'vitest'

import { isInWeekend, weekendWindow } from '@/lib/instagram-weekend'

describe('Instagram weekendplan', () => {
  it('kiest op een woensdag het eerstvolgende weekend', () => {
    const window = weekendWindow(new Date('2026-09-09T10:00:00Z'))
    expect(window.saturdayKey).toBe('2026-09-12')
    expect(window.sundayKey).toBe('2026-09-13')
  })

  it('houdt op zondag het lopende weekend vast', () => {
    const window = weekendWindow(new Date('2026-09-13T10:00:00Z'))
    expect(window.saturdayKey).toBe('2026-09-12')
    expect(window.sundayKey).toBe('2026-09-13')
  })

  it('filtert op Belgische kalenderdagen, ook rond de zomertijd', () => {
    const window = weekendWindow(new Date('2026-03-25T12:00:00Z'))
    expect(isInWeekend(new Date('2026-03-27T23:30:00Z'), window)).toBe(true) // zaterdag 00:30 in België
    expect(isInWeekend(new Date('2026-03-29T21:30:00Z'), window)).toBe(true) // zondag 23:30 in België
    expect(isInWeekend(new Date('2026-03-29T22:30:00Z'), window)).toBe(false) // maandag 00:30 in België
  })
})
