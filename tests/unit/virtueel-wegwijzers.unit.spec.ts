import { describe, expect, it } from 'vitest'

import { ringAfstand, wegwijzer, type Doel } from '@/lib/virtueel-wegwijzers'

// Bewegwijzering in de gangen van Virtueel krachtbal: een ring van 200 m.
const doelen: Doel[] = [
  { naam: 'Hall of Fame', icoon: '🏆', s: 0 },
  { naam: 'Fotogalerij', icoon: '📸', s: 50 },
  { naam: 'Dit weekend', icoon: '⚡', s: 100 },
]

describe('ringAfstand', () => {
  it('neemt de kortste weg, links- of rechtsom', () => {
    expect(ringAfstand(0, 50, 200)).toBe(50)
    expect(ringAfstand(0, 150, 200)).toBe(-50)
    expect(ringAfstand(190, 10, 200)).toBe(20)
    expect(ringAfstand(10, 190, 200)).toBe(-20)
  })
})

describe('wegwijzer', () => {
  it('bij de ingang: links en rechts langs de ring, met afstand', () => {
    // Bij s = 2 aan de ingang, kijkend naar het noorden (-z); stijgende s loopt naar +x = rechts.
    const w = wegwijzer({ s: 2, omtrek: 200, kijk: { x: 0, z: -1 }, raak: { x: 1, z: 0 } }, doelen)
    expect(w[0]).toMatchObject({ naam: 'Hall of Fame', pijl: '↓', meter: 0 })
    expect(w.find((x) => x.naam === 'Fotogalerij')).toMatchObject({ pijl: '→', meter: 50 })
    // Precies even ver beide kanten op: de rekenkunde kiest een kant, en dat is een zijpijl.
    expect(['←', '→']).toContain(w.find((x) => x.naam === 'Dit weekend')?.pijl)
  })

  it('in een rechte gang: vooruit, of achter je (andere kant van het bord)', () => {
    // Bij s = 25, kijkend in de richting van stijgende s.
    const vooruit = wegwijzer({ s: 25, omtrek: 200, kijk: { x: 1, z: 0 }, raak: { x: 1, z: 0 } }, doelen)
    expect(vooruit.find((x) => x.naam === 'Fotogalerij')?.pijl).toBe('↑')
    expect(vooruit.find((x) => x.naam === 'Hall of Fame')?.pijl).toBe('terug')
    const andersom = wegwijzer({ s: 25, omtrek: 200, kijk: { x: -1, z: 0 }, raak: { x: 1, z: 0 } }, doelen)
    expect(andersom.find((x) => x.naam === 'Hall of Fame')).toMatchObject({ pijl: '↑', meter: 25 })
  })

  it('wat dichtbij is komt eerst', () => {
    const w = wegwijzer({ s: 40, omtrek: 200, kijk: { x: 1, z: 0 }, raak: { x: 1, z: 0 } }, doelen)
    expect(w.map((x) => x.naam)).toEqual(['Fotogalerij', 'Hall of Fame', 'Dit weekend'])
  })
  it('een bestemming op twee plaatsen: enkel de dichtste', () => {
    const dubbel = [...doelen, { naam: 'Fotogalerij', icoon: '📸', s: 150 }]
    const w = wegwijzer({ s: 140, omtrek: 200, kijk: { x: 1, z: 0 }, raak: { x: 1, z: 0 } }, dubbel)
    expect(w.filter((x) => x.naam === 'Fotogalerij')).toEqual([{ naam: 'Fotogalerij', icoon: '📸', pijl: '↑', meter: 10 }])
  })
})
