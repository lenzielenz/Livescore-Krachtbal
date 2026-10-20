import { describe, expect, it } from 'vitest'

import { klachtWeigering } from '@/lib/klacht'

const w = { bladStatus: 'ingediend', homeClub: 1, awayClub: 2, openKlachtVanClub: false }

describe('klachtWeigering', () => {
  it('de clubverantwoordelijke van een van beide ploegen mag klagen over een ingediend blad', () => {
    expect(klachtWeigering({ roles: ['club-beheerder'], club: 2 }, w)).toBeNull()
    expect(klachtWeigering({ roles: ['club-medewerker'], club: 1 }, w)).toBeNull()
  })
  it('niet ingelogd, geen clubstaf of een andere club: nee', () => {
    expect(klachtWeigering(null, w)).toMatch(/Log in/)
    expect(klachtWeigering({ roles: ['club-lid'], club: 1 }, w)).toMatch(/clubverantwoordelijken/)
    expect(klachtWeigering({ roles: ['club-beheerder'], club: 9 }, w)).toMatch(/speelde deze wedstrijd niet/)
  })
  it('pas na het indienen, en maar één open klacht per club', () => {
    expect(klachtWeigering({ roles: ['club-beheerder'], club: 1 }, { ...w, bladStatus: 'af_te_tekenen' })).toMatch(/ingediend/)
    expect(klachtWeigering({ roles: ['club-beheerder'], club: 1 }, { ...w, openKlachtVanClub: true })).toMatch(/al een open klacht/)
  })
})
