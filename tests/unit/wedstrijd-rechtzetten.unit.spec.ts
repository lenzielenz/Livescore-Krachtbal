import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import { correctionBlockedReason, mayCorrectMatch, mayScoreMatch } from '@/lib/api-auth'

// Aanleiding (2026-09-06): een clubverantwoordelijke kon de wedstrijd Snellegem–Aalter U12 wél
// aantekenen, maar bij "terugzetten naar niet-gestart" kreeg hij te lezen dat hij aantekenaar moest
// zijn — terwijl hij op dat moment de wedstrijd zat aan te tekenen. Twee dingen liepen mis:
//
//   1. voor een scheidsrechter liepen de twee vragen uiteen: aantekenen mocht op een wedstrijd
//      zónder toegewezen scheidsrechter, rechtzetten niet;
//   2. de weigering somde rollen op in plaats van te zeggen wat er in dít geval scheelde.
//
// Deze test legt allebei vast.

type Doc = Record<string, unknown>

/** Minimale Payload-dubbel: één wedstrijd, één wedstrijdblad, één settings-global. */
function fakePayload(opts: {
  match?: Doc
  sheet?: Doc | null
  scoreMode?: 'federatie' | 'supporters'
}): Payload {
  const match = opts.match ?? { id: 1, homeTeam: { club: { id: 7 } }, awayTeam: { club: { id: 9 } } }
  return {
    findByID: async () => match,
    findGlobal: async () => ({ scoreMode: opts.scoreMode ?? 'federatie' }),
    find: async ({ collection }: { collection: string }) => ({
      docs: collection === 'matchsheets' ? (opts.sheet ? [opts.sheet] : []) : [],
    }),
  } as unknown as Payload
}

const scheidsrechter = { id: 3, roles: ['scheidsrechter' as const], official: 55 }
const supporter = { id: 8, roles: ['club-lid' as const] }

describe('mayCorrectMatch — scheidsrechter', () => {
  it('mag rechtzetten op een wedstrijd zonder toegewezen scheidsrechter', async () => {
    // Dit was de bug: geen wedstrijdblad → aantekenen mocht, terugzetten niet.
    const payload = fakePayload({ sheet: null })
    expect(await mayScoreMatch(payload, scheidsrechter, 1)).toBe(true)
    expect(await mayCorrectMatch(payload, scheidsrechter, 1)).toBe(true)
  })

  it('mag rechtzetten wanneer hij zelf op het blad staat', async () => {
    const payload = fakePayload({ sheet: { assignedReferee: 55 } })
    expect(await mayCorrectMatch(payload, scheidsrechter, 1)).toBe(true)
  })

  it('mag niet rechtzetten wanneer een collega is toegewezen', async () => {
    // De strengere regel blijft staan: is er wél een toewijzing, dan enkel die scheidsrechter.
    const payload = fakePayload({ sheet: { assignedReferee: 99 } })
    expect(await mayScoreMatch(payload, scheidsrechter, 1)).toBe(false)
    expect(await mayCorrectMatch(payload, scheidsrechter, 1)).toBe(false)
  })

  it('geeft op beide vragen hetzelfde antwoord', async () => {
    // De kern: wie mag aantekenen omdat er niemand is toegewezen, mag ook rechtzetten.
    for (const sheet of [null, { assignedReferee: 55 }, { backupReferee: 55 }, { assignedReferee: 99 }]) {
      const payload = fakePayload({ sheet })
      expect(await mayCorrectMatch(payload, scheidsrechter, 1)).toBe(
        await mayScoreMatch(payload, scheidsrechter, 1),
      )
    }
  })
})

describe('correctionBlockedReason', () => {
  it('zwijgt wanneer het gewoon mag', async () => {
    const payload = fakePayload({ sheet: null })
    expect(await correctionBlockedReason(payload, scheidsrechter, 1, 'terugzetten')).toBeNull()
  })

  it('vraagt een uitgelogde bezoeker om aan te melden', async () => {
    const payload = fakePayload({})
    expect(await correctionBlockedReason(payload, null, 1, 'terugzetten')).toMatch(/meld je .*aan/i)
  })

  it('legt aan een supporter-aantekenaar uit waaróm het niet mag', async () => {
    // Precies het geval uit de melding: aantekenen mag (open livescore), terugzetten niet. De
    // oude tekst somde rollen op en las als een tegenspraak; deze moet het verschil benoemen
    // en zeggen bij wie hij moet zijn.
    const payload = fakePayload({ scoreMode: 'supporters' })
    expect(await mayScoreMatch(payload, supporter, 1)).toBe(true)
    const reden = await correctionBlockedReason(payload, supporter, 1, 'terugzetten')
    expect(reden).toBeTruthy()
    expect(reden).toMatch(/open livescore/i)
    expect(reden).toMatch(/scheidsrechter|clubstaf|federatie/i)
    // Geen rollijst meer die de lezer tegenspreekt.
    expect(reden).not.toMatch(/^Enkel de aantekenaar/)
  })

  it('houdt het kort voor wie de wedstrijd sowieso niet mag bedienen', async () => {
    const payload = fakePayload({ scoreMode: 'federatie' })
    const reden = await correctionBlockedReason(payload, supporter, 1, 'heropenen')
    expect(reden).toMatch(/geen rechten/i)
    expect(reden).toMatch(/heropenen/)
  })
})
