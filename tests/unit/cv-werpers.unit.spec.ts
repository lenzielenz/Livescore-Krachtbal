import { describe, it, expect } from 'vitest'

import { dekking, groepeerWerpers, leesToewijzing, type Voorstelwerper } from '@/lib/cv-werpers'

// De worpen per werper groeperen. Het model leest geen rugnummers, maar het kan wél dezelfde
// persoon van beeld tot beeld volgen — en dát maakt "wie wierp wat" een handvol keuzes in plaats
// van er één per worp. Als deze groepering scheef staat, wijst iemand met de beste bedoelingen
// zestig worpen aan de verkeerde speler toe.

const v = (extra: Partial<Voorstelwerper>): Voorstelwerper => ({
  videoTimeS: 100,
  werper: 1,
  side: 'home',
  verdict: 'bevestigd',
  ...extra,
})

describe('groepeerWerpers', () => {
  it('zet de werper met het meeste werk bovenaan', () => {
    // Wie het vaakst wierp, wijs je eerst toe: dat is de grootste hap uit de wedstrijd.
    const g = groepeerWerpers([
      v({ werper: 2, videoTimeS: 10 }),
      v({ werper: 1, videoTimeS: 20 }),
      v({ werper: 1, videoTimeS: 30 }),
      v({ werper: 1, videoTimeS: 40 }),
    ])
    expect(g.map((x) => x.werper)).toEqual([1, 2])
    expect(g[0].worpen).toBe(3)
  })

  it('houdt bij hoeveel er al bevestigd zijn', () => {
    const g = groepeerWerpers([
      v({ werper: 5, verdict: 'bevestigd' }),
      v({ werper: 5, verdict: null }),
    ])
    expect(g[0].worpen).toBe(2)
    expect(g[0].bevestigd).toBe(1)
  })

  it('laat afgewezen voorstellen buiten de groep', () => {
    // Een afgewezen voorstel is geen worp; het mag het werk van een werper niet opblazen.
    const g = groepeerWerpers([v({ werper: 3 }), v({ werper: 3, verdict: 'afgewezen' })])
    expect(g[0].worpen).toBe(1)
  })

  it('negeert voorstellen zonder werper in plaats van ze bij iemand te tellen', () => {
    // Kon het model niemand volgen, dan weten we het niet — en dan hoort die worp nergens bij.
    expect(groepeerWerpers([v({ werper: null }), v({ werper: undefined })])).toEqual([])
  })

  it('laat één afwijkende meting de ploeg niet omgooien', () => {
    const g = groepeerWerpers([
      v({ werper: 1, side: 'home' }),
      v({ werper: 1, side: 'home' }),
      v({ werper: 1, side: 'away' }),
    ])
    expect(g[0].side).toBe('home')
  })

  it('zegt niets over de ploeg bij een gelijkspel', () => {
    const g = groepeerWerpers([v({ werper: 1, side: 'home' }), v({ werper: 1, side: 'away' })])
    expect(g[0].side).toBeNull()
  })

  it('bewaart wanneer deze werper voor het eerst en het laatst wierp', () => {
    const g = groepeerWerpers([
      v({ werper: 1, videoTimeS: 300 }),
      v({ werper: 1, videoTimeS: 100 }),
      v({ werper: 1, videoTimeS: 200 }),
    ])
    expect(g[0].eerste).toBe(100)
    expect(g[0].laatste).toBe(300)
  })

  it('middelt de plek op het veld als die gemeten is', () => {
    const g = groepeerWerpers([v({ werper: 1, yM: 10 }), v({ werper: 1, yM: 20 })])
    expect(g[0].gemiddeldeY).toBe(15)
    expect(groepeerWerpers([v({ werper: 2 })])[0].gemiddeldeY).toBeNull()
  })
})

describe('leesToewijzing', () => {
  it('leest een bewaarde toewijzing veilig uit', () => {
    expect(leesToewijzing({ '1': 42, '2': 43 })).toEqual({ '1': 42, '2': 43 })
  })

  it('weigert onzin in plaats van er een speler-id van te maken', () => {
    // Een speler-id van 0 of negatief bestaat niet, 'x' is geen werper, en 'zeven' is geen id.
    expect(leesToewijzing({ '1': 0, '2': -3, x: 5, '3': 'zeven' })).toEqual({})
    // Wat wél klopt blijft staan, ook tussen de onzin.
    expect(leesToewijzing({ '1': 0, '4': 42 })).toEqual({ '4': 42 })
  })

  it('geeft een lege toewijzing terug bij niets', () => {
    expect(leesToewijzing(null)).toEqual({})
    expect(leesToewijzing('nee')).toEqual({})
  })
})

describe('dekking', () => {
  it('zegt hoeveel worpen straks weten wie ze maakte', () => {
    // Dít is het getal dat telt vóór je overzet: zestig worpen en twee toegewezen werpers
    // betekent dat de rest op een gok terechtkomt.
    const groepen = groepeerWerpers([
      v({ werper: 1 }), v({ werper: 1 }), v({ werper: 1 }),
      v({ werper: 2 }),
    ])
    expect(dekking(groepen, { '1': 42 })).toEqual({ worpen: 4, toegewezen: 3, deel: 0.75 })
    expect(dekking(groepen, {}).deel).toBe(0)
  })

  it('deelt niet door nul zonder werpers', () => {
    expect(dekking([], {})).toEqual({ worpen: 0, toegewezen: 0, deel: 0 })
  })
})
