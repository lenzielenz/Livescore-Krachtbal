import { describe, it, expect } from 'vitest'

import { buildPassNetwork, type PassEvent, type ThrowEvent } from '@/lib/pass-network'

const pass = (possessionId: number, afterThrows: number, playerId: number, extra: Partial<PassEvent> = {}): PassEvent => ({
  possessionId,
  afterThrows,
  playerId,
  forward: false,
  ...extra,
})

const worp = (possessionId: number, throwNumber: number, playerId: number, isGoal = false): ThrowEvent => ({
  possessionId,
  throwNumber,
  playerId,
  isGoal,
})

describe('buildPassNetwork', () => {
  it('legt de keten vanger → vanger → werper vast', () => {
    const net = buildPassNetwork(
      [pass(1, 0, 10), pass(1, 0, 11)],
      [worp(1, 1, 12)],
    )
    expect(net.totaal).toBe(2)
    expect(net.lijnen).toEqual([
      { fromPlayerId: 10, toPlayerId: 11, count: 1 },
      { fromPlayerId: 11, toPlayerId: 12, count: 1 },
    ])
  })

  it('telt de laatste schakel vóór een doelpunt als aangever', () => {
    const net = buildPassNetwork([pass(1, 0, 10)], [worp(1, 1, 12, true)])
    const tien = net.spelers.find((s) => s.playerId === 10)!
    expect(tien.aangevers).toBe(1)
    expect(tien.gegeven).toBe(1)
    // De werper zelf is geen aangever.
    expect(net.spelers.find((s) => s.playerId === 12)).toBeUndefined()
  })

  it('geen aangever wanneer de vanger zelf werpt', () => {
    const net = buildPassNetwork([pass(1, 0, 10)], [worp(1, 1, 10, true)])
    expect(net.spelers.find((s) => s.playerId === 10)!.aangevers).toBe(0)
    expect(net.lijnen).toEqual([])
  })

  it('koppelt passes aan de juiste worp binnen hetzelfde balbezit', () => {
    // Worp 1 door 12, daarna een pass naar 11, daarna worp 2 door 11 — geen passlijn naar 11 zelf.
    const net = buildPassNetwork(
      [pass(1, 1, 11)],
      [worp(1, 1, 12), worp(1, 2, 11)],
    )
    expect(net.lijnen).toEqual([])
    expect(net.spelers.find((s) => s.playerId === 11)!.ontvangen).toBe(1)
  })

  it('een voorwaartse pass is een fout op naam van de gever en telt niet als passlijn', () => {
    const net = buildPassNetwork(
      [pass(1, 0, 10), pass(1, 0, 11, { forward: true })],
      [],
    )
    expect(net.fouten).toBe(1)
    expect(net.totaal).toBe(1)
    expect(net.spelers.find((s) => s.playerId === 10)!.fouten).toBe(1)
    expect(net.lijnen).toEqual([])
  })

  it('telt terreinwinst op bij de gever', () => {
    const net = buildPassNetwork(
      [pass(1, 0, 10), pass(1, 0, 11, { gainM: -3 }), pass(1, 0, 12, { gainM: -2 })],
      [],
    )
    expect(net.spelers.find((s) => s.playerId === 10)!.winstM).toBe(-3)
    expect(net.spelers.find((s) => s.playerId === 11)!.winstM).toBe(-2)
  })

  it('bundelt herhaalde passlijnen', () => {
    const net = buildPassNetwork(
      [pass(1, 0, 10), pass(1, 0, 11), pass(2, 0, 10), pass(2, 0, 11)],
      [],
    )
    expect(net.lijnen).toEqual([{ fromPlayerId: 10, toPlayerId: 11, count: 2 }])
  })

  it('geeft een leeg netwerk terug zonder passes', () => {
    expect(buildPassNetwork([], [worp(1, 1, 12, true)])).toEqual({ spelers: [], lijnen: [], totaal: 0, fouten: 0 })
  })
})
