import { formatDateTimeBE } from '@/lib/datetime'
import { federatieToegang, leesJson, relId } from '@/lib/federatie-api'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { meld } from '@/lib/meldingen'

// Scheidsrechters toewijzen in bulk (vanuit /beheer/scheidsrechters).
//   POST { toewijzingen: [{ matchId, officialId | null }] } → { ok, gewijzigd }
// Enkel wat echt verandert wordt geschreven. Wie er een wedstrijd bij krijgt, krijgt een melding (🔔 + push);
// wie er een kwijtraakt ook — anders rijdt een vervangen scheidsrechter voor niets naar het terrein.
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
    const meldingen: { userId: number; matchId: number; tekst: string; weg?: boolean }[] = []
    const userVanOfficial = async (id: number | null): Promise<number | null> => {
      if (id == null) return null
      if (bekend.has(id)) return relId(bekend.get(id)?.user)
      const o = await payload.findByID({ collection: 'officials', id, depth: 0, overrideAccess: true }).catch(() => null)
      return relId(o?.user)
    }
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
      const vorige = relId(sheet.assignedReferee)
      if (vorige === officialId) continue
      await payload.update({ collection: 'matchsheets', id: sheet.id, data: { assignedReferee: officialId }, overrideAccess: true })
      gewijzigd += 1
      const naam = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')
      const tekst = `${naam(match.homeTeam)} – ${naam(match.awayTeam)}, ${formatDateTimeBE(String(match.date))}`
      const userId = await userVanOfficial(officialId)
      if (userId != null) meldingen.push({ userId, matchId, tekst })
      const vorigeUser = await userVanOfficial(vorige)
      if (vorigeUser != null && vorigeUser !== userId) meldingen.push({ userId: vorigeUser, matchId, tekst, weg: true })
    }
    for (const m of meldingen) {
      await meld(payload, [m.userId], {
        titel: m.weg ? '🧑‍⚖️ Je fluit een wedstrijd niet meer' : '🧑‍⚖️ Je fluit een wedstrijd',
        tekst: m.weg ? `${m.tekst} — de federatie wees een andere scheidsrechter aan.` : m.tekst,
        url: m.weg ? '/scheidsrechter/portaal' : `/scheidsrechter/${m.matchId}`,
      }).catch(() => 0)
    }
    return Response.json({ ok: true, gewijzigd })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
