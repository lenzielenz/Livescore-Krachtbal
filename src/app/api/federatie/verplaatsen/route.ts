import { betrokkenen } from '@/lib/aftrap'
import { formatDateTimeBE } from '@/lib/datetime'
import { federatieToegang, leesJson, relId } from '@/lib/federatie-api'
import { meld } from '@/lib/meldingen'
import { sendPushToClubs } from '@/lib/push'

// Wedstrijden verplaatsen in bulk (vanuit /beheer/wedstrijden en de planner /beheer/planner).
//   POST { wijzigingen: [{ matchId, date: ISO }] } → { ok, verplaatst, overgeslagen }
// Enkel geplande wedstrijden: een lopende of afgelopen wedstrijd verplaats je niet. Iedereen hoort
// het nieuwe tijdstip: de staf van beide clubs, de scheidsrechter (die meteen kan laten weten als
// hij dan niet kan) en de spelers op de selectie.
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const { payload } = t
  const body = await leesJson(req)
  const lijst = Array.isArray(body?.wijzigingen) ? (body!.wijzigingen as { matchId?: unknown; date?: unknown }[]) : []
  if (!lijst.length) return Response.json({ error: 'Niets om te bewaren.' }, { status: 400 })
  if (lijst.length > 300) return Response.json({ error: 'Te veel in één keer (max 300).' }, { status: 400 })

  let verplaatst = 0
  const overgeslagen: { matchId: number; reden: string }[] = []
  try {
    for (const w of lijst) {
      const matchId = Number(w.matchId)
      const datum = new Date(String(w.date ?? ''))
      if (!Number.isFinite(matchId) || Number.isNaN(datum.getTime())) {
        overgeslagen.push({ matchId, reden: 'ongeldige datum' })
        continue
      }
      const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)
      if (!match) {
        overgeslagen.push({ matchId, reden: 'niet gevonden' })
        continue
      }
      if (match.status !== 'scheduled') {
        overgeslagen.push({ matchId, reden: match.status === 'live' ? 'is bezig' : 'is al gespeeld' })
        continue
      }
      if (new Date(String(match.date)).getTime() === datum.getTime()) continue
      await payload.update({ collection: 'matches', id: matchId, data: { date: datum.toISOString() }, overrideAccess: true })
      verplaatst += 1
      const team = (v: unknown) => (v && typeof v === 'object' ? (v as { name?: unknown; club?: unknown }) : null)
      const thuis = team(match.homeTeam)
      const uit = team(match.awayTeam)
      const titel = `${String(thuis?.name ?? '')} – ${String(uit?.name ?? '')}`
      await meld(payload, (await betrokkenen(payload, { id: matchId, homeTeam: match.homeTeam, awayTeam: match.awayTeam })).filter((id) => id !== Number(t.user.id)), {
        titel: `🔁 Verplaatst: ${titel}`,
        tekst: `Nieuw tijdstip: ${formatDateTimeBE(datum.toISOString())} (was ${formatDateTimeBE(String(match.date))}). Scheidsrechter: kan je dan niet, laat het de federatie meteen weten.`,
        url: `/match/${matchId}`,
      }).catch(() => 0)
      void sendPushToClubs(payload, [relId(thuis?.club), relId(uit?.club)], {
        title: '🔁 Wedstrijd verplaatst',
        body: `${String(thuis?.name ?? '')} – ${String(uit?.name ?? '')}: nu ${formatDateTimeBE(datum.toISOString())}`,
        url: `/match/${matchId}`,
        tag: `verplaatst-${matchId}`,
      }).catch(() => null)
    }
    return Response.json({ ok: true, verplaatst, overgeslagen })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
