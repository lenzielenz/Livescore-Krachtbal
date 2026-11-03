import { describe, expect, it, vi } from 'vitest'

import type { Payload } from 'payload'

import { addPollVote, joinMatch } from '@/lib/match-channel'

// Regressie 2026-10-30: bij het wegvallen van de laatste kijker schreef het kanaal ALTIJD drie keer weg
// (tellers, poll, piek). Vielen de kijkers van meerdere wedstrijden tegelijk weg, dan waren dat tientallen
// gelijktijdige transacties die de Postgres-pool vastzetten. Nu enkel nog wat écht openstaat.
function stubMetUpdate() {
  const update = vi.fn(async () => ({}))
  return { update, payload: { update } as unknown as Payload }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 20))

describe('match-channel: opruimen bij de laatste kijker', () => {
  it('schrijft niets weg als er niets openstaat', async () => {
    const { update, payload } = stubMetUpdate()
    const leave = joinMatch(payload, 991001, () => {}, null) // passief scherm: telt niet mee, geen piek
    leave()
    await flush()
    expect(update).not.toHaveBeenCalled()
  })

  it('schrijft de openstaande tellers wél nog weg — niets gaat verloren', async () => {
    const { update, payload } = stubMetUpdate()
    const leave = joinMatch(payload, 991002, () => {}, null)
    expect(addPollVote(991002, 'home', 3)).toBe(true) // plant een opslag van de poll (debounce van 5 s)
    leave() // laatste kijker weg vóór de debounce afloopt → meteen wegschrijven
    await flush()
    // Enkel de poll stond open: precies één update, en die bevat de stemmen.
    expect(update).toHaveBeenCalledTimes(1)
    expect((update.mock.calls[0] as unknown as [{ data: { livePoll: Record<string, number> } }])[0].data.livePoll).toEqual({ home: 3 })
  })
})
