import { describe, expect, it } from 'vitest'

import { FOTO_OPDRACHTEN, opdrachtOp, startIndexVoor } from '@/lib/foto-opdrachten'

// De foto-opdrachten prikkelen supporters om in te sturen: deterministisch per tornooidag,
// en de lijst draait netjes rond zodat er ná elke volbrachte opdracht altijd een volgende is.
describe('foto-opdrachten', () => {
  it('startpositie is deterministisch en valt binnen de lijst', () => {
    const a = startIndexVoor('Beker van Brugge')
    expect(a).toBe(startIndexVoor('Beker van Brugge'))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(FOTO_OPDRACHTEN.length)
    // Andere dag ≠ gegarandeerd andere start, maar de hash spreidt wél.
    const verschillend = ['A', 'B', 'C', 'D', 'E'].map(startIndexVoor)
    expect(new Set(verschillend).size).toBeGreaterThan(1)
  })

  it('cycelt door de hele lijst en begint dan opnieuw', () => {
    const n = FOTO_OPDRACHTEN.length
    const reeks = Array.from({ length: n }, (_, i) => opdrachtOp(i))
    expect(new Set(reeks).size).toBe(n)
    expect(opdrachtOp(n)).toBe(opdrachtOp(0))
    expect(opdrachtOp(-1)).toBe(opdrachtOp(n - 1))
  })
})
