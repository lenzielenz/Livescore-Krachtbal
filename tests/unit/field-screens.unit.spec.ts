import { describe, expect, it } from 'vitest'

import {
  MAX_VELDEN,
  MIN_VELDEN,
  VELDSCHERM_PRE_MATCH_LEAD_MS,
  fictionalDagplanning,
  isPairingCode,
  isVeldschermPreMatchLead,
  pairOutcome,
  planVeldenSync,
  randomPairingCode,
  veldNaam,
  type VeldRow,
} from '@/lib/field-screens'

// Veldschermen: één per fysiek veld bij een club, met een roterende koppelcode. Puur en getest —
// de DB-laag (field-screens-data.ts) en het datamodel (collections/FieldScreens.ts) leunen hierop.

describe('isPairingCode', () => {
  it('aanvaardt exact 6 cijfers', () => {
    expect(isPairingCode('482913')).toBe(true)
    expect(isPairingCode('000000')).toBe(true)
  })

  it('negeert omringende spaties', () => {
    expect(isPairingCode('  482913  ')).toBe(true)
  })

  it('weigert alles wat geen 6 cijfers is', () => {
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 345', '12345a']) {
      expect(isPairingCode(bad)).toBe(false)
    }
  })
})

describe('randomPairingCode', () => {
  it('genereert altijd een geldige code', () => {
    for (let i = 0; i < 50; i++) {
      expect(isPairingCode(randomPairingCode())).toBe(true)
    }
  })
})

describe('veldNaam', () => {
  it('nummert vanaf 1', () => {
    expect(veldNaam(1)).toBe('Veld 1')
    expect(veldNaam(2)).toBe('Veld 2')
  })
})

const row = (id: number, paired = false): VeldRow => ({ id, naam: veldNaam(id), paired })

describe('planVeldenSync', () => {
  it('maakt velden aan als er nog te weinig zijn', () => {
    const plan = planVeldenSync([], 2)
    expect(plan).toEqual({ toCreate: 2, toRemove: [], blockedByLive: [] })
  })

  it('doet niets als het aantal al klopt', () => {
    const plan = planVeldenSync([row(1), row(2)], 2)
    expect(plan).toEqual({ toCreate: 0, toRemove: [], blockedByLive: [] })
  })

  it('verwijdert het hoogste volgnummer eerst bij een verkleining', () => {
    const plan = planVeldenSync([row(1), row(2), row(3)], 1)
    expect(plan.toCreate).toBe(0)
    expect(plan.toRemove).toEqual([3, 2])
    expect(plan.blockedByLive).toEqual([])
  })

  it('slaat een gekoppeld veld over, verwijdert de rest en meldt het', () => {
    const plan = planVeldenSync([row(1), row(2, true), row(3)], 1)
    // Veld 2 (gekoppeld) blijft altijd staan; velden 3 en 1 mogen wél weg, en samen halen die het
    // doel van 1 veld — het overblijvende veld is toevallig veld 2, niet per se het laagste nummer.
    expect(plan.toRemove).toEqual([3, 1])
    expect(plan.blockedByLive).toEqual(['Veld 2'])
  })

  it('klemt het doel tussen MIN_VELDEN en MAX_VELDEN', () => {
    expect(planVeldenSync([], 0).toCreate).toBe(MIN_VELDEN)
    expect(planVeldenSync([], 999).toCreate).toBe(MAX_VELDEN)
  })
})

describe('isVeldschermPreMatchLead', () => {
  const kickoff = '2026-09-29T14:00:00.000Z'

  it('is nog gesloten ruim vóór de aftrap', () => {
    const now = new Date(kickoff).getTime() - VELDSCHERM_PRE_MATCH_LEAD_MS - 1000
    expect(isVeldschermPreMatchLead(kickoff, now)).toBe(false)
  })

  it('gaat open exact op het kwartier-venster', () => {
    const now = new Date(kickoff).getTime() - VELDSCHERM_PRE_MATCH_LEAD_MS
    expect(isVeldschermPreMatchLead(kickoff, now)).toBe(true)
  })

  it('blijft open na de aftrap', () => {
    const now = new Date(kickoff).getTime() + 1000
    expect(isVeldschermPreMatchLead(kickoff, now)).toBe(true)
  })

  it('geeft false zonder (geldige) datum', () => {
    expect(isVeldschermPreMatchLead(null)).toBe(false)
    expect(isVeldschermPreMatchLead(undefined)).toBe(false)
    expect(isVeldschermPreMatchLead('geen-datum')).toBe(false)
  })

  it('staat op 15 minuten', () => {
    expect(VELDSCHERM_PRE_MATCH_LEAD_MS).toBe(15 * 60 * 1000)
  })
})

describe('pairOutcome', () => {
  it('koppelt meteen op een vrij scherm', () => {
    expect(pairOutcome({ paired: false, queued: false })).toBe('pair')
    // een "queued"-vlag op een vrij scherm zou eigenlijk nooit voorkomen, maar paired wint hier hoe dan ook niet
    expect(pairOutcome({ paired: false, queued: true })).toBe('pair')
  })

  it('zet in de wachtrij op een bezet scherm zonder wachtrij', () => {
    expect(pairOutcome({ paired: true, queued: false })).toBe('queue')
  })

  it('weigert wanneer de wachtrij al bezet is', () => {
    expect(pairOutcome({ paired: true, queued: true })).toBe('queue-full')
  })
})

describe('fictionalDagplanning', () => {
  const now = new Date('2026-09-17T12:00:00.000Z')

  it('geeft een mix van afgelopen, live en geplande fictieve wedstrijden', () => {
    const plan = fictionalDagplanning(now, 'A')
    expect(plan).toHaveLength(4)
    expect(plan.map((m) => m.status)).toEqual(['finished', 'live', 'scheduled', 'scheduled'])
  })

  it('gebruikt uitsluitend negatieve id\'s, zodat ze nooit met een echte wedstrijd botsen', () => {
    const plan = fictionalDagplanning(now, 'A')
    for (const m of plan) expect(m.id).toBeLessThan(0)
  })

  it('zet tijden relatief t.o.v. `now`, in oplopende volgorde', () => {
    const plan = fictionalDagplanning(now, 'A')
    const times = plan.map((m) => new Date(m.time).getTime())
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
  })

  it('geeft elke wedstrijd dezelfde reeks mee, ook null', () => {
    expect(fictionalDagplanning(now, 'B').every((m) => m.reeks === 'B')).toBe(true)
    expect(fictionalDagplanning(now, null).every((m) => m.reeks === null)).toBe(true)
  })
})
