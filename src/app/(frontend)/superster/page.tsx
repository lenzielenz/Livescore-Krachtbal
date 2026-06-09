import { SiteHeader } from '@/components/SiteHeader'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { seasonFromDate } from '@/lib/seasons'
import { buildSuperstars, type Superstar } from '@/lib/superstars'
import './superster.css'

export const dynamic = 'force-dynamic'

// Jeugdreeksen, jongens en meisjes apart (U12 is gemengd). Per reeks een eigen klassement.
const YOUTH_REEKSEN = ['U18J', 'U18M', 'U16J', 'U16M', 'U14J', 'U14M', 'U12'] as const

const MEDAL = ['🥇', '🥈', '🥉']

function Board({ reeks, players }: { reeks: string; players: Superstar[] }) {
  if (players.length === 0) return null
  const topRug = Math.max(0, ...players.map((p) => p.rug))
  return (
    <section className="ss-card">
      <h2 className="ss-card-title">{reeksNaam(reeks as Parameters<typeof reeksNaam>[0])}</h2>
      <div className="ss-table" role="table">
        <div className="ss-row ss-head" role="row">
          <span className="ss-rank">#</span>
          <span className="ss-player">Speler</span>
          <span className="ss-num" title="Doelpunten">⚽</span>
          <span className="ss-num" title="Rugworpen (+2)">🔄</span>
          <span className="ss-num ss-pts" title="Punten">Ptn</span>
        </div>
        {players.slice(0, 12).map((p, i) => (
          <div className="ss-row" role="row" key={p.playerId}>
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

  return (
    <>
      <SiteHeader active="stand" />
      <main className="ss-page">
        <header className="ss-intro">
          <h1>⭐ <span className="brand">Jeugd-superster</span></h1>
          <p>Wie scoort het meest in zijn reeks? Doelpunten én rugworpen (+2) tellen mee — jongens en meisjes apart. Seizoen {seizoen}.</p>
        </header>
        {any ? (
          <div className="ss-grid">
            {boards.map((b) => (
              <Board key={b.reeks} reeks={b.reeks} players={b.players} />
            ))}
          </div>
        ) : (
          <p className="ss-empty">Nog geen jeugddoelpunten dit seizoen. Zodra er gescoord wordt, verschijnen de superstars hier.</p>
        )}
      </main>
    </>
  )
}
