import { notFound } from 'next/navigation'

import { hasRole, isFederationLevel } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { type LogoFit, normalizeLogoFit } from '@/lib/logo-fit'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksPronostiekStand } from '@/lib/tornooi-pronostiek'
import { buildTournamentState } from '@/lib/tournament-engine'
import { BracketBoard } from './BracketBoard'
import { TornooiBeheer } from './TornooiBeheer'
import '../tornooi.css'

export const dynamic = 'force-dynamic'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

// Boomstructuur van een tornooi: alle rondes naast elkaar, live via SSE. Supporters kijken mee;
// enkel wie het tornooi beheert (federatie/aantekenaar) ziet de aanteken-/veldknoppen. Clublogo's
// worden via naamherkenning naast elke ploeg getoond.
export default async function TornooiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tournamentId = Number(id)
  if (!Number.isFinite(tournamentId)) notFound()

  const payload = await getPayloadClient()
  let state
  try {
    state = await buildTournamentState(payload, tournamentId)
  } catch {
    notFound()
  }

  // Supporters (en dus ook elk vers lid, dat standaard 'scorekeeper' krijgt) kijken alleen:
  // schema en rangschikking. Beheer, aantekenen, plannen en het kantinescherm zijn voor de
  // organisatie — federatie/admin en de aangestelde scheidsrechters.
  const user = await getAuthUser()
  const canManage = isFederationLevel(user) || hasRole(user, 'scheidsrechter')

  // Clublogo's: in de eerste plaats via de EXPLICIETE koppeling (teamClubs, ingegeven bij het
  // aanmaken); anders via naamherkenning als terugval.
  const clubsRes = await payload.find({ collection: 'clubs', where: competitionWhere(), depth: 1, limit: 500 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const clubsNorm: { norm: string; url: string; fit: LogoFit | null }[] = []
  const logoByClubId = new Map<number, string>()
  const fitByClubId = new Map<number, LogoFit>()
  for (const c of clubsRes.docs) {
    const name = String((c as { name?: unknown }).name ?? '')
    const logo = (c as { logo?: { url?: string } }).logo
    const url = logo && typeof logo === 'object' && logo.url ? logo.url : (typeof (c as { logoUrl?: unknown }).logoUrl === 'string' ? String((c as { logoUrl?: string }).logoUrl) : '')
    if (url) {
      // Zoom/positie zoals in de admin ingesteld — zonder deze fit "komt het logo er niet door"
      // (witruimte boven en onder bij logo's met een gekleurde achtergrond).
      const raw = c as { logoZoom?: number | null; logoOffsetX?: number | null; logoOffsetY?: number | null }
      const f = normalizeLogoFit({ zoom: raw.logoZoom ?? 1, offsetX: raw.logoOffsetX ?? 0, offsetY: raw.logoOffsetY ?? 0 })
      const fit = f.zoom === 1 && f.offsetX === 0 && f.offsetY === 0 ? null : f
      logoByClubId.set((c as { id: number }).id, url)
      if (fit) fitByClubId.set((c as { id: number }).id, fit)
      if (name) clubsNorm.push({ norm: norm(name), url, fit })
    }
  }
  clubsNorm.sort((a, b) => b.norm.length - a.norm.length)

  // Expliciete ploeg→club-koppeling van dit tornooi.
  const tourDoc = await payload.findByID({ collection: 'tournaments', id: tournamentId, depth: 0 }).catch(() => null)

  // Aantal velden van de tornooidag: eigen waarde, anders de eerste reeks van de groep die het
  // instelde (zelfde regel als het dagprogramma) — voedt de veldweergave op de wedstrijdkaarten.
  let veldCount = Number((tourDoc as { veldCount?: number | null } | null)?.veldCount) || 0
  const groepNaam = typeof (tourDoc as { groep?: string | null } | null)?.groep === 'string' ? String((tourDoc as { groep?: string | null }).groep).trim() : ''
  if (!veldCount && groepNaam) {
    const zusters = await payload
      .find({ collection: 'tournaments', where: { groep: { equals: groepNaam } }, sort: 'createdAt', depth: 0, limit: 50 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const z of zusters.docs as { veldCount?: number | null }[]) {
      const n = Number(z.veldCount)
      if (Number.isFinite(n) && n >= 1) {
        veldCount = n
        break
      }
    }
  }
  const teamClubs = Array.isArray((tourDoc as { teamClubs?: unknown } | null)?.teamClubs)
    ? (tourDoc as { teamClubs: { name?: unknown; clubId?: unknown }[] }).teamClubs
    : []
  const clubIdByName = new Map<string, number>()
  for (const t of teamClubs) {
    const nm = typeof t?.name === 'string' ? norm(t.name) : ''
    const clubId = Number(t?.clubId)
    if (nm && Number.isFinite(clubId)) clubIdByName.set(nm, clubId)
  }

  const resolveClub = (teamName: string): { url: string; fit: LogoFit | null } | null => {
    const n = norm(teamName)
    if (!n) return null
    const explicitId = clubIdByName.get(n)
    if (explicitId != null && logoByClubId.has(explicitId)) {
      return { url: logoByClubId.get(explicitId) as string, fit: fitByClubId.get(explicitId) ?? null }
    }
    const hit = clubsNorm.find((c) => c.norm.length >= 3 && (n.includes(c.norm) || c.norm.includes(n)))
    return hit ? { url: hit.url, fit: hit.fit } : null
  }
  const names = new Set<string>()
  for (const r of state.rounds) for (const m of r.matches) { if (m.home) names.add(m.home); if (m.away) names.add(m.away) }
  if (state.thirdPlace) { if (state.thirdPlace.home) names.add(state.thirdPlace.home); if (state.thirdPlace.away) names.add(state.thirdPlace.away) }
  for (const s of state.standings ?? []) names.add(s.team)
  const logos: Record<string, string> = {}
  const fits: Record<string, LogoFit> = {}
  for (const nm of names) {
    const club = resolveClub(nm)
    if (club) {
      logos[nm] = club.url
      if (club.fit) fits[nm] = club.fit
    }
  }

  // Beheer (naam/ploegnamen/herloting): ploegnamen in vaste volgorde; herloten kan enkel zolang
  // er nog niets gespeeld is (zelfde regel als de server hanteert).
  const alleMatches = [...state.rounds.flatMap((r) => r.matches), ...(state.thirdPlace ? [state.thirdPlace] : [])]
  const magHerloten = alleMatches.every((m) => {
    const bye = m.status === 'finished' && (!m.home || !m.away)
    return bye || (m.status === 'pending' && m.score.home === 0 && m.score.away === 0)
  })

  // Pronostiekstand van deze reeks. Hoort een reeks bij een tornooidag, dan staat de volledige
  // dagstand op de groepspagina — hier tonen we ze enkel voor een los tornooi.
  const stand = groepNaam ? [] : await reeksPronostiekStand(payload, tournamentId).catch(() => [])

  return (
    <>
      {canManage && (
        <div className="trn-page trn-beheer-wrap">
          <TornooiBeheer
            id={tournamentId}
            naam={state.name}
            categorie={state.category}
            duurMin={Math.round(state.halfDurationSeconds / 60)}
            veldCount={veldCount}
            teams={[...names].sort((a, b) => a.localeCompare(b, 'nl'))}
            magHerloten={magHerloten}
            format={state.format}
            schema={
              // Voorinvulling van de manuele planner (enkel round-robin: alles is ronde 1).
              state.format === 'roundrobin'
                ? alleMatches
                    .filter((m) => m.home && m.away)
                    .map((m) => ({ home: m.home as string, away: m.away as string, plannedAt: m.plannedAt ?? null, veld: m.veld ?? null }))
                : []
            }
          />
        </div>
      )}
      <BracketBoard id={tournamentId} initial={state} canManage={canManage} logos={logos} fits={fits} veldCount={veldCount} ingelogd={Boolean(user)} />
      {stand.length > 0 && (
        <div className="trn-page">
          <section className="trn-hub-sec">
            <h2>🔮 Pronostiekstand</h2>
            <ol className="tp-stand">
              {stand.slice(0, 15).map((r, i) => (
                <li key={r.userId} className={i === 0 ? 'leider' : ''}>
                  <span className="tp-plaats">{i + 1}</span>
                  <span className="tp-naam">{r.name}</span>
                  <span className="tp-detail">
                    {r.predictions} tip{r.predictions === 1 ? '' : 's'}
                    {r.exact > 0 ? ` · ${r.exact}× exact` : ''}
                  </span>
                  <span className="tp-punten">{r.points}</span>
                </li>
              ))}
            </ol>
            <p className="trn-hint">
              Exact = 10 punten · juiste winnaar én saldo = 6 · juiste winnaar = 3 · dichtst bij = 2 bonus.
            </p>
          </section>
        </div>
      )}
    </>
  )
}
