import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { pickMultiplier, TOKENS_PER_WIN } from '@/lib/pronostiek-rad'
import { loadRadState } from '@/lib/pronostiek-rad-server'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

type Power = { mult: number; remaining: number; wonAt: string }

// Bonusrad: de top 3 van vorig weekend draaien elk één keer aan het rad en winnen een PERSOONLIJKE
// vermenigvuldiger. De server kiest gezaghebbend de waarde (nooit de client vertrouwen) en bewaart
// 3 boosters op het account; het rad animeert er enkel naartoe.
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
    const eligible = isTester || state.top3.some((w) => w.userId === userId)
    if (!eligible) {
      return Response.json({ error: 'Alleen de top 3 van vorig weekend mag aan het rad draaien.' }, { status: 403 })
    }

    const power = (user as { pronostiekPower?: Power | null }).pronostiekPower ?? null
    // Eén keer per speelweek (testers mogen opnieuw draaien om te testen).
    if (!isTester && power && power.wonAt === state.weekendStartIso) {
      return Response.json({ error: 'Je hebt deze week al aan het rad gedraaid.' }, { status: 409 })
    }

    const mult = pickMultiplier()
    const next: Power = { mult, remaining: TOKENS_PER_WIN, wonAt: state.weekendStartIso }
    await payload.update({ collection: 'users', id: userId, data: { pronostiekPower: next }, overrideAccess: true })

    return Response.json({ ok: true, mult, remaining: TOKENS_PER_WIN })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
