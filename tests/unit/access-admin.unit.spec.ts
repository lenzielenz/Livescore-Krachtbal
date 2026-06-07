import { describe, it, expect } from 'vitest'

import { hasRole, isFederationLevel, canTraining, type UserRole } from '@/lib/access'

const u = (...roles: UserRole[]) => ({ roles })

describe('hasRole — admin is superuser', () => {
  it('admin erft de gezag-rollen (federatie, scheidsrechter, kapitein, scorekeeper)', () => {
    const admin = u('admin')
    expect(hasRole(admin, 'admin')).toBe(true)
    expect(hasRole(admin, 'federatie')).toBe(true)
    expect(hasRole(admin, 'scheidsrechter')).toBe(true)
    expect(hasRole(admin, 'kapitein')).toBe(true)
    expect(hasRole(admin, 'scorekeeper')).toBe(true)
  })

  it('admin telt mee als federatie-niveau', () => {
    expect(isFederationLevel(u('admin'))).toBe(true)
  })

  it('admin erft GEEN club-beheerder of viewer (club-/identiteits-scope blijft intact)', () => {
    const admin = u('admin')
    expect(hasRole(admin, 'club-beheerder')).toBe(false)
    expect(hasRole(admin, 'viewer')).toBe(false)
  })

  it('admin slaagt voor een gemengde check waar één rol een gezag-rol is', () => {
    expect(hasRole(u('admin'), 'club-beheerder', 'scheidsrechter')).toBe(true)
  })

  it('niet-admins behouden hun exacte rollen', () => {
    expect(hasRole(u('scheidsrechter'), 'scheidsrechter')).toBe(true)
    expect(hasRole(u('club-beheerder'), 'scheidsrechter')).toBe(false)
    expect(hasRole(u('viewer'), 'admin')).toBe(false)
  })

  it('admin mag het trainingsluik (canTraining)', () => {
    expect(canTraining(u('admin'))).toBe(true)
  })
})
