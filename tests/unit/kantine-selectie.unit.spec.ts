import { describe, expect, it } from 'vitest'

import {
  GEPLAND_DAGEN,
  ontdubbel,
  sanitizeKantineSelectie,
  schermVenster,
  selectieIsLeeg,
  sorteerSchermWedstrijden,
} from '@/lib/kantine-selectie'

// Het persoonlijke kantinescherm: elke ingelogde gebruiker stelt zijn eigen tv-scherm samen.
// De keuze staat als json op het profiel, dus er kan van alles in staan — en het scherm hangt in
// een kantine waar niemand een foutmelding gaat oplossen. Vandaar: nooit gooien, altijd iets tonen.

describe('sanitizeKantineSelectie', () => {
  it('leest een normale keuze', () => {
    expect(sanitizeKantineSelectie({ clubIds: [7], teamIds: [12, 13], matchIds: [900] })).toEqual({
      clubIds: [7],
      teamIds: [12, 13],
      matchIds: [900],
    })
  })

  it('overleeft rommel zonder te gooien', () => {
    for (const rommel of [null, undefined, 0, 'nee', [], { clubIds: 'x' }, { teamIds: null }]) {
      expect(() => sanitizeKantineSelectie(rommel)).not.toThrow()
      expect(sanitizeKantineSelectie(rommel)).toEqual({ clubIds: [], teamIds: [], matchIds: [] })
    }
  })

  it('gooit onzin-ids weg en ontdubbelt', () => {
    expect(sanitizeKantineSelectie({ clubIds: [7, 7, '8', 0, -3, null, NaN, 'abc'] }).clubIds).toEqual([7, 8])
  })

  it('kapt een absurd lange lijst af', () => {
    const veel = Array.from({ length: 500 }, (_, i) => i + 1)
    expect(sanitizeKantineSelectie({ matchIds: veel }).matchIds).toHaveLength(50)
  })

  it('herkent een lege keuze', () => {
    expect(selectieIsLeeg(sanitizeKantineSelectie(null))).toBe(true)
    expect(selectieIsLeeg(sanitizeKantineSelectie({ clubIds: [7] }))).toBe(false)
    expect(selectieIsLeeg(sanitizeKantineSelectie({ matchIds: [1] }))).toBe(false)
  })
})

describe('schermVenster', () => {
  it('start gisteren (eindstand blijft staan) en loopt tot een week vooruit', () => {
    const { dagStart, dagEinde, geplandTot } = schermVenster(new Date('2026-09-06T14:00:00Z'))
    expect(dagStart < dagEinde).toBe(true)
    expect(geplandTot > dagEinde).toBe(true)
    // dagStart is exact één dag vóór het einde van vandaag min de speeldag zelf: gisteren 00:00.
    const dagenTerug = (new Date(dagEinde).getTime() - new Date(dagStart).getTime()) / 86_400_000
    expect(Math.round(dagenTerug)).toBe(2)
    // Vanaf het einde van vandaag telt het nog steeds de volledige GEPLAND_DAGEN vooruit.
    const dagenVooruit = (new Date(geplandTot).getTime() - new Date(dagEinde).getTime()) / 86_400_000 + 1
    expect(Math.round(dagenVooruit)).toBe(GEPLAND_DAGEN)
  })
})

describe('sorteerSchermWedstrijden', () => {
  const dagEinde = '2026-09-06T22:00:00.000Z'

  it('zet wat bezig is bovenaan, dan wat vandaag nog komt, dan de uitslagen, dan de rest van de week', () => {
    const uit = sorteerSchermWedstrijden(
      [
        { id: 4, status: 'scheduled', date: '2026-09-09T18:00:00.000Z' }, // later deze week
        { id: 3, status: 'finished', date: '2026-09-06T12:00:00.000Z' }, // vandaag gespeeld
        { id: 2, status: 'scheduled', date: '2026-09-06T19:00:00.000Z' }, // vandaag nog
        { id: 1, status: 'live', date: '2026-09-06T15:00:00.000Z' },
      ],
      dagEinde,
    )
    expect(uit.map((m) => m.id)).toEqual([1, 2, 3, 4])
  })

  it('houdt binnen dezelfde groep de chronologie aan', () => {
    const uit = sorteerSchermWedstrijden(
      [
        { id: 2, status: 'live', date: '2026-09-06T16:00:00.000Z' },
        { id: 1, status: 'live', date: '2026-09-06T15:00:00.000Z' },
      ],
      dagEinde,
    )
    expect(uit.map((m) => m.id)).toEqual([1, 2])
  })

  it('laat de invoer met rust', () => {
    const invoer = [{ id: 2, status: 'live' }, { id: 1, status: 'live' }]
    sorteerSchermWedstrijden(invoer, dagEinde)
    expect(invoer.map((m) => m.id)).toEqual([2, 1])
  })
})

describe('ontdubbel', () => {
  it('houdt de eerste voorkomst — de drie lagen overlappen', () => {
    // Een wedstrijd van je eigen club die je óók los aanvinkte, hoort er één keer op.
    expect(ontdubbel([{ id: 1 }, { id: 2 }, { id: 1 }]).map((m) => m.id)).toEqual([1, 2])
  })
})
