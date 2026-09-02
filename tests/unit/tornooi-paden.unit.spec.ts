import { describe, it, expect } from 'vitest'

import { kantinePadVoor, tornooiBasisPad } from '@/lib/tornooi-paden'

describe('naar welk kantinescherm wijst een reeks', () => {
  it('stuurt een reeks van een tornooidag naar het dagscherm', () => {
    // Dít was de fout: je klikte "Kantinescherm" op een reeks van een tornooidag en belandde op
    // het karige reeksscherm in plaats van op het scherm van de dag.
    expect(kantinePadVoor(42, 'Beker van Brugge')).toBe('/tornooi/groep/Beker%20van%20Brugge/kantine')
  })

  it('houdt een losse beker op zijn eigen scherm', () => {
    expect(kantinePadVoor(42, null)).toBe('/tornooi/42/kantine')
    expect(kantinePadVoor(42)).toBe('/tornooi/42/kantine')
  })

  it('telt een dagnaam van louter spaties niet mee', () => {
    // Een leeg 'groep'-veld komt uit de database soms als spaties terug; dat is geen tornooidag,
    // en een link naar /tornooi/groep//kantine is een 404.
    expect(kantinePadVoor(7, '   ')).toBe('/tornooi/7/kantine')
  })

  it('codeert tekens die een pad zouden breken', () => {
    expect(kantinePadVoor(1, 'U16M / U18M')).toBe('/tornooi/groep/U16M%20%2F%20U18M/kantine')
  })
})

describe('het vaste vertrekpunt van een tornooidag', () => {
  it('brengt je terug naar je eigen tornooidag', () => {
    expect(tornooiBasisPad('Beker van Brugge')).toBe('/tornooi/groep/Beker%20van%20Brugge')
  })

  it('valt terug op de lijst met bekers als er geen dag is', () => {
    expect(tornooiBasisPad(null)).toBe('/tornooi')
    expect(tornooiBasisPad('  ')).toBe('/tornooi')
    expect(tornooiBasisPad()).toBe('/tornooi')
  })
})
