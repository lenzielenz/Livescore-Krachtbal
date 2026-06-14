import { isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { BONUS_COUNT, BONUS_MULTIPLIER, pickBonusMatches } from '@/lib/pronostiek-rad'
import { loadRadState } from '@/lib/pronostiek-rad-server'
import { clientIp, rateLimit } from '@/lib/sse-hub'

export const dynamic = 'force-dynamic'

// Bonusrad: de winnaar van vorig weekend draait aan het rad. De server kiest gezaghebbend
// (nooit de client vertrouwen) 3 wedstrijden van het komende weekend en zet hun pronostiek-bonus
// op ×2. Eén keer per weekend. Geeft de gekozen wedstrijden terug zodat het rad ernaartoe animeert.
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
    // Beheerders/federatie mogen altijd draaien (om te testen), ook zonder weekendwinst.
    const isTester = isFederationLevel(user)

    let state = await loadRadState(payload)
    if (!isTester) {
      if (!state.winner) return Response.json({ error: 'Er is nog geen weekendwinnaar.' }, { status: 409 })
      if (state.winner.userId !== userId) {
        return Response.json({ error: 'Alleen de winnaar van vorig weekend mag aan het rad draaien.' }, { status: 403 })
      }
      if (state.alreadySpun) {
        return Response.json({ error: 'Het rad is voor dit weekend al gedraaid.' }, { status: 409 })
      }
    } else if (state.alreadySpun) {
      // Testmodus: reset de bonus van deze week zodat de beheerder opnieuw kan draaien.
      await Promise.all(
        state.boosted.map((m) => payload.update({ collection: 'matches', id: m.id, data: { pronostiekBonus: 1 }, overrideAccess: true }).catch(() => null)),
      )
      state = await loadRadState(payload)
    }
    if (state.candidates.length === 0) {
      return Response.json({ error: 'Er zijn deze week geen geplande wedstrijden om te boosten.' }, { status: 409 })
    }

    const chosen = pickBonusMatches(state.candidates, BONUS_COUNT)
    await Promise.all(
      chosen.map((m) =>
        payload.update({ collection: 'matches', id: m.id, data: { pronostiekBonus: BONUS_MULTIPLIER }, overrideAccess: true }).catch(() => null),
      ),
    )

    return Response.json({ ok: true, chosen: chosen.map((m) => ({ id: m.id, home: m.home, away: m.away })) })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
