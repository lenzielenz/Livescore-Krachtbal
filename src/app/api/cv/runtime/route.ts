import { authUser } from '@/lib/api-auth'
import { isFederationLevel } from '@/lib/access'
import { analyseOmgeving, vergeetOmgeving } from '@/lib/cv-analyse'
import {
  heeftAiModel,
  heeftModelGewichten,
  heeftRuntime,
  installatieLoopt,
  leesRuntimeStand,
  PYTHON_VERSIE,
  startRuntimeInstallatie,
} from '@/lib/cv-runtime'
import { getPayloadClient } from '@/lib/payload-client'

export const dynamic = 'force-dynamic'

// De analyse-omgeving (Python + opencv) op deze server installeren.
//
// Serverbreed, niet per wedstrijd: het raakt iedereen die analyseert, kost een paar honderd MB
// op het volume en haalt een programma van het internet. Daarom federatie/admin — niet iedereen
// die toevallig één opname mag bewerken.

async function toegang(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return { fout: Response.json({ error: 'Niet ingelogd.' }, { status: 401 }) }
  if (!isFederationLevel(user)) {
    return { fout: Response.json({ error: 'Alleen de federatie kan dit installeren.' }, { status: 403 }) }
  }
  return {}
}

export async function GET(req: Request) {
  const t = await toegang(req)
  if ('fout' in t) return t.fout
  const omgeving = await analyseOmgeving()
  return Response.json({
    stand: await leesRuntimeStand(),
    omgevingOk: omgeving.ok,
    reden: omgeving.melding,
    geinstalleerd: heeftRuntime(),
    aiModel: heeftAiModel(),
    // Het pakket staat op het volume, de gewichten stonden vroeger in de container: die zijn
    // na een uitrol weg. Apart melden, anders hangt de eerste analyse op een stille download.
    modelGewichten: heeftModelGewichten(),
    loopt: installatieLoopt(),
    versie: PYTHON_VERSIE,
  })
}

export async function POST(req: Request) {
  const t = await toegang(req)
  if ('fout' in t) return t.fout

  let soort: 'basis' | 'ai' = 'basis'
  try {
    const body = (await req.json()) as { soort?: string }
    if (body?.soort === 'ai') soort = 'ai'
  } catch {
    /* geen body = de gewone omgeving */
  }

  if (soort === 'ai') {
    if (heeftAiModel() && heeftModelGewichten()) {
      return Response.json({ ok: true, stand: await leesRuntimeStand(), alGoed: true })
    }
    const resultaat = await startRuntimeInstallatie(null, vergeetOmgeving, 'ai')
    if (!resultaat.ok) return Response.json({ error: resultaat.fout }, { status: resultaat.code })
    return Response.json({ ok: true, stand: resultaat.stand })
  }

  // Staat er al een werkende Python (bv. lokaal), dan hoeft er niets gehaald te worden.
  const omgeving = await analyseOmgeving()
  if (omgeving.ok) return Response.json({ ok: true, stand: await leesRuntimeStand(), alGoed: true })

  const resultaat = await startRuntimeInstallatie(null, vergeetOmgeving)
  if (!resultaat.ok) return Response.json({ error: resultaat.fout }, { status: resultaat.code })
  return Response.json({ ok: true, stand: resultaat.stand })
}
