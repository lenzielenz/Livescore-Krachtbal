import { authUser } from '@/lib/api-auth'
import { isFederationLevel } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'
import { kiesHoldout, leesInstellingen, trainModel, verzamelWedstrijden } from '@/lib/cv-training'

export const dynamic = 'force-dynamic'

// Het houdingsmodel bijstellen op de eigen wedstrijden: GET zegt waar het model nu staat,
// POST traint opnieuw op alles wat er intussen bijgekomen is.
//
// Rechten: federatie-niveau. Dit is geen instelling van één wedstrijd — het getrainde bestand
// bepaalt hoe élke volgende analyse op deze server beslist wat een worp is.

async function toegang(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return { fout: Response.json({ error: 'Niet ingelogd.' }, { status: 401 }) }
  if (!isFederationLevel(user)) {
    return { fout: Response.json({ error: 'Enkel op federatie-niveau.' }, { status: 403 }) }
  }
  return { payload }
}

export async function GET(req: Request) {
  const t = await toegang(req)
  if ('fout' in t) return t.fout

  const { kandidaten, overgeslagen } = await verzamelWedstrijden(t.payload)
  return Response.json({
    model: await leesInstellingen(),
    kandidaten: kandidaten.map((k) => ({
      matchId: k.matchId, worpen: k.worpen, metingen: k.metingen, bron: k.bron,
    })),
    holdout: kiesHoldout(kandidaten),
    overgeslagen,
  })
}

export async function POST(req: Request) {
  const t = await toegang(req)
  if ('fout' in t) return t.fout

  const resultaat = await trainModel(t.payload)
  if (!resultaat.ok) {
    return Response.json({ error: resultaat.fout, overgeslagen: resultaat.overgeslagen ?? [] }, { status: resultaat.code })
  }
  return Response.json({
    ok: true,
    model: resultaat.rapport,
    uitvoer: resultaat.uitvoer,
    kandidaten: resultaat.kandidaten.map((k) => ({
      matchId: k.matchId, worpen: k.worpen, metingen: k.metingen, bron: k.bron,
    })),
    overgeslagen: resultaat.overgeslagen,
  })
}
