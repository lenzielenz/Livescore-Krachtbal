import { describe, it, expect } from 'vitest'

import { analyseMatchWhere, analyseOwnWhere, canViewAnalyseMatch, competitionWhere } from '@/lib/analyse-access'
import { ownsAnalyse } from '@/lib/analyse-crud'

const fed = { id: 1, roles: ['federatie'] as const }
const admin = { id: 2, roles: ['admin'] as const }
const analyst = { id: 7, roles: ['viewer'] as const, analyseAccess: true }
const other = { id: 8, roles: ['viewer'] as const, analyseAccess: true }
// Iemand deelde zijn analyses met deze gebruiker (inverse zit in het user-object).
const gedeeld = { id: 9, roles: ['viewer'] as const, analyseAccess: true, analyseToegangTot: [7] }

describe('analyseMatchWhere', () => {
  it('legt federatie/admin geen beperking op', () => {
    expect(analyseMatchWhere(fed)).toBeNull()
  })

  it('beperkt een gewone analist tot officiële wedstrijden + eigen opnames', () => {
    expect(analyseMatchWhere(analyst)).toEqual({
      or: [{ analyseOnly: { not_equals: true } }, { analyseOwner: { in: [7] } }],
    })
  })

  it('neemt gedeelde eigenaars mee', () => {
    expect(analyseMatchWhere(gedeeld)).toEqual({
      or: [{ analyseOnly: { not_equals: true } }, { analyseOwner: { in: [9, 7] } }],
    })
  })

  it('toont een niet-ingelogde enkel officiële wedstrijden', () => {
    expect(analyseMatchWhere(null)).toEqual({ analyseOnly: { not_equals: true } })
  })
})

describe('canViewAnalyseMatch', () => {
  it('officiële wedstrijd is voor iedereen zichtbaar', () => {
    expect(canViewAnalyseMatch(analyst, { analyseOnly: false, analyseOwner: 99 })).toBe(true)
  })

  it('eigen analyse-opname is zichtbaar', () => {
    expect(canViewAnalyseMatch(analyst, { analyseOnly: true, analyseOwner: 7 })).toBe(true)
  })

  it('analyse-opname van iemand anders is verborgen', () => {
    expect(canViewAnalyseMatch(other, { analyseOnly: true, analyseOwner: 7 })).toBe(false)
  })

  it('gedeelde analyse-opname is zichtbaar voor wie ze gedeeld kreeg', () => {
    expect(canViewAnalyseMatch(gedeeld, { analyseOnly: true, analyseOwner: 7 })).toBe(true)
    expect(canViewAnalyseMatch(gedeeld, { analyseOnly: true, analyseOwner: 8 })).toBe(false)
  })

  it('federatie ziet elke analyse-opname', () => {
    expect(canViewAnalyseMatch(fed, { analyseOnly: true, analyseOwner: 7 })).toBe(true)
  })

  it('werkt met een uitgeklapt owner-object', () => {
    expect(canViewAnalyseMatch(analyst, { analyseOnly: true, analyseOwner: { id: 7 } })).toBe(true)
  })
})

describe('analyseOwnWhere', () => {
  it('beperkt strikt tot eigen analyse-data (analyseOnly + eigen owner), ook voor admin/federatie', () => {
    const expected = (ids: number[]) => ({ and: [{ analyseOnly: { equals: true } }, { analyseOwner: { in: ids } }] })
    expect(analyseOwnWhere(analyst)).toEqual(expected([7]))
    expect(analyseOwnWhere(admin)).toEqual(expected([2]))
    expect(analyseOwnWhere(fed)).toEqual(expected([1]))
  })

  it('neemt gedeelde eigenaars mee (ook als uitgeklapte objecten)', () => {
    expect(analyseOwnWhere(gedeeld)).toEqual({
      and: [{ analyseOnly: { equals: true } }, { analyseOwner: { in: [9, 7] } }],
    })
    expect(analyseOwnWhere({ id: 9, analyseToegangTot: [{ id: 7 }] })).toEqual({
      and: [{ analyseOnly: { equals: true } }, { analyseOwner: { in: [9, 7] } }],
    })
  })

  it('valt zonder gebruiker terug op een onmogelijke eigenaar (-1) zodat er niets lekt', () => {
    expect(analyseOwnWhere(null)).toEqual({ and: [{ analyseOnly: { equals: true } }, { analyseOwner: { in: [-1] } }] })
  })
})

describe('competitionWhere', () => {
  it('sluit alle analyse-entiteiten uit', () => {
    expect(competitionWhere()).toEqual({ analyseOnly: { not_equals: true } })
  })
})

describe('ownsAnalyse', () => {
  it('eigenaar mag zijn eigen analyse-entiteit bewerken', () => {
    expect(ownsAnalyse({ analyseOnly: true, analyseOwner: 7 }, analyst)).toBe(true)
    expect(ownsAnalyse({ analyseOnly: true, analyseOwner: { id: 7 } }, analyst)).toBe(true)
  })

  it('iemand anders zijn analyse-entiteit niet', () => {
    expect(ownsAnalyse({ analyseOnly: true, analyseOwner: 7 }, other)).toBe(false)
  })

  it('admin mag elke analyse-entiteit bewerken', () => {
    expect(ownsAnalyse({ analyseOnly: true, analyseOwner: 7 }, admin)).toBe(true)
  })

  it('een competitie-entiteit (niet analyseOnly) is nooit via deze route bewerkbaar', () => {
    expect(ownsAnalyse({ analyseOnly: false, analyseOwner: 7 }, analyst)).toBe(false)
    expect(ownsAnalyse({ analyseOnly: false, analyseOwner: 7 }, admin)).toBe(false)
    expect(ownsAnalyse(null, admin)).toBe(false)
  })
})
