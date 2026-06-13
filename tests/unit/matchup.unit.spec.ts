import { describe, it, expect } from 'vitest'

import { buildMatchup } from '@/lib/matchup'
import type { RadarAxis } from '@/lib/team-report'

const radar = (vals: Partial<Record<string, number>>): RadarAxis[] =>
  [
    { key: 'afwerking', label: 'Afwerking' },
    { key: 'kracht', label: 'Kracht (rug)' },
    { key: 'diepgang', label: 'Diepgang' },
    { key: 'spreiding', label: 'Spreiding' },
    { key: 'balveilig', label: 'Balveiligheid' },
    { key: 'verdediging', label: 'Verdediging' },
  ].map((a) => ({ ...a, value: vals[a.key] ?? 50, display: `${vals[a.key] ?? 50}` }))

describe('buildMatchup', () => {
  it('bepaalt per as wie leidt met een drempel voor gelijkspel', () => {
    const m = buildMatchup(
      { name: 'Wij', radar: radar({ afwerking: 80, verdediging: 40 }) },
      { name: 'Zij', radar: radar({ afwerking: 55, verdediging: 75 }) },
    )
    const afw = m.axes.find((a) => a.key === 'afwerking')!
    const ver = m.axes.find((a) => a.key === 'verdediging')!
    const kr = m.axes.find((a) => a.key === 'kracht')! // 50 vs 50 → even
    expect(afw.leader).toBe('ours')
    expect(ver.leader).toBe('opp')
    expect(kr.leader).toBe('even')
  })

  it('berekent een geprojecteerd voordeel en verdict', () => {
    const m = buildMatchup(
      { name: 'Wij', radar: radar({ afwerking: 90, diepgang: 80, kracht: 70 }) },
      { name: 'Zij', radar: radar({}) },
    )
    expect(m.edgeScore).toBeGreaterThan(0)
    expect(m.verdict.side).toBe('ours')
    expect(m.verdict.label.toLowerCase()).toContain('voordeel voor wij')
  })

  it('duidt de uit te buiten troef en het gevaar aan, met tips', () => {
    const m = buildMatchup(
      { name: 'Wij', radar: radar({ afwerking: 85, verdediging: 35 }) },
      { name: 'Zij', radar: radar({ afwerking: 50, verdediging: 80 }) },
    )
    expect(m.exploit?.key).toBe('afwerking')
    expect(m.danger?.key).toBe('verdediging')
    const tips = m.tips.join(' ').toLowerCase()
    expect(tips).toContain('afwerking')
    expect(tips).toContain('zij is sterker')
  })

  it('noemt een gelijkwaardige matchup een evenwicht', () => {
    const m = buildMatchup({ name: 'Wij', radar: radar({}) }, { name: 'Zij', radar: radar({}) })
    expect(m.verdict.side).toBe('even')
    expect(m.verdict.margin).toBe('evenwicht')
    expect(m.exploit).toBeNull()
    expect(m.danger).toBeNull()
  })
})
