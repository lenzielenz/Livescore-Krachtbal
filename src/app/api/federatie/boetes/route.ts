import { boeteBehandelen, boeteManueel, boeteVoorstellen } from '@/lib/boetes'
import { federatieToegang, leesJson } from '@/lib/federatie-api'

// Boetes behandelen (vanuit /beheer/boetes), enkel de federatie:
//   POST { actie: 'opleggen' | 'vernietigen' | 'betaald' | 'handhaven', id, bedrag?, opmerking? }
//   POST { actie: …, ids: [...], opmerking? } → dezelfde actie op meerdere boetes tegelijk (bulk)
//   POST { actie: 'manueel', club, soort?, omschrijving?, bedrag?, match? } → meteen opgelegd
//   POST { actie: 'scan' } → automatische voorstellen bijwerken (forfait, blad te laat, aftrap later)
export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const body = (await leesJson(req)) ?? {}
  const num = (v: unknown) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
  try {
    if (body.actie === 'scan') return Response.json({ ok: true, nieuw: await boeteVoorstellen(t.payload) })
    if (body.actie === 'manueel') {
      const club = num(body.club)
      if (club == null) return Response.json({ error: 'Kies een club.' }, { status: 400 })
      const r = await boeteManueel(t.payload, {
        club,
        soort: num(body.soort),
        omschrijving: typeof body.omschrijving === 'string' ? body.omschrijving : null,
        bedrag: num(body.bedrag),
        match: num(body.match),
      })
      return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
    }
    const id = num(body.id)
    const actie = body.actie
    if (actie !== 'opleggen' && actie !== 'vernietigen' && actie !== 'betaald' && actie !== 'handhaven') {
      return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
    }
    // Bulk: elke boete apart behandelen (zelfde regels en meldingen als één per één); wat niet kan,
    // komt terug met de reden, de rest gaat gewoon door.
    if (Array.isArray(body.ids)) {
      const ids = [...new Set(body.ids.map(num).filter((x): x is number => x != null))].slice(0, 500)
      if (!ids.length) return Response.json({ error: 'Kies minstens één boete.' }, { status: 400 })
      const mislukt: { id: number; fout: string }[] = []
      for (const b of ids) {
        const r = await boeteBehandelen(t.payload, b, actie, { opmerking: typeof body.opmerking === 'string' ? body.opmerking : null })
        if (!r.ok) mislukt.push({ id: b, fout: r.error ?? 'mislukt' })
      }
      return Response.json({ ok: true, gelukt: ids.length - mislukt.length, mislukt })
    }
    if (id == null) return Response.json({ error: 'Kies een boete.' }, { status: 400 })
    const r = await boeteBehandelen(t.payload, id, actie, {
      bedrag: num(body.bedrag) ?? undefined,
      opmerking: typeof body.opmerking === 'string' ? body.opmerking : null,
    })
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: r.status })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
