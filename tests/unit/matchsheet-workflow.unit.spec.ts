import { describe, it, expect } from 'vitest'

import {
  canTransition,
  clubsMayEditLineup,
  isFinal,
  isReleaseTime,
  nextStatus,
} from '@/lib/matchsheet-workflow'

describe('isReleaseTime', () => {
  const start = '2026-03-01T15:00:00.000Z'
  it('niet vrijgegeven meer dan 60 min vooraf', () => {
    expect(isReleaseTime(start, 60, new Date('2026-03-01T13:30:00.000Z'))).toBe(false)
  })
  it('vrijgegeven binnen het venster', () => {
    expect(isReleaseTime(start, 60, new Date('2026-03-01T14:30:00.000Z'))).toBe(true)
  })
  it('vrijgegeven na aanvang', () => {
    expect(isReleaseTime(start, 60, new Date('2026-03-01T16:00:00.000Z'))).toBe(true)
  })
})

describe('nextStatus', () => {
  it('lineaire voorwaartse keten', () => {
    expect(nextStatus('concept')).toBe('vrijgegeven')
    expect(nextStatus('vrijgegeven')).toBe('wedstrijdklaar')
    expect(nextStatus('wedstrijdklaar')).toBe('bezig')
    expect(nextStatus('bezig')).toBe('af_te_tekenen')
    expect(nextStatus('af_te_tekenen')).toBe('ingediend')
    expect(nextStatus('ingediend')).toBeNull()
  })
})

describe('isFinal / clubsMayEditLineup', () => {
  it('ingediend is finaal', () => {
    expect(isFinal('ingediend')).toBe(true)
    expect(isFinal('bezig')).toBe(false)
  })
  it('clubs bewerken opstelling enkel in concept', () => {
    expect(clubsMayEditLineup('concept')).toBe(true)
    expect(clubsMayEditLineup('vrijgegeven')).toBe(false)
  })
})

describe('canTransition', () => {
  const ref = { roles: ['scheidsrechter' as const], isAssignedReferee: true }
  const fed = { roles: ['federatie' as const], isAssignedReferee: false }
  const club = { roles: ['club-beheerder' as const], isAssignedReferee: false }

  it('na ingediend kan niets meer', () => {
    expect(canTransition('ingediend', 'bezig', fed).allowed).toBe(false)
  })
  it('federatie mag vrij schakelen (ook terug) zolang niet ingediend', () => {
    expect(canTransition('wedstrijdklaar', 'concept', fed).allowed).toBe(true)
    expect(canTransition('concept', 'bezig', fed).allowed).toBe(true)
  })
  it('toegewezen scheidsrechter mag overschrijven', () => {
    expect(canTransition('bezig', 'wedstrijdklaar', ref).allowed).toBe(true)
  })
  it('club-beheerder mag enkel concept → vrijgegeven', () => {
    expect(canTransition('concept', 'vrijgegeven', club).allowed).toBe(true)
    expect(canTransition('vrijgegeven', 'wedstrijdklaar', club).allowed).toBe(false)
    expect(canTransition('bezig', 'af_te_tekenen', club).allowed).toBe(false)
  })
})
