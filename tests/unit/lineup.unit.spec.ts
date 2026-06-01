import { describe, it, expect } from 'vitest'

import { playerSelectability } from '@/lib/lineup'

// Seizoen-startjaar 2025 → peiljaar 2026.
const SEASON = 2025

const basis = {
  vergunningsstatus: 'geldig',
  birthDate: '2012-01-01', // U16 in peiljaar 2026
  hogerSpelenVerbod: false,
  medischAttest: true,
  actief: true,
}

describe('playerSelectability', () => {
  it('volledig in orde → ok', () => {
    expect(playerSelectability(basis, 'U16', SEASON).level).toBe('ok')
  })
  it('geen geldige vergunning → block', () => {
    const r = playerSelectability({ ...basis, vergunningsstatus: 'aangevraagd' }, 'U16', SEASON)
    expect(r.level).toBe('block')
    expect(r.reasons.join(' ')).toMatch(/vergunning/i)
  })
  it('knipjes-blokkade → block', () => {
    const r = playerSelectability({ ...basis, knipjesGeblokkeerd: true }, 'U16', SEASON)
    expect(r.level).toBe('block')
  })
  it('twee categorieën te hoog → block', () => {
    // U16-speler in een U20-ploeg = 2 hoger.
    expect(playerSelectability(basis, 'U20', SEASON).level).toBe('block')
  })
  it('één hoger met doktersverbod → warn', () => {
    const r = playerSelectability({ ...basis, hogerSpelenVerbod: true }, 'U18', SEASON)
    expect(r.level).toBe('warn')
  })
  it('ontbrekend medisch attest → minstens warn', () => {
    const r = playerSelectability({ ...basis, medischAttest: false }, 'U16', SEASON)
    expect(['warn', 'block']).toContain(r.level)
  })
  it('inactief lid → block', () => {
    expect(playerSelectability({ ...basis, actief: false }, 'U16', SEASON).level).toBe('block')
  })
})
