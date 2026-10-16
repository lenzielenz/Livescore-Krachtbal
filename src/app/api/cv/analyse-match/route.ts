import { canAnalyse } from '@/lib/access'
import { analyseKopieVan } from '@/lib/analyse-kopie'
import { getPayloadClient } from '@/lib/payload-client'
import type { Match, Team } from '@/payload-types'

import { cvAuthorized } from '../cv-auth'

export const dynamic = 'force-dynamic'

// Analysewedstrijd voor een video-analyse die buiten de site draait (de krachtbal-analyse-app):
// dezelfde analyse-kopie van een kalenderwedstrijd als "toevoegen uit de agenda"
// (/api/analyse/match met fromMatch), maar aangevraagd door de pipeline in naam van een eigenaar.
// Zo landt de analyse in de EIGEN analyse-omgeving van die gebruiker — de officiële wedstrijd,
// ploegen en spelers worden enkel gelezen.
//
// Idempotent: bestaat er voor die eigenaar al een analysekopie met dezelfde ploegen en datum, dan
// komt die terug (nieuw: false) i.p.v. een tweede.
//
// Auth: Bearer CV_BRIDGE_TOKEN of federatie-login (cv-auth.ts).
// Contract: POST { fromMatch, eigenaar?: e-mailadres (anders env CV_ANALYSE_EIGENAAR),
//                  goalAreaDepth?: 5..25 (opgemeten doelgebied) }
//   200 { id, nieuw, homeName, awayName }; 400/401/403/404 { error }

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  if (!(await cvAuthorized(payload, req))) {
    return Response.json({ error: 'Geen toegang.' }, { status: 401 })
  }

  let body: { fromMatch?: unknown; eigenaar?: unknown; goalAreaDepth?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body is geen geldige JSON.' }, { status: 400 })
  }

  const echtId = Number(body.fromMatch)
  if (!Number.isInteger(echtId)) return Response.json({ error: 'fromMatch ontbreekt.' }, { status: 400 })
  const email = String(body.eigenaar ?? process.env.CV_ANALYSE_EIGENAAR ?? '')
    .trim()
    .toLowerCase()
  if (!email) return Response.json({ error: 'eigenaar (e-mailadres) ontbreekt.' }, { status: 400 })
  const diepte = body.goalAreaDepth == null ? null : Number(body.goalAreaDepth)
  if (diepte != null && (!Number.isFinite(diepte) || diepte < 5 || diepte > 25)) {
    return Response.json({ error: 'goalAreaDepth moet tussen 5 en 25 m liggen.' }, { status: 400 })
  }

  const gebruikers = await payload
    .find({ collection: 'users', where: { email: { equals: email } }, depth: 0, limit: 1, overrideAccess: true })
    .catch(() => ({ docs: [] as unknown[] }))
  const eigenaar = gebruikers.docs[0] as { id: number } | undefined
  if (!eigenaar) return Response.json({ error: `Geen gebruiker met e-mailadres ${email}.` }, { status: 404 })
  if (!canAnalyse(eigenaar)) {
    return Response.json({ error: 'Deze gebruiker heeft geen analyse-toegang.' }, { status: 403 })
  }
  const eigenaarId = Number(eigenaar.id)

  const echt = (await payload.findByID({ collection: 'matches', id: echtId, depth: 2 }).catch(() => null)) as Match | null
  if (!echt || echt.analyseOnly || (echt as { isDemo?: boolean }).isDemo) {
    return Response.json({ error: 'Wedstrijd niet gevonden in de kalender.' }, { status: 404 })
  }
  const echtThuis = echt.homeTeam && typeof echt.homeTeam === 'object' ? (echt.homeTeam as Team) : null
  const echtUit = echt.awayTeam && typeof echt.awayTeam === 'object' ? (echt.awayTeam as Team) : null
  if (!echtThuis || !echtUit || !echt.reeks) {
    return Response.json({ error: 'Deze kalenderwedstrijd is onvolledig.' }, { status: 400 })
  }
  const reeks = String(echt.reeks)
  const date = echt.date ? String(echt.date) : new Date().toISOString()
  const [homeTeam, awayTeam] = await Promise.all([
    analyseKopieVan(payload, echtThuis, reeks, eigenaarId),
    analyseKopieVan(payload, echtUit, reeks, eigenaarId),
  ])
  if (homeTeam === awayTeam) {
    return Response.json({ error: 'Thuis- en uitploeg vallen samen in de analyse-kopie.' }, { status: 400 })
  }

  const bestaand = await payload
    .find({
      collection: 'matches',
      where: {
        and: [
          { analyseOnly: { equals: true } },
          { analyseOwner: { equals: eigenaarId } },
          { homeTeam: { equals: homeTeam } },
          { awayTeam: { equals: awayTeam } },
          { date: { equals: date } },
        ],
      },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })
    .catch(() => ({ docs: [] as { id: number }[] }))

  let id: number
  let nieuw = false
  if (bestaand.docs[0]) {
    id = Number((bestaand.docs[0] as { id: number }).id)
  } else {
    const created = await payload.create({
      collection: 'matches',
      data: {
        reeks: reeks as NonNullable<Match['reeks']>,
        homeTeam,
        awayTeam,
        date,
        status: 'scheduled',
        goalAreaDepth: diepte ?? (typeof echt.goalAreaDepth === 'number' ? echt.goalAreaDepth : 10),
        analyseOnly: true,
        analyseOwner: eigenaarId,
        analyseModus: 'video',
      },
      overrideAccess: true,
    })
    id = Number((created as { id: number }).id)
    nieuw = true
  }
  return Response.json({ id, nieuw, homeName: String(echtThuis.name ?? ''), awayName: String(echtUit.name ?? '') })
}
