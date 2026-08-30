import { getPayloadClient } from '@/lib/payload-client'

import { cvAuthorized } from '../../../cv-auth'

export const dynamic = 'force-dynamic'

// Fysieke statistiek uit de videotracking (cv/fysiek.py): per speler gelopen afstand, sprintjes
// en topsnelheid. Dit is een eigen méting uit de video (geen afgeleide van de worp-events) en
// wordt daarom als geheel op de wedstrijd bewaard; elke upload vervangt de vorige volledig —
// een herberekening met een betere toewijzing wint altijd.
//
// Auth: zelfde als de andere cv-routes — Bearer CV_BRIDGE_TOKEN of federatie-login (cv-auth.ts).
// Contract (cv/fysiek.py --upload stuurt exact deze vorm):
//   POST { "spelers": [{ team: 'thuis'|'uit', rugnummer, naam?, afstand_m, sprints,
//                        topsnelheid_m_s, actieve_s }] }
//   GET  → { match: { id }, spelers: [...], bijgewerkt } (leeg: spelers = [])

const MAX_SPELERS = 40

function valideerSpeler(s: unknown, index: number): string | null {
  if (!s || typeof s !== 'object') return `speler ${index}: geen object`
  const sp = s as Record<string, unknown>
  if (sp.team !== 'thuis' && sp.team !== 'uit') return `speler ${index}: team moet 'thuis' of 'uit' zijn`
  if (!Number.isInteger(sp.rugnummer) || (sp.rugnummer as number) < 0 || (sp.rugnummer as number) > 99)
    return `speler ${index}: rugnummer moet 0–99 zijn`
  for (const veld of ['afstand_m', 'sprints', 'topsnelheid_m_s', 'actieve_s'] as const) {
    const v = sp[veld]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return `speler ${index}: ${veld} moet een getal ≥ 0 zijn`
  }
  if (sp.naam !== undefined && typeof sp.naam !== 'string') return `speler ${index}: naam moet tekst zijn`
  return null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) {
    return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })
  }

  const payload = await getPayloadClient()
  if (!(await cvAuthorized(payload, req))) {
    return Response.json({ error: 'Geen toegang.' }, { status: 401 })
  }

  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) {
    return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body is geen geldige JSON.' }, { status: 400 })
  }
  const spelers = (body as { spelers?: unknown })?.spelers
  if (!Array.isArray(spelers) || spelers.length === 0) {
    return Response.json({ error: 'spelers moet een niet-lege lijst zijn.' }, { status: 400 })
  }
  if (spelers.length > MAX_SPELERS) {
    return Response.json({ error: `Te veel spelers (max ${MAX_SPELERS}).` }, { status: 400 })
  }
  for (let i = 0; i < spelers.length; i++) {
    const fout = valideerSpeler(spelers[i], i)
    if (fout) return Response.json({ error: fout }, { status: 400 })
  }
  const gezien = new Set<string>()
  for (const s of spelers as { team: string; rugnummer: number }[]) {
    const sleutel = `${s.team}#${s.rugnummer}`
    if (gezien.has(sleutel)) {
      return Response.json({ error: `Dubbele speler: ${sleutel.replace('#', ' #')}.` }, { status: 400 })
    }
    gezien.add(sleutel)
  }

  await payload.update({
    collection: 'matches',
    id: matchId,
    data: { cvFysiek: { spelers, bron: 'cv/fysiek.py', bijgewerkt: new Date().toISOString() } },
    overrideAccess: true,
  })

  return Response.json({ ok: true, match: matchId, spelers: spelers.length })
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isInteger(matchId)) {
    return Response.json({ error: 'Ongeldig match-id.' }, { status: 400 })
  }

  const payload = await getPayloadClient()
  if (!(await cvAuthorized(payload, req))) {
    return Response.json({ error: 'Geen toegang.' }, { status: 401 })
  }

  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  if (!match) {
    return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
  }

  const fysiek = (match.cvFysiek ?? null) as { spelers?: unknown[]; bijgewerkt?: string } | null
  return Response.json({
    match: { id: matchId },
    spelers: Array.isArray(fysiek?.spelers) ? fysiek.spelers : [],
    bijgewerkt: fysiek?.bijgewerkt ?? null,
  })
}
