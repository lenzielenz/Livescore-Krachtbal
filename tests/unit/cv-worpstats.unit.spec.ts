import { describe, it, expect } from 'vitest'

import { relatieveRichting, telWorpstats, worpKant, worpstatsPerWerper } from '@/lib/cv-worpstats'

// "Werpt hij links of rechts" gaat over de wérper, niet over het veld: richtingGraden staat in
// veldassen en moet dus gespiegeld worden zodra iemand richting thuiskant werpt. Staat die
// spiegel scheef, dan leest een coach voor de halve wedstrijd (één aanvalsrichting) precies de
// verkeerde kant.

describe('relatieveRichting', () => {
  it('is de veldrichting zelf voor een worp naar de uitkant', () => {
    // De werper kijkt mee met de veldas: zijn rechts ís veld-rechts.
    expect(relatieveRichting(0)).toBe(0)
    expect(relatieveRichting(30)).toBe(30)
    expect(relatieveRichting(-45)).toBe(-45)
  })

  it('spiegelt voor een worp naar de thuiskant', () => {
    // Wie omgekeerd staat, heeft veld-links aan zijn rechterhand.
    expect(relatieveRichting(180)).toBe(0) // recht achteruit = recht vooruit voor de werper
    expect(relatieveRichting(-170)).toBe(10) // veld-links uitwijken = rechts van de werper
    expect(relatieveRichting(170)).toBe(-10) // veld-rechts uitwijken = links van de werper
  })
})

describe('worpKant', () => {
  it('deelt in op de drempel rond recht vooruit', () => {
    expect(worpKant(0)).toBe('midden')
    expect(worpKant(14.9)).toBe('midden')
    expect(worpKant(20)).toBe('rechts')
    expect(worpKant(-20)).toBe('links')
    // En gespiegeld voor de thuiskant-richting:
    expect(worpKant(-160)).toBe('rechts')
    expect(worpKant(160)).toBe('links')
    expect(worpKant(null)).toBeNull()
  })
})

describe('telWorpstats', () => {
  it('telt afstand en kanten, en laat afgewezen voorstellen buiten alles', () => {
    const stats = telWorpstats([
      { verdict: 'bevestigd', afstandM: 20, richtingGraden: 5 },
      { verdict: null, afstandM: 16, richtingGraden: -30 },
      { verdict: 'bevestigd', afstandM: null, richtingGraden: 40, uitbal: true },
      { verdict: 'afgewezen', afstandM: 99, richtingGraden: 90 },
    ])
    expect(stats.worpen).toBe(3)
    expect(stats.metAfstand).toBe(2)
    expect(stats.gemAfstandM).toBe(18)
    expect(stats.maxAfstandM).toBe(20)
    expect(stats).toMatchObject({ links: 1, midden: 1, rechts: 1, uitballen: 1 })
  })

  it('geeft null-afstanden bij niets om te meten', () => {
    const stats = telWorpstats([{ verdict: 'bevestigd', richtingGraden: null }])
    expect(stats.gemAfstandM).toBeNull()
    expect(stats.maxAfstandM).toBeNull()
    expect(stats.links + stats.midden + stats.rechts).toBe(0)
  })
})

describe('worpstatsPerWerper', () => {
  it('groepeert per werper-volgnummer en slaat werperloze metingen over', () => {
    const uit = worpstatsPerWerper([
      { werper: 3, verdict: 'bevestigd', afstandM: 10, richtingGraden: 0 },
      { werper: 3, verdict: 'bevestigd', afstandM: 14, richtingGraden: 50 },
      { werper: 1005, verdict: 'bevestigd', afstandM: 22, richtingGraden: -140 },
      { verdict: 'bevestigd', afstandM: 5, richtingGraden: 0 },
    ])
    expect([...uit.keys()].sort((a, b) => a - b)).toEqual([3, 1005])
    expect(uit.get(3)).toMatchObject({ worpen: 2, gemAfstandM: 12, rechts: 1, midden: 1 })
    expect(uit.get(1005)).toMatchObject({ worpen: 1, maxAfstandM: 22, rechts: 1 })
  })
})
