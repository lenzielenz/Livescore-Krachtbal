import { describe, it, expect } from 'vitest'

import { canTraining, isClubStaff, ROLE_OPTIONS } from '@/lib/access'

const u = (...roles: string[]) => ({ roles })

describe('club-rollen — medewerker & lid', () => {
  it('de nieuwe rollen zijn toekenbaar (staan in ROLE_OPTIONS)', () => {
    const values = ROLE_OPTIONS.map((o) => o.value)
    expect(values).toContain('club-medewerker')
    expect(values).toContain('club-lid')
  })

  it('isClubStaff: club-beheerder + club-medewerker wél, club-lid + supporter niet', () => {
    expect(isClubStaff(u('club-beheerder'))).toBe(true)
    expect(isClubStaff(u('club-medewerker'))).toBe(true)
    expect(isClubStaff(u('club-lid'))).toBe(false)
    expect(isClubStaff(u('viewer'))).toBe(false)
    expect(isClubStaff(null)).toBe(false)
  })

  it('canTraining: clubstaf én clublid mogen bekijken; supporter niet (tenzij trainingAccess)', () => {
    expect(canTraining(u('club-beheerder'))).toBe(true)
    expect(canTraining(u('club-medewerker'))).toBe(true)
    expect(canTraining(u('club-lid'))).toBe(true)
    expect(canTraining(u('viewer'))).toBe(false)
    expect(canTraining({ roles: ['viewer'], trainingAccess: true })).toBe(true)
  })

  it('admin telt niet als clubstaf via erfenis (club-rollen zijn club-gebonden)', () => {
    // Admin passeert de gates via isFederationLevel, niet via de club-scope.
    expect(isClubStaff(u('admin'))).toBe(false)
  })
})
