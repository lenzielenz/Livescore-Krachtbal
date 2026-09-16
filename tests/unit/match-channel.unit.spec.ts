import { describe, expect, it } from 'vitest'

import type { Payload } from 'payload'

import { addInstant, joinMatch, recenteInstants } from '@/lib/match-channel'

// Stub volstaat: pollScore/hydrate vangen elke fout zelf op (best-effort), en de teller-logica
// die we hier testen raakt de database nooit aan.
const stubPayload = {} as unknown as Payload

function collector() {
  const events: { event: string; data: unknown }[] = []
  const send = (event: string, data: unknown) => {
    events.push({ event, data })
  }
  const lastViewers = () => {
    const v = [...events].reverse().find((e) => e.event === 'viewers')
    return (v?.data as { count?: number } | undefined)?.count
  }
  return { send, lastViewers }
}

describe('match-channel kijkersteller (het oogje)', () => {
  it('telt personen per browser-id — meerdere tabbladen van dezelfde persoon tellen één keer', () => {
    const tabA1 = collector()
    const tabA2 = collector()
    const veldscherm = collector()
    const persoonB = collector()

    const leaveA1 = joinMatch(stubPayload, 990001, tabA1.send, 'browser-a')
    const leaveA2 = joinMatch(stubPayload, 990001, tabA2.send, 'browser-a') // 2e tabblad, zelfde persoon
    const leaveVeld = joinMatch(stubPayload, 990001, veldscherm.send, null) // passief scherm: telt niet
    expect(veldscherm.lastViewers()).toBe(1)

    const leaveB = joinMatch(stubPayload, 990001, persoonB.send, 'browser-b')
    expect(persoonB.lastViewers()).toBe(2)

    leaveA1() // één tabblad dicht → persoon A kijkt nog altijd
    expect(persoonB.lastViewers()).toBe(2)
    leaveA2() // laatste tabblad van A dicht → enkel B blijft over
    expect(persoonB.lastViewers()).toBe(1)

    leaveVeld()
    leaveB()
  })

  it('valt zonder browser-id terug op één kijker per verbinding', () => {
    const x = collector()
    const y = collector()
    const leaveX = joinMatch(stubPayload, 990002, x.send)
    const leaveY = joinMatch(stubPayload, 990002, y.send)
    expect(y.lastViewers()).toBe(2)
    leaveX()
    leaveY()
  })
})

describe('match-channel recente foto-instants (voor de kantine-tv)', () => {
  it('blijft opgepikt zonder actief kanaal — de kantine-tv heeft er zelf geen', () => {
    // Geen joinMatch: er is geen viewer/kanaal voor deze wedstrijd, precies de situatie waarin
    // een kantine-tv een foto toch moet kunnen oppikken (zie kantine-channel.ts loadKantineLive).
    const matchId = 990101
    expect(recenteInstants(matchId, 60_000)).toEqual([])

    const instant = { id: 1, url: '/api/match-instants/file/x.jpg', authorName: 'Jan', at: Date.now() }
    const kanaalActief = addInstant(matchId, instant)
    expect(kanaalActief).toBe(false) // geen broadcast: niemand kijkt

    const recent = recenteInstants(matchId, 60_000)
    expect(recent).toEqual([instant])
  })

  it('valt weg zodra ze ouder zijn dan de gevraagde leeftijd', () => {
    const matchId = 990102
    const oud = { id: 2, url: '/x.jpg', authorName: 'Marie', at: Date.now() - 120_000 }
    addInstant(matchId, oud)
    expect(recenteInstants(matchId, 60_000)).toEqual([])
  })
})
