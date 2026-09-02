import { describe, it, expect } from 'vitest'

import { nieuweAnalyseBody, type NieuweAnalyseKeuze } from '@/lib/analyse-nieuw'

// Wat er meegaat bij het aanmaken van een analysewedstrijd.
//
// De melding: "ik maak de keuze om te automatiseren en dan lukt dit niet." De oorzaak zat hier:
// de kalenderweg stuurde enkel het wedstrijdnummer mee, zonder de gekozen modus. De server vult
// dan de standaard 'manueel' in, en daarna wijst alles naar de aantekentafel.

describe('body voor een nieuwe analysewedstrijd', () => {
  it('stuurt de gekozen modus mee vanuit de kalender', () => {
    const body = nieuweAnalyseBody({ bron: 'kalender', fromMatch: 12, modus: 'video' })
    expect(body).toEqual({ fromMatch: 12, modus: 'video' })
  })

  it('stuurt de gekozen modus mee bij een zelf samengestelde wedstrijd', () => {
    const body = nieuweAnalyseBody({
      bron: 'zelf', reeks: '1NAH', homeTeam: 3, awayTeam: 4, date: '2026-09-02T18:00:00.000Z', modus: 'video',
    })
    expect(body.modus).toBe('video')
    expect(body.homeTeam).toBe(3)
  })

  it('draagt de modus op élke weg — dat is precies wat er misging', () => {
    const wegen: NieuweAnalyseKeuze[] = [
      { bron: 'kalender', fromMatch: 1, modus: 'video' },
      { bron: 'kalender', fromMatch: 1, modus: 'manueel' },
      { bron: 'zelf', reeks: '1NAH', homeTeam: 1, awayTeam: 2, date: '2026-09-02T18:00:00.000Z', modus: 'video' },
      { bron: 'zelf', reeks: '1NAH', homeTeam: 1, awayTeam: 2, date: '2026-09-02T18:00:00.000Z', modus: 'manueel' },
    ]
    for (const weg of wegen) {
      expect(nieuweAnalyseBody(weg).modus, `${weg.bron}/${weg.modus} verliest de modus`).toBe(weg.modus)
    }
  })
})
