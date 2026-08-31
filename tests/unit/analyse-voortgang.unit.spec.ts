import { describe, it, expect } from 'vitest'

import { voortgangStappen, type VoortgangInput } from '@/app/(frontend)/analyse/[id]/AnalyseVoortgang'

// Twee wegen naar een analyse, en het voortgangsbord moet de juiste volgen. Zet je de
// verkeerde stap in de lijst, dan blijft die eeuwig op onvoltooid staan en haalt de analyse
// nooit 100% — zonder dat er iets kapot lijkt.

const BASIS: VoortgangInput = {
  matchId: 1,
  worpen: 0,
  videoGekoppeld: true,
  ijkH1: false,
  ijkH2: false,
  tweedeHelftGespeeld: false,
  fysiekSpelers: 0,
  terreinOpgemeten: false,
  openVoorstellen: 0,
  kalibratiePunten: 14,
  kalibratieBeelden: 1,
  analyseStatus: 'klaar',
  analyseStand: 'gewoon',
  voorstellen: 20,
  beoordeeld: 20,
}

const titels = (i: Partial<VoortgangInput>) => voortgangStappen({ ...BASIS, ...i }).map((s) => s.titel)

describe('voortgangStappen — manueel aantekenen', () => {
  it('vraagt om aangetekende worpen', () => {
    expect(titels({ modus: 'manueel' }).some((t) => t.includes('aantekenen'))).toBe(true)
  })

  it('haalt geen 100% zolang er niets aangetekend is', () => {
    const s = voortgangStappen({ ...BASIS, modus: 'manueel', worpen: 0 })
    expect(s.every((x) => x.klaar)).toBe(false)
  })

  it('is rond met worpen, video, kalibratie en een analyse', () => {
    const s = voortgangStappen({ ...BASIS, modus: 'manueel', worpen: 42 })
    expect(s.every((x) => x.klaar)).toBe(true)
  })

  it('rekent het beoordelen niet mee — dat is hier extra', () => {
    const s = voortgangStappen({ ...BASIS, modus: 'manueel', worpen: 42, beoordeeld: 0 })
    expect(s.every((x) => x.klaar)).toBe(true)
  })
})

describe('voortgangStappen — alles uit de video', () => {
  it('vraagt niet om aangetekende worpen', () => {
    // Niemand tekent hier iets aan; dat vinkje zou nooit groen worden.
    expect(titels({ modus: 'video' }).some((t) => t.includes('aantekenen'))).toBe(false)
  })

  it('is rond zonder één ingevoerde worp', () => {
    const s = voortgangStappen({ ...BASIS, modus: 'video', worpen: 0 })
    expect(s.every((x) => x.klaar)).toBe(true)
  })

  it('vraagt wél om je oordeel over de voorstellen', () => {
    const s = voortgangStappen({ ...BASIS, modus: 'video', beoordeeld: 3, voorstellen: 20 })
    const oordeel = s.find((x) => x.titel.toLowerCase().includes('beoordel'))
    expect(oordeel).toBeDefined()
    expect(oordeel?.klaar).toBe(false)
  })

  it('telt het beoordelen pas als klaar wanneer er ook iets te beoordelen wás', () => {
    // Nul voorstellen én nul oordelen is niet "klaar" maar "er is nog niets".
    const s = voortgangStappen({ ...BASIS, modus: 'video', voorstellen: 0, beoordeeld: 0, analyseStatus: null })
    expect(s.find((x) => x.titel.toLowerCase().includes('beoordel'))?.klaar).toBe(false)
  })
})

describe('voortgangStappen — wat beide wegen delen', () => {
  it('vraagt altijd om een video en om een gekalibreerd veld', () => {
    for (const modus of ['manueel', 'video'] as const) {
      const t = titels({ modus })
      expect(t.some((x) => x.toLowerCase().includes('video'))).toBe(true)
      expect(t.some((x) => x.toLowerCase().includes('kalibr'))).toBe(true)
    }
  })

  it('rekent vier punten als genoeg om te kunnen meten', () => {
    // Vier is het minimum voor een homografie; minder kan niet omgerekend worden.
    const drie = voortgangStappen({ ...BASIS, modus: 'video', kalibratiePunten: 3 })
    const vier = voortgangStappen({ ...BASIS, modus: 'video', kalibratiePunten: 4 })
    expect(drie.find((s) => s.titel.toLowerCase().includes('kalibr'))?.klaar).toBe(false)
    expect(vier.find((s) => s.titel.toLowerCase().includes('kalibr'))?.klaar).toBe(true)
  })

  it('vraagt de ijking van de wedstrijdklok niet meer als stap', () => {
    // Bewust: die is nuttig om naar een doelpunt te springen, maar ze meet niets. Ze staat
    // sindsdien bij de extra's.
    for (const modus of ['manueel', 'video'] as const) {
      expect(titels({ modus }).some((t) => t.toLowerCase().includes('aftrap'))).toBe(false)
    }
  })
})
