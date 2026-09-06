import { describe, expect, it } from 'vitest'

import { ONDERBREKING_SECONDEN, doelSeconden, extraMinuten, speeltTotMinuut } from '@/lib/speeltijd'

// Hoe lang deze helft loopt. Aan de aantekentafel loopt de klok door in plaats van te pauzeren bij
// elke onderbreking; in ruil schuift de doeltijd één minuut op per time-out en per
// scheidsrechter-minuut. De tellers zijn per helft, dus na de rust staat de doeltijd weer op de
// kale basisduur — dat is precies wat de aantekenaar verwacht.

const geen = { timeouts: { home: 0, away: 0 }, refereeStops: 0 }

describe('extraMinuten', () => {
  it('telt de time-outs van beide ploegen én de scheidsrechter-minuten', () => {
    expect(extraMinuten({ timeouts: { home: 2, away: 1 }, refereeStops: 3 })).toBe(6)
  })

  it('is nul zonder onderbrekingen', () => {
    expect(extraMinuten(geen)).toBe(0)
  })

  it('negeert rommel in plaats van te struikelen', () => {
    // De staat komt over SSE binnen; een half doorgekomen bericht mag de klok niet stukmaken.
    expect(extraMinuten({ timeouts: { home: NaN, away: -3 }, refereeStops: 1.7 })).toBe(1)
    expect(extraMinuten(undefined as never)).toBe(0)
  })
})

describe('doelSeconden', () => {
  it('houdt de basisduur wanneer er niets gevraagd is', () => {
    expect(doelSeconden(25 * 60, geen)).toBe(1500)
    expect(doelSeconden(20 * 60, geen)).toBe(1200)
  })

  it('telt één minuut per onderbreking bij', () => {
    expect(doelSeconden(25 * 60, { timeouts: { home: 1, away: 0 }, refereeStops: 0 })).toBe(1500 + 60)
    expect(doelSeconden(25 * 60, { timeouts: { home: 2, away: 2 }, refereeStops: 2 })).toBe(1500 + 6 * 60)
  })

  it('gebruikt één minuut per onderbreking, zoals het reglement zegt', () => {
    expect(ONDERBREKING_SECONDEN).toBe(60)
  })
})

describe('speeltTotMinuut', () => {
  it('geeft de kale helftduur in minuten zonder onderbrekingen', () => {
    expect(speeltTotMinuut(25 * 60, geen)).toBe(25)
    expect(speeltTotMinuut(20 * 60, geen)).toBe(20)
  })

  it('schuift op met de gevraagde minuten', () => {
    expect(speeltTotMinuut(25 * 60, { timeouts: { home: 2, away: 1 }, refereeStops: 0 })).toBe(28)
    expect(speeltTotMinuut(20 * 60, { timeouts: { home: 0, away: 0 }, refereeStops: 4 })).toBe(24)
  })

  it('valt na de rust terug op de basisduur', () => {
    // De tellers zijn per helft (buildMatchState filtert op currentHalf), dus zodra de 2e helft
    // begint staan ze weer op nul en zegt deze functie opnieuw gewoon 25.
    const helft1 = speeltTotMinuut(25 * 60, { timeouts: { home: 2, away: 2 }, refereeStops: 1 })
    const helft2 = speeltTotMinuut(25 * 60, geen)
    expect(helft1).toBe(30)
    expect(helft2).toBe(25)
  })
})
