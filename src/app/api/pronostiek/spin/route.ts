import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { activeTokens, pickSegmentIndex, RAD_SEGMENTS, SPINS_PER_WEEK, tokenExpiry, type RadToken } from '@/lib/pronostiek-rad'
import { loadRadState } from '@/lib/pronostiek-rad-server'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

type Power = { tokens?: RadToken[]; spinWeek?: string; spinsUsed?: number }

// Bonusrad: de top 3 van vorig weekend draaien elk tot 3 keer en winnen telkens een PERSOONLIJKE
// vermenigvuldiger (4 weken geldig). De server kiest gezaghebbend het vak (nooit de client
// vertrouwen) en bewaart de boosters op het account; het rad animeert er enkel naartoe.
export async function POST(req: Request) {
  const ip = clientIp(req)
  if (!rateLimit(`spin:${ip}`, Number(process.env.SPIN_MAX_PER_SEC) || 3, 1000)) {
    return Response.json({ error: 'Te veel verzoeken.' }, { status: 429 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    const userId = Number((user as { id: number }).id)
    const isTester = isFederationLevel(user)

    const state = await loadRadState(payload)
    const eligible = isTester || state.winners.some((w) => w.userId === userId)
    if (!eligible) {
      return Response.json({ error: 'Alleen de besten van vorig weekend mogen aan het rad draaien.' }, { status: 403 })
    }

    const power = ((user as { pronostiekPower?: Power | null }).pronostiekPower ?? {}) as Power
    // Nieuwe speelweek → de 3 beurten resetten (bestaande, nog geldige boosters blijven).
    const sameWeek = power.spinWeek === state.weekendStartIso
    const spinsUsed = sameWeek ? Number(power.spinsUsed) || 0 : 0
    if (!isTester && spinsUsed >= SPINS_PER_WEEK) {
      return Response.json({ error: 'Je hebt je 3 beurten van deze week gebruikt.' }, { status: 409 })
    }

    const idx = pickSegmentIndex(RAD_SEGMENTS)
    const mult = RAD_SEGMENTS[idx].mult
    const nowIso = new Date().toISOString()
    const tokens = [...activeTokens(power.tokens), { mult, wonAt: nowIso, expiresAt: tokenExpiry(nowIso) }]
    const nextUsed = spinsUsed + 1
    await payload.update({
      collection: 'users',
      id: userId,
      data: { pronostiekPower: { tokens, spinWeek: state.weekendStartIso, spinsUsed: nextUsed } },
      overrideAccess: true,
    })

    const spinsLeft = isTester ? 99 : Math.max(0, SPINS_PER_WEEK - nextUsed)
    return Response.json({ ok: true, index: idx, mult, spinsLeft, tokens: tokens.map((t) => t.mult) })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
