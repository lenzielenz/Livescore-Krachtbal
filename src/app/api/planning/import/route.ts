import { hasRole, isFederationLevel } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { hasFunctionGrant } from '@/lib/function-grants'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS, reeksCategorie, type Reeks } from '@/lib/reeksen'

// Bulk-import van het seizoensplan. Per regel: datum ; reeks ; thuisploeg ; uitploeg
// (gescheiden door ; of tab). Ploegen worden op naam opgezocht; reeks op code of label.

function parseDate(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  // dd/mm/jjjj (uu:mm)
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2}))?$/)
  if (m) {
    const [, dd, mm, yyyy, hh = '0', min = '0'] = m
    const year = yyyy.length === 2 ? 2000 + Number(yyyy) : Number(yyyy)
    const d = new Date(year, Number(mm) - 1, Number(dd), Number(hh), Number(min))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  // ISO als laatste poging
  const iso = new Date(t)
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString()
}

function resolveReeks(token: string): Reeks | null {
  const t = token.trim().toLowerCase()
  const hit = REEKS_OPTIONS.find((o) => o.value.toLowerCase() === t || o.label.toLowerCase() === t)
  return hit ? (hit.value as Reeks) : null
}

export async function POST(req: Request) {
  let body: { text?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    const granted = await hasFunctionGrant(payload, user.id, 'beheer/planning')
    if (!isFederationLevel(user) && !hasRole(user, 'federatie') && !granted) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    // Eén keer alle ploegen ophalen → naam (kleine letters) → id.
    const teams = await payload.find({ collection: 'teams', where: competitionWhere(), depth: 0, limit: 2000 })
    const teamByName = new Map<string, number>()
    for (const t of teams.docs) teamByName.set(String(t.name).trim().toLowerCase(), t.id as number)

    const lines = String(body.text ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)

    const results: { line: string; ok: boolean; reason?: string }[] = []
    let created = 0

    for (const line of lines) {
      const cols = line.split(/[\t;]+/).map((c) => c.trim())
      if (cols.length < 4) {
        results.push({ line, ok: false, reason: 'Verwacht 4 velden: datum ; reeks ; thuis ; uit' })
        continue
      }
      const [dateRaw, reeksRaw, homeRaw, awayRaw] = cols
      const date = parseDate(dateRaw)
      const reeks = resolveReeks(reeksRaw)
      const homeId = teamByName.get(homeRaw.toLowerCase())
      const awayId = teamByName.get(awayRaw.toLowerCase())

      if (!date) { results.push({ line, ok: false, reason: `Ongeldige datum: ${dateRaw}` }); continue }
      if (!reeks) { results.push({ line, ok: false, reason: `Onbekende reeks: ${reeksRaw}` }); continue }
      if (!homeId) { results.push({ line, ok: false, reason: `Ploeg niet gevonden: ${homeRaw}` }); continue }
      if (!awayId) { results.push({ line, ok: false, reason: `Ploeg niet gevonden: ${awayRaw}` }); continue }
      if (homeId === awayId) { results.push({ line, ok: false, reason: 'Thuis en uit zijn dezelfde ploeg' }); continue }

      try {
        await payload.create({
          collection: 'matches',
          data: { reeks, category: reeksCategorie(reeks), homeTeam: homeId, awayTeam: awayId, date, status: 'scheduled', goalAreaDepth: 10 },
          overrideAccess: true,
        })
        created += 1
        results.push({ line, ok: true })
      } catch (e) {
        results.push({ line, ok: false, reason: (e as Error).message })
      }
    }

    return Response.json({ created, total: lines.length, results })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
