import type { Where } from 'payload'

import { userClubId } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { rateLimit } from '@/lib/sse-hub'
import { artikelVan, leesOutfit, magGeven, magKopen } from '@/lib/virtueel-fanshop'
import { meldGebeurtenis } from '@/lib/virtueel-praat'
import { GOUDEN_BALLEN, TEMPO, valideerSpoor, vatSporenSamen, type Spoor, type SpoorSoort } from '@/lib/virtueel-sporen'

export const dynamic = 'force-dynamic'

// Sporen in het virtuele stadion (zie lib/virtueel-sporen.ts).
//  GET  ?club=<id>                → de afgeleide toestand van dat stadion (eendjes, verf, popcorn,
//                                   loopband, zetels, highscores, borden, gouden ballen — met die van
//                                   jezelf als je ingelogd bent).
//  POST { soort, waarde }         → iets achterlaten in het stadion van je EIGEN club (bepaald door
//                                   de server). Vereist login; tempo-limiet per soort; elke waarde
//                                   wordt gecontroleerd. Een aankoop in de fanshop, een outfit en
//                                   de kluis worden getoetst aan je eigen sporen (saldo, bezit,
//                                   alle gouden ballen); een Superstar-worp krijgt zijn afstand van
//                                   de server.

/** Hoeveel sporen we per soort meenemen in de samenvatting (de recentste). */
const PER_SOORT: Record<SpoorSoort, number> = { eend: 120, verf: 6, popcorn: 5000, loopband: 5000, zetel: 2000, doelworp: 2000, bord: 50, vondst: 5000, aankoop: 0, outfit: 0, kluis: 0, werp: 0, geschenk: 0 }
/** Wat enkel over jezelf gaat: die halen we apart (en volledig) op voor wie kijkt. */
const EIGEN: SpoorSoort[] = ['vondst', 'aankoop', 'outfit', 'kluis', 'geschenk']

type Doc = Record<string, unknown>
const naarSpoor = (d: Doc): Spoor => ({ id: d.id as number, soort: d.soort as SpoorSoort, waarde: d.waarde as Spoor['waarde'], naam: String(d.authorName ?? 'Supporter'), auteur: relId(d.author), wanneer: String(d.createdAt ?? '') })
const opTijd = (a: Spoor, b: Spoor) => (a.wanneer < b.wanneer ? -1 : a.wanneer > b.wanneer ? 1 : Number(a.id) - Number(b.id))

/**
 * Al je eigen sporen van de soorten die over jezelf gaan (gouden ballen, kast, kluis), plus de
 * cadeaus binnen je club (vatSporenSamen houdt enkel die aan jou over).
 */
async function eigenSporen(payload: Awaited<ReturnType<typeof getPayloadClient>>, ik: number | string, club: number | null): Promise<Spoor[]> {
  const [eigen, cadeaus] = await Promise.all([
    payload
      .find({ collection: 'virtuele-sporen', where: { and: [{ author: { equals: ik } }, { soort: { in: EIGEN } }, stadionVan(club)] }, sort: 'createdAt', depth: 0, limit: 5000, overrideAccess: true })
      .catch(() => ({ docs: [] as Doc[] })),
    payload
      .find({ collection: 'virtuele-sporen', where: { and: [{ soort: { equals: 'geschenk' } }, stadionVan(club)] }, sort: 'createdAt', depth: 0, limit: 5000, overrideAccess: true })
      .catch(() => ({ docs: [] as Doc[] })),
  ])
  const alle = new Map([...(eigen.docs as unknown as Doc[]), ...(cadeaus.docs as unknown as Doc[])].map((d) => [String(d.id), naarSpoor(d)]))
  return [...alle.values()].sort(opTijd)
}

const relId = (v: unknown): number | null => {
  const raw = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

const stadionVan = (club: number | null): Where => (club ? { club: { equals: club } } : { club: { exists: false } })

function naamVan(user: Record<string, unknown>): string {
  const n = typeof user.name === 'string' ? user.name.trim() : ''
  if (n) return n.split(/\s+/)[0]
  const e = typeof user.email === 'string' ? user.email.split('@')[0] : ''
  return e || 'Supporter'
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const club = relId(url.searchParams.get('club'))
  const payload = await getPayloadClient()
  const ik = await authUser(payload, req).catch(() => null)
  const lijsten = await Promise.all(
    (Object.keys(PER_SOORT) as SpoorSoort[]).filter((soort) => PER_SOORT[soort] > 0).map((soort) =>
      payload
        .find({ collection: 'virtuele-sporen', where: { and: [stadionVan(club), { soort: { equals: soort } }] }, sort: '-createdAt', depth: 0, limit: PER_SOORT[soort], overrideAccess: true })
        .then((r) => r.docs as unknown as Record<string, unknown>[])
        .catch(() => [] as Record<string, unknown>[]),
    ),
  )
  const alle = new Map(lijsten.flat().map((d) => [String(d.id), naarSpoor(d)]))
  if (ik) for (const s of await eigenSporen(payload, ik.id as number, club)) alle.set(String(s.id), s)
  const sporen = [...alle.values()].sort(opTijd)
  return Response.json(vatSporenSamen(sporen, ik ? (ik.id as number) : null), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Log in om iets achter te laten in het stadion.' }, { status: 401 })
  let body: { soort?: unknown; waarde?: unknown }
  try {
    body = (await req.json()) as { soort?: unknown; waarde?: unknown }
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }
  const check = valideerSpoor(body.soort, body.waarde)
  if (!check.ok) return Response.json({ error: check.fout }, { status: 400 })
  if (!rateLimit(`spoor:${check.soort}:${user.id}`, TEMPO[check.soort], 60_000)) {
    return Response.json({ error: 'Even rustig aan — probeer het zo opnieuw.' }, { status: 429 })
  }
  const club = relId(userClubId(user))
  const naam = naamVan(user)
  let waarde = check.waarde
  // Wat over je eigen kast of de kluis gaat, toetsen we aan je eigen sporen.
  if (check.soort === 'geschenk') {
    // Een cadeau: enkel iets uit je eigen kast, aan een andere supporter van je eigen club die het
    // nog niet heeft. Wat je geeft, ben je kwijt.
    const { id, aan } = waarde as { id: string; aan: number }
    if (String(aan) === String(user.id)) return Response.json({ error: 'Aan jezelf geven gaat niet.' }, { status: 400 })
    const mij = vatSporenSamen(await eigenSporen(payload, user.id as number, club), user.id as number)
    const fout = magGeven(mij.mij, id)
    if (fout) return Response.json({ error: fout }, { status: 409 })
    const ontvanger = (await payload.findByID({ collection: 'users', id: aan, depth: 0, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null
    if (!ontvanger || relId(userClubId(ontvanger as never)) !== club) return Response.json({ error: 'Je kan enkel iets geven aan een supporter van je eigen club.' }, { status: 409 })
    const hun = vatSporenSamen(await eigenSporen(payload, aan, club), aan)
    if (hun.mij.gekocht.includes(id)) return Response.json({ error: `${naamVan(ontvanger)} heeft dat al.` }, { status: 409 })
    waarde = { id, aan, aanNaam: naamVan(ontvanger) }
  }
  if (check.soort === 'aankoop' || check.soort === 'outfit' || check.soort === 'kluis') {
    const mij = vatSporenSamen(await eigenSporen(payload, user.id as number, club), user.id as number)
    if (check.soort === 'aankoop') {
      const fout = magKopen(mij.mij, (waarde as { id: string }).id)
      if (fout) return Response.json({ error: fout }, { status: 409 })
    } else if (check.soort === 'outfit') {
      waarde = { outfit: leesOutfit((waarde as { outfit: unknown }).outfit, mij.mij.gekocht) }
    } else {
      if (mij.vondsten.mijn.length < GOUDEN_BALLEN) return Response.json({ error: `De kluis gaat pas open met alle ${GOUDEN_BALLEN} gouden ballen.` }, { status: 409 })
      if (mij.mij.sleutel) return Response.json({ error: 'Je hebt de sleutel al.' }, { status: 409 })
    }
  }
  const doc = await payload.create({
    collection: 'virtuele-sporen',
    data: { club: club ?? undefined, soort: check.soort, author: Number(user.id), authorName: naam, waarde },
    overrideAccess: true,
  })
  if (check.soort === 'geschenk' && club != null) {
    const w = waarde as { id: string; aan: number; aanNaam: string }
    meldGebeurtenis(String(club), { soort: 'geschenk', van: String(user.id), vanNaam: naam, aan: String(w.aan), aanNaam: w.aanNaam, artikel: artikelVan(w.id)?.naam ?? w.id })
  }
  return Response.json({ id: doc.id, soort: check.soort, waarde, naam }, { status: 201 })
}
