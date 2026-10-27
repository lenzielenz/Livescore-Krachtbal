import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { verplaatsWedstrijd } from '@/lib/wedstrijd-verplaatsen'

// Wedstrijden verplaatsen in bulk (vanuit /beheer/wedstrijden en de planner /beheer/planner).
//   POST { wijzigingen: [{ matchId, date: ISO }] } → { ok, verplaatst, overgeslagen }
// Enkel geplande wedstrijden: een lopende of afgelopen wedstrijd verplaats je niet. Iedereen hoort
// het nieuwe tijdstip (zie wedstrijd-verplaatsen.ts). Een heel weekend in één keer:
// /api/federatie/weekend-verplaatsen.
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
      const r = await verplaatsWedstrijd(payload, match, datum, { doorUser: Number(t.user.id) })
      if (!r.ok) overgeslagen.push({ matchId, reden: r.reden })
      else if (r.verplaatst) verplaatst += 1
    }
    return Response.json({ ok: true, verplaatst, overgeslagen })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
