import { describe, expect, it } from 'vitest'

import { clubFunctiesVan, magOpstellingVoor, magTrainingVoor } from '@/lib/club-functies'
import { regelsVanBlad } from '@/lib/speler-deelname'

const senioren = { id: 10, club: 1, category: 'senioren' }
const u14 = { id: 11, club: 1, category: 'U14' }
const vreemd = { id: 20, club: 2, category: 'U14' }

describe('clubfuncties', () => {
  it('coach: enkel de opstelling van zijn eigen ploegen', () => {
    const coach = { roles: ['club-lid'], club: 1, clubFuncties: ['coach', 'speler'], functieTeams: [10] }
    expect(magOpstellingVoor(coach, senioren)).toBe(true)
    expect(magOpstellingVoor(coach, u14)).toBe(false)
    expect(magOpstellingVoor(coach, vreemd)).toBe(false)
    expect(magTrainingVoor(coach, senioren)).toBe(true)
  })

  it('jeugdverantwoordelijke: alle jeugdploegen van de club, geen senioren', () => {
    const jv = { roles: ['club-lid'], club: 1, clubFuncties: ['jeugdverantwoordelijke'] }
    expect(magOpstellingVoor(jv, u14)).toBe(true)
    expect(magOpstellingVoor(jv, senioren)).toBe(false)
    expect(magOpstellingVoor(jv, vreemd)).toBe(false)
  })

  it('trainer zet training, geen opstelling', () => {
    const t = { roles: ['club-lid'], club: 1, clubFuncties: ['trainer'], functieTeams: [{ id: 11 }] }
    expect(magTrainingVoor(t, u14)).toBe(true)
    expect(magOpstellingVoor(t, u14)).toBe(false)
  })

  it('clubstaf, scheidsrechter en federatie zoals voorheen', () => {
    expect(magOpstellingVoor({ roles: ['club-medewerker'], club: 1 }, senioren)).toBe(true)
    expect(magOpstellingVoor({ roles: ['club-medewerker'], club: 1 }, vreemd)).toBe(false)
    expect(magOpstellingVoor({ roles: ['scheidsrechter'] }, vreemd)).toBe(true)
    expect(magOpstellingVoor({ roles: ['federatie'] }, vreemd)).toBe(true)
  })

  it('een zelf gekozen functie of onbekende waarde geeft niets', () => {
    expect(clubFunctiesVan({ clubFuncties: ['coach', 'baas'] })).toEqual(['coach'])
    expect(magOpstellingVoor({ roles: ['viewer'], club: 1, functie: 'coach', functieTeams: [10] }, senioren)).toBe(false)
  })
})

describe('deelname uit het wedstrijdblad', () => {
  it('geselecteerd en gespeeld per speler', () => {
    const r = regelsVanBlad({
      match: 5,
      homeLineup: [{ player: 1, deelgenomen: true }, { player: { id: 2 }, deelgenomen: false }],
      awayLineup: [{ player: 3 }],
    })
    expect(r.get(1)).toEqual({ matchId: 5, geselecteerd: true, gespeeld: true })
    expect(r.get(2)?.gespeeld).toBe(false)
    expect(r.get(3)?.gespeeld).toBe(false)
  })
})
