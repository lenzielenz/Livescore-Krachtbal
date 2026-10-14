import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { balOp, balSpoor, bezitOp, bezitTijdlijn, decodeer, GEVEL, gevelAfstand, op, ploegKleuren, STANDAARD_THEMA, stadionThema, stap, vrij, WERELD_STRAAL, type Reconstructie, type Spoor } from '@/lib/virtueel'

// Een klein handgemaakt fragment: één speler per ploeg en de bal.
const spoor = (over: Partial<Spoor> & { id: string }): Spoor => ({
  bal: false, team: 0, track: null, t: new Float64Array(), x: new Float32Array(), y: new Float32Array(), z: new Float32Array(), fase: [], houder: [], ...over,
})
const a = spoor({ id: 'T0-S1', team: 0, track: '3', t: Float64Array.from([0, 1, 2]), x: Float32Array.from([10, 12, 14]), y: Float32Array.from([5, 5, 5]), z: new Float32Array(3), fase: [null, null, null], houder: [null, null, null] })
const b = spoor({ id: 'T1-S1', team: 1, track: '7', t: Float64Array.from([0, 1, 2, 5]), x: Float32Array.from([20, 20, 20, 30]), y: Float32Array.from([8, 8, 8, 8]), z: new Float32Array(4), fase: [null, null, null, null], houder: [null, null, null, null] })
const bal = spoor({
  id: 'bal-baan', bal: true, team: null,
  t: Float64Array.from([0, 1, 1.5, 2]), x: Float32Array.from([10, 16, 19, 20]), y: Float32Array.from([5, 6, 7, 8]), z: Float32Array.from([1, 3, 2, 1]),
  fase: ['held', 'flight', 'flight', 'held'], houder: ['3', null, null, '7'],
})
const sporen = [a, b, bal]

describe('op', () => {
  it('interpoleert tussen twee metingen', () => {
    expect(op(a, 0.5)).toMatchObject({ x: 11, y: 5 })
  })
  it('is null vóór de eerste meting en na een te groot gat', () => {
    expect(op(a, -1)).toBeNull()
    expect(op(b, 3.5)).toBeNull() // gat van 3 s tussen 2 en 5
    expect(op(b, 2.05)).not.toBeNull()
  })
})

describe('balOp', () => {
  it('legt de bal in de handen van zijn houder', () => {
    const s = balOp(sporen, 0)!
    expect(s.fase).toBe('held')
    expect(s.houder?.id).toBe('T0-S1')
    expect(s.z).toBeCloseTo(1.15)
  })
  it('volgt de gemeten baan in de vlucht', () => {
    const s = balOp(sporen, 1.25)!
    expect(s.fase).toBe('flight')
    expect(s.x).toBeCloseTo(17.5)
    expect(s.z).toBeCloseTo(2.5)
  })
})

describe('bezitOp', () => {
  it('geeft de ploeg van de laatste houder, ook tijdens de vlucht', () => {
    expect(bezitOp(sporen, 0.2)).toBe(0)
    expect(bezitOp(sporen, 1.2)).toBe(0)
    expect(bezitOp(sporen, 2)).toBe(1)
  })
})

describe('balSpoor', () => {
  it('geeft de punten van de laatste seconden', () => {
    const pts = balSpoor(sporen, 2, 1, 0.25)
    expect(pts.length).toBe(5)
  })
})

describe('ploegKleuren', () => {
  it('geeft elke ploeg een eigen tenuekleur', () => {
    const k = ploegKleuren([{ id: 0, naam: 'A', thuis: true, tenue: ['rood', 'grijs'] }, { id: 1, naam: 'B', thuis: false, tenue: ['rood', 'grijs'] }])
    expect(k[0]).not.toBe(k[1])
  })
})

describe('decodeer (echt fragment)', () => {
  const r = JSON.parse(readFileSync('public/virtueel/2026-10-07-sint-michiels.json', 'utf8')) as Reconstructie
  const s = decodeer(r)
  it('levert negen spelers (4 + 5) en één bal', () => {
    expect(s.filter((x) => !x.bal)).toHaveLength(9)
    expect(s.filter((x) => x.bal)).toHaveLength(1)
  })
  it('legt de bal meestal in de handen van een bekende speler', () => {
    let vast = 0
    for (let t = 1; t < r.duur_s; t += 0.5) if (balOp(s, t)?.houder) vast++
    expect(vast).toBeGreaterThan(30)
  })
})

describe('stadionThema', () => {
  it('neemt de clubkleuren over en kiest leesbare tekst', () => {
    const t = stadionThema({ naam: 'KBC St. Michiels', primair: '#C8102E', secundair: '#FFFFFF', logoUrl: '/logo.png' })
    expect(t).toMatchObject({ primair: '#c8102e', secundair: '#ffffff', tekstOpPrimair: '#ffffff', kort: 'KSM', logoUrl: '/logo.png' })
  })
  it('vervangt een ontbrekende of te gelijkaardige tweede kleur', () => {
    expect(stadionThema({ naam: 'X', primair: '#facc15', secundair: null, logoUrl: null }).secundair).toBe('#111827')
    expect(stadionThema({ naam: 'X', primair: '#1e3a8a', secundair: '#1e3a8b', logoUrl: null }).secundair).toBe('#f8fafc')
  })
  it('valt terug op Krachtbal Live bij een ongeldige kleur', () => {
    expect(stadionThema({ naam: 'X', primair: 'rood', secundair: null, logoUrl: null }).primair).toBe(STANDAARD_THEMA.primair)
  })
})

describe('bezitTijdlijn', () => {
  it('telt het balbezit per ploeg op, de vlucht inbegrepen', () => {
    const bezit = bezitTijdlijn(sporen)
    expect(bezit(-1)).toBeNull()
    // 0–1.5 s: ploeg 0 (vast + vlucht), 1.5–2 s: nog steeds ploeg 0 tot ploeg 1 vangt op 2 s.
    expect(bezit(2)).toEqual([1, 0])
  })
})

describe('rondlopen: gevel, poorten en obstakels', () => {
  const g = GEVEL
  it('kent binnen en buiten', () => {
    expect(gevelAfstand(g, 0, 0)).toBeLessThan(0)
    expect(gevelAfstand(g, 0, g.B + 5)).toBeCloseTo(5)
    expect(gevelAfstand(g, g.A + 2, 0)).toBeCloseTo(2)
  })
  it('laat je enkel door een poort het stadion in', () => {
    const buiten = { x: 0, z: g.B + 1.5 }
    // Recht naar binnen door de hoofdingang: lukt.
    let p = buiten
    for (let i = 0; i < 12; i++) p = stap(g, [], p, { x: p.x, z: p.z - 0.4 })
    expect(p.z).toBeLessThan(g.B - 2)
    // Naast de poort: de muur houdt je tegen.
    let q = { x: 20, z: g.B + 1.5 }
    for (let i = 0; i < 12; i++) q = stap(g, [], q, { x: q.x, z: q.z - 0.4 })
    expect(q.z).toBeGreaterThan(g.B)
  })
  it('schuift langs een muur in plaats van vast te lopen', () => {
    const p = stap(g, [], { x: 20, z: g.B + 1.1 }, { x: 20.4, z: g.B + 0.7 })
    expect(p).toEqual({ x: 20.4, z: g.B + 1.1 })
  })
  it('houdt rekening met tribunes en gebouwen', () => {
    const tribune = { x0: -10, x1: 10, z0: 12, z1: 22 }
    expect(vrij(g, [tribune], 0, 15)).toBe(false)
    expect(vrij(g, [tribune], 0, 25)).toBe(true)
    expect(vrij(g, [], 0, WERELD_STRAAL + 1)).toBe(false)
  })
})
