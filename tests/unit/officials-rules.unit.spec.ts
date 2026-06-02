import { describe, it, expect } from 'vitest'

import {
  isVolledigeNaam,
  requiredOfficials,
  validateOfficials,
} from '@/lib/officials-rules'

describe('isVolledigeNaam (naam + voornaam vereist)', () => {
  it('twee woorden → ok', () => {
    expect(isVolledigeNaam('Jan Janssens')).toBe(true)
  })
  it('één woord → niet ok', () => {
    expect(isVolledigeNaam('Janssens')).toBe(false)
  })
  it('leeg / undefined → niet ok', () => {
    expect(isVolledigeNaam('')).toBe(false)
    expect(isVolledigeNaam(undefined)).toBe(false)
  })
  it('losse initiaal telt niet als woord', () => {
    expect(isVolledigeNaam('J Janssens')).toBe(false)
  })
})

describe('requiredOfficials per reekstype', () => {
  it('nationaal vereist thuis + bezoekers-functies incl. coaches', () => {
    const req = requiredOfficials('1NAH')
    expect(req).toContain('coachThuis')
    expect(req).toContain('coachUit')
    expect(req).toContain('terreinafgevaardigde')
  })
  it('jeugd vereist terreinafgevaardigde maar geen coach', () => {
    const req = requiredOfficials('U14J')
    expect(req).toContain('terreinafgevaardigde')
    expect(req).not.toContain('coachThuis')
  })
  it('landelijk vereist geen coach', () => {
    const req = requiredOfficials('LH')
    expect(req).not.toContain('coachThuis')
    expect(req).toContain('aantekenaar')
  })
})

describe('validateOfficials', () => {
  it('volledig en geldig nationaal blad → ok', () => {
    const res = validateOfficials('1NAH', {
      aantekenaar: 'Jan Janssens',
      tijdopnemer: 'Piet Pieters',
      grensrechterThuis: 'Karel Karels',
      grensrechterUit: 'Luc Lucas',
      terreinafgevaardigde: 'Mark Markies',
      coachThuis: 'Theo Thuis',
      coachUit: 'Wim Weg',
    })
    expect(res.ok).toBe(true)
    expect(res.errors).toHaveLength(0)
  })

  it('ontbrekende verplichte functie → fout', () => {
    const res = validateOfficials('U14J', {
      aantekenaar: 'Jan Janssens',
      tijdopnemer: 'Piet Pieters',
      grensrechterThuis: 'Karel Karels',
      // terreinafgevaardigde ontbreekt
    })
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.includes('Terreinafgevaardigde'))).toBe(true)
  })

  it('official zonder voornaam → fout', () => {
    const res = validateOfficials('LH', {
      aantekenaar: 'Janssens',
      tijdopnemer: 'Piet Pieters',
      grensrechterThuis: 'Karel Karels',
    })
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.includes('volledige naam'))).toBe(true)
  })

  it('coach is tegelijk grensrechter → fout (Art. 25)', () => {
    const res = validateOfficials('LH', {
      aantekenaar: 'Jan Janssens',
      tijdopnemer: 'Piet Pieters',
      grensrechterThuis: 'Karel Karels',
      coachThuis: 'Karel Karels',
    })
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.includes('Art. 25'))).toBe(true)
  })
})
