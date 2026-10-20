import { formatDateTimeBE } from '@/lib/datetime'
import { federatieToegang, leesJson, relId } from '@/lib/federatie-api'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { sendPushToUsers } from '@/lib/push'

// Scheidsrechters toewijzen in bulk (vanuit /beheer/scheidsrechters).
//   POST { toewijzingen: [{ matchId, officialId | null }] } → { ok, gewijzigd }
// Enkel wat echt verandert wordt geschreven; wie er een wedstrijd bij krijgt, krijgt een melding.
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const { payload } = t
  const body = await leesJson(req)
  const lijst = Array.isArray(body?.toewijzingen) ? (body!.toewijzingen as { matchId?: unknown; officialId?: unknown }[]) : []
  if (!lijst.length) return Response.json({ error: 'Niets om te bewaren.' }, { status: 400 })
  if (lijst.length > 500) return Response.json({ error: 'Te veel in één keer (max 500).' }, { status: 400 })

  try {
    const officialIds = [...new Set(lijst.map((x) => relId(x.officialId)).filter((x): x is number => x != null))]
    const officials = officialIds.length
      ? await payload.find({ collection: 'officials', where: { id: { in: officialIds } }, depth: 0, limit: officialIds.length, overrideAccess: true })
      : { docs: [] }
    const bekend = new Map(officials.docs.map((o) => [Number(o.id), o]))

    let gewijzigd = 0
    const meldingen: { userId: number; matchId: number; tekst: string }[] = []
    for (const x of lijst) {
      const matchId = Number(x.matchId)
      if (!Number.isFinite(matchId)) continue
      const officialId = relId(x.officialId)
      if (officialId != null && !bekend.has(officialId)) {
        return Response.json({ error: `Scheidsrechter ${officialId} bestaat niet.` }, { status: 400 })
      }
      const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)
      if (!match || match.status === 'finished') continue
      const sheet = await getOrCreateMatchSheet(payload, matchId)
      if (relId(sheet.assignedReferee) === officialId) continue
      await payload.update({ collection: 'matchsheets', id: sheet.id, data: { assignedReferee: officialId }, overrideAccess: true })
      gewijzigd += 1
      const userId = officialId != null ? relId(bekend.get(officialId)?.user) : null
      if (userId != null) {
        const naam = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')
        meldingen.push({ userId, matchId, tekst: `${naam(match.homeTeam)} – ${naam(match.awayTeam)}, ${formatDateTimeBE(String(match.date))}` })
      }
    }
    for (const m of meldingen) {
      void sendPushToUsers(payload, [m.userId], {
        title: '🧑‍⚖️ Je fluit een wedstrijd',
        body: m.tekst,
        url: `/scheidsrechter/${m.matchId}`,
        tag: `toewijzing-${m.matchId}`,
      }).catch(() => null)
    }
    return Response.json({ ok: true, gewijzigd })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
