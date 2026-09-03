import { execFileSync } from 'node:child_process'

import { describe, it, expect } from 'vitest'

import {
  afstandUitEvent,
  afstandVanWorp,
  maakOverzetplan,
  naarNorm,
  opHetVeld,
  richtingTekst,
  richtingUitEvent,
  richtingVanWorp,
  worpUitVoorstel,
  type Voorstelworp,
} from '@/lib/cv-naar-worp'
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

  it('laat de vanger enkel meereizen op een échte vangst', () => {
    // De reviewlaan kan zeggen wíe ving (rugnummer); op een gewone worp is dat stille rommel.
    expect(worpUitVoorstel(voorstel({ eventType: 'vangst', vangerRugnummer: 8 }), 10)?.vangerRugnummer).toBe(8)
    expect(worpUitVoorstel(voorstel({ eventType: 'worp', vangerRugnummer: 8 }), 10)?.vangerRugnummer).toBeNull()
    expect(worpUitVoorstel(voorstel({ eventType: 'vangst' }), 10)?.vangerRugnummer).toBeNull()
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

describe('afstandUitEvent — de engine is de baas over de afstand', () => {
  // De doorlichting-upgrade: er waren twéé afstandsberekeningen (landing.py in Python, field.ts
  // in de app) en twee bronnen van waarheid drijven onvermijdelijk uiteen. Voortaan levert de
  // CV enkel werpplaats + landingspunt; de import rekent de afstand met de field.ts-machinerie.

  it('berekent de afstand uit werpplaats + landingspunt en negeert het Python-getal', () => {
    // Regressiewacht: het event draagt een bewust FOUT afstand_m mee. Zou de import dat getal
    // nog overnemen, dan kwam hier 99.9 uit in plaats van de 10 m die field.ts berekent.
    const e = {
      werpplaats: { x_m: 7, y_m: 20 },
      zone: { in_doelgebied: false, x_m: 7, y_m: 30 },
      afstand_m: 99.9,
    }
    expect(afstandUitEvent(e, 10)).toBeCloseTo(10, 9)
  })

  it('geeft zonder werpplaats geen afstand', () => {
    // Zonder werpplaats valt er niets reglementairs te meten — zoals voorheen zonder afstand_m.
    expect(afstandUitEvent({ zone: { x_m: 7, y_m: 30 }, afstand_m: 12.3 }, 10)).toBeNull()
    expect(afstandUitEvent({ werpplaats: { x_m: 7 }, zone: { x_m: 7, y_m: 30 } }, 10)).toBeNull()
  })

  it('geeft een uitbal geen afstand — het reglement kent geen afstand voor een uitworp', () => {
    // Een uitbal heeft geen zone maar wél uitbal_x_m/uitbal_y_m; ook mét werpplaats en zelfs
    // een meegestuurd afstand_m blijft de afstand leeg.
    const e = {
      uitbal: true,
      uitbal_x_m: 7,
      uitbal_y_m: 48,
      werpplaats: { x_m: 7, y_m: 20 },
      afstand_m: 28,
    }
    expect(afstandUitEvent(e, 10)).toBeNull()
  })

  it('past §6.4 zelf toe op de werpplaats — ook als de CV-kant dat zou vergeten', () => {
    // Werpplaats (7, 12) ligt in de band doellijn–vrijeworplijn (10–14): de engine schuift
    // hem naar 14 en meet 16 m naar (7, 30). Voor een al geprojecteerde werpplaats is de
    // projectie idempotent, dus de gewone route rekent identiek.
    expect(afstandUitEvent({ werpplaats: { x_m: 7, y_m: 12 }, zone: { x_m: 7, y_m: 30 } }, 10)).toBeCloseTo(16, 9)
  })

  it('rekent met de diepte van de wedstrijd', () => {
    // Bij diepte 15 loopt de band tot 19 m: werpplaats (6, 16) schuift naar 19 → 12 m naar
    // (6, 31). Bij diepte 10 ligt (6, 16) vrij en blijft het 15 m.
    const e = { werpplaats: { x_m: 6, y_m: 16 }, zone: { x_m: 6, y_m: 31 } }
    expect(afstandUitEvent(e, 15)).toBeCloseTo(12, 9)
    expect(afstandUitEvent(e, 10)).toBeCloseTo(15, 9)
  })
})

describe('pariteit Python ↔ TypeScript op de afstand', () => {
  // Dé regressietest tegen de divergentie: dezelfde invoer door béide paden. De Python-kant
  // (landing.py: projecteer_vrijeworplijn + euclidische afstand — wat afstand_m in het
  // CLI-rapport oplevert) moet exact hetzelfde geven als de TS-kant (projectWerpplaats +
  // distanceM — wat in de app opgeslagen wordt). Drijven ze uiteen, dan is dit rood.
  it('geeft op dezelfde punten hetzelfde getal als landing.py', () => {
    const punten = [
      // midden veld, diepte 10
      { werp: [7, 20], land: [7, 30], diepte: 10, breedte: 14, speelveld: 26 },
      // landing in het doelgebied
      { werp: [4, 18], land: [6.5, 40.2], diepte: 10, breedte: 14, speelveld: 26 },
      // §6.4: werpplaats in de band aan de thuis-kant (10–14) → vrijeworplijn
      { werp: [7, 12], land: [7, 33], diepte: 10, breedte: 14, speelveld: 26 },
      // §6.4: band aan de uit-kant (32–36 op een veld van 46) → terug tot 32
      { werp: [10, 33.5], land: [10, 12], diepte: 10, breedte: 14, speelveld: 26 },
      // vanuit het eigen doelgebied (y < diepte): §6.4 laat de plaats staan
      { werp: [7, 8], land: [10, 24], diepte: 10, breedte: 14, speelveld: 26 },
      // niet-reglementair terrein: diepte 15, breedte 13, speelveld 25
      { werp: [6, 17], land: [6, 40], diepte: 15, breedte: 13, speelveld: 25 },
    ]
    const script = [
      'import json, math, sys',
      "sys.path.insert(0, 'cv')",
      'import landing',
      'uit = []',
      'for p in json.loads(sys.argv[1]):',
      "    sx, sy = p['werp']",
      "    lx, ly = p['land']",
      "    sy = landing.projecteer_vrijeworplijn(sy, p['diepte'], p['speelveld'])",
      '    uit.append(math.hypot(lx - sx, ly - sy))',
      'print(json.dumps(uit))',
    ].join('\n')
    const py = JSON.parse(
      execFileSync('python3', ['-c', script, JSON.stringify(punten)], {
        cwd: process.cwd(),
        encoding: 'utf-8',
      }),
    ) as number[]
    expect(py).toHaveLength(punten.length)
    punten.forEach((p, i) => {
      const ts = afstandVanWorp(
        { xM: p.werp[0], yM: p.werp[1] },
        { xM: p.land[0], yM: p.land[1] },
        p.diepte,
        { breedteM: p.breedte, speelveldM: p.speelveld },
      )
      expect(ts).toBeCloseTo(py[i], 9)
    })
  })
})

describe('uitballen door de brug', () => {
  // De blokkerende vondst uit de doorlichting: de landing werd op de veldrand geklemd en elke
  // uitbal telde als doelpunt. Nu draagt een uitbal zijn echte punt buiten de lijnen, en moet
  // dat punt ONGEKLEMD door de brug — precies daaruit leidt de engine out_side/out_back af.
  const uitbal = (xM: number, yM: number) => ({
    videoTimeS: 100, eventType: 'worp' as const, xM, yM, uitbal: true,
    verdict: 'bevestigd' as const,
  })

  it('laat het punt van een uitbal buiten de lijnen staan', () => {
    // 2 m voorbij de achterlijn van een veld van 46 m (y-norm > 1).
    const w = worpUitVoorstel(uitbal(7, 48), 10)
    expect(w).not.toBeNull()
    expect(w!.point.y).toBeGreaterThan(1)
  })

  it('weigert een uitbal-punt dat te ver weg ligt om geloofwaardig te zijn', () => {
    // 30 m naast het veld is geen uitbal maar een kapotte projectie.
    expect(worpUitVoorstel(uitbal(44, 20), 10)).toBeNull()
  })

  it('klemt een gewone worp nog steeds op het veld', () => {
    const w = worpUitVoorstel({ videoTimeS: 5, eventType: 'worp', xM: 7, yM: 45.9, verdict: 'bevestigd' }, 10)
    expect(w).not.toBeNull()
    expect(w!.point.y).toBeLessThanOrEqual(1)
  })

  it('blijft een punt buiten het veld zónder uitbal-vlag weigeren', () => {
    // Buiten zonder vlag betekent: de meting deugt niet — geen worp van maken.
    expect(worpUitVoorstel({ videoTimeS: 5, eventType: 'worp', xM: 7, yM: 48, verdict: 'bevestigd' }, 10)).toBeNull()
  })
})

// De richting van een worp.
//
// "Ook de afstand en de richting" — de afstand stond er al, de richting nergens. Ze komt uit
// hetzelfde paar punten (werpplaats en landing) en moet dus ook langs dezelfde §6.4-projectie
// lopen: anders beschrijven "hoe ver" en "welke kant op" niet dezelfde worp.
//
// De assen zijn die van het VELD, niet die van de aanvallende ploeg: 0° recht naar de uitkant,
// +90° naar de rechterzijlijn (links is x=0 — sta op de thuis-achterlijn en kijk naar uit).
describe('richtingVanWorp', () => {
  // Een veld van 14 m breed; y loopt van de thuis-achterlijn (0) naar de uitkant.
  const van = { xM: 7, yM: 20 }

  it('noemt recht naar de uitkant nul graden', () => {
    expect(richtingVanWorp(van, { xM: 7, yM: 35 })).toBe(0)
  })

  it('telt naar rechts positief en naar links negatief', () => {
    expect(richtingVanWorp(van, { xM: 12, yM: 25 })).toBeGreaterThan(0)
    expect(richtingVanWorp(van, { xM: 2, yM: 25 })).toBeLessThan(0)
    // Symmetrisch: even ver naar links is exact het spiegelbeeld van even ver naar rechts.
    expect(richtingVanWorp(van, { xM: 12, yM: 25 })).toBeCloseTo(
      -(richtingVanWorp(van, { xM: 2, yM: 25 }) as number), 6,
    )
  })

  it('legt dwars op de lengte-as op ±90°', () => {
    expect(richtingVanWorp(van, { xM: 13, yM: 20 })).toBeCloseTo(90, 6)
    expect(richtingVanWorp(van, { xM: 1, yM: 20 })).toBeCloseTo(-90, 6)
  })

  it('geeft ±180° voor een bal die terug naar de thuiskant gaat', () => {
    expect(Math.abs(richtingVanWorp(van, { xM: 7, yM: 5 }) as number)).toBeCloseTo(180, 6)
  })

  it('geeft niets terug wanneer er geen richting ís', () => {
    // Landen op je eigen vertrekpunt is meetruis, geen worp; atan2 zou er een willekeurige
    // hoek van maken.
    expect(richtingVanWorp({ xM: 7, yM: 20 }, { xM: 7, yM: 20 })).toBeNull()
  })

  it('vertrekt van dezelfde geprojecteerde werpplaats als de afstand', () => {
    // Een werpplaats ín het eigen doelgebied wordt door §6.4 naar de vrijeworplijn geschoven.
    // Als de richting die projectie zou overslaan, wijzen afstand en richting naar twee
    // verschillende worpen — precies het soort stille tegenspraak dat niemand opmerkt.
    const diep = { xM: 7, yM: 2 }
    const naar = { xM: 7, yM: 30 }
    const richting = richtingVanWorp(diep, naar)
    expect(richting).toBe(0) // recht vooruit blijft recht vooruit
    // En een schuine worp uit datzelfde punt: het teken moet de kant volgen, niet het ruwe punt.
    expect(richtingVanWorp(diep, { xM: 12, yM: 30 })).toBeGreaterThan(0)
  })
})

describe('richtingUitEvent', () => {
  const veld = { werpplaats: { x_m: 7, y_m: 20 } }

  it('leest de landing uit de zone', () => {
    expect(richtingUitEvent({ ...veld, zone: { x_m: 7, y_m: 30 } })).toBe(0)
  })

  it('geeft een uitbal wél een richting, ook al krijgt hij geen afstand', () => {
    // Het reglement kent geen worpafstand voor een bal die buiten eindigt — maar "welke kant
    // ging hij uit" is juist dán het interessante.
    const uit = { ...veld, uitbal: true, uitbal_x_m: 16, uitbal_y_m: 24 }
    expect(afstandUitEvent(uit)).toBeNull()
    expect(richtingUitEvent(uit)).toBeGreaterThan(0)
  })

  it('geeft niets zonder werpplaats of zonder landing', () => {
    expect(richtingUitEvent({ zone: { x_m: 7, y_m: 30 } })).toBeNull()
    expect(richtingUitEvent(veld)).toBeNull()
  })

  it('negeert een landing met onvolledige coördinaten', () => {
    expect(richtingUitEvent({ ...veld, zone: { x_m: 7 } })).toBeNull()
  })
})

describe('richtingTekst', () => {
  it('zet graden om in iets wat een aantekenaar leest', () => {
    expect(richtingTekst(0)).toBe('recht vooruit')
    expect(richtingTekst(-8)).toBe('recht vooruit')
    expect(richtingTekst(40)).toBe('schuin naar rechts')
    expect(richtingTekst(-40)).toBe('schuin naar links')
    expect(richtingTekst(90)).toBe('dwars naar rechts')
    expect(richtingTekst(-130)).toBe('schuin achteruit links')
    expect(richtingTekst(180)).toBe('terug naar achter')
  })

  it('zwijgt wanneer er geen richting is', () => {
    expect(richtingTekst(null)).toBeNull()
    expect(richtingTekst(undefined)).toBeNull()
    expect(richtingTekst(Number.NaN)).toBeNull()
  })
})
