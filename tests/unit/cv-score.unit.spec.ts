import { describe, it, expect } from 'vitest'

import { inWoorden, vergelijk, verschuiving } from '@/lib/cv-score'

// De scorekaart die zegt hoe goed het model het op een échte wedstrijd doet: de voorstellen
// naast de worpen die de aantekenaar invoerde. Hier wordt vastgelegd hoe er gekoppeld wordt,
// want daar zit de eerlijkheid: een detector die elke worp dubbel aanmeldt mag geen hogere
// score krijgen dan één die het één keer juist doet.

describe('vergelijk', () => {
  it('koppelt elke worp aan het dichtstbijzijnde voorstel', () => {
    const k = vergelijk([10, 20, 30], [10.4, 19.7, 30.2])
    expect(k.gevonden).toBe(3)
    expect(k.gemist).toBe(0)
    expect(k.vals).toBe(0)
    expect(k.recall).toBe(1)
    expect(k.precisie).toBe(1)
    expect(k.medianeAfwijking).toBeCloseTo(0.3, 5)
  })

  it('telt een worp buiten het venster als gemist', () => {
    const k = vergelijk([10, 50], [10.2])
    expect(k.gevonden).toBe(1)
    expect(k.gemist).toBe(1)
    expect(k.gemisteTijden).toEqual([50])
    expect(k.recall).toBeCloseTo(0.5, 5)
  })

  it('telt een voorstel zonder worp als vals alarm', () => {
    const k = vergelijk([10], [10.1, 33, 41])
    expect(k.gevonden).toBe(1)
    expect(k.vals).toBe(2)
    expect(k.precisie).toBeCloseTo(1 / 3, 5)
  })

  it('geeft een dubbel voorstel geen dubbele beloning', () => {
    // Twee voorstellen op dezelfde worp: één treffer, één valse. Anders scoort een detector
    // die alles twee keer aanmeldt kunstmatig goed.
    const k = vergelijk([10], [9.9, 10.1])
    expect(k.gevonden).toBe(1)
    expect(k.vals).toBe(1)
    expect(k.precisie).toBeCloseTo(0.5, 5)
    expect(k.recall).toBe(1)
  })

  it('kiest bij twijfel het dichtste paar, niet het eerste', () => {
    // Voorstel op 10,9 ligt dichter bij worp 11 dan bij worp 10; de koppeling moet dat volgen.
    const k = vergelijk([10, 11], [10.9])
    expect(k.koppelingen).toHaveLength(1)
    expect(k.koppelingen[0].worp).toBe(1)
    expect(k.gemisteTijden).toEqual([10])
  })

  it('respecteert een eigen venster', () => {
    expect(vergelijk([10], [12.5]).gevonden).toBe(0)
    expect(vergelijk([10], [12.5], 3.0).gevonden).toBe(1)
  })

  it('houdt de verhoudingen leeg als er niets te vergelijken valt', () => {
    const leeg = vergelijk([], [])
    expect(leeg.precisie).toBeNull()
    expect(leeg.recall).toBeNull()
    expect(leeg.f1).toBeNull()
    expect(leeg.medianeAfwijking).toBeNull()
    // Nul procent recall melden terwijl er niets getagd is, zou onzin zijn.
    expect(vergelijk([], [5, 9]).recall).toBeNull()
  })

  it('rekent de f1 uit als beide kanten er zijn', () => {
    const k = vergelijk([10, 20, 30, 40], [10.1, 20.1, 77])
    expect(k.precisie).toBeCloseTo(2 / 3, 5)
    expect(k.recall).toBeCloseTo(0.5, 5)
    expect(k.f1).toBeCloseTo((2 * (2 / 3) * 0.5) / (2 / 3 + 0.5), 5)
  })
})

describe('inWoorden', () => {
  it('zegt in één zin hoe het ervoor staat', () => {
    const zin = inWoorden(vergelijk([10, 20, 30, 40], [10.1, 20.1, 77]))
    expect(zin).toContain('4 ingevoerde worpen')
    expect(zin).toContain('2')
    expect(zin).toMatch(/50%/)
  })

  it('zegt het gewoon als er nog niets te vergelijken valt', () => {
    expect(inWoorden(vergelijk([], [1, 2]))).toMatch(/nog geen worpen/i)
    expect(inWoorden(vergelijk([1, 2], []))).toMatch(/nog geen voorstellen/i)
  })
})

describe('verschuiving', () => {
  // Nul treffers zegt op zich niets: het model kan niets gevonden hebben, óf de ijking van de
  // video staat scheef. Dit getal maakt het verschil zichtbaar.
  it('vindt een stelselmatige verschuiving die het venster ver overschrijdt', () => {
    const worpen = [100, 200, 300]
    const voorstellen = worpen.map((w) => w + 620)
    expect(vergelijk(worpen, voorstellen).gevonden).toBe(0)
    expect(verschuiving(worpen, voorstellen)).toBeCloseTo(620, 5)
  })

  it('geeft ongeveer nul als de tijden gewoon kloppen', () => {
    expect(verschuiving([10, 20, 30], [10.2, 19.9, 30.1])).toBeCloseTo(0.1, 5)
  })

  it('herkent ook een voorstel dat te vroeg ligt', () => {
    expect(verschuiving([500, 600], [200, 300])).toBeCloseTo(-300, 5)
  })

  it('zegt niets zonder één van beide lijsten', () => {
    expect(verschuiving([], [1, 2])).toBeNull()
    expect(verschuiving([1, 2], [])).toBeNull()
  })

  it('zegt niets als er geen patroon in zit', () => {
    // Willekeurige voorstellen: geen twee paren die het over hetzelfde verschil eens zijn.
    expect(verschuiving([10, 200, 900], [57, 431, 1503])).toBeNull()
  })
})
