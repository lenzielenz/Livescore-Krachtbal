import { maakEindronde } from '@/lib/competitieregels'
import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { CATEGORY_OPTIONS } from '@/lib/categories'
import { REEKS_OPTIONS } from '@/lib/reeksen'

// Reglement, verslagen en regels (bouwstenen) beheren — vanuit /federatie/reglement.
//   { actie: 'reglement', id?, titel, geldigVanaf, inhoud, bron? }      nieuwe versie of bewerken
//   { actie: 'activeren', id }                                          deze versie geldt (vorige → archief)
//   { actie: 'reglementVerwijderen', id }                               enkel een concept
//   { actie: 'verslag', id?, titel, datum, reglement, artikel?, inhoud, status? }
//   { actie: 'verslagVerwijderen', id }
//   { actie: 'regel', id?, naam, soort, actief, reglement?, verslag?, artikel?, …parameters }
//   { actie: 'regelVerwijderen', id }
//   { actie: 'eindronde', regelId, start?, forceer? }                   eindronde nu aanmaken
const REEKSEN = new Set(REEKS_OPTIONS.map((o) => o.value as string))
const CATEGORIEEN = new Set(['alle', ...CATEGORY_OPTIONS.map((o) => o.value as string)])
const isDatum = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(new Date(v).getTime())
const tekst = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const optId = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const { payload } = t
  const b = await leesJson(req)
  if (!b) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  const id = optId(b.id)

  try {
    switch (b.actie) {
      case 'reglement': {
        if (!tekst(b.titel) || !isDatum(b.geldigVanaf) || !tekst(b.inhoud)) {
          return Response.json({ error: 'Titel, geldig vanaf en de tekst zijn verplicht.' }, { status: 400 })
        }
        const data = { titel: tekst(b.titel), geldigVanaf: String(b.geldigVanaf), inhoud: String(b.inhoud), bron: tekst(b.bron) || null }
        const doc = id
          ? await payload.update({ collection: 'reglementen', id, data, overrideAccess: true })
          : await payload.create({ collection: 'reglementen', data: { ...data, status: 'concept' }, overrideAccess: true })
        return Response.json({ ok: true, id: doc.id })
      }
      case 'activeren': {
        if (!id) return Response.json({ error: 'Kies een versie.' }, { status: 400 })
        const vorige = await payload.find({ collection: 'reglementen', where: { and: [{ status: { equals: 'actief' } }, { id: { not_equals: id } }] }, depth: 0, limit: 20, overrideAccess: true })
        for (const v of vorige.docs) await payload.update({ collection: 'reglementen', id: v.id, data: { status: 'archief' }, overrideAccess: true })
        await payload.update({ collection: 'reglementen', id, data: { status: 'actief' }, overrideAccess: true })
        return Response.json({ ok: true })
      }
      case 'reglementVerwijderen': {
        const doc = id ? await payload.findByID({ collection: 'reglementen', id, overrideAccess: true }).catch(() => null) : null
        if (!doc) return Response.json({ error: 'Niet gevonden.' }, { status: 404 })
        if (doc.status !== 'concept') return Response.json({ error: 'Enkel een concept kan weg; een geldende of vorige versie blijft bewaard.' }, { status: 409 })
        await payload.delete({ collection: 'reglementen', id: doc.id, overrideAccess: true })
        return Response.json({ ok: true })
      }
      case 'verslag': {
        const reglement = optId(b.reglement)
        if (!tekst(b.titel) || !isDatum(b.datum) || !reglement || !tekst(b.inhoud)) {
          return Response.json({ error: 'Titel, datum, het reglement en de tekst zijn verplicht.' }, { status: 400 })
        }
        const data = {
          titel: tekst(b.titel),
          datum: String(b.datum),
          reglement,
          artikel: tekst(b.artikel) || null,
          inhoud: String(b.inhoud),
          status: (b.status === 'ingetrokken' ? 'ingetrokken' : 'actief') as 'actief' | 'ingetrokken',
        }
        const doc = id
          ? await payload.update({ collection: 'reglement-verslagen', id, data, overrideAccess: true })
          : await payload.create({ collection: 'reglement-verslagen', data, overrideAccess: true })
        return Response.json({ ok: true, id: doc.id })
      }
      case 'verslagVerwijderen': {
        if (!id) return Response.json({ error: 'Kies een verslag.' }, { status: 400 })
        const gebruikt = await payload.count({ collection: 'competitieregels', where: { verslag: { equals: id } }, overrideAccess: true })
        if (gebruikt.totalDocs) return Response.json({ error: 'Een regel steunt op dit verslag. Pas eerst die regel aan, of trek het verslag in.' }, { status: 409 })
        await payload.delete({ collection: 'reglement-verslagen', id, overrideAccess: true })
        return Response.json({ ok: true })
      }
      case 'regel': {
        const soort = b.soort === 'eindronde' ? 'eindronde' : b.soort === 'vastspelen' ? 'vastspelen' : null
        if (!tekst(b.naam) || !soort) return Response.json({ error: 'Naam en soort zijn verplicht.' }, { status: 400 })
        const reglement = optId(b.reglement)
        const verslag = optId(b.verslag)
        if (!reglement && !verslag) return Response.json({ error: 'Kies de bron: een reglement of een verslag.' }, { status: 400 })
        const data: Record<string, unknown> = { naam: tekst(b.naam), soort, actief: b.actief !== false, reglement, verslag, artikel: tekst(b.artikel) || null }
        if (soort === 'vastspelen') {
          const max = Number(b.maxKeerHoger)
          if (!Number.isInteger(max) || max < 1) return Response.json({ error: 'Hoeveel keer hoger mag? (minstens 1)' }, { status: 400 })
          const cat = tekst(b.categorie) || 'alle'
          if (!CATEGORIEEN.has(cat)) return Response.json({ error: 'Onbekende categorie.' }, { status: 400 })
          Object.assign(data, { maxKeerHoger: max, categorie: cat })
        } else {
          const reeksen = (Array.isArray(b.bronReeksen) ? b.bronReeksen : []).map(String)
          const top = Number(b.topPerReeks)
          if (!reeksen.length || reeksen.some((r) => !REEKSEN.has(r))) return Response.json({ error: 'Kies de reeksen waaruit de eindronde komt.' }, { status: 400 })
          if (!Number.isInteger(top) || top < 1) return Response.json({ error: 'Hoeveel ploegen per reeks gaan door?' }, { status: 400 })
          Object.assign(data, {
            bronReeksen: reeksen,
            topPerReeks: top,
            eindrondeNaam: tekst(b.eindrondeNaam) || tekst(b.naam),
            heenEnTerug: Boolean(b.heenEnTerug),
            dagenNaEinde: Math.max(1, Number(b.dagenNaEinde) || 7),
          })
        }
        const doc = id
          ? await payload.update({ collection: 'competitieregels', id, data, overrideAccess: true })
          : await payload.create({ collection: 'competitieregels', data: data as never, overrideAccess: true })
        return Response.json({ ok: true, id: doc.id })
      }
      case 'regelVerwijderen': {
        if (!id) return Response.json({ error: 'Kies een regel.' }, { status: 400 })
        await payload.delete({ collection: 'competitieregels', id, overrideAccess: true })
        return Response.json({ ok: true })
      }
      case 'eindronde': {
        const regelId = optId(b.regelId)
        const regel = regelId ? await payload.findByID({ collection: 'competitieregels', id: regelId, depth: 0, overrideAccess: true }).catch(() => null) : null
        if (!regel || regel.soort !== 'eindronde') return Response.json({ error: 'Kies een eindronde-regel.' }, { status: 404 })
        const r = await maakEindronde(payload, regel as never, { start: isDatum(b.start) ? String(b.start).slice(0, 10) : undefined, forceer: b.forceer === true })
        if (!r) return Response.json({ error: 'Niet aangemaakt: ze bestaat al, of de reeksen zijn nog niet uitgespeeld.' }, { status: 409 })
        return Response.json({ ok: true, ...r })
      }
      default:
        return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
    }
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
