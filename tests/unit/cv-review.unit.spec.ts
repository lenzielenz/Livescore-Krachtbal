import { describe, it, expect } from 'vitest'

import { BEELDEN, beeldTijden, volgendOpen } from '@/lib/cv-review'

// De reviewlaan als diavoorstelling.
//
// Aanleiding: "een voorstel is een foto van het beeld waar een vraag over is, en niet dat ik in
// de video moet klikken om te zien wat het is". Bij 21 voorstellen is zelf scrubben 21 keer
// zoeken vóór je iets beoordeeld hebt.

describe('beeldTijden', () => {
  it('legt het lusje rond het moment, niet erna', () => {
    // Het model wijst het moment van de worp aan: de aanloop ligt ervóór, het loslaten erna.
    const t = beeldTijden(10, 600)
    expect(t).toHaveLength(BEELDEN)
    expect(t[0]).toBeLessThan(10)
    expect(t[t.length - 1]).toBeGreaterThan(10)
    expect(t[Math.floor(BEELDEN / 2)]).toBeCloseTo(10, 6)
  })

  it('geeft oplopende, unieke tijdstippen', () => {
    const t = beeldTijden(30, 600)
    expect([...t].sort((a, b) => a - b)).toEqual(t)
    expect(new Set(t).size).toBe(t.length)
  })

  it('schuift naar binnen bij een worp in de eerste seconde', () => {
    // Niet inkorten maar verschuiven: het lusje blijft even lang, dus de beweging blijft
    // herkenbaar. En nooit een negatief tijdstip — daar kan geen speler naartoe zoeken.
    const t = beeldTijden(0.1, 600)
    expect(t[0]).toBeGreaterThanOrEqual(0)
    expect(t[t.length - 1] - t[0]).toBeCloseTo(0.8, 6)
  })

  it('schuift naar binnen aan het einde van de video', () => {
    const t = beeldTijden(599.9, 600)
    expect(t[t.length - 1]).toBeLessThanOrEqual(600)
    expect(t[t.length - 1] - t[0]).toBeCloseTo(0.8, 6)
  })

  it('werkt ook zonder gekende duur', () => {
    // De duur komt pas als de speler zijn metadata geladen heeft; tot dan mag het beeld niet
    // uitblijven.
    const t = beeldTijden(10, null)
    expect(t).toHaveLength(BEELDEN)
    expect(t[0]).toBeGreaterThanOrEqual(0)
  })

  it('levert één beeld als er maar één gevraagd wordt', () => {
    expect(beeldTijden(10, 600, 1)).toEqual([10])
  })

  it('houdt een video die korter is dan het lusje binnen zijn grenzen', () => {
    const t = beeldTijden(0.2, 0.4)
    expect(t[0]).toBeGreaterThanOrEqual(0)
    expect(t[t.length - 1]).toBeLessThanOrEqual(0.4)
  })
})

describe('volgendOpen', () => {
  const lijst = [
    { id: 1, videoTimeS: 10, verdict: null },
    { id: 2, videoTimeS: 20, verdict: 'bevestigd' },
    { id: 3, videoTimeS: 30, verdict: null },
    { id: 4, videoTimeS: 40, verdict: null },
  ]

  it('slaat wat al beoordeeld is over', () => {
    expect(volgendOpen(lijst, 1)?.id).toBe(3)
  })

  it('slaat het voorstel over dat zonet beantwoord werd', () => {
    // De optimistische update is dan nog niet rond, dus staat het nog als "open" in de lijst —
    // zonder deze uitzondering blijft de diavoorstelling hangen op wat je net beantwoordde.
    expect(volgendOpen(lijst, 3, 3)?.id).toBe(4)
  })

  it('gaat niet in het rond aan het einde van de rij', () => {
    // Klaar is klaar: opnieuw bij het begin beginnen laat een tweede ronde op een eerste lijken.
    expect(volgendOpen(lijst, 4, 4)).toBeNull()
  })

  it('begint vooraan als er nog niets actief is', () => {
    expect(volgendOpen(lijst, null)?.id).toBe(1)
  })

  it('gebruikt het id als tiebreak bij gelijke tijdstippen', () => {
    const gelijk = [
      { id: 7, videoTimeS: 12, verdict: null },
      { id: 9, videoTimeS: 12, verdict: null },
    ]
    expect(volgendOpen(gelijk, 7)?.id).toBe(9)
    expect(volgendOpen(gelijk, 9)).toBeNull()
  })

  it('geeft niets terug als er niets openstaat', () => {
    expect(volgendOpen([{ id: 1, videoTimeS: 1, verdict: 'afgewezen' }], 1)).toBeNull()
  })
})
