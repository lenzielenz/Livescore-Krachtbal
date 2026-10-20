import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { kiesbaarVoor, PUNTEN, stemFouten, type StemRegel } from '@/lib/referendum'
import { bestaandeStem, openRonde, stemmerVoor } from '@/lib/referendum-server'

// Stemmen voor speler/speelster van het jaar (zie lib/referendum.ts).
//   GET  → { ronde, magStemmen, reden?, kiesbaar, mijnStem }
//   POST { regels: [{ speler, punten }] } → { ok }
// Zolang de ronde open is, kan je je stem aanpassen; de laatste telt.
export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  const ronde = await openRonde(payload)
  if (!ronde) return Response.json({ ronde: null, magStemmen: false, reden: 'Er loopt nu geen stemronde.' })
  if (!user) return Response.json({ ronde: { seizoen: ronde.seizoen }, magStemmen: false, reden: 'Log in om te stemmen.' })
  const { stemmer, reden, kandidaten } = await stemmerVoor(payload, user, ronde)
  if (!stemmer) return Response.json({ ronde: { seizoen: ronde.seizoen }, magStemmen: false, reden })
  const stem = await bestaandeStem(payload, ronde.id, stemmer.speler.id)
  return Response.json({
    ronde: { seizoen: ronde.seizoen },
    magStemmen: true,
    competitie: stemmer.competitie,
    ik: { naam: stemmer.speler.naam, clubNaam: stemmer.speler.clubNaam },
    kiesbaar: kiesbaarVoor({ id: stemmer.speler.id, clubId: stemmer.speler.clubId }, kandidaten).map((k) => ({ id: k.id, naam: k.naam, clubNaam: k.clubNaam })),
    mijnStem: stem
      ? (stem.regels ?? []).map((r) => ({ speler: typeof r.speler === 'object' ? r.speler.id : r.speler, punten: r.punten }))
      : null,
  })
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om te stemmen.' }, { status: 401 })
  const ronde = await openRonde(payload)
  if (!ronde) return Response.json({ error: 'Er loopt nu geen stemronde.' }, { status: 409 })

  let body: { regels?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  const regels: StemRegel[] = (Array.isArray(body.regels) ? body.regels : [])
    .slice(0, PUNTEN.length + 1)
    .map((r) => ({ speler: Number((r as { speler?: unknown }).speler), punten: Number((r as { punten?: unknown }).punten) }))

  const { stemmer, reden, kandidaten } = await stemmerVoor(payload, user, ronde)
  if (!stemmer) return Response.json({ error: reden ?? 'Je mag niet stemmen.' }, { status: 403 })
  const fouten = stemFouten(regels, { id: stemmer.speler.id, clubId: stemmer.speler.clubId }, kandidaten)
  if (fouten.length) return Response.json({ error: fouten.join(' ') }, { status: 400 })

  const data = { ronde: ronde.id, stemmer: stemmer.speler.id, competitie: stemmer.competitie, regels }
  const bestaand = await bestaandeStem(payload, ronde.id, stemmer.speler.id)
  if (bestaand) await payload.update({ collection: 'referendum-stemmen', id: bestaand.id, data, overrideAccess: true })
  else await payload.create({ collection: 'referendum-stemmen', data, overrideAccess: true })
  return Response.json({ ok: true })
}
