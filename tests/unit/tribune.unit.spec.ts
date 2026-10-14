import { describe, it, expect } from 'vitest'

import { fotoVensterOpen, isPreMatchLead, isTribuneOpen, PRE_MATCH_LEAD_MS, TRIBUNE_GRACE_MS } from '@/lib/tribune'

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

describe('isPreMatchLead', () => {
  const now = Date.parse('2026-06-07T12:00:00.000Z')

  it('is gesloten zonder datum', () => {
    expect(isPreMatchLead(null, now)).toBe(false)
  })

  it('is gesloten ruim vóór het venster', () => {
    expect(isPreMatchLead('2026-06-07T18:00:00.000Z', now)).toBe(false)
  })

  it('opent exact een uur vóór de aftrap', () => {
    const kickoff = now + PRE_MATCH_LEAD_MS
    expect(isPreMatchLead(new Date(kickoff).toISOString(), now)).toBe(true)
  })

  it('blijft open na de aftrap', () => {
    expect(isPreMatchLead('2026-06-07T11:00:00.000Z', now)).toBe(true)
  })
})

describe('fotoVensterOpen', () => {
  const now = Date.parse('2026-10-11T12:00:00.000Z')
  const min = 60 * 1000
  const iso = (t: number) => new Date(t).toISOString()
  const volwassen = { volwassen: true, finishedAt: null }

  it('staat open tijdens een live wedstrijd', () => {
    expect(fotoVensterOpen({ ...volwassen, status: 'live', date: iso(now - 30 * min) }, now)).toBe(true)
  })

  it('opent een uur vóór de aftrap, niet eerder', () => {
    expect(fotoVensterOpen({ ...volwassen, status: 'scheduled', date: iso(now + 30 * min) }, now)).toBe(true)
    expect(fotoVensterOpen({ ...volwassen, status: 'scheduled', date: iso(now + 2 * 60 * min) }, now)).toBe(false)
  })

  it('blijft een uur na het einde open en sluit dan', () => {
    expect(fotoVensterOpen({ volwassen: true, status: 'finished', finishedAt: iso(now - 30 * min), date: null }, now)).toBe(true)
    expect(fotoVensterOpen({ volwassen: true, status: 'finished', finishedAt: iso(now - 2 * 60 * min), date: null }, now)).toBe(false)
  })

  it('staat nooit open op een jeugdwedstrijd (safeguarding)', () => {
    expect(fotoVensterOpen({ volwassen: false, status: 'live', finishedAt: null, date: iso(now) }, now)).toBe(false)
  })

  it('gaat open zodra de wedstrijd live gaat, ook als de pagina al vroeg openstond', () => {
    // Zelfde wedstrijd, twee momenten: twee uur vóór de aftrap dicht, eens live open. Het scorebord
    // toetst dit opnieuw bij elke live-update; vroeger bleef de waarde van het laden staan.
    const date = iso(now + 2 * 60 * min)
    expect(fotoVensterOpen({ ...volwassen, status: 'scheduled', date }, now)).toBe(false)
    expect(fotoVensterOpen({ ...volwassen, status: 'live', date }, now + 2 * 60 * min)).toBe(true)
  })
})
