import type { Payload } from 'payload'

import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS } from '@/lib/reeksen'

// Centrale kantinescherm-selectie. GET levert de gekozen wedstrijden als live-samenvattingen;
// POST bewaart de selectie (komma-gescheiden match-ids) op de settings-global. Geen login nodig:
// de kantine wordt ter plaatse bediend en de inzet is laag (enkel welke borden tonen).

const reeksLabel = (v: unknown) =>
  REEKS_OPTIONS.find((o) => o.value === v)?.label ?? (typeof v === 'string' ? v : 'Overig')

async function readIds(payload: Payload): Promise<number[]> {
  const s = await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)
  const raw = (s as { kantineMatchIds?: string | null } | null)?.kantineMatchIds ?? ''
  return String(raw)
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

export async function GET() {
  try {
    const payload = await getPayloadClient()
    const ids = await readIds(payload)
    const matches = []
    for (const id of ids) {
      try {
        const m = await payload.findByID({ collection: 'matches', id, depth: 0 })
        const s = await buildMatchState(payload, id)
        matches.push({
          id,
          reeks: reeksLabel(m.reeks),
          time: new Date(m.date as string).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
          status: s.match.status,
          home: { name: s.teams.home.name, logoUrl: s.teams.home.logoUrl, logoFit: s.teams.home.logoFit, colors: s.teams.home.colors },
          away: { name: s.teams.away.name, logoUrl: s.teams.away.logoUrl, logoFit: s.teams.away.logoFit, colors: s.teams.away.colors },
          score: s.score,
        })
      } catch {
        // Verwijderde/kapotte wedstrijd overslaan.
      }
    }
    return Response.json({ ids, matches })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let body: { ids?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    : []
  try {
    const payload = await getPayloadClient()
    await payload.updateGlobal({ slug: 'settings', data: { kantineMatchIds: ids.join(',') }, overrideAccess: true })
    return Response.json({ ok: true, ids })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
