import { describe, expect, it } from 'vitest'

import { dagRol, duurVan, FOTO_MS, OVERZICHT_MS, WEDSTRIJD_MS, winnaar } from '@/lib/kantine-dagverloop'

// Het dagverloop op het kantinescherm: zodra alles van vandaag gespeeld is, speelt de tv de dag
// opnieuw af — overzicht, elke wedstrijd in de schijnwerpers, en de foto's van die wedstrijd.

describe('dagRol', () => {
  it('opent met het overzicht en volgt daarna de wedstrijden in speelvolgorde', () => {
    expect(dagRol([10, 20], [])).toEqual([
      { soort: 'overzicht' },
      { soort: 'wedstrijd', matchId: 10 },
      { soort: 'wedstrijd', matchId: 20 },
    ])
  })

  it('zet de foto’s van een wedstrijd meteen achter die wedstrijd', () => {
    const fotos = [
      { id: 1, matchId: 20 },
      { id: 2, matchId: 10 },
      { id: 3, matchId: 20 },
    ]
    expect(dagRol([10, 20], fotos)).toEqual([
      { soort: 'overzicht' },
      { soort: 'wedstrijd', matchId: 10 },
      { soort: 'foto', fotoId: 2, matchId: 10 },
      { soort: 'wedstrijd', matchId: 20 },
      { soort: 'foto', fotoId: 1, matchId: 20 },
      { soort: 'foto', fotoId: 3, matchId: 20 },
    ])
  })

  it('toont per beurt hoogstens twee foto’s en schuift elke ronde door', () => {
    const fotos = [1, 2, 3, 4, 5].map((id) => ({ id, matchId: 10 }))
    const fotoIds = (ronde: number) =>
      dagRol([10], fotos, ronde).flatMap((s) => (s.soort === 'foto' ? [s.fotoId] : []))
    expect(fotoIds(0)).toEqual([1, 2])
    expect(fotoIds(1)).toEqual([3, 4])
    expect(fotoIds(2)).toEqual([5, 1])
  })

  it('toont één foto maar één keer per beurt', () => {
    const rol = dagRol([10], [{ id: 7, matchId: 10 }])
    expect(rol.filter((s) => s.soort === 'foto')).toHaveLength(1)
  })

  it('negeert foto’s van wedstrijden die niet op het scherm staan', () => {
    expect(dagRol([10], [{ id: 1, matchId: 99 }])).toEqual([{ soort: 'overzicht' }, { soort: 'wedstrijd', matchId: 10 }])
  })
})

describe('duurVan', () => {
  it('geeft het overzicht het langst, een foto het kortst', () => {
    expect(duurVan({ soort: 'overzicht' })).toBe(OVERZICHT_MS)
    expect(duurVan({ soort: 'wedstrijd', matchId: 1 })).toBe(WEDSTRIJD_MS)
    expect(duurVan({ soort: 'foto', fotoId: 1, matchId: 1 })).toBe(FOTO_MS)
    expect(OVERZICHT_MS).toBeGreaterThan(WEDSTRIJD_MS)
  })
})

describe('winnaar', () => {
  it('kent de winnaar of het gelijkspel', () => {
    expect(winnaar({ home: 21, away: 17 })).toBe('home')
    expect(winnaar({ home: 12, away: 14 })).toBe('away')
    expect(winnaar({ home: 18, away: 18 })).toBeNull()
  })
})
