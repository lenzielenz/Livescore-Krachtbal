import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { canAnalyse, hasRole, isFederationLevel } from '@/lib/access'
import { getSelectedSeason } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { buildScoreboards } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { buildSeasonStats, type SeasonPlayer } from '@/lib/season-stats'
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

const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

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

  // Enkel een admin krijgt de volledige scoreopnemer (veldschema) die de analyse-data voedt;
  // daarom tonen we de "manueel opnemen"-sectie enkel aan admins.
  const isAdmin = hasRole(me, 'admin')

  const payload = await getPayloadClient()
  // De analyse-hub toont enkel de wedstrijden die jíj voor analyse hebt ingestoken
  // (analyseOnly) — geen live/competitiewedstrijden. Afgelopen analysewedstrijden moeten
  // bovendien échte worpdata hebben.
  const matchRes = await payload
    .find({
      collection: 'matches',
      where: { and: [{ status: { equals: 'finished' } }, { analyseOnly: { equals: true } }] },
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
  // scoreopnemer. Enkel relevant voor admins.
  const openRes = isAdmin
    ? await payload
        .find({
          collection: 'matches',
          where: { and: [{ status: { in: ['scheduled', 'live'] } }, { analyseOnly: { equals: true } }] },
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
  // Ploegen voor de "nieuwe analysewedstrijd"-creator (enkel admin heeft die nodig).
  const teamsRes = isAdmin
    ? await payload
        .find({ collection: 'teams', where: { reeks: { in: COMPETITIE_REEKSEN.map((o) => o.value) } }, sort: 'name', depth: 0, limit: 500 })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const teamOptions = teamsRes.docs.map((t) => ({
    id: (t as { id: number }).id,
    name: String((t as { name?: unknown }).name ?? '—'),
    reeks: String((t as { reeks?: unknown }).reeks ?? ''),
  }))

  // League-insights: toppers van de gekozen reeks (seizoensbreed, over alle wedstrijden).
  const { reeks: reeksParam } = await searchParams
  const reeks =
    typeof reeksParam === 'string' && COMPETITIE_REEKSEN.some((o) => o.value === reeksParam)
      ? reeksParam
      : COMPETITIE_REEKSEN[0].value
  const season = await buildSeasonStats(payload, reeks, await getSelectedSeason()).catch(() => [] as SeasonPlayer[])
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
        <AnalyseNav active="overzicht" />
        <h1 className="page-title"><span className="brand">Analyse</span></h1>

        {(isFederationLevel(me) || hasRole(me, 'federatie')) && (
          <div className="an-hub-links">
            <Link href="/analyse/import" className="sk-demo-cta">📥 Importeren &amp; opkuisen</Link>
          </div>
        )}

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
          {isAdmin && <div className="rep-card"><span className="rep-num">{openRows.length}</span><span className="rep-lbl">Voorbereid</span></div>}
        </div>

        {isAdmin && (
          <section className="an-record">
            <h2 className="an-sub">🎬 Wedstrijd manueel opnemen</h2>
            <p className="an-intro">
              Start en teken een wedstrijd aan met de volledige scoreopnemer (veldschema). Die detaildata voedt meteen
              de analyse hierboven. Een <strong>analysewedstrijd</strong> wordt niet live of in de rangschikking getoond
              — ze dient puur om data te verzamelen.
            </p>
            <div className="an-record-new">
              <NieuweAnalyseMatch teams={teamOptions} reeksOptions={[...COMPETITIE_REEKSEN]} />
            </div>
            <p style={{ margin: '6px 0 14px' }}>
              <Link href="/analyse/import" className="sk-demo-cta">⬆ Officiële uitslagen importeren →</Link>
            </p>
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
          </section>
        )}

        <h2 className="an-sub">📊 Afgelopen wedstrijden</h2>
        {rows.length === 0 ? (
          <p className="empty">Nog geen afgelopen wedstrijden om te analyseren.</p>
        ) : (
          <div className="an-list">
            {rows.map((r) => (
              <Link key={r.id} href={`/analyse/${r.id}`} className="an-card">
                <span className="an-card-reeks">{r.reeks}</span>
                <span className="an-card-row">
                  <span className="an-team">
                    <TeamLogo name={r.home.name} logoUrl={r.home.logoUrl} logoFit={r.home.logoFit} side="home" size="sm" ringColor={r.home.colors?.primary} />
                    <span className="an-team-nm">{r.home.name}</span>
                  </span>
                  <span className="an-score">{r.score.home}<span className="an-dash">–</span>{r.score.away}</span>
                  <span className="an-team away">
                    <span className="an-team-nm">{r.away.name}</span>
                    <TeamLogo name={r.away.name} logoUrl={r.away.logoUrl} logoFit={r.away.logoFit} side="away" size="sm" ringColor={r.away.colors?.primary} />
                  </span>
                </span>
                <span className="an-card-date">
                  {r.date ? new Date(r.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                </span>
                {isAdmin && <DeleteMatchButton matchId={r.id} label={`${r.home.name} – ${r.away.name}`} />}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
