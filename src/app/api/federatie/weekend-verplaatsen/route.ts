import { formatDateBE } from '@/lib/datetime'
import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { verplaatsWedstrijd } from '@/lib/wedstrijd-verplaatsen'
import { geldigeDatum, weekLabel, weekendGrenzen, weekendVerplaatsing } from '@/lib/weekend-verplaatsen'

// Een heel speelweekend verplaatsen (vanuit /beheer/weekend): alle geplande wedstrijden van
// zaterdag + zondag naar een ander weekend, elk op haar eigen dag en haar eigen aftrapuur.
//   POST { van: "YYYY-MM-DD" (zaterdag), naar: "YYYY-MM-DD" (zaterdag) }
//   → { ok, verplaatst, overgeslagen: [{ matchId, reden }], dagen }
// Demo- en analysewedstrijden blijven staan. Iedereen van elke wedstrijd krijgt een melding (zie
// wedstrijd-verplaatsen.ts), met erbij dat het om het hele weekend gaat.
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const { payload } = t
  const body = await leesJson(req)
  const van = body?.van
  const naar = body?.naar
  if (!geldigeDatum(van) || !geldigeDatum(naar)) return Response.json({ error: 'Kies een weekend om te verplaatsen en een nieuw weekend.' }, { status: 400 })
  if (van === naar) return Response.json({ error: 'Dat is hetzelfde weekend.' }, { status: 400 })

  const grenzen = weekendGrenzen(van)
  const gevonden = await payload.find({
    collection: 'matches',
    where: { and: [{ analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }, { date: { greater_than_equal: grenzen.start } }, { date: { less_than: grenzen.einde } }] },
    depth: 1,
    limit: 300,
    pagination: false,
    overrideAccess: true,
  })
  if (!gevonden.docs.length) return Response.json({ error: 'Geen wedstrijden in dat weekend.' }, { status: 400 })

  const { dagen, wijzigingen } = weekendVerplaatsing(
    gevonden.docs.map((m) => ({ matchId: Number(m.id), date: String(m.date) })),
    van,
    naar,
  )
  const perId = new Map(gevonden.docs.map((m) => [Number(m.id), m]))
  let verplaatst = 0
  const overgeslagen: { matchId: number; reden: string }[] = []
  try {
    for (const w of wijzigingen) {
      const match = perId.get(w.matchId)
      if (!match) continue
      const r = await verplaatsWedstrijd(payload, match, new Date(w.date), {
        doorUser: Number(t.user.id),
        extraTekst: `Het hele speelweekend van ${weekLabel(van)} (${formatDateBE(grenzen.start)}) is verplaatst.`,
      })
      if (!r.ok) overgeslagen.push({ matchId: w.matchId, reden: r.reden })
      else if (r.verplaatst) verplaatst += 1
    }
    return Response.json({ ok: true, verplaatst, overgeslagen, dagen })
  } catch (err) {
    return Response.json({ error: (err as Error).message, verplaatst, overgeslagen }, { status: 400 })
  }
}
