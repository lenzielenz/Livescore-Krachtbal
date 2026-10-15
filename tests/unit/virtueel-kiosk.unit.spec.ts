import { describe, expect, it } from 'vitest'

import { KIOSK_MAX, kioskWedstrijden, type KioskRuw } from '@/lib/virtueel-kiosk'

const nu = new Date('2026-10-15T10:00:00Z')
const dag = (d: number) => new Date(nu.getTime() + d * 86_400_000).toISOString()
const m = (id: number, d: number, extra: Partial<KioskRuw> = {}): KioskRuw => ({
  id,
  datum: dag(d),
  status: 'scheduled',
  reeks: 'heren-1',
  thuisId: 10 + id,
  uitId: 100 + id,
  thuis: `Thuis ${id}`,
  uit: `Uit ${id}`,
  preds: [],
  ...extra,
})
const opt = { nu, clubPloegen: new Set([13]), userId: 7, isOpen: (iso: string) => new Date(iso).getTime() < nu.getTime() + 5 * 86_400_000 }

describe('kioskWedstrijden', () => {
  it('toont enkel komende, geplande competitiewedstrijden binnen twee weken', () => {
    const l = kioskWedstrijden(
      [m(1, 1), m(2, -1), m(4, 20), m(5, 2, { status: 'live' }), m(6, 2, { isDemo: true }), m(7, 2, { analyseOnly: true })],
      opt,
    )
    expect(l.map((w) => w.id)).toEqual([1])
  })

  it('zet de eigen club eerst, daarna op aftrap', () => {
    const l = kioskWedstrijden([m(1, 3), m(2, 1), m(3, 6)], opt)
    expect(l.map((w) => w.id)).toEqual([3, 2, 1])
    expect(l[0].eigenClub).toBe(true)
  })

  it('markeert open wedstrijden en je eigen voorspelling', () => {
    const l = kioskWedstrijden([m(1, 1, { preds: [{ userId: 7, home: 12, away: 9 }, { userId: 8, home: 1, away: 1 }] }), m(2, 8)], opt)
    expect(l[0]).toMatchObject({ id: 1, open: true, mijn: { home: 12, away: 9 } })
    expect(l[1]).toMatchObject({ id: 2, open: false, mijn: null })
  })

  it('herkent de gebruiker ook als relatie-object', () => {
    const l = kioskWedstrijden([m(1, 1, { preds: [{ userId: { id: 7 }, home: 3, away: 4 }] })], opt)
    expect(l[0].mijn).toEqual({ home: 3, away: 4 })
  })

  it('zonder login heb je geen eigen voorspelling', () => {
    const l = kioskWedstrijden([m(1, 1, { preds: [{ userId: 7, home: 3, away: 4 }] })], { ...opt, userId: null })
    expect(l[0].mijn).toBeNull()
  })

  it('beperkt de lijst', () => {
    const veel = Array.from({ length: KIOSK_MAX + 10 }, (_, i) => m(i + 20, 1 + i * 0.1))
    expect(kioskWedstrijden(veel, opt)).toHaveLength(KIOSK_MAX)
  })
})
