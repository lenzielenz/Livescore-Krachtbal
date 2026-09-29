import { describe, expect, it } from 'vitest'

import { clubActies, primaireActie } from '@/lib/wedstrijddag-acties'

// Welke knoppen een wedstrijdkaart op het clubdashboard toont. De aanleiding: in supportersmodus
// stond "Opstelling" er nog als primaire knop, en bij een thuiswedstrijd verving
// "⏳ Wacht op scheidsrechter" het aantekenen — terwijl er in die modus geen scheidsrechter is die
// het wedstrijdblad ooit opent. Je kon een geplande wedstrijd daar dus nooit starten.

describe('clubActies in supportersmodus', () => {
  const supporters = { supportersMode: true, live: false, bladOpen: false } as const

  it('biedt meteen aantekenen aan, thuis én uit', () => {
    expect(clubActies({ ...supporters, side: 'home' })).toEqual(['aantekenen', 'bekijk'])
    expect(clubActies({ ...supporters, side: 'away' })).toEqual(['aantekenen', 'bekijk'])
  })

  it('noemt de opstelling nergens meer', () => {
    for (const side of ['home', 'away'] as const) {
      for (const live of [false, true]) {
        for (const bladOpen of [false, true]) {
          const acties = clubActies({ supportersMode: true, side, live, bladOpen })
          expect(acties).not.toContain('opstelling')
          expect(acties).not.toContain('wachtOpScheidsrechter')
        }
      }
    }
  })

  it('laat het aantekenen niet afhangen van het wedstrijdblad', () => {
    // Precies het lek: het blad blijft in supportersmodus op 'concept' staan, dus bladOpen is
    // altijd false. Dat mag de knop niet meer wegnemen.
    expect(clubActies({ supportersMode: true, side: 'home', live: false, bladOpen: false })).toContain('aantekenen')
  })

  it('zet aantekenen vooraan als primaire knop', () => {
    expect(primaireActie(clubActies({ ...supporters, side: 'home' }))).toBe('aantekenen')
  })
})

describe('clubActies in federatiemodus', () => {
  const federatie = { supportersMode: false } as const

  it('houdt de opstelling als eerste stap en primaire knop', () => {
    const acties = clubActies({ ...federatie, side: 'home', live: false, bladOpen: false })
    expect(acties[0]).toBe('opstelling')
    expect(primaireActie(acties)).toBe('opstelling')
  })

  it('laat thuis wachten op de scheidsrechter zolang het blad dicht is', () => {
    expect(clubActies({ ...federatie, side: 'home', live: false, bladOpen: false })).toEqual([
      'opstelling',
      'wachtOpScheidsrechter',
    ])
  })

  it('geeft thuis de aantekenknop zodra het blad open staat', () => {
    expect(clubActies({ ...federatie, side: 'home', live: false, bladOpen: true })).toEqual([
      'opstelling',
      'aantekenen',
    ])
  })

  it('laat een lopende wedstrijd altijd terug binnen, ook met een dicht blad', () => {
    // Na een refresh of vanaf een ander toestel moet de aantekentafel er terug in kunnen.
    expect(clubActies({ ...federatie, side: 'home', live: true, bladOpen: false })).toContain('aantekenen')
    expect(clubActies({ ...federatie, side: 'away', live: true, bladOpen: false })).toContain('aantekenen')
  })

  it('geeft de uitploeg bekijken, en aantekenen enkel wanneer het blad open is', () => {
    expect(clubActies({ ...federatie, side: 'away', live: false, bladOpen: false })).toEqual([
      'opstelling',
      'bekijk',
    ])
    expect(clubActies({ ...federatie, side: 'away', live: false, bladOpen: true })).toEqual([
      'opstelling',
      'aantekenen',
      'bekijk',
    ])
  })

  it('toont nooit tegelijk een aantekenknop en een wachtmelding', () => {
    for (const side of ['home', 'away'] as const) {
      for (const live of [false, true]) {
        for (const bladOpen of [false, true]) {
          const acties = clubActies({ supportersMode: false, side, live, bladOpen })
          expect(acties.includes('aantekenen') && acties.includes('wachtOpScheidsrechter')).toBe(false)
        }
      }
    }
  })
})

describe('clubActies met claimedByOther (iemand anders tekent al aan)', () => {
  it('haalt aantekenen weg in supportersmodus en houdt bekijken over', () => {
    expect(clubActies({ supportersMode: true, side: 'home', live: false, bladOpen: false, claimedByOther: true })).toEqual(['bekijk'])
    expect(clubActies({ supportersMode: true, side: 'away', live: false, bladOpen: false, claimedByOther: true })).toEqual(['bekijk'])
  })

  it('haalt aantekenen weg in federatiemodus (thuis) en voegt bekijken toe', () => {
    expect(clubActies({ supportersMode: false, side: 'home', live: true, bladOpen: false, claimedByOther: true })).toEqual([
      'opstelling',
      'bekijk',
    ])
  })

  it('haalt aantekenen weg in federatiemodus (uit) en behoudt bekijken', () => {
    expect(clubActies({ supportersMode: false, side: 'away', live: false, bladOpen: true, claimedByOther: true })).toEqual([
      'opstelling',
      'bekijk',
    ])
  })

  it('laat wachtOpScheidsrechter ongemoeid — die bevat sowieso geen aantekenen', () => {
    expect(clubActies({ supportersMode: false, side: 'home', live: false, bladOpen: false, claimedByOther: true })).toEqual([
      'opstelling',
      'wachtOpScheidsrechter',
    ])
  })

  it('doet niets wanneer claimedByOther niet meegegeven wordt (bestaand gedrag ongewijzigd)', () => {
    expect(clubActies({ supportersMode: true, side: 'home', live: false, bladOpen: false })).toEqual(['aantekenen', 'bekijk'])
  })
})

describe('primaireActie', () => {
  it('geeft null bij een lege lijst', () => {
    expect(primaireActie([])).toBeNull()
  })

  it('valt terug op de eerste actie wanneer er niets te doen valt', () => {
    expect(primaireActie(['bekijk'])).toBe('bekijk')
  })
})
