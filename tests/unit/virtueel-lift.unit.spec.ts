import { describe, expect, it } from 'vitest'

import { deurOp, liftStap, nieuweLift, type Lift, type LiftSpeler } from '@/lib/virtueel-lift'

// De lift in Virtueel krachtbal: deuren, oproepen, meerijden, uitstappen.

/** Laat de lift `s` seconden lopen met een vaste speler; geeft de lift en eventuele aankomst terug. */
function loop(l: Lift, s: number, speler: LiftSpeler) {
  // Zoals in de viewer: wie meerijdt, staat bij aankomst op het nieuwe verdiep.
  const sp = { ...speler }
  let aangekomen: 0 | 1 | null = null
  let hoogste = 0
  for (let t = 0; t < s; t += 0.05) {
    const r = liftStap(l, 0.05, sp)
    l = r.lift
    if (r.aangekomen != null) {
      aangekomen = r.aangekomen
      sp.verdiep = r.aangekomen
    }
    if (r.spelerHoogte != null) hoogste = Math.max(hoogste, r.spelerHoogte)
  }
  return { l, aangekomen, hoogste }
}

const weg: LiftSpeler = { verdiep: 0, inKooi: false, bijDeur: false }

describe('lift', () => {
  it('opent de deuren als je ervoor staat, en sluit ze weer als je weggaat', () => {
    let { l } = loop(nieuweLift(), 1.5, { verdiep: 0, inKooi: false, bijDeur: true })
    expect(l.toestand).toBe('open')
    expect(deurOp(l, 0)).toBe(1)
    expect(deurOp(l, 1)).toBe(0)
    ;({ l } = loop(l, 7, weg))
    expect(l.toestand).toBe('dicht')
  })

  it('brengt je naar boven als je instapt, en opent daar de deuren', () => {
    let { l } = loop(nieuweLift(), 1.5, { verdiep: 0, inKooi: false, bijDeur: true })
    const rit = loop(l, 7, { verdiep: 0, inKooi: true, bijDeur: false })
    expect(rit.aangekomen).toBe(1)
    expect(rit.hoogste).toBe(1)
    l = rit.l
    expect(l.hoogte).toBe(1)
    expect(deurOp(l, 1)).toBe(1)
  })

  it('rijdt niet opnieuw zolang je na aankomst blijft staan; wel na uit- en opnieuw instappen', () => {
    let { l } = loop(nieuweLift(), 1.5, { verdiep: 0, inKooi: false, bijDeur: true })
    ;({ l } = loop(l, 7, { verdiep: 0, inKooi: true, bijDeur: false }))
    // Aangekomen op 1: blijven staan in de kooi.
    const blijf = loop(l, 6, { verdiep: 1, inKooi: true, bijDeur: false })
    expect(blijf.aangekomen).toBeNull()
    expect(blijf.l.hoogte).toBe(1)
    // Even uitstappen, dan weer in: terug naar beneden.
    ;({ l } = loop(blijf.l, 0.3, { verdiep: 1, inKooi: false, bijDeur: true }))
    const terug = loop(l, 7, { verdiep: 1, inKooi: true, bijDeur: false })
    expect(terug.aangekomen).toBe(0)
    expect(terug.l.hoogte).toBe(0)
  })

  it('komt naar je toe als je haar oproept op het andere verdiep', () => {
    const { l, aangekomen } = loop(nieuweLift(), 6, { verdiep: 1, inKooi: false, bijDeur: true })
    expect(aangekomen).toBeNull()
    expect(l.hoogte).toBe(1)
    expect(deurOp(l, 1)).toBe(1)
  })

  it('gaat weer open als iemand instapt terwijl de deuren sluiten', () => {
    let { l } = loop(nieuweLift(), 1.5, { verdiep: 0, inKooi: false, bijDeur: true })
    ;({ l } = loop(l, 4.3, weg))
    expect(l.toestand).toBe('sluiten')
    ;({ l } = loop(l, 0.2, { verdiep: 0, inKooi: false, bijDeur: true }))
    expect(['openen', 'open']).toContain(l.toestand)
  })
})
