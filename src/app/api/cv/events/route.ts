import { FIELD, totalLengthM } from '@/lib/field'
import { getPayloadClient } from '@/lib/payload-client'

import { cvAuthorized } from '../cv-auth'

export const dynamic = 'force-dynamic'

// Importbrug van de computer-vision-pipeline: neemt event-JSON aan en schrijft ze als
// CV-VOORSTELLEN (collection 'cv-events', reviewed=false) weg. Dit raakt de waarheid nooit:
// throws/possessions blijven onaangeroerd — een voorstel wordt pas iets na menselijke review.
//
// Auth: Bearer CV_BRIDGE_TOKEN (timing-veilig vergeleken; zonder env-var bestaat die weg niet)
// of een ingelogde federatie-gebruiker. Body: { matchId, events: [event-JSON…] }, max 500.
// Antwoord: { aanvaard, geweigerd: [{ index, reden }] } — geweigerde events blokkeren de rest niet.

const MAX_EVENTS = 500

const EVENT_TYPES = ['worp', 'vangst', 'doelpunt', 'buitenspel'] as const
type CvEventType = (typeof EVENT_TYPES)[number]

// Het brugcontract spreekt de volle domeintermen; de collection bewaart de korte throw-codes.
const WORP_TYPES: Record<string, 'nek' | 'rug'> = { nekworp: 'nek', rugworp: 'rug' }

interface RuwEvent {
  match_id?: unknown
  video_time_s?: unknown
  frame?: unknown
  event_type?: unknown
  worp_type?: unknown
  zone?: unknown
  afstand_m?: unknown
  speler?: unknown
  score_delta?: unknown
  confidence?: unknown
  provenance?: unknown
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Valideer één event uit de pipeline; geeft de weiger-reden (NL) of null als het geldig is. */
function valideerEvent(e: RuwEvent, matchId: number, veldLengteM: number): string | null {
  if (typeof e !== 'object' || e === null) return 'Event is geen object.'
  if (e.match_id != null && Number(e.match_id) !== matchId) {
    return `match_id ${String(e.match_id)} komt niet overeen met de wedstrijd (${matchId}).`
  }
  if (!isFiniteNumber(e.video_time_s) || e.video_time_s < 0) {
    return 'video_time_s ontbreekt of is geen getal ≥ 0.'
  }
  if (e.frame != null && (!Number.isInteger(e.frame) || (e.frame as number) < 0)) {
    return 'frame moet een geheel getal ≥ 0 of null zijn.'
  }
  if (!EVENT_TYPES.includes(e.event_type as CvEventType)) {
    return `event_type '${String(e.event_type)}' is onbekend (worp/vangst/doelpunt/buitenspel).`
  }
  if (e.worp_type != null && !(String(e.worp_type) in WORP_TYPES)) {
    return `worp_type '${String(e.worp_type)}' is onbekend (nekworp/rugworp).`
  }
  if (e.zone != null) {
    const zone = e.zone as { in_doelgebied?: unknown; x_m?: unknown; y_m?: unknown }
    if (typeof zone !== 'object') return 'zone moet een object of null zijn.'
    if (typeof zone.in_doelgebied !== 'boolean') return 'zone.in_doelgebied moet een boolean zijn.'
    if (!isFiniteNumber(zone.x_m) || zone.x_m < 0 || zone.x_m > FIELD.widthM) {
      return `zone.x_m valt buiten het veld (0..${FIELD.widthM} m).`
    }
    if (!isFiniteNumber(zone.y_m) || zone.y_m < 0 || zone.y_m > veldLengteM) {
      return `zone.y_m valt buiten het veld (0..${veldLengteM} m bij deze doelgebied-diepte).`
    }
  }
  if (e.afstand_m != null && (!isFiniteNumber(e.afstand_m) || e.afstand_m < 0)) {
    return 'afstand_m moet een getal ≥ 0 of null zijn.'
  }
  if (e.speler != null) {
    const speler = e.speler as { team?: unknown; rugnummer?: unknown }
    if (typeof speler !== 'object') return 'speler moet een object of null zijn.'
    if (speler.team !== 'home' && speler.team !== 'away')
      return "speler.team moet 'home' of 'away' zijn."
    if (speler.rugnummer != null && !Number.isInteger(speler.rugnummer)) {
      return 'speler.rugnummer moet een geheel getal of null zijn.'
    }
  }
  if (e.score_delta != null && !Number.isInteger(e.score_delta)) {
    return 'score_delta moet een geheel getal zijn.'
  }
  if (!isFiniteNumber(e.confidence) || e.confidence < 0 || e.confidence > 1) {
    return 'confidence ontbreekt of ligt niet tussen 0 en 1.'
  }
  const prov = e.provenance as { model?: unknown; model_version?: unknown } | null | undefined
  if (
    typeof prov !== 'object' ||
    prov === null ||
    typeof prov.model !== 'string' ||
    !prov.model.trim()
  ) {
    return 'provenance.model ontbreekt.'
  }
  if (prov.model_version != null && typeof prov.model_version !== 'string') {
    return 'provenance.model_version moet een string of null zijn.'
  }
  return null
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  if (!(await cvAuthorized(payload, req))) {
    return Response.json({ error: 'Geen toegang.' }, { status: 401 })
  }

  let body: { matchId?: unknown; events?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON-body.' }, { status: 400 })
  }

  const matchId = Number(body.matchId)
  if (!Number.isInteger(matchId)) {
    return Response.json({ error: 'matchId ontbreekt of is ongeldig.' }, { status: 400 })
  }
  if (!Array.isArray(body.events)) {
    return Response.json({ error: 'events moet een array zijn.' }, { status: 400 })
  }
  if (body.events.length > MAX_EVENTS) {
    return Response.json({ error: `Max. ${MAX_EVENTS} events per aanroep.` }, { status: 400 })
  }

  const match = await payload
    .findByID({ collection: 'matches', id: matchId, depth: 0 })
    .catch(() => null)
  if (!match) {
    return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
  }
  // Zone-bounds hangen af van de doelgebied-diepte van dít terrein (zie src/lib/field.ts).
  const veldLengteM = totalLengthM(match.goalAreaDepth ?? FIELD.defaultGoalAreaDepthM)

  let aanvaard = 0
  const geweigerd: { index: number; reden: string }[] = []

  for (let index = 0; index < body.events.length; index++) {
    const e = body.events[index] as RuwEvent
    const reden = valideerEvent(e, matchId, veldLengteM)
    if (reden) {
      geweigerd.push({ index, reden })
      continue
    }
    const zone = (e.zone ?? null) as { in_doelgebied: boolean; x_m: number; y_m: number } | null
    const speler = (e.speler ?? null) as { team: 'home' | 'away'; rugnummer?: number | null } | null
    const prov = e.provenance as { model: string; model_version?: string | null }
    try {
      await payload.create({
        collection: 'cv-events',
        data: {
          match: matchId,
          videoTimeS: e.video_time_s as number,
          frame: (e.frame ?? null) as number | null,
          eventType: e.event_type as CvEventType,
          worpType: e.worp_type == null ? null : WORP_TYPES[String(e.worp_type)],
          // De claim van het model, bevroren bij aanmaak: review mag worpType later corrigeren,
          // maar retraining wil "model zei X, mens zei Y" — dit veld verandert nooit meer.
          worpTypeOrigineel: e.worp_type == null ? null : WORP_TYPES[String(e.worp_type)],
          inDoelgebied: zone?.in_doelgebied ?? false,
          xM: zone?.x_m ?? null,
          yM: zone?.y_m ?? null,
          afstandM: (e.afstand_m ?? null) as number | null,
          side: speler?.team ?? null,
          rugnummer: speler?.rugnummer ?? null,
          scoreDelta: (e.score_delta ?? 0) as number,
          confidence: e.confidence as number,
          // Altijd ongereviewd binnen: een voorstel wordt pas iets na menselijke controle.
          reviewed: false,
          provenance: { model: prov.model, modelVersion: prov.model_version ?? null },
        },
        overrideAccess: true,
      })
      aanvaard++
    } catch (err) {
      // Eén kapot event mag de rest van de batch niet meesleuren in een kale 500:
      // het antwoordcontract blijft overeind en de afzender ziet wélk event faalde.
      geweigerd.push({ index, reden: `opslaan mislukt: ${(err as Error).message}` })
    }
  }

  return Response.json({ aanvaard, geweigerd })
}
