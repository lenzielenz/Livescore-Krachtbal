import { hasRole, isFederationLevel } from '@/lib/access'
import { refereeMayHandleMatch, type AuthedUser } from '@/lib/api-auth'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'

type LineupRow = { player?: number | { id: number }; rugnummer?: number | null }

const playerId = (row: LineupRow): number | null =>
  typeof row.player === 'object' ? (row.player?.id ?? null) : (row.player ?? null)

// Na de wedstrijd: de scheidsrechter duidt aan wie effectief gespeeld heeft (O-markering).
// We behouden de geregistreerde opstelling en zetten per speler `deelgenomen` aan/uit;
// spelers die speelden maar niet op het blad stonden, voegen we toe.
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params

  let body: { home?: number[]; away?: number[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!(isFederationLevel(user) || (hasRole(user, 'scheidsrechter') && (await refereeMayHandleMatch(payload, user as unknown as AuthedUser, matchId))))) {
      return Response.json({ error: 'Enkel de scheidsrechter van deze wedstrijd of de federatie.' }, { status: 403 })
    }

    const sheet = await getOrCreateMatchSheet(payload, matchId)
    if (sheet.status === 'ingediend') return Response.json({ error: 'Het blad is ingediend (Item 37).' }, { status: 409 })

    const merge = (existing: LineupRow[] | undefined, played: number[]): LineupRow[] => {
      const rows = (existing ?? []).map((r) => ({ ...r }))
      const known = new Set(rows.map(playerId).filter((id): id is number => id != null))
      // Bestaande regels: deelgenomen-vlag bijwerken.
      const out = rows.map((r) => ({
        player: playerId(r),
        rugnummer: r.rugnummer ?? null,
        deelgenomen: played.includes(playerId(r) ?? -1),
      }))
      // Spelers die speelden maar nog niet op het blad stonden, toevoegen.
      for (const id of played) {
        if (!known.has(id)) out.push({ player: id, rugnummer: null, deelgenomen: true })
      }
      return out as LineupRow[]
    }

    const home = Array.isArray(body.home) ? body.home.map(Number).filter(Number.isFinite) : []
    const away = Array.isArray(body.away) ? body.away.map(Number).filter(Number.isFinite) : []

    // Enkel spelers van de club van die kant (eigen ploeg, of hoger spelend uit een lagere ploeg):
    // anders kon een vreemde speler "gespeeld" krijgen (en meetellen voor referendum of vastspelen).
    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1 }).catch(() => null)
    const clubVan = (v: unknown) => {
      const c = v && typeof v === 'object' ? (v as { club?: unknown }).club : null
      return c && typeof c === 'object' ? (c as { id: number }).id : (c as number | null)
    }
    for (const [ids, club] of [[home, clubVan(match?.homeTeam)], [away, clubVan(match?.awayTeam)]] as const) {
      if (!ids.length) continue
      const ok = await payload.find({ collection: 'players', where: { and: [{ id: { in: ids } }, { 'team.club': { equals: club } }] }, depth: 0, limit: ids.length })
      if (club == null || ok.docs.length !== new Set(ids).size) {
        return Response.json({ error: 'Een aangeduide speler hoort niet bij die club.' }, { status: 400 })
      }
    }

    const updated = await payload.update({
      collection: 'matchsheets',
      id: sheet.id,
      data: {
        homeLineup: merge(sheet.homeLineup as LineupRow[] | undefined, home),
        awayLineup: merge(sheet.awayLineup as LineupRow[] | undefined, away),
      },
      user,
      overrideAccess: false,
    })
    return Response.json({ ok: true, homeLineup: updated.homeLineup, awayLineup: updated.awayLineup })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

// De huidige deelname-selectie ophalen (pre-fill na 'Einde').
export async function GET(_req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  try {
    const payload = await getPayloadClient()
    const sheet = await getOrCreateMatchSheet(payload, matchId)
    const ids = (rows: unknown): number[] =>
      Array.isArray(rows)
        ? rows
            .filter((r) => (r as { deelgenomen?: boolean }).deelgenomen)
            .map((r) => playerId(r as LineupRow))
            .filter((id): id is number => id != null)
        : []
    return Response.json({
      home: ids(sheet.homeLineup),
      away: ids(sheet.awayLineup),
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
