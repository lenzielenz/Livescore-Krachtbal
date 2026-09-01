import { authUser } from '@/lib/api-auth'
import { afstandUitEvent, richtingUitEvent } from '@/lib/cv-naar-worp'
import { FIELD, matenVanMatch, type VeldMaten } from '@/lib/field'
import { getPayloadClient } from '@/lib/payload-client'
import { mayEditMatchVideo } from '@/lib/video-access'
import {
  analyseOmgeving,
  breekAf,
  leesStand,
  looptErEenAnalyse,
  startAnalyse,
  videoBestand,
  type AnalyseOpties,
} from '@/lib/cv-analyse'

export const dynamic = 'force-dynamic'

// De video-analyse als servertaak: POST start ze, GET vertelt hoe ver ze staat, DELETE breekt
// ze af. Wat de gebruiker anders met de hand in de cv/-map zou draaien, gebeurt hier op de
// server — inclusief het klaarzetten van de voorstellen in de reviewlaan.
//
// Rechten: dezelfde kring die de video van deze wedstrijd beheert. Het is zwaar rekenwerk op
// gedeelde infrastructuur, dus niet iets wat een willekeurige bezoeker mag aanzwengelen.

const STANDEN = ['snel', 'gewoon', 'nauwkeurig', 'ultra'] as const

function leesOpties(body: Record<string, unknown>): AnalyseOpties {
  const stand = STANDEN.includes(body.stand as (typeof STANDEN)[number])
    ? (body.stand as AnalyseOpties['stand'])
    : 'gewoon'
  return {
    stand,
    bewegend: body.bewegend === true,
    tracking: body.tracking === true,
    ai: body.ai === true,
    overlay: body.overlay !== false, // standaard aan: zonder controlebeeld kan je niets beoordelen
  }
}

/**
 * De voorstellen uit de pijplijn in de reviewlaan zetten.
 *
 * Dezelfde vorm en dezelfde regels als de HTTP-brug (`POST /api/cv/events`), maar dan
 * rechtstreeks tegen de eigen database: geen token, geen netwerk in de lus. Rijen die niet
 * kloppen worden overgeslagen in plaats van de hele import te laten mislukken — één rare
 * detectie mag een halfuur rekenwerk niet weggooien.
 */
async function importeerVoorstellen(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  matchId: number,
  veld: { goalAreaDepthM: number; maten: Partial<VeldMaten> },
  regels: Record<string, unknown>[],
): Promise<number> {
  const WORP: Record<string, 'nek' | 'rug'> = { nekworp: 'nek', rugworp: 'rug', nek: 'nek', rug: 'rug' }
  const TYPES = ['worp', 'vangst', 'doelpunt', 'buitenspel']
  let aantal = 0
  for (const e of regels) {
    const tijd = Number(e.video_time_s)
    if (!Number.isFinite(tijd) || tijd < 0) continue
    const type = String(e.event_type ?? 'worp')
    if (!TYPES.includes(type)) continue
    const vertrouwen = Number(e.confidence)
    if (!Number.isFinite(vertrouwen) || vertrouwen < 0 || vertrouwen > 1) continue
    const zone = (e.zone ?? null) as { in_doelgebied?: boolean; x_m?: number; y_m?: number } | null
    const speler = (e.speler ?? null) as { team?: string; rugnummer?: number | null } | null
    const prov = (e.provenance ?? {}) as { model?: string; model_version?: string }
    const rug = speler?.rugnummer
    const worpType = e.worp_type == null ? null : (WORP[String(e.worp_type)] ?? null)
    await payload
      .create({
        collection: 'cv-events',
        data: {
          match: matchId,
          videoTimeS: tijd,
          frame: Number.isFinite(Number(e.frame)) ? Number(e.frame) : null,
          eventType: type as 'worp' | 'vangst' | 'doelpunt' | 'buitenspel',
          worpType,
          worpTypeOrigineel: worpType,
          inDoelgebied: zone?.in_doelgebied === true,
          // Een uitbal heeft geen zone maar wél een landingspunt — bewust buiten de lijnen.
          // Dat punt gaat mee: daarmee leidt de engine bij het overzetten zelf 'uit' af.
          uitbal: e.uitbal === true,
          xM: Number.isFinite(Number(zone?.x_m))
            ? Number(zone?.x_m)
            : e.uitbal === true && Number.isFinite(Number(e.uitbal_x_m)) ? Number(e.uitbal_x_m) : null,
          yM: Number.isFinite(Number(zone?.y_m))
            ? Number(zone?.y_m)
            : e.uitbal === true && Number.isFinite(Number(e.uitbal_y_m)) ? Number(e.uitbal_y_m) : null,
          // Eén bron van waarheid voor de worpafstand: de engine (field.ts) berekent ze hier
          // zelf uit werpplaats + landingspunt, met de diepte en echte veldmaten van déze
          // wedstrijd. Het Python-getal (e.afstand_m) is enkel de CLI-benadering en wordt
          // bewust genegeerd; een uitbal of een event zonder werpplaats krijgt geen afstand.
          afstandM: afstandUitEvent(e, veld.goalAreaDepthM, veld.maten),
          // Welke kant ging hij op — dezelfde twee punten als de afstand, in de veldassen.
          // Een uitbal krijgt géén afstand (reglement) maar wél een richting: dán wil je juist
          // weten waar hij uitging.
          richtingGraden: richtingUitEvent(e, veld.goalAreaDepthM, veld.maten),
          side: speler?.team === 'home' || speler?.team === 'away' ? speler.team : null,
          rugnummer: Number.isInteger(rug) && (rug as number) >= 0 && (rug as number) <= 99 ? (rug as number) : null,
          scoreDelta: Number.isFinite(Number(e.score_delta)) ? Number(e.score_delta) : 0,
          // De werper-groep uit het houdingsmodel: geen rugnummer, wel genoeg om de worpen per
          // speler te groeperen.
          werper: Number.isInteger(Number(e.werper)) ? Number(e.werper) : null,
          confidence: vertrouwen,
          reviewed: false,
          provenance: {
            model: prov.model || 'server-analyse',
            modelVersion: prov.model_version || null,
          },
        },
        overrideAccess: true,
      })
      .then(() => {
        aantal++
      })
      .catch(() => undefined)
  }
  return aantal
}

async function toegang(req: Request, matchId: number) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return { fout: Response.json({ error: 'Niet ingelogd.' }, { status: 401 }) }
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) return { fout: Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 }) }
  if (!mayEditMatchVideo(user, match as { analyseOnly?: boolean | null; analyseOwner?: unknown })) {
    return { fout: Response.json({ error: 'Geen rechten voor de analyse van deze wedstrijd.' }, { status: 403 }) }
  }
  return { payload, match }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })

  const t = await toegang(req, matchId)
  if ('fout' in t) return t.fout
  const { payload, match } = t

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  // De veldgeometrie van deze wedstrijd, voor de afstandsberekening bij het importeren.
  const diepte = Number(match.goalAreaDepth)
  const veld = {
    goalAreaDepthM: Number.isFinite(diepte) && diepte > 0 ? diepte : FIELD.defaultGoalAreaDepthM,
    maten: matenVanMatch(match as { veldBreedte?: number | null; veldSpeelveld?: number | null }),
  }
  const resultaat = await startAnalyse(payload, matchId, leesOpties(body), (regels) =>
    importeerVoorstellen(payload, matchId, veld, regels),
  )
  if (!resultaat.ok) return Response.json({ error: resultaat.fout }, { status: resultaat.code })
  return Response.json({ ok: true, stand: resultaat.stand })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })

  const t = await toegang(req, matchId)
  if ('fout' in t) return t.fout
  const { payload, match } = t

  const video = videoBestand(match.videoUrl as string | null)
  const omgeving = await analyseOmgeving()
  const stand = await leesStand(payload, matchId)
  return Response.json({
    stand,
    // Ontbreekt de omgeving, dan kan de federatie ze hieronder installeren — vandaar apart van
    // 'reden', die ook over een ontbrekende video kan gaan.
    omgevingOk: omgeving.ok,
    heeftOverlay: stand?.rapport?.overlay === true,
    // Wat de gebruiker moet weten vóór hij op de knop drukt: kan deze server het, en hangt
    // er een bestand dat te analyseren valt.
    kanAnalyseren: omgeving.ok && !('fout' in video),
    reden: !omgeving.ok ? omgeving.melding : 'fout' in video ? video.fout : null,
    heeftKalibratie: Array.isArray((match.cvKalibratie as { punten?: unknown[] } | null)?.punten)
      && ((match.cvKalibratie as { punten: unknown[] }).punten.length >= 4),
    andereLoopt: (() => {
      const bezig = looptErEenAnalyse()
      return bezig != null && bezig !== matchId
    })(),
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })

  const t = await toegang(req, matchId)
  if ('fout' in t) return t.fout

  const gestopt = await breekAf(t.payload, matchId)
  return Response.json({ ok: true, gestopt })
}
