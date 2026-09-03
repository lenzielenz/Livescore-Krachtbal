import { describe, expect, it } from 'vitest'

import { naarInvoervelden, naarIso, nieuwSeizoen } from '@/lib/wedstrijd-beheer'

// Een wedstrijd rechtzetten. Wat hier bewaakt wordt is de tijdzone: de beheerder typt Belgische
// kloktijd, de database bewaart een UTC-instant. Wie dat door elkaar haalt, verschuift elke
// wedstrijd een of twee uur — een fout die je pas merkt wanneer de kantine leeg is.

describe('naarInvoervelden', () => {
  it('toont Belgische kloktijd, niet UTC — zomertijd', () => {
    // 12 september 2026, 17:30 in Brussel = 15:30 UTC (CEST, +2).
    expect(naarInvoervelden('2026-09-12T15:30:00.000Z')).toEqual({ datum: '2026-09-12', uur: '17:30' })
  })

  it('toont Belgische kloktijd, niet UTC — wintertijd', () => {
    // 12 december 2026, 17:30 in Brussel = 16:30 UTC (CET, +1).
    expect(naarInvoervelden('2026-12-12T16:30:00.000Z')).toEqual({ datum: '2026-12-12', uur: '17:30' })
  })

  it('rekent over middernacht heen naar de juiste dag', () => {
    // 31 december 2026 23:30 UTC is in Brussel al 1 januari 00:30.
    expect(naarInvoervelden('2026-12-31T23:30:00.000Z')).toEqual({ datum: '2027-01-01', uur: '00:30' })
  })

  it('geeft niets terug bij een onbruikbare waarde', () => {
    expect(naarInvoervelden(null)).toBeNull()
    expect(naarInvoervelden('geen datum')).toBeNull()
    expect(naarInvoervelden(undefined)).toBeNull()
  })
})

describe('naarIso', () => {
  it('leest Belgische kloktijd in — zomertijd', () => {
    expect(naarIso('2026-09-12', '17:30')).toEqual({ iso: '2026-09-12T15:30:00.000Z' })
  })

  it('leest Belgische kloktijd in — wintertijd', () => {
    expect(naarIso('2026-12-12', '17:30')).toEqual({ iso: '2026-12-12T16:30:00.000Z' })
  })

  it('is de omkering van naarInvoervelden', () => {
    for (const iso of ['2026-09-12T15:30:00.000Z', '2026-12-12T16:30:00.000Z', '2026-03-29T01:30:00.000Z']) {
      const velden = naarInvoervelden(iso)!
      expect(naarIso(velden.datum, velden.uur)).toEqual({ iso })
    }
  })

  it('aanvaardt een uur met één cijfer', () => {
    expect(naarIso('2026-09-12', '9:05')).toEqual({ iso: '2026-09-12T07:05:00.000Z' })
  })

  it('weigert een datum die niet bestaat in plaats van hem op te schuiven', () => {
    // Date maakt van 31 februari stilzwijgend 3 maart; een typfout hoort een fout te zijn.
    expect(naarIso('2026-02-31', '17:30')).toEqual({ fout: 'Die datum bestaat niet.' })
    expect(naarIso('2026-13-01', '17:30')).toEqual({ fout: 'Die datum bestaat niet.' })
  })

  it('weigert onleesbare invoer met een bruikbare melding', () => {
    expect(naarIso('12/09/2026', '17:30')).toEqual({ fout: 'Geef een datum als jjjj-mm-dd.' })
    expect(naarIso('2026-09-12', '17u30')).toEqual({ fout: 'Geef een uur als uu:mm.' })
    expect(naarIso('2026-09-12', '25:00')).toEqual({ fout: 'Dat uur bestaat niet.' })
    expect(naarIso('', '')).toEqual({ fout: 'Geef een datum als jjjj-mm-dd.' })
  })
})

describe('nieuwSeizoen', () => {
  it('schuift mee wanneer het seizoen automatisch afgeleid was', () => {
    // Van september 2026 (seizoen 2026-2027) naar mei 2026 (seizoen 2025-2026).
    expect(nieuwSeizoen('2026-09-12T15:30:00.000Z', '2026-05-12T15:30:00.000Z', '2026-2027')).toBe('2025-2026')
  })

  it('laat een handmatig gezet seizoen met rust', () => {
    // Het opgeslagen seizoen hoort niet bij de oude datum → iemand heeft het bewust gezet.
    expect(nieuwSeizoen('2026-09-12T15:30:00.000Z', '2026-05-12T15:30:00.000Z', '2019-2020')).toBeNull()
  })

  it('wijzigt niets wanneer het seizoen hetzelfde blijft', () => {
    expect(nieuwSeizoen('2026-09-12T15:30:00.000Z', '2026-10-12T15:30:00.000Z', '2026-2027')).toBeNull()
  })

  it('vult een leeg seizoen alsnog in', () => {
    expect(nieuwSeizoen('2026-09-12T15:30:00.000Z', '2026-09-19T15:30:00.000Z', '')).toBe('2026-2027')
    expect(nieuwSeizoen(null, '2026-09-19T15:30:00.000Z', null)).toBe('2026-2027')
  })
})
