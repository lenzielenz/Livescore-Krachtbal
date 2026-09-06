import { describe, expect, it } from 'vitest'

import { clubWedstrijdActies } from '@/lib/club-acties'

// Robin, 2026-09-06: "als de supporter modus aanstaat is er geen opstelling. gewoon aantekenen in
// basis versie."
//
// Op "Mijn club" hing onder elke wedstrijd nog altijd de federatie-flow: een knop "Opstelling" naar
// een scherm dat in supporters-modus niets doet, en voor de thuisploeg een "⏳ Wacht op
// scheidsrechter" dat het aantekenen blokkeerde op een goedkeuring die in die modus nooit komt.

const wedstrijd = { status: 'scheduled', sheetStatus: null as string | null }

describe('supporters-modus: enkel aantekenen', () => {
  it('laat de opstelling en het wachten op de scheidsrechter weg', () => {
    for (const side of ['home', 'away'] as const) {
      const acties = clubWedstrijdActies({ supportersMode: true, side, ...wedstrijd })
      expect(acties).not.toContain('opstelling')
      expect(acties).not.toContain('wacht-op-scheidsrechter')
      expect(acties).toContain('aantekenen')
    }
  })

  it('geeft de thuisploeg meteen toegang, zonder vrijgegeven wedstrijdblad', () => {
    // Precies het geval uit de melding: blad nog op concept, en tóch aantekenen.
    expect(
      clubWedstrijdActies({
        supportersMode: true,
        side: 'home',
        status: 'scheduled',
        sheetStatus: 'concept',
      }),
    ).toEqual(['aantekenen', 'bekijk'])
  })
})

describe('federatie-modus: de volledige flow blijft staan', () => {
  it('toont de opstelling en laat de thuisploeg wachten tot de scheidsrechter opent', () => {
    expect(clubWedstrijdActies({ supportersMode: false, side: 'home', ...wedstrijd })).toEqual([
      'opstelling',
      'wacht-op-scheidsrechter',
    ])
  })

  it('opent het aantekenen zodra het blad wedstrijdklaar is', () => {
    expect(
      clubWedstrijdActies({
        supportersMode: false,
        side: 'home',
        status: 'scheduled',
        sheetStatus: 'wedstrijdklaar',
      }),
    ).toEqual(['opstelling', 'aantekenen'])
  })

  it('laat een lopende wedstrijd er altijd terug in — thuis én uit', () => {
    // Na een refresh of vanaf een ander toestel moet de aantekentafel er weer in kunnen.
    expect(
      clubWedstrijdActies({
        supportersMode: false,
        side: 'home',
        status: 'live',
        sheetStatus: null,
      }),
    ).toContain('aantekenen')
    expect(
      clubWedstrijdActies({
        supportersMode: false,
        side: 'away',
        status: 'live',
        sheetStatus: null,
      }),
    ).toContain('aantekenen')
  })

  it('geeft de uitploeg altijd de kijk-knop', () => {
    expect(clubWedstrijdActies({ supportersMode: false, side: 'away', ...wedstrijd })).toEqual([
      'opstelling',
      'bekijk',
    ])
  })
})
