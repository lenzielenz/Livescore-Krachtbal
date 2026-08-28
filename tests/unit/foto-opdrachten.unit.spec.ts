import { describe, expect, it } from 'vitest'

import { FOTO_OPDRACHTEN, opdrachtOp, willekeurigeStart } from '@/lib/foto-opdrachten'

// De foto-opdrachten prikkelen supporters om in te sturen: elke gsm loot een eigen start,
// en de lijst draait netjes rond zodat er ná elke volbrachte opdracht altijd een volgende is.
describe('foto-opdrachten', () => {
  it('geloot startpunt valt binnen de lijst en spreidt over de toestellen', () => {
    // Deterministische "toestellen": elke waarde in [0,1) moet een geldige index opleveren.
    for (const r of [0, 0.1, 0.5, 0.99, 0.999999]) {
      const i = willekeurigeStart(() => r)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(FOTO_OPDRACHTEN.length)
    }
    // Verschillende toestellen (verschillende loting) → verschillende startopdrachten.
    const spreiding = new Set(Array.from({ length: FOTO_OPDRACHTEN.length }, (_, k) => willekeurigeStart(() => k / FOTO_OPDRACHTEN.length)))
    expect(spreiding.size).toBe(FOTO_OPDRACHTEN.length)
  })

  it('cycelt door de hele lijst en begint dan opnieuw', () => {
    const n = FOTO_OPDRACHTEN.length
    const reeks = Array.from({ length: n }, (_, i) => opdrachtOp(i))
    expect(new Set(reeks).size).toBe(n)
    expect(opdrachtOp(n)).toBe(opdrachtOp(0))
    expect(opdrachtOp(-1)).toBe(opdrachtOp(n - 1))
  })
})
