import { describe, expect, it } from 'vitest'

import { deurOp, liftStap, liftY, nieuweLift, verdiepBijY, VERDIEPEN, type Lift, type LiftSpeler } from '@/lib/virtueel-lift'

// De lift in Virtueel krachtbal: deuren, oproepen, een verdiep kiezen, meerijden.

/** Laat de lift `s` seconden lopen met een vaste speler; geeft de lift en eventuele aankomst terug. */
function loop(l: Lift, s: number, speler: LiftSpeler) {
  // Zoals in de viewer: wie meerijdt, staat bij aankomst op het nieuwe verdiep, en een aanvaarde
  // keuze wordt gewist.
  const sp = { ...speler }
  let aangekomen: number | null = null
  let hoogste = -Infinity
  let laagste = Infinity
  for (let t = 0; t < s; t += 0.05) {
    const r = liftStap(l, 0.05, sp)
    l = r.lift
    if (r.keuzeGebruikt) sp.keuze = null
    if (r.aangekomen != null) {
      aangekomen = r.aangekomen
      sp.verdiep = r.aangekomen
    }
    if (r.spelerHoogte != null) {
      hoogste = Math.max(hoogste, r.spelerHoogte)
      laagste = Math.min(laagste, r.spelerHoogte)
    }
  }
  return { l, aangekomen, hoogste, laagste, sp }
}

const weg: LiftSpeler = { verdiep: 0, inKooi: false, bijDeur: false, keuze: null }
const binnen = (verdiep: number, keuze: number | null = null): LiftSpeler => ({ verdiep, inKooi: true, bijDeur: false, keuze })

describe('lift', () => {
  it('opent de deuren als je ervoor staat, en sluit ze weer als je weggaat', () => {
    let { l } = loop(nieuweLift(), 1.5, { verdiep: 0, inKooi: false, bijDeur: true, keuze: null })
    expect(l.toestand).toBe('open')
    expect(deurOp(l, 0)).toBe(1)
    expect(deurOp(l, 1)).toBe(0)
    ;({ l } = loop(l, 7, weg))
    expect(l.toestand).toBe('dicht')
  })

  it('blijft open staan zolang je in de kooi staat zonder te kiezen', () => {
    let { l } = loop(nieuweLift(), 1.5, { verdiep: 0, inKooi: false, bijDeur: true, keuze: null })
    ;({ l } = loop(l, 10, binnen(0)))
    expect(l.toestand).toBe('open')
    expect(l.hoogte).toBe(0)
  })

  it('brengt je naar het verdiep dat je kiest, ook het dak en de kelder', () => {
    let { l } = loop(nieuweLift(), 1.5, { verdiep: 0, inKooi: false, bijDeur: true, keuze: null })
    const naarDak = loop(l, 12, binnen(0, 2))
    expect(naarDak.aangekomen).toBe(2)
    expect(naarDak.hoogste).toBe(2)
    l = naarDak.l
    expect(deurOp(l, 2)).toBe(1)
    const naarKelder = loop(l, 14, binnen(2, -1))
    expect(naarKelder.aangekomen).toBe(-1)
    expect(naarKelder.laagste).toBe(-1)
    expect(deurOp(naarKelder.l, -1)).toBe(1)
  })

  it('negeert een keuze voor het verdiep waar je al bent', () => {
    let { l } = loop(nieuweLift(), 1.5, { verdiep: 0, inKooi: false, bijDeur: true, keuze: null })
    const r = loop(l, 6, binnen(0, 0))
    expect(r.aangekomen).toBeNull()
    expect(r.l.toestand).toBe('open')
  })

  it('komt naar je toe als je haar oproept op een ander verdiep', () => {
    const { l, aangekomen } = loop(nieuweLift(), 8, { verdiep: -1, inKooi: false, bijDeur: true, keuze: null })
    expect(aangekomen).toBeNull()
    expect(l.hoogte).toBe(-1)
    expect(deurOp(l, -1)).toBe(1)
  })

  it('gaat weer open als iemand instapt terwijl de deuren sluiten', () => {
    let { l } = loop(nieuweLift(), 1.5, { verdiep: 0, inKooi: false, bijDeur: true, keuze: null })
    ;({ l } = loop(l, 4.3, weg))
    expect(l.toestand).toBe('sluiten')
    ;({ l } = loop(l, 0.2, { verdiep: 0, inKooi: false, bijDeur: true, keuze: null }))
    expect(['openen', 'open']).toContain(l.toestand)
  })

  it('rekent liftstanden om naar vloerhoogtes en terug', () => {
    for (const v of VERDIEPEN) {
      expect(liftY(v.nr)).toBeCloseTo(v.y)
      expect(verdiepBijY(v.y)).toBe(v.nr)
    }
    expect(liftY(0.5)).toBeCloseTo((VERDIEPEN[1].y + VERDIEPEN[2].y) / 2)
  })
})
