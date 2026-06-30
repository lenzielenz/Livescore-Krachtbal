import { describe, expect, it } from 'vitest'

import type { Payload } from 'payload'

import { joinMatch, nudgeMatch } from '@/lib/match-channel'

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

describe('match-channel instant push (nudgeMatch)', () => {
  it('is een no-op zonder actieve kijkers (geen kanaal) en gooit nooit', () => {
    // Geen enkele kijker op dit match-id → geen kanaal → nudge mag niets doen en niet falen.
    expect(() => nudgeMatch(990101)).not.toThrow()
  })

  it('is veilig wanneer er wél een kanaal is (best-effort poll, geen exception)', () => {
    const k = collector()
    const leave = joinMatch(stubPayload, 990102, k.send, 'browser-x')
    // pollScore vangt DB-fouten zelf op (stubPayload), dus de nudge mag de aanroeper nooit breken.
    expect(() => nudgeMatch(990102)).not.toThrow()
    leave()
  })
})
