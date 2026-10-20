import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { publiceer, rondeVan } from '@/lib/referendum-server'
import { REEKS_OPTIONS } from '@/lib/reeksen'

// Het referendum beheren (vanuit /federatie/referendum).
//   POST { actie: 'aanmaken', seizoen, reeksHeren?, reeksDames?, minWedstrijden?, maxLeeftijdBelofte? }
//   POST { actie: 'status', rondeId, status: 'open' | 'gesloten' | 'voorbereiding' }
//   POST { actie: 'publiceren', rondeId } → winnaars naar het archief (Erelijst)
// Er staat hoogstens één ronde tegelijk open.
const REEKSEN = new Set(REEKS_OPTIONS.map((o) => o.value as string))

export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const { payload } = t
  const body = await leesJson(req)
  if (!body) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })

  try {
    if (body.actie === 'aanmaken') {
      const seizoen = String(body.seizoen ?? '').trim()
      if (!/^\d{4}-\d{4}$/.test(seizoen)) return Response.json({ error: 'Seizoen als 2026-2027.' }, { status: 400 })
      const reeksHeren = String(body.reeksHeren || '1NAH')
      const reeksDames = String(body.reeksDames || '1NAD')
      if (!REEKSEN.has(reeksHeren) || !REEKSEN.has(reeksDames)) return Response.json({ error: 'Onbekende reeks.' }, { status: 400 })
      const dubbel = await payload.find({ collection: 'referendum-rondes', where: { seizoen: { equals: seizoen } }, limit: 1, overrideAccess: true })
      if (dubbel.docs.length) return Response.json({ error: 'Er bestaat al een ronde voor dit seizoen.' }, { status: 409 })
      const r = await payload.create({
        collection: 'referendum-rondes',
        data: {
          seizoen,
          status: 'voorbereiding',
          reeksHeren,
          reeksDames,
          minWedstrijden: Math.max(1, Number(body.minWedstrijden) || 5),
          maxLeeftijdBelofte: Math.max(10, Number(body.maxLeeftijdBelofte) || 21),
        },
        overrideAccess: true,
      })
      return Response.json({ ok: true, id: r.id })
    }

    const rondeId = Number(body.rondeId)
    const doc = Number.isFinite(rondeId) ? await payload.findByID({ collection: 'referendum-rondes', id: rondeId, depth: 0, overrideAccess: true }).catch(() => null) : null
    if (!doc) return Response.json({ error: 'Ronde niet gevonden.' }, { status: 404 })
    const ronde = rondeVan(doc as unknown as Record<string, unknown>)

    if (body.actie === 'status') {
      const status = String(body.status)
      if (!['voorbereiding', 'open', 'gesloten'].includes(status)) return Response.json({ error: 'Ongeldige status.' }, { status: 400 })
      if (ronde.status === 'gepubliceerd') return Response.json({ error: 'De uitslag is al bekendgemaakt.' }, { status: 409 })
      if (status === 'open') {
        const andere = await payload.find({
          collection: 'referendum-rondes',
          where: { and: [{ status: { equals: 'open' } }, { id: { not_equals: rondeId } }] },
          limit: 1,
          overrideAccess: true,
        })
        if (andere.docs.length) return Response.json({ error: `De ronde ${andere.docs[0].seizoen} staat nog open.` }, { status: 409 })
      }
      await payload.update({
        collection: 'referendum-rondes',
        id: rondeId,
        // Bij het sluiten de peildatum voor de belofte vastleggen als die nog leeg is.
        data: { status: status as 'voorbereiding' | 'open' | 'gesloten', ...(status === 'gesloten' && !doc.peildatum ? { peildatum: new Date().toISOString() } : {}) },
        overrideAccess: true,
      })
      return Response.json({ ok: true })
    }

    if (body.actie === 'publiceren') {
      if (ronde.status !== 'gesloten') return Response.json({ error: 'Sluit eerst de stemronde.' }, { status: 409 })
      const winnaars = await publiceer(payload, ronde)
      return Response.json({ ok: true, winnaars })
    }

    return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
