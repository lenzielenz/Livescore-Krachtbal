import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canAnalyse } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPlayerDanger, type DangerBand } from '@/lib/player-danger'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { buildSeasonStats } from '@/lib/season-stats'
import { GevaarMap } from './GevaarMap'
import { GevaarPicker } from './GevaarPicker'
import '../analyse.css'

export const dynamic = 'force-dynamic'

const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

function BandList({ title, bands }: { title: string; bands: DangerBand[] }) {
  const max = Math.max(1, ...bands.map((b) => b.attempts))
  return (
    <div className="an-chart">
      <h3 className="an-chart-title">{title} <span className="an-chart-hint">scoringskans</span></h3>
      <div className="an-bars">
        {bands.map((b) => (
          <div className="an-bar-row" key={b.label}>
            <span className="an-bar-lbl">{b.label}</span>
            <span className="an-bar-track">
              <span
                className="an-bar-fill"
                style={{ width: `${Math.round((b.attempts / max) * 100)}%`, background: 'var(--accent)' }}
              />
            </span>
            <span className="an-bar-val">
              {b.attempts ? `${Math.round(b.conversion * 100)}%` : '—'}{' '}
              <span className="an-season-sub">({b.goals}/{b.attempts})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Gevaarzone-kaart per speler: van waar op het veld scoort hij het best?
export default async function GevaarPage({ searchParams }: { searchParams: Promise<{ reeks?: string; speler?: string }> }) {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Gevaarzone</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const { reeks: reeksParam, speler: spelerParam } = await searchParams
  const reeks =
    typeof reeksParam === 'string' && COMPETITIE_REEKSEN.some((o) => o.value === reeksParam)
      ? reeksParam
      : COMPETITIE_REEKSEN[0].value

  const payload = await getPayloadClient()
  const seasonPlayers = await buildSeasonStats(payload, reeks)
  const playerOptions = seasonPlayers.map((p) => ({ value: String(p.playerId), label: `#${p.shirtNumber} ${p.name} · ${p.teamName}` }))

  const playerId = spelerParam && playerOptions.some((o) => o.value === spelerParam) ? Number(spelerParam) : null
  const danger = playerId != null ? await buildPlayerDanger(payload, playerId, reeks) : null

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <Link href="/analyse" className="back-link">← Analyse</Link>
        <div className="an-head-bar">
          <h1 className="page-title"><span className="brand">Gevaarzone</span></h1>
          <GevaarPicker
            reeks={reeks}
            reeksOptions={[...COMPETITIE_REEKSEN]}
            playerOptions={playerOptions}
            player={playerId != null ? String(playerId) : ''}
          />
        </div>
        <p className="an-intro">
          Van waar op het veld is de speler gevaarlijk om te scoren? De kaart spiegelt beide helften naar één
          aanvalsrichting (doel onderaan) en kleurt elke zone naar de scoringskans vanaf dat vertrekpunt.
        </p>

        {danger == null ? (
          <p className="empty">Kies een speler om zijn gevaarzone te bekijken.</p>
        ) : danger.attempts === 0 ? (
          <p className="empty">Nog geen doelpogingen van {danger.name} in deze reeks.</p>
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
              <BandList title="Diepte" bands={danger.depthBands} />
              <BandList title="Breedte" bands={danger.zoneBands} />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
