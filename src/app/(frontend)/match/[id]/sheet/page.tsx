import Link from 'next/link'
import { notFound } from 'next/navigation'

import { buildMatchSheet } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { SheetActions } from './SheetActions'
import './sheet.css'

export const dynamic = 'force-dynamic'

function fmtClock(total: number): string {
  const s = Math.max(0, Math.floor(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) notFound()

  const payload = await getPayloadClient()
  let sheet
  try {
    sheet = await buildMatchSheet(payload, matchId)
  } catch {
    notFound()
  }

  const dateStr = new Date(sheet.match.date).toLocaleString('nl-BE', {
    dateStyle: 'full',
    timeStyle: 'short',
  })

  return (
    <div className="sheet">
      <div className="sheet-topbar no-print">
        <Link href={`/match/${matchId}`} className="back-link">
          ← Terug naar wedstrijd
        </Link>
        <SheetActions matchId={matchId} />
      </div>

      <article className="sheet-doc">
        <header className="sheet-header">
          <div>
            <h1>Wedstrijdblad</h1>
            <p className="sheet-sub">Krachtbal · {sheet.match.category} · {dateStr}</p>
          </div>
          <div className="sheet-status">{sheet.match.status === 'finished' ? 'Officieel' : 'Voorlopig'}</div>
        </header>

        <section className="sheet-scoreline">
          <div className="sl-team">{sheet.teams.home.name}</div>
          <div className="sl-score">
            {sheet.totals.home} – {sheet.totals.away}
          </div>
          <div className="sl-team">{sheet.teams.away.name}</div>
        </section>

        <table className="sheet-half">
          <thead>
            <tr><th></th><th>1e helft</th><th>2e helft</th><th>Totaal</th><th>Time-outs (1e/2e)</th><th>Kruisjes</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>{sheet.teams.home.name}</td>
              <td>{sheet.halfScores.home[0]}</td>
              <td>{sheet.halfScores.home[1]}</td>
              <td><b>{sheet.totals.home}</b></td>
              <td>{sheet.timeouts.home[0]} / {sheet.timeouts.home[1]}</td>
              <td>{sheet.crosses.home}</td>
            </tr>
            <tr>
              <td>{sheet.teams.away.name}</td>
              <td>{sheet.halfScores.away[0]}</td>
              <td>{sheet.halfScores.away[1]}</td>
              <td><b>{sheet.totals.away}</b></td>
              <td>{sheet.timeouts.away[0]} / {sheet.timeouts.away[1]}</td>
              <td>{sheet.crosses.away}</td>
            </tr>
          </tbody>
        </table>

        <section className="sheet-cols">
          <div>
            <h2>Doelpunten</h2>
            {sheet.goals.length === 0 ? (
              <p className="sheet-dim">Geen doelpunten.</p>
            ) : (
              <table className="sheet-goals">
                <thead><tr><th>Tijd</th><th>Ploeg</th><th>#</th><th>Speler</th><th>Type</th><th>Pt</th></tr></thead>
                <tbody>
                  {sheet.goals.map((g, i) => (
                    <tr key={i}>
                      <td>{g.half}H {fmtClock(g.gameClock)}</td>
                      <td>{g.side === 'home' ? sheet.teams.home.name : sheet.teams.away.name}</td>
                      <td>{g.shirtNumber}</td>
                      <td>{g.playerName}</td>
                      <td>{g.type === 'rug' ? 'rug' : 'nek'}</td>
                      <td>{g.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="sheet-rosters">
            <h2>Opstellingen</h2>
            <div className="roster-grid">
              <div>
                <h3>{sheet.teams.home.name}</h3>
                <ul>
                  {sheet.rosters.home.map((p) => (
                    <li key={p.shirtNumber}><span className="rn">{p.shirtNumber}</span> {p.name}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>{sheet.teams.away.name}</h3>
                <ul>
                  {sheet.rosters.away.map((p) => (
                    <li key={p.shirtNumber}><span className="rn">{p.shirtNumber}</span> {p.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="sheet-signatures">
          <div className="sig"><span className="sig-line" />Scheidsrechter</div>
          <div className="sig"><span className="sig-line" />Verantwoordelijke {sheet.teams.home.name}</div>
          <div className="sig"><span className="sig-line" />Verantwoordelijke {sheet.teams.away.name}</div>
        </section>

        <footer className="sheet-foot">
          Gegenereerd door Krachtbal Live · wedstrijd #{sheet.match.id}
        </footer>
      </article>
    </div>
  )
}
