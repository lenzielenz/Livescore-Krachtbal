import { describe, expect, it } from 'vitest'

import { beoordeelReset, beschrijfImpact, type ResetImpact } from '@/lib/match-reset-policy'

// Wie mag "↺ Niet gestart" gebruiken?
//
// Aanleiding: een clubverantwoordelijke kon de wedstrijd wél aantekenen maar niet terugzetten, en
// las een melding die zei dat hij aantekenaar moest zijn. Robin (2026-09-06): laat het toe zolang
// er nog niets aangetekend is — dan gooit terugzetten immers niets weg.

const leeg: ResetImpact = { worpen: 0, doelpunten: 0, kruisjes: 0, leeg: true }
const metWorpen: ResetImpact = { worpen: 12, doelpunten: 0, kruisjes: 0, leeg: false }
const metDoelpunten: ResetImpact = { worpen: 0, doelpunten: 3, kruisjes: 1, leeg: false }

const supporter = { magRechtzetten: false, magAantekenen: true, isFederatie: false }
const clubstaf = { magRechtzetten: true, magAantekenen: true, isFederatie: false }
const federatie = { magRechtzetten: true, magAantekenen: true, isFederatie: true }
const vreemde = { magRechtzetten: false, magAantekenen: false, isFederatie: false }

describe('beoordeelReset — niets ingevoerd', () => {
  it('laat wie de wedstrijd aantekent zelf terugzetten', () => {
    // De nieuwe regel. Dit is precies het geval waarvoor de knop bedoeld is: iemand drukte te
    // vroeg op start, er staat nog niets in, en dan hoeft daar geen federatie aan te pas te komen.
    expect(beoordeelReset({ ...supporter, impact: leeg })).toEqual({ ok: true })
    expect(beoordeelReset({ ...clubstaf, impact: leeg })).toEqual({ ok: true })
    expect(beoordeelReset({ ...federatie, impact: leeg })).toEqual({ ok: true })
  })

  it('weigert wie de wedstrijd sowieso niet mag bedienen', () => {
    const oordeel = beoordeelReset({ ...vreemde, impact: leeg })
    expect(oordeel.ok).toBe(false)
    expect(oordeel.ok === false && oordeel.reden).toMatch(/geen rechten/i)
  })
})

describe('beoordeelReset — er staat al iets in', () => {
  it('houdt de oude, strengere lat aan', () => {
    // Wat hier verandert is enkel de bodem, niet het plafond: zodra er iets aangetekend is,
    // blijft leegmaken voorbehouden aan de federatie.
    for (const impact of [metWorpen, metDoelpunten]) {
      expect(beoordeelReset({ ...supporter, impact }).ok).toBe(false)
      expect(beoordeelReset({ ...clubstaf, impact }).ok).toBe(false)
      expect(beoordeelReset({ ...federatie, impact })).toEqual({ ok: true })
    }
  })

  it('zegt tegen de aantekenaar wat er staat en bij wie hij moet zijn', () => {
    const oordeel = beoordeelReset({ ...clubstaf, impact: metWorpen })
    expect(oordeel.ok === false && oordeel.reden).toMatch(/12 worpen/)
    expect(oordeel.ok === false && oordeel.reden).toMatch(/federatie/)
  })

  it('legt aan een supporter-aantekenaar uit dat het net nog wél mocht', () => {
    const oordeel = beoordeelReset({ ...supporter, impact: metDoelpunten })
    expect(oordeel.ok === false && oordeel.reden).toMatch(/open livescore/i)
    expect(oordeel.ok === false && oordeel.reden).toMatch(/nog niets ingevoerd stond/i)
    expect(oordeel.ok === false && oordeel.reden).toMatch(/3 doelpunten/)
  })

  it('telt snelscore-doelpunten mee, ook zonder één worp', () => {
    // De oude teller keek enkel naar `throws`. Een snelscore-wedstrijd legt daar niets in vast,
    // dus tien doelpunten golden als "leeg" — terwijl een reset ze wél wist.
    expect(beoordeelReset({ ...clubstaf, impact: metDoelpunten }).ok).toBe(false)
  })
})

describe('beschrijfImpact', () => {
  it('noemt alleen wat er is', () => {
    expect(beschrijfImpact(leeg)).toBe('niets')
    expect(beschrijfImpact(metWorpen)).toBe('12 worpen')
    expect(beschrijfImpact({ worpen: 1, doelpunten: 0, kruisjes: 0, leeg: false })).toBe('1 worp')
    expect(beschrijfImpact(metDoelpunten)).toBe('3 doelpunten en 1 kruisje')
    expect(beschrijfImpact({ worpen: 2, doelpunten: 1, kruisjes: 3, leeg: false })).toBe(
      '2 worpen, 1 doelpunt en 3 kruisjes',
    )
  })
})
