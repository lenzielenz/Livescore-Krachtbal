import { describe, expect, it } from 'vitest'

import { bezier, emojiDraaiing, INSLAG_MS, LANCEER_MS, richting, stuurpunten, voortgang } from '@/lib/raketvlucht'

// De rugworp-raket op het kantinescherm: van het logo van de scorer, in een S-bocht over het hele
// scherm, tot in het logo van de tegenstander.

const scherm = { b: 1920, h: 1080 }
const van = { x: 250, y: 860 } // thuis scoort: linksonder
const naar = { x: 1670, y: 220 } // tegenstander: rechtsboven

describe('baan', () => {
  it('begint in het logo van de scorer en eindigt in dat van de tegenstander', () => {
    const [p1, p2] = stuurpunten(van, naar, scherm)
    expect(bezier(van, p1, p2, naar, 0)).toEqual(van)
    expect(bezier(van, p1, p2, naar, 1)).toEqual(naar)
  })

  it('gebruikt het hele scherm maar blijft erbinnen', () => {
    const [p1, p2] = stuurpunten(van, naar, scherm)
    const punten = Array.from({ length: 101 }, (_, i) => bezier(van, p1, p2, naar, i / 100))
    const ys = punten.map((p) => p.y)
    // Een grote boog tot in het bovenste zesde van het scherm, hoger dan het doel: de raket duikt
    // er van boven in. Geen rechte lijn tussen twee logo's.
    expect(Math.min(...ys)).toBeLessThan(naar.y)
    expect(Math.min(...ys)).toBeLessThan(scherm.h / 6)
    for (const p of punten) {
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(scherm.h)
    }
  })

  it('werkt ook gespiegeld: de uitploeg vuurt van rechts naar links', () => {
    const vanRechts = { x: 1670, y: 860 }
    const naarLinks = { x: 250, y: 220 }
    const [p1, p2] = stuurpunten(vanRechts, naarLinks, scherm)
    expect(bezier(vanRechts, p1, p2, naarLinks, 1)).toEqual(naarLinks)
    // Halverwege zit de raket tussen beide logo's in.
    const half = bezier(vanRechts, p1, p2, naarLinks, 0.5)
    expect(half.x).toBeLessThan(vanRechts.x)
    expect(half.x).toBeGreaterThan(naarLinks.x)
  })

  it('wijst bij de lancering omhoog', () => {
    const [p1, p2] = stuurpunten(van, naar, scherm)
    // Omhoog = negatieve y op het scherm: een hoek tussen -180° en 0°.
    const hoek = richting(van, p1, p2, naar, 0.001)
    expect(hoek).toBeLessThan(0)
    expect(hoek).toBeGreaterThan(-Math.PI)
  })
})

describe('tijdlijn', () => {
  it('staat stil tijdens de lanceerflits en is klaar bij de inslag', () => {
    expect(voortgang(0)).toBe(0)
    expect(voortgang(LANCEER_MS)).toBe(0)
    expect(voortgang(INSLAG_MS)).toBe(1)
    expect(voortgang(INSLAG_MS + 500)).toBe(1)
  })

  it('versnelt: de tweede helft van de vlucht legt meer baan af dan de eerste', () => {
    const halverwege = voortgang((LANCEER_MS + INSLAG_MS) / 2)
    expect(halverwege).toBeLessThan(0.5)
    for (let ms = LANCEER_MS; ms < INSLAG_MS; ms += 50) expect(voortgang(ms + 50)).toBeGreaterThanOrEqual(voortgang(ms))
  })
})

describe('emojiDraaiing', () => {
  it('draait de schuin wijzende 🚀 zodat hij langs de baan wijst', () => {
    // Recht naar rechts vliegen (0 rad) vraagt 45° draaiing; recht omhoog (-90°) geen.
    expect(emojiDraaiing(0)).toBeCloseTo(Math.PI / 4)
    expect(emojiDraaiing(-Math.PI / 4)).toBeCloseTo(0)
  })
})
