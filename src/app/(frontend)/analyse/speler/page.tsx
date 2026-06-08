import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { analyseMatchWhere } from '@/lib/analyse-access'
import { getSelectedSeason } from '@/lib/analyse-season'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { BandChart } from '@/components/analytics/BandChart'
import { Sparkline } from '@/components/analytics/Sparkline'
import { buildPlayerDanger } from '@/lib/player-danger'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { buildSeasonStats } from '@/lib/season-stats'
import { AnalyseNav } from '../AnalyseNav'
import { GevaarMap } from '../gevaar/GevaarMap'
import { DossierPicker } from './DossierPicker'
import '../analyse.css'

export const dynamic = 'force-dynamic'

const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

// Spelerdossier: álles van één speler op één blad — kerncijfers, richting, vorm en gevaarzone.
export default async function SpelerDossierPage({ searchParams }: { searchParams: Promise<{ reeks?: string; club?: string; speler?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Spelerdossier</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const { reeks: reeksParam, club: clubParam, speler: spelerParam } = await searchParams
  const reeks =
    typeof reeksParam === 'string' && COMPETITIE_REEKSEN.some((o) => o.value === reeksParam) ? reeksParam : COMPETITIE_REEKSEN[0].value

  const payload = await getPayloadClient()
  const seizoen = await getSelectedSeason()
  const seasonPlayers = await buildSeasonStats(payload, reeks, seizoen, analyseMatchWhere(me))

  // Cascade: kies eerst een club (binnen de reeks), dan pas een speler van die club.
  const clubOptions = [...new Map(seasonPlayers.filter((p) => p.teamId != null).map((p) => [p.teamId as number, p.teamName])).entries()]
    .map(([id, name]) => ({ value: String(id), label: name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'nl'))
  const clubId = clubParam && clubOptions.some((o) => o.value === clubParam) ? Number(clubParam) : null
  const inClub = clubId != null ? seasonPlayers.filter((p) => p.teamId === clubId) : []
  const playerOptions = inClub.map((p) => ({ value: String(p.playerId), label: `#${p.shirtNumber} ${p.name}` }))

  const playerId = spelerParam && playerOptions.some((o) => o.value === spelerParam) ? Number(spelerParam) : null
  const p = playerId != null ? seasonPlayers.find((sp) => sp.playerId === playerId) ?? null : null
  const danger = playerId != null ? await buildPlayerDanger(payload, playerId, reeks, seizoen, analyseMatchWhere(me)) : null

  // Periodevergelijking: dezelfde speler in het vorige seizoen (enkel als één seizoen gekozen is).
  const sm = /^(\d{4})-(\d{4})$/.exec(seizoen ?? '')
  const prevSeason = sm ? `${Number(sm[1]) - 1}-${Number(sm[2]) - 1}` : null
  const prevPlayers = prevSeason && playerId != null ? await buildSeasonStats(payload, reeks, prevSeason, analyseMatchWhere(me)).catch(() => []) : []
  const prevP = playerId != null ? prevPlayers.find((sp) => sp.playerId === playerId) ?? null : null
  const delta = (cur: number, prev: number | undefined, digits = 0, unit = '') => {
    if (prev == null) return null
    const d = cur - prev
    const eps = digits ? 0.05 : 0.5
    if (Math.abs(d) < eps) return <span className="dos-delta flat">=</span>
    return <span className={`dos-delta ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d).toFixed(digits)}{unit}</span>
  }

  const zoneTot = p ? p.zones.links + p.zones.midden + p.zones.rechts || 1 : 1

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <AnalyseNav active="spelers" />
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Spelerdossier</span></h1>
          <DossierPicker
            reeks={reeks}
            reeksOptions={[...COMPETITIE_REEKSEN]}
            club={clubId != null ? String(clubId) : ''}
            clubOptions={clubOptions}
            player={playerId != null ? String(playerId) : ''}
            playerOptions={playerOptions}
          />
        </div>

        {p == null ? (
          <p className="empty">Kies een reeks, dan een club en dan een speler om zijn volledige dossier te zien.</p>
        ) : (
          <>
            <div className="dos-head">
              <span className="dos-num">#{p.shirtNumber}</span>
              <span className="dos-id">
                <span className="dos-name">{p.name}</span>
                <span className="dos-team">{p.teamName} · {reeksNaam(reeks)}</span>
              </span>
              <span className={`dos-score ${p.score < 0 ? 'an-neg' : ''}`}>{p.score > 0 ? `+${p.score}` : p.score}<small>score</small></span>
            </div>

            {prevP && <p className="dos-cmp-note">↕ verschil t.o.v. seizoen {prevSeason}</p>}
            <div className="rep-cards an-summary">
              <div className="rep-card"><span className="rep-num">{p.matches}</span><span className="rep-lbl">Wedstrijden</span></div>
              <div className="rep-card"><span className="rep-num">{p.points}</span><span className="rep-lbl">Punten</span>{delta(p.points, prevP?.points)}</div>
              <div className="rep-card"><span className="rep-num">{p.goals}</span><span className="rep-lbl">Doelpunten</span>{delta(p.goals, prevP?.goals)}</div>
              <div className="rep-card"><span className="rep-num">{p.throws}</span><span className="rep-lbl">Worpen</span>{delta(p.throws, prevP?.throws)}</div>
              <div className="rep-card"><span className="rep-num">{Math.round(p.conversion * 100)}%</span><span className="rep-lbl">Conversie</span>{delta(Math.round(p.conversion * 100), prevP ? Math.round(prevP.conversion * 100) : undefined, 0, '%')}</div>
              <div className="rep-card"><span className="rep-num">{p.nek}/{p.rug}</span><span className="rep-lbl">Nek / Rug</span></div>
              <div className="rep-card"><span className="rep-num">{p.avgDistance.toFixed(1)}m</span><span className="rep-lbl">Gem. afstand</span>{delta(p.avgDistance, prevP?.avgDistance, 1, 'm')}</div>
              <div className="rep-card"><span className="rep-num">{p.maxDistance.toFixed(1)}m</span><span className="rep-lbl">Verste worp</span>{delta(p.maxDistance, prevP?.maxDistance, 1, 'm')}</div>
              <div className="rep-card"><span className={`rep-num ${p.lost > 0 ? 'an-neg' : ''}`}>{p.lost}</span><span className="rep-lbl">Geforceerd</span></div>
            </div>

            <div className="an-chart" style={{ marginBottom: 14 }}>
              <h3 className="an-chart-title">Richting <span className="an-chart-hint">aandeel worpen</span></h3>
              <span className="dos-zonebar">
                <i className="seg l" style={{ width: `${(p.zones.links / zoneTot) * 100}%` }}>{p.zones.links || ''}</i>
                <i className="seg m" style={{ width: `${(p.zones.midden / zoneTot) * 100}%` }}>{p.zones.midden || ''}</i>
                <i className="seg r" style={{ width: `${(p.zones.rechts / zoneTot) * 100}%` }}>{p.zones.rechts || ''}</i>
              </span>
              <div className="dos-zonelbl"><span>Links {p.zones.links}</span><span>Midden {p.zones.midden}</span><span>Rechts {p.zones.rechts}</span></div>
            </div>

            {p.trend.length >= 2 && (
              <div className="an-chart">
                <h3 className="an-chart-title">Vorm <span className="an-chart-hint">punten per wedstrijd</span></h3>
                <Sparkline values={p.trend.map((t) => t.points)} width={280} height={60} ariaLabel="Vorm per wedstrijd" />
              </div>
            )}

            <h2 className="an-sub" style={{ marginTop: 18 }}>🔥 Gevaarzone</h2>
            {danger == null || danger.attempts === 0 ? (
              <p className="empty">Nog geen doelpogingen van {p.name} in deze reeks.</p>
            ) : (
              <div className="gev-grid">
                <GevaarMap shots={danger.shots} />
                <div className="gev-side">
                  <div className="rep-cards">
                    <div className="rep-card"><span className="rep-num">{danger.attempts}</span><span className="rep-lbl">Pogingen</span></div>
                    <div className="rep-card"><span className="rep-num">{danger.goals}</span><span className="rep-lbl">Doelpunten</span></div>
                    <div className="rep-card"><span className="rep-num">{Math.round(danger.conversion * 100)}%</span><span className="rep-lbl">Conversie</span></div>
                    <div className="rep-card"><span className="rep-num">{danger.avgDistance}m</span><span className="rep-lbl">Gem. afstand</span></div>
                  </div>
                  <BandChart title="Diepte" bands={danger.depthBands} />
                  <BandChart title="Breedte" bands={danger.zoneBands} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
