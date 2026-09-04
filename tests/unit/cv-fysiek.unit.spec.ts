import { execFileSync } from 'node:child_process'

import { describe, it, expect } from 'vitest'

import { CAMERA2_BASIS } from '@/lib/cv-samenvoegen'
import {
  bundelPerSpeler,
  fysiekPerSpoor,
  gladSpoor,
  leesPosities,
  leesSporenVingerafdruk,
  positiesVingerafdruk,
  spoorOverzicht,
  type Positie,
} from '@/lib/cv-fysiek'

// De fysieke telling op de server — de TypeScript-spiegel van cv/fysiek.py. Deze getallen komen
// op spelerskaarten terecht ("wie liep het meest"), dus de spiegels mogen niet uiteendrijven:
// dezelfde posities moeten in Python en TypeScript dezelfde meters opleveren.

/** Een spoor dat met vaste snelheid over het veld loopt, bemonsterd op `perS` metingen/s. */
function lijn(spoor: number, vanT: number, duurS: number, snelheidMS: number, perS = 4): Positie[] {
  const uit: Positie[] = []
  for (let i = 0; i <= duurS * perS; i++) {
    const t = vanT + i / perS
    uit.push({ t, spoor, xM: 2, yM: 5 + snelheidMS * (t - vanT) })
  }
  return uit
}

describe('leesPosities', () => {
  it('leest tracking-regels en namespacet camera 2', () => {
    const regels = [
      { t: 1.5, track: 3, x_m: 7, y_m: 20 },
      { t: 'kapot', track: 3, x_m: 7, y_m: 20 },
      { t: 2, track: 3.5, x_m: 7, y_m: 20 },
    ]
    expect(leesPosities(regels, 1)).toEqual([{ t: 1.5, spoor: 3, xM: 7, yM: 20 }])
    expect(leesPosities(regels, 2)[0].spoor).toBe(3 + CAMERA2_BASIS)
  })

  it('laat een spoornummer vallen dat de camera 2-basis raakt', () => {
    // Zo'n nummer kan niet meer eenduidig genamespacet worden: meenemen zou een camera 1-spoor
    // met een echt camera 2-spoor op dezelfde sleutel zetten — twee mensen op één spelerskaart.
    const regels = [{ t: 1, track: CAMERA2_BASIS + 2, x_m: 7, y_m: 20 }]
    expect(leesPosities(regels, 1)).toEqual([])
    expect(leesPosities(regels, 2)).toEqual([])
  })
})

describe('positiesVingerafdruk', () => {
  const posities: Positie[] = [
    { t: 1, spoor: 3, xM: 7, yM: 20 },
    { t: 2, spoor: 4, xM: 8, yM: 21 },
  ]

  it('verandert mee met de tracking-run, niet met de leesvolgorde', () => {
    // De spoornummers zijn een artefact van één run: een her-analyse geeft andere posities en
    // dus een andere vingerafdruk — precies waar de herrekening een oude toewijzing aan herkent.
    expect(positiesVingerafdruk([...posities].reverse())).toBe(positiesVingerafdruk(posities))
    expect(positiesVingerafdruk(posities)).not.toBe(
      positiesVingerafdruk([posities[0], { ...posities[1], spoor: 5 }]),
    )
    expect(positiesVingerafdruk(posities)).not.toBe(positiesVingerafdruk(posities.slice(0, 1)))
  })
})

describe('leesSporenVingerafdruk', () => {
  it('leest de gereserveerde sleutel en negeert al de rest', () => {
    expect(leesSporenVingerafdruk({ '3': 42, _posities: '2|3000|7|15000' })).toBe('2|3000|7|15000')
    expect(leesSporenVingerafdruk({ '3': 42 })).toBeNull()
    expect(leesSporenVingerafdruk(null)).toBeNull()
    expect(leesSporenVingerafdruk({ _posities: 17 })).toBeNull()
  })
})

describe('gladSpoor', () => {
  it('laat de tijdstempels staan en middelt enkel de positie', () => {
    const punten = [
      { t: 0, x: 0, y: 0 },
      { t: 0.25, x: 1, y: 0 },
      { t: 0.5, x: 0, y: 0 },
    ]
    const glad = gladSpoor(punten, 0.75)
    expect(glad.map((p) => p.t)).toEqual([0, 0.25, 0.5])
    // Het middelste punt ziet alle drie: (0+1+0)/3.
    expect(glad[1].x).toBeCloseTo(1 / 3, 9)
  })

  it('doet niets met een te kort spoor', () => {
    const punten = [
      { t: 0, x: 0, y: 0 },
      { t: 1, x: 5, y: 0 },
    ]
    expect(gladSpoor(punten)).toEqual(punten)
  })
})

describe('fysiekPerSpoor', () => {
  it('telt de meters van een rechte wandeling ongeveer als de echte lengte', () => {
    // 20 s aan 1,5 m/s = 30 m; de dode band meet een rechte lijn in koorden met dezelfde
    // totale lengte, dus dit moet er dicht bij zitten.
    const f = fysiekPerSpoor(lijn(1, 0, 20, 1.5))
    expect(f.get(1)!.afstandM).toBeGreaterThan(27)
    expect(f.get(1)!.afstandM).toBeLessThan(31)
    expect(f.get(1)!.sprints).toBe(0)
  })

  it('laat een stilstaande speler met meetruis niet "lopen"', () => {
    // Jitter van ±15 cm rond één plek, een minuut lang op 4/s: zonder dode band telde dit
    // honderden meters — precies de bug die RUIS_DREMPEL_M bestrijdt.
    const posities: Positie[] = []
    for (let i = 0; i < 240; i++) {
      posities.push({ t: i / 4, spoor: 1, xM: 7 + (i % 2 ? 0.15 : -0.15), yM: 20 })
    }
    expect(fysiekPerSpoor(posities).get(1)!.afstandM).toBeLessThan(2)
  })

  it('herkent een echte sprint, één keer per aaneengesloten stuk', () => {
    // 3 s aan 5 m/s, ruim boven de drempel van 4 m/s en langer dan de minimumduur.
    const f = fysiekPerSpoor(lijn(1, 0, 3, 5))
    expect(f.get(1)!.sprints).toBe(1)
    expect(f.get(1)!.topsnelheidMS).toBeGreaterThan(4)
  })

  it('slaat een teleportatie over in plaats van ze als sprint te tellen', () => {
    // Identiteitswissel: het spoor springt 12 m in een kwart seconde (48 m/s).
    const posities: Positie[] = [
      { t: 0, spoor: 1, xM: 2, yM: 5 },
      { t: 0.25, spoor: 1, xM: 2, yM: 5.2 },
      { t: 0.5, spoor: 1, xM: 2, yM: 17.2 },
      { t: 0.75, spoor: 1, xM: 2, yM: 17.4 },
    ]
    const f = fysiekPerSpoor(posities)
    expect(f.get(1)!.sprints).toBe(0)
    expect(f.get(1)!.afstandM).toBeLessThan(3)
  })

  it('telt geen afstand over een gat waarin het spoor zoek was', () => {
    const stuk1 = lijn(1, 0, 5, 1)
    const stuk2 = lijn(1, 60, 5, 1).map((p) => ({ ...p, yM: p.yM + 30 }))
    const f = fysiekPerSpoor([...stuk1, ...stuk2])
    // Twee stukken van ± 5 m; de 30 m sprong ertussen (gat van 55 s) telt niet.
    expect(f.get(1)!.afstandM).toBeLessThan(13)
  })
})

describe('bundelPerSpeler', () => {
  const spelers = new Map([
    [42, { team: 'thuis' as const, rugnummer: 7, naam: 'An' }],
    [43, { team: 'uit' as const, rugnummer: 3 }],
  ])

  it('telt meerdere sporen van dezelfde speler op (identiteitswissels, tweede camera)', () => {
    const perSpoor = new Map([
      [1, { afstandM: 100, sprints: 2, topsnelheidMS: 5, actieveS: 300 }],
      [1003, { afstandM: 50.5, sprints: 1, topsnelheidMS: 6.2, actieveS: 200 }],
    ])
    const { spelers: uit, anoniem } = bundelPerSpeler(perSpoor, { '1': 42, '1003': 42 }, spelers)
    expect(anoniem).toEqual([])
    expect(uit).toHaveLength(1)
    expect(uit[0]).toMatchObject({
      team: 'thuis', rugnummer: 7, naam: 'An',
      afstand_m: 150.5, sprints: 3, topsnelheid_m_s: 6.2, actieve_s: 500,
    })
  })

  it('houdt sporen zonder (geldige) toewijzing anoniem in plaats van ze stil te tellen', () => {
    const perSpoor = new Map([
      [1, { afstandM: 100, sprints: 0, topsnelheidMS: 3, actieveS: 300 }],
      [2, { afstandM: 80, sprints: 0, topsnelheidMS: 3, actieveS: 250 }],
    ])
    const { spelers: uit, anoniem } = bundelPerSpeler(perSpoor, { '1': 999 }, spelers)
    expect(uit).toEqual([])
    expect(anoniem).toEqual([1, 2])
  })
})

describe('spoorOverzicht', () => {
  it('zet het spoor met de meeste meters bovenaan, met camera en leefperiode als hint', () => {
    const posities = [...lijn(3, 10, 20, 1.5), ...lijn(CAMERA2_BASIS + 5, 0, 5, 1)]
    const overzicht = spoorOverzicht(posities)
    expect(overzicht[0].spoor).toBe(3)
    expect(overzicht[0].camera).toBe(1)
    expect(overzicht[0].eerste).toBe(10)
    expect(overzicht[1].camera).toBe(2)
  })
})

describe('pariteit Python ↔ TypeScript op de fysieke telling', () => {
  // Zelfde regressiegedachte als de afstands-pariteitstest in cv-naar-worp: dezelfde posities
  // door béide tellingen. fysiek.py is pure stdlib-Python, dus dit draait overal waar python3
  // staat. Drijven de spiegels uiteen, dan is dit rood.
  it('geeft op dezelfde posities dezelfde cijfers als cv/fysiek.py', () => {
    const posities: Positie[] = [
      ...lijn(1, 0, 20, 1.5), // wandeling
      ...lijn(2, 5, 3, 5), // sprint
      ...lijn(2, 30, 10, 0.5), // zelfde spoor, later traag stuk (gat van 22 s)
    ]
    const script = [
      'import json, sys',
      "sys.path.insert(0, 'cv')",
      'import fysiek',
      'rijen = json.loads(sys.argv[1])',
      'uit = fysiek.fysiek_per_spoor(rijen)',
      'print(json.dumps({str(k): v for k, v in uit.items()}))',
    ].join('\n')
    const rijen = posities.map((p) => ({ t: p.t, track: p.spoor, x_m: p.xM, y_m: p.yM }))
    const py = JSON.parse(
      execFileSync('python3', ['-c', script, JSON.stringify(rijen)], {
        cwd: process.cwd(),
        encoding: 'utf-8',
      }),
    ) as Record<string, { afstand_m: number; sprints: number; topsnelheid_m_s: number; actieve_s: number }>
    const ts = fysiekPerSpoor(posities)
    expect(Object.keys(py).length).toBe(ts.size)
    for (const [spoor, f] of ts) {
      const p = py[String(spoor)]
      expect(f.afstandM).toBeCloseTo(p.afstand_m, 6)
      expect(f.sprints).toBe(p.sprints)
      expect(f.topsnelheidMS).toBeCloseTo(p.topsnelheid_m_s, 6)
      expect(f.actieveS).toBeCloseTo(p.actieve_s, 6)
    }
  })
})
