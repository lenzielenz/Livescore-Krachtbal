import { describe, expect, it, vi, afterEach } from 'vitest'

import { kantineTijdLabel } from '@/lib/kantine-borden'

// kantineTijdLabel gebruikt dateStrBE() zonder argument (= "nu") om te bepalen of een wedstrijd
// vandaag is — we zetten de systeemklok dus vast per test i.p.v. een datum mee te geven.
describe('kantineTijdLabel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('toont enkel het uur op de dag zelf', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T10:00:00.000Z')) // zaterdag, Brussel = 12:00
    expect(kantineTijdLabel('2026-09-19T13:15:00.000Z')).toBe('15:15')
  })

  it('zet de korte dagnaam ervoor op een andere dag', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T10:00:00.000Z')) // vandaag = zaterdag 19/09
    // zondag 20/09, 13:45 Brussel
    const label = kantineTijdLabel('2026-09-20T11:45:00.000Z')
    expect(label).toMatch(/^zo\.? 13:45$/i)
  })

  it('geeft een lege string bij een ongeldige datum', () => {
    expect(kantineTijdLabel('niet-een-datum')).toBe('')
  })
})
