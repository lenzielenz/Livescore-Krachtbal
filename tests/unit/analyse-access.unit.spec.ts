import { describe, it, expect } from 'vitest'

import { analyseMatchWhere, canViewAnalyseMatch } from '@/lib/analyse-access'

const fed = { id: 1, roles: ['federatie'] as const }
const analyst = { id: 7, roles: ['viewer'] as const, analyseAccess: true }
const other = { id: 8, roles: ['viewer'] as const, analyseAccess: true }

describe('analyseMatchWhere', () => {
  it('legt federatie/admin geen beperking op', () => {
    expect(analyseMatchWhere(fed)).toBeNull()
  })

  it('beperkt een gewone analist tot officiële wedstrijden + eigen opnames', () => {
    expect(analyseMatchWhere(analyst)).toEqual({
      or: [{ analyseOnly: { not_equals: true } }, { analyseOwner: { equals: 7 } }],
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

  it('federatie ziet elke analyse-opname', () => {
    expect(canViewAnalyseMatch(fed, { analyseOnly: true, analyseOwner: 7 })).toBe(true)
  })

  it('werkt met een uitgeklapt owner-object', () => {
    expect(canViewAnalyseMatch(analyst, { analyseOnly: true, analyseOwner: { id: 7 } })).toBe(true)
  })
})
