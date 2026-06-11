import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { canAnalyse, hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { analyseOwnWhere } from '@/lib/analyse-access'
import { getSelectedSeason } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { buildScoreboards, clubLogoUrl } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { COMPETITIE_REEKSEN, reeksNaam, resolveCompetitieReeks } from '@/lib/reeksen'
import { buildSeasonStats, type SeasonPlayer } from '@/lib/season-stats'
import { AnalyseDelen } from './AnalyseDelen'
import { AnalyseNav } from './AnalyseNav'
import { DeleteMatchButton } from './DeleteMatchButton'
import { HubReeksPicker } from './HubReeksPicker'
import { NieuweAnalyseMatch } from './NieuweAnalyseMatch'
import './analyse.css'

// De analyse-tools, gebundeld in twee groepen zodat het overzicht rustig blijft.
const PLOEG_TOOLS = [
  { href: '/analyse/seizoen', icon: '📊', title: 'Seizoensanalyse', desc: 'Ranglijst per reeks met vorm-curve.', tone: 'accent' },
  { href: '/analyse/ploeg', icon: '🛡️', title: 'Ploegrapport', desc: 'Scoutingrapport per ploeg + PDF/CSV-export.', tone: 'away' },
  { href: '/analyse/ploegen', icon: '🆚', title: 'Ploegvergelijking', desc: 'Twee ploegen op een radar van kerncijfers.', tone: 'home' },
] as const
const SPELER_TOOLS = [
  { href: '/analyse/speler', icon: '🪪', title: 'Spelerdossier', desc: 'Alles van één speler op één blad: cijfers, richting, vorm & gevaarzone.', tone: 'accent' },
  { href: '/analyse/spelers', icon: '🎯', title: 'Spelersradar', desc: 'Rating, profiel & vergelijking op zeven assen.', tone: 'home' },
  { href: '/analyse/verwacht', icon: '📐', title: 'Verwachte punten', desc: 'xG-model: wie scoort boven verwachting?', tone: 'pop' },
  { href: '/analyse/gevaar', icon: '🔥', title: 'Gevaarzone', desc: 'Van waar scoort een speler het gevaarlijkst?', tone: 'pop2' },
  { href: '/analyse/panini', icon: '🃏', title: 'Panini', desc: 'Maak een verzamelkaart van elke speler.', tone: 'accent' },
] as const
type Tool = { href: string; icon: string; title: string; desc: string; tone: string }

// Eén leaderboard-kaart (top 5) voor de league-insights op de hub.
function LeaderCard({ icon, title, rows, unit }: { icon: string; title: string; rows: { name: string; shirt: number; team: string; val: string }[]; unit?: string }) {
  return (
    <div className="an-lead">
      <h3 className="an-lead-title"><span aria-hidden>{icon}</span> {title}</h3>
      {rows.length === 0 ? (
        <p className="an-lead-empty">Nog geen data.</p>
      ) : (
        <ol className="an-lead-list">
          {rows.map((r, i) => (
            <li key={`${r.name}-${i}`} className="an-lead-row">
              <span className={`an-lead-rank r${i + 1}`}>{i + 1}</span>
              <span className="an-lead-name">#{r.shirt} {r.name}<span className="an-lead-team">{r.team}</span></span>
              <span className="an-lead-val">{r.val}{unit ? <span className="an-lead-unit">{unit}</span> : null}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export const dynamic = 'force-dynamic'

// Analyse-hub (admin-only): league-dashboard met toppers, tools en je analysewedstrijden.
export default async function AnalysePage({ searchParams }: { searchParams: Promise<{ reeks?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Analyse</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse. Vraag een admin om je toegang te geven.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  // Analyse-data is strikt privé per persoon: je ziet/recordeert enkel je eigen analyse-database
  // (eigen clubs/ploegen/spelers). Iedereen met analyse-toegang mag opnemen — geen competitie-club nodig.
  const isFed = isFederationLevel(me)
  const canRecord = canAnalyse(me)
  const vis = analyseOwnWhere(me) // strikt: enkel je eigen analyse-data

  const payload = await getPayloadClient()

  // Clubhuis-identiteit: het echte logo + de naam van de eigen club (uit de clubs-data) geven de
  // analyse-zone het gevoel "dit is van ons". Geen club of geen logo → terugval op het clubwapen.
  const myClubId = userClubId(me)
  let heroClubName = 'Sint-Michiels'
  let heroLogo: string | null = null
  if (myClubId != null) {
    const club = await payload.findByID({ collection: 'clubs', id: myClubId, depth: 1 }).catch(() => null)
    if (club) {
      const c = club as { displayTitle?: unknown; name?: unknown }
      const nm = (typeof c.displayTitle === 'string' && c.displayTitle.trim()) || (typeof c.name === 'string' && c.name.trim())
      if (nm) heroClubName = nm
      heroLogo = clubLogoUrl({ club })
    }
  }

  // De analyse-hub toont enkel de wedstrijden die voor analyse zijn ingestoken (analyseOnly) — geen
  // live/competitiewedstrijden — en voor een gewone analist enkel z'n eigen opnames. Afgelopen
  // analysewedstrijden moeten bovendien échte worpdata hebben.
  const matchRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ status: { equals: 'finished' } }, { analyseOnly: { equals: true } }, ...(vis ? [vis] : [])] },
      sort: '-date',
      depth: 0,
      limit: 500,
    })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const finishedDocs = matchRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)

  // Enkel afgelopen wedstrijden met échte analyse-data (worp-events) horen op de analyse-hub.
  // Wedstrijden zonder worpen (afgebroken of niet opgenomen) tellen niet mee.
  const finishedIds = finishedDocs.map((m) => (m as { id: number }).id)
  const relId = (v: unknown): number | null =>
    v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null
  const withData = new Set<number>()
  if (finishedIds.length) {
    const throwRes = await payload
      .find({ collection: 'throws', where: { match: { in: finishedIds } }, depth: 0, pagination: false, select: { match: true } })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const t of throwRes.docs) {
      const mid = relId((t as { match?: unknown }).match)
      if (mid != null) withData.add(mid)
    }
  }
  const docs = finishedDocs.filter((m) => withData.has((m as { id: number }).id))

  // Te-recorderen wedstrijden (gepland of live) — om manueel aan te tekenen met de volledige
  // scoreopnemer. Enkel relevant voor wie mag opnemen, en per persoon afgeschermd.
  const openRes = canRecord
    ? await payload
        .find({
          collection: 'matches',
          where: { and: [{ status: { in: ['scheduled', 'live'] } }, { analyseOnly: { equals: true } }, ...(vis ? [vis] : [])] },
          sort: 'date',
          depth: 0,
          limit: 200,
        })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const openDocs = openRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)

  // Eén batched scoreboard-opbouw voor afgelopen + open wedstrijden.
  const cards = await buildScoreboards(payload, [...docs, ...openDocs] as Parameters<typeof buildScoreboards>[1])

  const toRow = (m: Record<string, unknown> | { id: number }) => {
    const id = (m as { id: number }).id
    const c = cards.get(id)
    if (!c) return null
    return {
      id,
      reeks: reeksNaam((m as { reeks?: unknown }).reeks),
      date: (m as { date?: string }).date ?? '',
      status: String((m as { status?: unknown }).status ?? ''),
      home: c.teams.home,
      away: c.teams.away,
      score: c.score,
    }
  }
  type Row = NonNullable<ReturnType<typeof toRow>>
  const notNull = (r: Row | null): r is Row => r != null

  const rows = docs.map(toRow).filter(notNull)
  const openRows = openDocs.map(toRow).filter(notNull)

  // Samenvattende cijfers (goedkoop afgeleid uit de reeds geladen scoreboards).
  const totalPunten = rows.reduce((s, r) => s + r.score.home + r.score.away, 0)
  // Ploegen voor de "nieuwe analysewedstrijd"-creator (enkel wie mag opnemen heeft die nodig).
  // Enkel je eigen analyse-ploegen zijn selecteerbaar voor een nieuwe analysewedstrijd.
  const teamsRes = canRecord
    ? await payload
        .find({ collection: 'teams', where: analyseOwnWhere(me), sort: 'name', depth: 0, limit: 500 })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const teamOptions = teamsRes.docs.map((t) => ({
    id: (t as { id: number }).id,
    name: String((t as { name?: unknown }).name ?? '—'),
    reeks: String((t as { reeks?: unknown }).reeks ?? ''),
  }))

  // League-insights: toppers van de gekozen reeks (seizoensbreed, over alle wedstrijden).
  const { reeks: reeksParam } = await searchParams
  const reeks = resolveCompetitieReeks(reeksParam)
  const season = await buildSeasonStats(payload, reeks, await getSelectedSeason(), vis).catch(() => [] as SeasonPlayer[])
  const top = (sel: (a: SeasonPlayer, b: SeasonPlayer) => number, fmt: (p: SeasonPlayer) => string, filter?: (p: SeasonPlayer) => boolean) =>
    [...(filter ? season.filter(filter) : season)]
      .sort(sel)
      .slice(0, 5)
      .map((p) => ({ name: p.name, shirt: p.shirtNumber, team: p.teamName, val: fmt(p) }))
  const ldTop = top((a, b) => b.points - a.points || b.goals - a.goals, (p) => String(p.points))
  const ldConv = top((a, b) => b.conversion - a.conversion, (p) => `${Math.round(p.conversion * 100)}%`, (p) => p.goalAttempts >= 5)
  const ldDist = top((a, b) => b.maxDistance - a.maxDistance, (p) => p.maxDistance.toFixed(1))
  const ldVol = top((a, b) => b.throws - a.throws, (p) => String(p.throws))
  const hasSeason = season.length > 0

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        {/* Clubhuis-hero: het eigen clublogo + naam. "Dit is óns terrein." */}
        <header className="an-hero">
          <span className="an-hero-badge">
            <span className="an-hero-plate">
              <img
                className="an-hero-crest"
                src={heroLogo ?? '/sint-michiels.svg'}
                alt={`${heroClubName} clublogo`}
                width={84}
                height={84}
              />
            </span>
          </span>
          <div className="an-hero-txt">
            <span className="an-hero-eyebrow">Clubhuis · Analyse</span>
            <h1 className="an-hero-title">{heroClubName}</h1>
            <p className="an-hero-motto">Oltegoare</p>
            <p className="an-hero-tag">
              Onze ploeg, onze cijfers. Hier zien wij wat de tegenstander niet ziet — dit is óns terrein.
            </p>
          </div>
        </header>
        <AnalyseNav active="overzicht" />

        {/* Wedstrijden — openklapbaar menu (gesloten standaard) zodat de hub kort blijft: bovenaan de
            afgelopen analyses, daaronder (voor wie mag opnemen) het manueel opnemen. */}
        <details className="an-record-menu">
          <summary className="an-record-summary">
            <span className="an-record-summary-title">🎬 Wedstrijden</span>
            <span className="an-record-summary-hint">
              afgelopen analyses bekijken{canRecord ? ' · manueel opnemen & toevoegen' : ''}
              {rows.length ? ` · ${rows.length} afgelopen` : ''}{canRecord && openRows.length ? ` · ${openRows.length} voorbereid` : ''}
            </span>
          </summary>
          <div className="an-record-body">
            {canRecord && (
              <>
                <div className="an-record-new">
                  <NieuweAnalyseMatch teams={teamOptions} reeksOptions={[...COMPETITIE_REEKSEN]} />
                </div>
                {openRows.length === 0 ? (
                  <p className="empty">Nog geen voorbereide analysewedstrijden. Maak er een aan met de knop hierboven.</p>
                ) : (
                  <div className="an-list">
                    {openRows.map((r) => (
                      <Link key={r.id} href={`/scorekeeper/${r.id}`} className="an-card">
                        <span className={`an-card-reeks ${r.status === 'live' ? 'an-live' : ''}`}>
                          {r.status === 'live' ? '● LIVE — aantekenen' : '🎬 Analyse · ▶ Activeren'}
                        </span>
                        <span className="an-card-row">
                          <span className="an-team">
                            <TeamLogo name={r.home.name} logoUrl={r.home.logoUrl} logoFit={r.home.logoFit} side="home" size="sm" ringColor={r.home.colors?.primary} />
                            <span className="an-team-nm">{r.home.name}</span>
                          </span>
                          <span className="an-score">{r.status === 'live' ? `${r.score.home}–${r.score.away}` : 'vs'}</span>
                          <span className="an-team away">
                            <span className="an-team-nm">{r.away.name}</span>
                            <TeamLogo name={r.away.name} logoUrl={r.away.logoUrl} logoFit={r.away.logoFit} side="away" size="sm" ringColor={r.away.colors?.primary} />
                          </span>
                        </span>
                        <span className="an-card-date">
                          {r.date ? new Date(r.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                        <DeleteMatchButton matchId={r.id} label={`${r.home.name} – ${r.away.name}`} />
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}

            <h2 className="an-sub" style={canRecord ? undefined : { marginTop: 0 }}>📊 Afgelopen wedstrijden</h2>
            {rows.length === 0 ? (
              <p className="empty">Nog geen afgelopen wedstrijden om te analyseren.</p>
            ) : (
              <div className="an-list an-list-sm">
                {rows.map((r) => (
                  <Link key={r.id} href={`/analyse/${r.id}`} className="an-card">
                    <span className="an-card-reeks">{r.reeks}</span>
                    <span className="an-card-row">
                      <span className="an-team">
                        <TeamLogo name={r.home.name} logoUrl={r.home.logoUrl} logoFit={r.home.logoFit} side="home" size="xs" ringColor={r.home.colors?.primary} />
                        <span className="an-team-nm">{r.home.name}</span>
                      </span>
                      <span className="an-score">{r.score.home}<span className="an-dash">–</span>{r.score.away}</span>
                      <span className="an-team away">
                        <span className="an-team-nm">{r.away.name}</span>
                        <TeamLogo name={r.away.name} logoUrl={r.away.logoUrl} logoFit={r.away.logoFit} side="away" size="xs" ringColor={r.away.colors?.primary} />
                      </span>
                    </span>
                    <span className="an-card-date">
                      {r.date ? new Date(r.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                    </span>
                    {canRecord && <DeleteMatchButton matchId={r.id} label={`${r.home.name} – ${r.away.name}`} />}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </details>

        {/* Analyse delen: duid aan welke accounts jouw analyses mee mogen bekijken. */}
        <AnalyseDelen />

        {/* Tools, gebundeld in twee groepen i.p.v. één lange lijst losse menu's. */}
        {(() => {
          const card = (t: Tool) => (
            <Link key={t.href} href={t.href} className={`an-tool tone-${t.tone}`}>
              <span className="an-tool-ico" aria-hidden>{t.icon}</span>
              <span className="an-tool-body">
                <span className="an-tool-title">{t.title}</span>
                <span className="an-tool-desc">{t.desc}</span>
              </span>
              <span className="an-tool-arrow" aria-hidden>→</span>
            </Link>
          )
          return (
            <>
              <section id="ploegen" className="an-group">
                <h2 className="an-sub">🛡️ Ploegen &amp; competitie</h2>
                <div className="an-tools">{PLOEG_TOOLS.map(card)}</div>
              </section>
              <section id="spelers" className="an-group">
                <h2 className="an-sub">🎯 Spelers</h2>
                <div className="an-tools">{SPELER_TOOLS.map(card)}</div>
              </section>
            </>
          )
        })()}

        {/* League-insights: toppers van de gekozen reeks */}
        <section id="toppers" className="an-toppers">
          <div className="an-head-bar">
            <h2 className="an-sub">🏆 Toppers van de reeks</h2>
            <HubReeksPicker reeks={reeks} options={[...COMPETITIE_REEKSEN]} />
          </div>
          {!hasSeason ? (
            <p className="empty">Nog geen seizoensdata in deze reeks.</p>
          ) : (
            <div className="an-leaders">
              <LeaderCard icon="🏆" title="Topscorers" rows={ldTop} unit=" ptn" />
              <LeaderCard icon="🎯" title="Beste afwerkers" rows={ldConv} />
              <LeaderCard icon="💪" title="Verste worp" rows={ldDist} unit=" m" />
              <LeaderCard icon="⚡" title="Meeste worpen" rows={ldVol} />
            </div>
          )}
        </section>

        <div className="rep-cards an-summary">
          <div className="rep-card"><span className="rep-num">{rows.length}</span><span className="rep-lbl">Opgenomen</span></div>
          <div className="rep-card"><span className="rep-num">{totalPunten}</span><span className="rep-lbl">Punten gescoord</span></div>
          {canRecord && <div className="rep-card"><span className="rep-num">{openRows.length}</span><span className="rep-lbl">Voorbereid</span></div>}
        </div>

        {/* Import-acties (competitie-data) helemaal onderaan — enkel federatie/admin. */}
        {(isFed || hasRole(me, 'federatie')) && (
          <div className="an-hub-links an-hub-links-foot">
            <Link href="/analyse/import" className="sk-demo-cta">📥 Officiële uitslagen importeren &amp; opkuisen</Link>
          </div>
        )}
      </div>
    </>
  )
}
