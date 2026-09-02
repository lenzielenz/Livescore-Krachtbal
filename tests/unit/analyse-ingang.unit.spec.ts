import { describe, it, expect } from 'vitest'

import { analyseIngang } from '@/lib/analyse-ingang'

// Waar een analysewedstrijd je naartoe brengt als je erop klikt.
//
// De melding: "ik maak de keuze om te automatiseren en dan lukt dit niet. Eens ik eruit ga en
// terug die wedstrijd aanklik, dan kom ik op het manueel aantekenen en geraak ik niet meer naar
// het video platform." De keuze wérd bewaard; enkel de weg terug negeerde ze.

describe('ingang van een analysewedstrijd', () => {
  it('brengt de videoweg naar de analysepagina, niet naar de aantekentafel', () => {
    expect(analyseIngang(42, 'video', 'pending').pad).toBe('/analyse/42')
    // Ook wanneer de wedstrijd al op live staat: op deze weg tekent niemand iets aan.
    expect(analyseIngang(42, 'video', 'live').pad).toBe('/analyse/42')
    expect(analyseIngang(42, 'video', 'finished').pad).toBe('/analyse/42')
  })

  it('zegt op de kaart al waar je uitkomt', () => {
    expect(analyseIngang(42, 'video', 'pending').label).toContain('video')
    expect(analyseIngang(42, 'manueel', 'live').label).toContain('LIVE')
    expect(analyseIngang(42, 'manueel', 'pending').label).toContain('Activeren')
  })

  it('houdt de manuele weg op de aantekentafel', () => {
    expect(analyseIngang(7, 'manueel', 'pending').pad).toBe('/scorekeeper/7')
    expect(analyseIngang(7, 'manueel', 'live').pad).toBe('/scorekeeper/7')
  })

  it('valt zonder gekozen modus terug op de aantekentafel', () => {
    // Wedstrijden van vóór dit veld hebben geen modus; die zijn manueel aangetekend.
    expect(analyseIngang(7, null, 'pending').pad).toBe('/scorekeeper/7')
    expect(analyseIngang(7, undefined, 'pending').pad).toBe('/scorekeeper/7')
    expect(analyseIngang(7, '', 'pending').pad).toBe('/scorekeeper/7')
  })
})
