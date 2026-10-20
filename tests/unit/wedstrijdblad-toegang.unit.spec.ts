import { describe, expect, it } from 'vitest'

import { magWedstrijdbladZienVoor } from '@/lib/wedstrijdblad-toegang'

const w = { home: { id: 10, club: 1, category: 'senioren' }, away: { id: 20, club: 2, category: 'senioren' }, spelers: [100, 200] }

describe('magWedstrijdbladZienVoor', () => {
  it('niemand zonder login', () => {
    expect(magWedstrijdbladZienVoor(null, w)).toBe(false)
  })
  it('federatie en scheidsrechters', () => {
    expect(magWedstrijdbladZienVoor({ roles: ['federatie'] }, w)).toBe(true)
    expect(magWedstrijdbladZienVoor({ roles: ['scheidsrechter'] }, w)).toBe(true)
  })
  it('clubstaf van een van beide clubs, niet van een andere club', () => {
    expect(magWedstrijdbladZienVoor({ roles: ['club-beheerder'], club: 2 }, w)).toBe(true)
    expect(magWedstrijdbladZienVoor({ roles: ['club-medewerker'], club: 1 }, w)).toBe(true)
    expect(magWedstrijdbladZienVoor({ roles: ['club-beheerder'], club: 9 }, w)).toBe(false)
  })
  it('de coach van een van beide ploegen', () => {
    expect(magWedstrijdbladZienVoor({ roles: ['club-lid'], club: 1, clubFuncties: ['coach'], functieTeams: [10] }, w)).toBe(true)
    expect(magWedstrijdbladZienVoor({ roles: ['club-lid'], club: 1, clubFuncties: ['coach'], functieTeams: [11] }, w)).toBe(false)
  })
  it('een speler die op het blad staat (zoals de kapitein), niet een andere speler', () => {
    expect(magWedstrijdbladZienVoor({ roles: ['club-lid'], club: 2, player: 200 }, w)).toBe(true)
    expect(magWedstrijdbladZienVoor({ roles: ['club-lid'], club: 2, player: 300 }, w)).toBe(false)
    expect(magWedstrijdbladZienVoor({ roles: ['viewer'] }, w)).toBe(false)
  })
})
