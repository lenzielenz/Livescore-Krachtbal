import { describe, expect, it } from 'vitest'

import { analyseer, rem } from '@/lib/virtueel-analyse'
import { vatSamen, type Meting } from '@/lib/virtueel-meting'

const plek = { s: 300, beelden: 18000, schokken: 10, haperingen: 0, p50: 16.7, p95: 20, p99: 30, calls: 300, tris: 200000, cpu: 4 }
const meting = (sessie: string, over: Partial<Meting> = {}): Meting => ({
  sessie,
  toestel: { gpu: 'Apple M2', browser: 'Chrome 141', os: 'macOS', cores: 8, geheugen: 8, scherm: [1440, 900, 2], licht: false, mobiel: false },
  laden: { eersteBeeld: 3000, shaders: 400 },
  duur: 300,
  plekken: { gang: plek },
  bijsturing: { ratio: 1.25, nabewerking: false, schaduw: 0, stappen: [] },
  ergste: [],
  versie: 'aaa1111',
  dag: '2026-10-17',
  ...over,
})
const vijf = (over: Partial<Meting> = {}) => ['s1aaaaaaa', 's2aaaaaaa', 's3aaaaaaa', 's4aaaaaaa', 's5aaaaaaa'].map((s) => meting(s, over))

describe('analyse van de metingen van het virtuele stadion', () => {
  it('herkent de rem uit processortijd tegenover frametijd', () => {
    expect(rem({ fps: 30, cpu: 28 })).toBe('processor')
    expect(rem({ fps: 30, cpu: 5 })).toBe('grafische kaart')
    expect(rem({ fps: 30, cpu: 0 })).toBe('onbekend')
  })

  it('meldt te weinig metingen', () => {
    const a = analyseer(vatSamen([meting('s1aaaaaaa')]))
    expect(a[0].titel).toBe('Nog weinig metingen')
  })

  it('zegt dat het vlot loopt als er niets is', () => {
    const a = analyseer(vatSamen(vijf()))
    expect(a).toHaveLength(1)
    expect(a[0].titel).toMatch(/loopt vlot/)
  })

  it('vindt een trage plek en wijst de grafische kaart als rem aan', () => {
    const traag = { ...plek, beelden: 7500, p95: 50, tris: 600000, cpu: 6 }
    const a = analyseer(vatSamen(vijf({ plekken: { gang: plek, plein: traag } })))
    const k = a.find((x) => x.waar === 'plein')!
    expect(k.ernst).toBe('hoog')
    expect(k.advies).toMatch(/grafische kaart/)
    expect(k.advies).toMatch(/600k driehoeken/)
    expect(a[0]).toBe(k)
  })

  it('wijst de processor aan bij veel tekenopdrachten', () => {
    const traag = { ...plek, beelden: 12000, calls: 900, cpu: 22 }
    const k = analyseer(vatSamen(vijf({ plekken: { kelder: traag } }))).find((x) => x.waar === 'kelder')!
    expect(k.ernst).toBe('middel')
    expect(k.advies).toMatch(/processor/)
    expect(k.advies).toMatch(/900 tekenopdrachten/)
  })

  it('vergelijkt de laatste versie met de vorige', () => {
    const oud = vijf({ versie: 'aaa1111', dag: '2026-10-10', plekken: { gang: { ...plek, beelden: 12000 } } })
    const nieuw = vijf({ versie: 'bbb2222', dag: '2026-10-17' }).map((m) => ({ ...m, sessie: `n${m.sessie}` }))
    const s = vatSamen([...nieuw, ...oud])
    expect(s.versies.map((v) => v.versie)).toEqual(['aaa1111', 'bbb2222'])
    expect(s.dagen.map((d) => d.dag)).toEqual(['2026-10-10', '2026-10-17'])
    const k = analyseer(s).find((x) => x.waar === 'versies')!
    expect(k.titel).toBe('Versie bbb2222: +20 b/s tegenover aaa1111')
  })

  it('meldt een achteruitgang als hoog', () => {
    const oud = vijf({ versie: 'aaa1111', dag: '2026-10-10' })
    const nieuw = vijf({ versie: 'bbb2222', dag: '2026-10-17', plekken: { gang: { ...plek, beelden: 15000 } } })
    const k = analyseer(vatSamen([...oud, ...nieuw])).find((x) => x.waar === 'versies')!
    expect(k.ernst).toBe('hoog')
    expect(k.titel).toMatch(/Achteruitgang/)
  })
})
