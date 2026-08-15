import { SiteHeader } from '@/components/SiteHeader'
import { KrachtbalIcon } from '@/components/KrachtbalIcon'
import { getPayloadClient } from '@/lib/payload-client'
import { krachtbalKleur, reeksNaam } from '@/lib/reeksen'
import { seasonFromDate } from '@/lib/seasons'
import { buildSuperstars, type Superstar } from '@/lib/superstars'
import './superster.css'

export const dynamic = 'force-dynamic'

// Jeugdreeksen, jongens en meisjes apart (U12 is gemengd). Per reeks een eigen klassement.
const YOUTH_REEKSEN = [
  'U18J', 'U18M',
  'U16J', 'U16M', 'U16MA', 'U16MB',
  'U14J', 'U14JA', 'U14JB', 'U14M',
  'U12', 'U12A', 'U12B',
] as const

const MEDAL = ['🥇', '🥈', '🥉']
const reeksLabel = (r: string) => reeksNaam(r as Parameters<typeof reeksNaam>[0])
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '★'

function Board({ reeks, players }: { reeks: string; players: Superstar[] }) {
  if (players.length === 0) return null
  const topRug = Math.max(0, ...players.map((p) => p.rug))
  return (
    <section className="ss-card">
      <h2 className="ss-card-title">{reeksLabel(reeks)}</h2>
      <div className="ss-table" role="table">
        <div className="ss-row ss-head" role="row">
          <span className="ss-rank">#</span>
          <span className="ss-player">Speler</span>
          <span className="ss-num" title="Doelpunten">
            <KrachtbalIcon size="1.3em" kleur={krachtbalKleur(reeks)} style={{ display: 'block', margin: '0 auto' }} />
          </span>
          <span className="ss-num" title="Rugworpen (+2)">🔄</span>
          <span className="ss-num ss-pts" title="Punten">Ptn</span>
        </div>
        {players.slice(0, 12).map((p, i) => (
          <div className={`ss-row${i === 0 ? ' ss-leader' : ''}`} role="row" key={p.playerId}>
            <span className="ss-rank">{MEDAL[i] ?? i + 1}</span>
            <span className="ss-player">
              <span className="ss-name">{p.shirtNumber != null ? `${p.shirtNumber} ` : ''}{p.name}</span>
              <span className="ss-team">{p.teamName}</span>
            </span>
            <span className="ss-num">{p.goals}</span>
            <span className={`ss-num ${p.rug > 0 && p.rug === topRug ? 'ss-rugtop' : ''}`}>{p.rug}</span>
            <span className="ss-num ss-pts">{p.points}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default async function SupersterPage({ searchParams }: { searchParams: Promise<{ seizoen?: string }> }) {
  const { seizoen: qs } = await searchParams
  const seizoen = qs && /^\d{4}-\d{4}$/.test(qs) ? qs : seasonFromDate(new Date())

  const payload = await getPayloadClient()
  const boards = await Promise.all(
    YOUTH_REEKSEN.map(async (reeks) => ({ reeks, players: await buildSuperstars(payload, reeks, seizoen).catch(() => []) })),
  )
  const any = boards.some((b) => b.players.length > 0)

  // De absolute topscorer over alle jeugdreeksen heen → de grote spotlight bovenaan.
  const top = boards
    .flatMap((b) => b.players.map((p) => ({ ...p, reeks: b.reeks })))
    .sort((a, b) => b.points - a.points || b.goals - a.goals)[0]

  return (
    <>
      <SiteHeader active="stand" />
      <main className="ss-page">
        <header className="ss-intro">
          <h1>⭐ <span className="brand">Jeugd-superster</span></h1>
          <p>Wie scoort het meest in zijn reeks? Doelpunten én rugworpen (+2) tellen mee — jongens en meisjes apart. Seizoen {seizoen}.</p>
        </header>

        {top && (
          <section className="ss-hero" aria-label="Superster van het moment">
            <div className="ss-hero-glow" aria-hidden />
            <div className="ss-hero-stars" aria-hidden>
              {['✦', '✧', '★', '✦', '✧'].map((s, i) => (
                <span key={i} className="ss-hero-star" style={{ animationDelay: `${i * 0.5}s` }}>{s}</span>
              ))}
            </div>
            <div className="ss-hero-medal">
              <span className="ss-hero-crown" aria-hidden>👑</span>
              <span className="ss-hero-init">{top.shirtNumber != null ? top.shirtNumber : initials(top.name)}</span>
            </div>
            <div className="ss-hero-info">
              <span className="ss-hero-eyebrow">⭐ Superster van het moment</span>
              <span className="ss-hero-name">{top.name}</span>
              <span className="ss-hero-team">{top.teamName} · {reeksLabel(top.reeks)}</span>
              <div className="ss-hero-stats">
                <span className="ss-hero-stat"><b>{top.goals}</b> doelpunten</span>
                <span className="ss-hero-stat"><b>{top.rug}</b> rugworpen</span>
                <span className="ss-hero-stat big"><b>{top.points}</b> punten</span>
              </div>
            </div>
          </section>
        )}

        {any ? (
          <>
            <p className="ss-aspire">Sta jij hier volgende week? Elke goal telt — knal je naar de top van je reeks! 🔥</p>
            <div className="ss-grid">
              {boards.map((b) => (
                <Board key={b.reeks} reeks={b.reeks} players={b.players} />
              ))}
            </div>
          </>
        ) : (
          <p className="ss-empty">Nog geen jeugddoelpunten dit seizoen. Scoor jij de eerste? Dan sta jij straks groot bovenaan als superster. ⭐</p>
        )}
      </main>
    </>
  )
}
