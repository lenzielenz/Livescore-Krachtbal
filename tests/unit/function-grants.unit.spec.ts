import { describe, expect, it } from 'vitest'

import { FUNCTIES, FUNCTIE_OPTIONS, functieDef } from '@/lib/function-grants'

// Functietoekenningen: federatie/admin kent één functie (veldscherm, kantinescherm, ...) toe aan
// één gebruiker, los van diens rol. Zie collections/FunctionGrants.ts + de migratie voor het
// datamodel; deze tests bewaken enkel de pure lijst hier.

describe('FUNCTIES', () => {
  it('heeft geen dubbele waarden', () => {
    const values = FUNCTIES.map((f) => f.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it('bevat exact dezelfde waarden als de Postgres-enum in de migratie', () => {
    // Moet in sync blijven met CREATE TYPE "enum_function_grants_functie" in
    // src/migrations/20260918_090000_function_grants.ts — een nieuwe functie hier zonder de enum
    // uit te breiden faalt anders pas bij het opslaan, niet bij het compileren.
    const migrationValues = [
      'club/voorspel', 'kantine', 'cast', 'club/veldscherm', 'beheer/spelers', 'beheer/training/aanwezigheid',
      'beheer/leden', 'beheer/aantekenaars', 'beheer/planning', 'knipjes', 'bekerfinale',
    ]
    expect(FUNCTIES.map((f) => f.value).sort()).toEqual(migrationValues.sort())
  })

  it('sluit de scheidsrechter-tools en admin-only routes bewust uit', () => {
    const values = FUNCTIES.map((f) => f.value)
    for (const uitgesloten of ['scheidsrechter/portaal', 'vergoedingen', 'admin', 'beheer/accounts', 'reglement']) {
      expect(values).not.toContain(uitgesloten)
    }
  })

  it('elke clubgebonden functie hoort bij groep clubs, elke niet-clubgebonden bij federatie', () => {
    for (const f of FUNCTIES) {
      expect(f.clubGebonden).toBe(f.groep === 'clubs')
    }
  })
})

describe('functieDef', () => {
  it('vindt een bestaande functie', () => {
    expect(functieDef('club/veldscherm')?.label).toContain('Veldscherm')
  })

  it('geeft undefined voor een onbekende functie', () => {
    expect(functieDef('onbestaand')).toBeUndefined()
  })
})

describe('FUNCTIE_OPTIONS', () => {
  it('heeft evenveel opties als functies, elk met de groep in het label', () => {
    expect(FUNCTIE_OPTIONS).toHaveLength(FUNCTIES.length)
    for (const opt of FUNCTIE_OPTIONS) {
      const def = functieDef(opt.value)
      expect(opt.label).toContain(`(${def?.groep})`)
    }
  })
})
