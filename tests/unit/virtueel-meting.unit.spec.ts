import { describe, expect, it } from 'vitest'

import { fpsVan, leesMeting, MAX_PLEKKEN, vatSamen, type Meting } from '@/lib/virtueel-meting'

const plek = { s: 60, beelden: 3000, schokken: 6, haperingen: 1, p50: 16.7, p95: 22, p99: 40, calls: 700, tris: 450000 }
const ruw = {
  sessie: 'abc12345-def',
  toestel: { gpu: 'ANGLE (Intel UHD 620)', browser: 'Chrome 141', os: 'Windows', cores: 8, geheugen: 8, scherm: [1536, 864, 1.25], licht: false, mobiel: false },
  laden: { eersteBeeld: 4200, shaders: 380 },
  duur: 120,
  plekken: { gang: plek, 'kelder:Zwembad': { ...plek, beelden: 1800 } },
  bijsturing: { ratio: 1, nabewerking: true, schaduw: 2048, stappen: [{ t: 30, wat: 'pixels 1' }] },
  ergste: [{ ms: 240, plek: 'gang', t: 12 }],
}

describe('metingen van het virtuele stadion', () => {
  it('neemt een gewone meting aan', () => {
    const m = leesMeting(ruw)!
    expect(m.sessie).toBe('abc12345-def')
    expect(m.toestel.scherm).toEqual([1536, 864, 1.25])
    expect(Object.keys(m.plekken)).toEqual(['gang', 'kelder:Zwembad'])
    expect(m.bijsturing.stappen[0].wat).toBe('pixels 1')
  })

  it('weigert een meting zonder geldige sessie', () => {
    expect(leesMeting({ ...ruw, sessie: 'x' })).toBeNull()
    expect(leesMeting({ ...ruw, sessie: '<script>alert(1)</script>' })).toBeNull()
    expect(leesMeting(null)).toBeNull()
  })

  it('begrenst en schoont op wat een client stuurt', () => {
    const veel = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`plek${i}`, plek]))
    const m = leesMeting({
      ...ruw,
      toestel: { ...ruw.toestel, gpu: 'x'.repeat(500), cores: 1e9 },
      plekken: { ...veel, '<img src=x>': plek, gang: { ...plek, p95: -5, tris: 'veel' } },
      ergste: Array.from({ length: 50 }, () => ({ ms: 99999999, plek: '<b>', t: 1 })),
    })!
    expect(m.toestel.gpu.length).toBeLessThanOrEqual(120)
    expect(m.toestel.cores).toBe(256)
    expect(Object.keys(m.plekken).length).toBeLessThanOrEqual(MAX_PLEKKEN)
    expect(m.plekken['<img src=x>']).toBeUndefined()
    expect(m.ergste).toHaveLength(10)
    expect(m.ergste[0]).toEqual({ ms: 60000, plek: '?', t: 1 })
  })

  it('rekent de beelden per seconde uit', () => {
    expect(fpsVan(leesMeting(ruw)!)).toBe(40)
    expect(fpsVan({ plekken: {} })).toBe(0)
  })

  it('vat samen per plek en per toestel, de traagste eerst', () => {
    const a = leesMeting(ruw)!
    const b: Meting = { ...leesMeting({ ...ruw, sessie: 'zzz99999-xyz', toestel: { ...ruw.toestel, gpu: 'Apple M2' } })!, plekken: { gang: { ...plek, beelden: 3600, schokken: 0 } } }
    const s = vatSamen([a, b])
    expect(s.sessies).toBe(2)
    expect(s.minuten).toBe(3)
    expect(s.plekken[0].plek).toBe('kelder:Zwembad')
    expect(s.plekken[0].fps).toBe(30)
    const gang = s.plekken.find((p) => p.plek === 'gang')!
    expect(gang.fps).toBe(55)
    expect(gang.schokkenPerMinuut).toBe(3)
    expect(s.toestellen.map((t) => t.gpu)).toEqual(['ANGLE (Intel UHD 620)', 'Apple M2'])
    expect(s.bijsturing).toEqual({ 'pixels 1': 2 })
    expect(s.ergste[0]).toEqual({ ms: 240, plek: 'gang', t: 12, gpu: 'ANGLE (Intel UHD 620)' })
  })
})
