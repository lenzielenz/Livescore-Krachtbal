import { describe, expect, it } from 'vitest'

import { magTornooiAantekenen } from '@/lib/access'

// Wie mag een tornooiwedstrijd aantekenen?
//
// De valkuil zit in de standaardrol: élk vers account krijgt 'scorekeeper'. Wie dat recht aan die
// rol zou hangen, geeft het aan iedereen die zich registreert. Daarom een apart recht dat de admin
// per account toekent.

const met = (v: Record<string, unknown>) => v

describe('magTornooiAantekenen', () => {
  it('laat de organisatie en de scheidsrechter door', () => {
    expect(magTornooiAantekenen(met({ roles: ['admin'] }))).toBe(true)
    expect(magTornooiAantekenen(met({ roles: ['federatie'] }))).toBe(true)
    expect(magTornooiAantekenen(met({ roles: ['scheidsrechter'] }))).toBe(true)
  })

  it('laat door wie het recht uitdrukkelijk kreeg', () => {
    expect(magTornooiAantekenen(met({ roles: ['viewer'], aantekenRechten: true }))).toBe(true)
    expect(magTornooiAantekenen(met({ roles: ['club-lid'], aantekenRechten: true }))).toBe(true)
  })

  it('geeft het NIET aan iedereen met de standaardrol', () => {
    // Dit is de kern: 'scorekeeper' is de defaultValue op elk nieuw account.
    expect(magTornooiAantekenen(met({ roles: ['scorekeeper'] }))).toBe(false)
    expect(magTornooiAantekenen(met({ roles: ['scorekeeper', 'viewer'] }))).toBe(false)
  })

  it('weigert een uitgelogde bezoeker en rommel', () => {
    expect(magTornooiAantekenen(null)).toBe(false)
    expect(magTornooiAantekenen(undefined)).toBe(false)
    expect(magTornooiAantekenen(met({}))).toBe(false)
    expect(magTornooiAantekenen(met({ roles: [] }))).toBe(false)
  })

  it('telt een uitgevinkt recht als geen recht', () => {
    expect(magTornooiAantekenen(met({ roles: ['viewer'], aantekenRechten: false }))).toBe(false)
    expect(magTornooiAantekenen(met({ roles: ['viewer'], aantekenRechten: null }))).toBe(false)
  })

  it('laat in supporters-modus élke ingelogde bezoeker meetellen', () => {
    // Vrije livescore: op een tornooidag spelen tien velden tegelijk en zit er lang niet achter elk
    // veld iemand van de organisatie. Dan telt een supporter mee — mét naam bij de stand.
    expect(magTornooiAantekenen(met({ id: 7, roles: ['scorekeeper'] }), true)).toBe(true)
    expect(magTornooiAantekenen(met({ id: 7, roles: ['viewer'] }), true)).toBe(true)
    expect(magTornooiAantekenen(met({ id: 7, roles: [] }), true)).toBe(true)
  })

  it('vraagt ook in supporters-modus een login', () => {
    // De keuze van de federatie: er hoort een naam achter elke doorgegeven stand te staan.
    expect(magTornooiAantekenen(null, true)).toBe(false)
    expect(magTornooiAantekenen(undefined, true)).toBe(false)
    expect(magTornooiAantekenen(met({ roles: ['viewer'] }), true)).toBe(false)
  })

  it('verandert niets zolang de supporters-modus uit staat', () => {
    expect(magTornooiAantekenen(met({ id: 7, roles: ['scorekeeper'] }), false)).toBe(false)
    expect(magTornooiAantekenen(met({ id: 7, roles: ['scorekeeper'] }))).toBe(false)
  })

  it('geeft geen clubstaf of kapitein stilzwijgend het recht', () => {
    // Clubstaf tekent competitiewedstrijden van de eigen club aan; een tornooi is van de
    // organisatie. Wie het toch moet kunnen, krijgt het recht expliciet.
    expect(magTornooiAantekenen(met({ roles: ['club-beheerder'] }))).toBe(false)
    expect(magTornooiAantekenen(met({ roles: ['club-medewerker'] }))).toBe(false)
    expect(magTornooiAantekenen(met({ roles: ['kapitein'] }))).toBe(false)
  })
})
