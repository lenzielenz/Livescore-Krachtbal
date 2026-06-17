import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { competitionWhere } from '@/lib/analyse-access'
import { getPayloadClient } from '@/lib/payload-client'
import { buildDevelopmentBoard, type DevBoardEntry } from '@/lib/player-development-board'
import { COMPETITIE_REEKSEN, reeksNaam } from '@/lib/reeksen'
import './ontwikkeling-board.css'

// Centrale vindplaats voor Spelersontwikkeling (Skill + Fame + badges): een klassement van alle
// spelers, afgeleid uit echte wedstrijddata. Linkt door naar elk profiel voor het volledige paneel.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Spelersontwikkeling — Krachtbal Live' }

const TIER_EMOJI: Record<string, string> = {
  Brons: '🥉',
  Zilver: '🥈',
  Goud: '🥇',
  Platina: '🏅',
  Diamant: '💎',
  Legende: '👑',
}
const RANK_MEDAL = ['🥇', '🥈', '🥉']
const reeksLabel = (r: string) => reeksNaam(r as Parameters<typeof reeksNaam>[0])
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '★'

function Row({ entry, rank }: { entry: DevBoardEntry; rank: number }) {
  const { dev } = entry
  return (
    <Link href={`/spelers/${entry.playerId}`} className={`ob-row${rank === 0 ? ' ob-leader' : ''}`}>
      <span className="ob-rank">{RANK_MEDAL[rank] ?? rank + 1}</span>
      <span className="ob-player">
        <span className="ob-tier" title={dev.overall.tier} aria-hidden>{TIER_EMOJI[dev.overall.tier] ?? '🥉'}</span>
        <span className="ob-pnames">
          <span className="ob-name">{entry.name}</span>
          <span className="ob-team">{entry.teamName} · {reeksLabel(entry.reeks)}</span>
        </span>
      </span>
      <span className="ob-cell ob-skill" title="Skill-niveau">🎯 {dev.skill.level}</span>
      <span className="ob-cell ob-fame" title="Fame-niveau">⭐ {dev.fame.level}</span>
      <span className="ob-cell ob-badges" title="Badges verdiend">🏅 {dev.earnedBadges}/{dev.totalBadges}</span>
      <span className="ob-cell ob-pts" title="Ontwikkelingspunten">{dev.overall.score}</span>
    </Link>
  )
}

function MiniBoard({ title, hint, entries, value }: { title: string; hint: string; entries: DevBoardEntry[]; value: (e: DevBoardEntry) => string }) {
  if (entries.length === 0) return null
  return (
    <section className="ob-mini">
      <h2 className="ob-mini-title">{title}</h2>
      <p className="ob-mini-hint">{hint}</p>
      <ol className="ob-mini-list">
        {entries.map((e) => (
          <li key={e.playerId}>
            <Link href={`/spelers/${e.playerId}`} className="ob-mini-row">
              <span className="ob-mini-name">{e.name}</span>
              <span className="ob-mini-team">{e.teamName}</span>
              <span className="ob-mini-val">{value(e)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default async function OntwikkelingPage() {
  const payload = await getPayloadClient()
  const board = await buildDevelopmentBoard(
    payload,
    COMPETITIE_REEKSEN.map((r) => r.value),
    competitionWhere(),
  ).catch(() => [] as DevBoardEntry[])

  const top = board[0]
  const topSkill = [...board].sort((a, b) => b.dev.skill.score - a.dev.skill.score).slice(0, 5)
  const topFame = [...board].filter((e) => e.dev.fame.score > 0).sort((a, b) => b.dev.fame.score - a.dev.fame.score).slice(0, 5)

  return (
    <>
      <SiteHeader active="stand" />
      <main className="ob">
        <header className="ob-intro">
          <h1>📈 <span className="brand">Spelersontwikkeling</span></h1>
          <p>
            Elke speler bouwt aan twee assen: <strong>🎯 Skill</strong> (beter worden — worpen, doelpunten,
            rugworpen, afstand) en <strong>⭐ Fame</strong> (erkenning — ‘held van de match’-stemmen en
            deelnames). Samen vormen ze een ontwikkelingsniveau met medailles en <strong>🏅 badges</strong>.
            Alles afgeleid uit echte wedstrijddata. Tik een speler voor het volledige profiel.
          </p>
        </header>

        {board.length === 0 ? (
          <p className="ob-empty">
            Nog geen ontwikkelingsdata. Zodra er wedstrijden gespeeld zijn, verschijnen hier de spelers met
            hun niveau, Skill &amp; Fame en verdiende badges.
          </p>
        ) : (
          <>
            {top && (
              <section className="ob-hero" aria-label="Hoogste ontwikkeling">
                <div className="ob-hero-glow" aria-hidden />
                <div className="ob-hero-medal">
                  <span className="ob-hero-tier" aria-hidden>{TIER_EMOJI[top.dev.overall.tier] ?? '🥉'}</span>
                  <span className="ob-hero-init">{top.shirtNumber != null ? top.shirtNumber : initials(top.name)}</span>
                </div>
                <div className="ob-hero-info">
                  <span className="ob-hero-eyebrow">📈 Hoogste ontwikkeling</span>
                  <Link href={`/spelers/${top.playerId}`} className="ob-hero-name">{top.name}</Link>
                  <span className="ob-hero-team">{top.teamName} · {reeksLabel(top.reeks)}</span>
                  <div className="ob-hero-stats">
                    <span className="ob-hero-stat"><b>{top.dev.overall.tier}</b> · niveau {top.dev.overall.level}</span>
                    <span className="ob-hero-stat">🎯 Skill {top.dev.skill.level}</span>
                    <span className="ob-hero-stat">⭐ Fame {top.dev.fame.level}</span>
                    <span className="ob-hero-stat big"><b>{top.dev.overall.score}</b> punten</span>
                  </div>
                </div>
              </section>
            )}

            <section className="ob-board">
              <h2 className="ob-h2">Algemeen klassement</h2>
              <div className="ob-table" role="table">
                <div className="ob-row ob-headrow" role="row">
                  <span className="ob-rank">#</span>
                  <span className="ob-player">Speler</span>
                  <span className="ob-cell ob-skill" title="Skill-niveau">🎯</span>
                  <span className="ob-cell ob-fame" title="Fame-niveau">⭐</span>
                  <span className="ob-cell ob-badges" title="Badges">🏅</span>
                  <span className="ob-cell ob-pts">Ptn</span>
                </div>
                {board.slice(0, 50).map((e, i) => (
                  <Row key={e.playerId} entry={e} rank={i} />
                ))}
              </div>
            </section>

            <div className="ob-minis">
              <MiniBoard title="🎯 Top Skill" hint="beste prestatie-as" entries={topSkill} value={(e) => `Lv ${e.dev.skill.level}`} />
              <MiniBoard title="⭐ Top Fame" hint="meeste erkenning" entries={topFame} value={(e) => `Lv ${e.dev.fame.level}`} />
            </div>
          </>
        )}
      </main>
    </>
  )
}
