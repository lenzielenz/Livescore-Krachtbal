import { describe, it, expect } from 'vitest'

import { maakOverzetplan, naarNorm, opHetVeld, worpUitVoorstel, type Voorstelworp } from '@/lib/cv-naar-worp'
import { toMeters } from '@/lib/field'

// De vertaling van "wat het model in de video zag" naar "een worp in de wedstrijd". Hier zit de
// stilste foutbron van de hele video-weg: een verkeerd omgerekend punt crasht nergens, het legt
// gewoon elke landing op de verkeerde plek — en dan klopt de veldkaart, de afstand, de zone en
// het doelpunt allemaal niet, zonder één foutmelding.

const voorstel = (extra: Partial<Voorstelworp> = {}): Voorstelworp => ({
  videoTimeS: 100,
  eventType: 'worp',
  worpType: 'nek',
  side: 'home',
  rugnummer: 7,
  xM: 7,
  yM: 23,
  verdict: 'bevestigd',
  ...extra,
})

describe('naarNorm', () => {
  it('is de exacte omkering van toMeters — hetzelfde assenstelsel als de engine', () => {
    // cv/veld.py spiegelt src/lib/field.ts; wijkt deze omrekening af, dan spreken Python en
    // TypeScript stilletjes een ander veld.
    for (const p of [{ x: 0.25, y: 0.4 }, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.5 }]) {
      const m = toMeters(p, 10)
      const terug = naarNorm(m.x, m.y, 10)
      expect(terug.x).toBeCloseTo(p.x, 9)
      expect(terug.y).toBeCloseTo(p.y, 9)
    }
  })

  it('rekent met de échte terreinmaten als die ingevuld zijn', () => {
    // Een krap veld: 12 m breed. Dezelfde 6 m ligt dan op een andere genormaliseerde x.
    expect(naarNorm(6, 10, 10).x).toBeCloseTo(6 / 14, 9)
    expect(naarNorm(6, 10, 10, { breedteM: 12 }).x).toBeCloseTo(0.5, 9)
  })

  it('houdt de diepte van het doelgebied mee in de lengte', () => {
    // Totale lengte = 26 + 2 × diepte. Bij 15 m diepte is hetzelfde punt dus dichter bij het midden.
    expect(naarNorm(7, 23, 10).y).toBeCloseTo(23 / 46, 9)
    expect(naarNorm(7, 23, 15).y).toBeCloseTo(23 / 56, 9)
  })
})

describe('opHetVeld', () => {
  it('aanvaardt de randen en een kleine marge', () => {
    expect(opHetVeld({ x: 0, y: 0 })).toBe(true)
    expect(opHetVeld({ x: 1, y: 1 })).toBe(true)
    expect(opHetVeld({ x: 1.01, y: 0.5 })).toBe(true)
  })

  it('weigert een punt dat ver buiten het veld ligt', () => {
    // Zo'n punt betekent dat de meting niet deugt (scheve kalibratie), niet dat de bal uit ging —
    // een uitbal ligt nog altijd binnen het genormaliseerde veld.
    expect(opHetVeld({ x: 1.4, y: 0.5 })).toBe(false)
    expect(opHetVeld({ x: 0.5, y: -0.3 })).toBe(false)
  })
})

describe('worpUitVoorstel', () => {
  it('zet een bevestigd voorstel om', () => {
    const w = worpUitVoorstel(voorstel(), 10)
    expect(w).not.toBeNull()
    expect(w?.type).toBe('nek')
    expect(w?.tapCount).toBe(1)
    expect(w?.point.x).toBeCloseTo(0.5, 9)
    expect(w?.point.y).toBeCloseTo(0.5, 9)
    expect(w?.rugnummer).toBe(7)
  })

  it('vertaalt een vangst naar twee tikken — het enige dat je niet aan de plek ziet', () => {
    expect(worpUitVoorstel(voorstel({ eventType: 'vangst' }), 10)?.tapCount).toBe(2)
    // Een doelpunt is géén tweede tik: dat leidt de engine af uit het landingspunt.
    expect(worpUitVoorstel(voorstel({ eventType: 'doelpunt' }), 10)?.tapCount).toBe(1)
  })

  it('laat een niet-bevestigd voorstel liggen', () => {
    expect(worpUitVoorstel(voorstel({ verdict: null }), 10)).toBeNull()
    expect(worpUitVoorstel(voorstel({ verdict: 'afgewezen' }), 10)).toBeNull()
  })

  it('weigert een voorstel zonder landingspunt', () => {
    // Zonder kalibratie weet niets waar de bal viel; de engine zou dan een plek verzinnen.
    expect(worpUitVoorstel(voorstel({ xM: null, yM: null }), 10)).toBeNull()
  })

  it('weigert een landingspunt dat buiten het veld valt', () => {
    expect(worpUitVoorstel(voorstel({ xM: 40, yM: 23 }), 10)).toBeNull()
  })

  it('valt terug op de gewone nekworp als het type onbekend is', () => {
    expect(worpUitVoorstel(voorstel({ worpType: null }), 10)?.type).toBe('nek')
  })
})

describe('maakOverzetplan', () => {
  it('zet de worpen in videovolgorde — dat is de volgorde waarin gespeeld werd', () => {
    const plan = maakOverzetplan(
      [voorstel({ videoTimeS: 300 }), voorstel({ videoTimeS: 100 }), voorstel({ videoTimeS: 200 })],
      10,
    )
    expect(plan.worpen.map((w) => w.videoTimeS)).toEqual([100, 200, 300])
  })

  it('meldt wat er afvalt en waarom', () => {
    // Stilzwijgend weglaten is hoe je een wedstrijd van 60 worpen als 41 in de boeken krijgt.
    const plan = maakOverzetplan(
      [
        voorstel({ videoTimeS: 100 }),
        voorstel({ videoTimeS: 200, xM: null, yM: null }),
        voorstel({ videoTimeS: 300, verdict: null }),
        voorstel({ videoTimeS: 400, xM: 99, yM: 99 }),
      ],
      10,
    )
    expect(plan.worpen).toHaveLength(1)
    expect(plan.overgeslagen.map((o) => o.videoTimeS)).toEqual([200, 300, 400])
    expect(plan.overgeslagen[0].reden).toMatch(/landingspunt/i)
    expect(plan.overgeslagen[1].reden).toMatch(/beoordeeld/i)
    expect(plan.overgeslagen[2].reden).toMatch(/buiten het veld/i)
  })

  it('zwijgt over afgewezen voorstellen — die zijn een bewuste keuze, geen probleem', () => {
    const plan = maakOverzetplan([voorstel({ verdict: 'afgewezen' })], 10)
    expect(plan.worpen).toHaveLength(0)
    expect(plan.overgeslagen).toHaveLength(0)
  })
})
