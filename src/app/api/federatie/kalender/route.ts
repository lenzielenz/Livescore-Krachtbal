import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { maakKalender } from '@/lib/kalender-generator'
import { REEKS_OPTIONS, reeksCategorie, type Reeks } from '@/lib/reeksen'

// Kalender opmaken voor één reeks (vanuit /beheer/kalender).
//   POST { reeks, start, interval?, vrij?: string[], standaardUur?, enkelHeen?, bevestig?: boolean }
//   → zonder bevestig: { voorstel } (niets bewaard) — met bevestig: { ok, aangemaakt }
// Dezelfde twee stappen als de planning-import: eerst kijken, dan pas aanmaken. Staat er voor deze
// reeks al een geplande wedstrijd tussen dezelfde twee ploegen, dan wordt die niet dubbel aangemaakt.
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const { payload } = t
  const body = await leesJson(req)
  const reeks = String(body?.reeks ?? '') as Reeks
  if (!REEKS_OPTIONS.some((o) => o.value === reeks)) return Response.json({ error: 'Kies een reeks.' }, { status: 400 })

  try {
    const ploegen = await payload.find({
      collection: 'teams',
      where: { and: [{ reeks: { equals: reeks } }, { analyseOnly: { not_equals: true } }] },
      sort: 'name',
      depth: 0,
      limit: 100,
      pagination: false,
      overrideAccess: true,
    })
    if (ploegen.docs.length < 2) return Response.json({ error: 'Deze reeks heeft minder dan twee ploegen.' }, { status: 400 })

    const kalender = maakKalender(
      ploegen.docs.map((p) => ({ id: Number(p.id), naam: String(p.name ?? ''), thuisUur: (p.thuisUur as string | null) ?? null, thuisdag: ((p as { thuisdag?: 'za' | 'zo' | null }).thuisdag ?? null) })),
      {
        start: String(body?.start ?? ''),
        interval: Number(body?.interval) || 7,
        vrij: Array.isArray(body?.vrij) ? (body!.vrij as unknown[]).map(String) : [],
        standaardUur: String(body?.standaardUur ?? '14:00'),
        enkelHeen: body?.enkelHeen === true,
      },
    )

    // Bestaande wedstrijden van deze reeks (dit of later): niet dubbel aanmaken.
    const bestaand = await payload.find({
      collection: 'matches',
      where: { and: [{ reeks: { equals: reeks } }, { date: { greater_than_equal: kalender[0]?.aftrapUtc ?? new Date().toISOString() } }] },
      depth: 0,
      limit: 2000,
      pagination: false,
      overrideAccess: true,
    })
    const al = new Set(bestaand.docs.map((m) => `${m.homeTeam}-${m.awayTeam}`))
    const naam = new Map(ploegen.docs.map((p) => [Number(p.id), String(p.name ?? '')]))
    const voorstel = kalender.map((w) => ({ ...w, thuisNaam: naam.get(w.thuis) ?? '', uitNaam: naam.get(w.uit) ?? '', bestaatAl: al.has(`${w.thuis}-${w.uit}`) }))

    if (body?.bevestig !== true) return Response.json({ ok: true, voorstel, ploegen: ploegen.docs.length })

    let aangemaakt = 0
    for (const w of voorstel) {
      if (w.bestaatAl) continue
      await payload.create({
        collection: 'matches',
        data: { reeks, category: reeksCategorie(reeks), homeTeam: w.thuis, awayTeam: w.uit, date: w.aftrapUtc, status: 'scheduled', goalAreaDepth: 10 },
        overrideAccess: true,
      })
      aangemaakt += 1
    }
    return Response.json({ ok: true, aangemaakt })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
