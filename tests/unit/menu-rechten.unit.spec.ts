import { describe, expect, it } from 'vitest'

import { menuRechten } from '@/lib/menu-rechten'

describe('menuRechten', () => {
  it('uitgelogd ziet niets van club, training of beheer', () => {
    expect(menuRechten(null)).toMatchObject({ loggedIn: false, canTraining: false, isClub: false, isCoach: false, isReferee: false, isFed: false })
  })

  it('een speler (club-lid) is met zijn wedstrijden bezig: geen training, geen clubbeheer', () => {
    const r = menuRechten({ id: 1, roles: ['club-lid'], club: 3, player: 9, clubFuncties: ['speler'] })
    expect(r).toMatchObject({ loggedIn: true, canTraining: false, isClub: false, isCoach: false })
  })

  it('een coach of trainer ziet Mijn club en training', () => {
    for (const f of ['coach', 'trainer', 'jeugdverantwoordelijke']) {
      expect(menuRechten({ id: 1, roles: ['club-lid'], club: 3, clubFuncties: [f] })).toMatchObject({ canTraining: true, isCoach: true, isClub: false })
    }
  })

  it('clubstaf, scheidsrechter en federatie', () => {
    expect(menuRechten({ id: 1, roles: ['club-beheerder'], club: 3 })).toMatchObject({ isClub: true, canTraining: true })
    expect(menuRechten({ id: 1, roles: ['scheidsrechter'] })).toMatchObject({ isReferee: true, isClub: false, canTraining: false })
    expect(menuRechten({ id: 1, roles: ['federatie'] })).toMatchObject({ isFed: true, canTraining: true })
  })

  it('aparte trainingtoegang blijft werken', () => {
    expect(menuRechten({ id: 1, roles: ['club-lid'], trainingAccess: true }).canTraining).toBe(true)
  })
})
