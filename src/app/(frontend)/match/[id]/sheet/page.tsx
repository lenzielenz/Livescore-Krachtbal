import Link from 'next/link'
import { notFound } from 'next/navigation'

import { buildMatchSheet } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { SheetActions } from './SheetActions'
import './sheet.css'
import { formatDateTimeBE } from '@/lib/datetime'

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

  const dateStr = formatDateTimeBE(new Date(sheet.match.date), {
    dateStyle: 'full',
    timeStyle: 'short',
  })

  // Officiële blad-velden komen van het matchsheet-document (niet afgeleid uit de worpen).
  const msRes = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 1, limit: 1 })
    .catch(() => null)
  const ms = msRes?.docs[0] as Record<string, unknown> | undefined

  const OFFICIAL_LABELS: Record<string, string> = {
    aantekenaar: 'Aantekenaar', tijdopnemer: 'Tijdopnemer', grensrechterThuis: 'Grensrechter (thuis)',
    grensrechterUit: 'Grensrechter (uit)', terreinafgevaardigde: 'Terreinafgevaardigde',
    coachThuis: 'Coach (thuis)', coachUit: 'Coach (uit)',
  }
  const officials = (ms?.officials ?? {}) as Record<string, string>
  const officialRows = Object.entries(OFFICIAL_LABELS).filter(([k]) => (officials[k] ?? '').trim())
  const forfaitUitslag = (ms?.forfait as { uitslag?: string } | undefined)?.uitslag ?? 'geen'
  const forfaitLabel: Record<string, string> = { thuis: `Forfait — ${sheet.teams.home.name}`, uit: `Forfait — ${sheet.teams.away.name}`, dubbel: 'Dubbel forfait' }
  type Uitsluiting = { player?: { name?: string } | number; naam?: string; reden?: string; score?: string; speeltijd?: string }
  type Voorbehoud = { naam?: string; reden?: string; score?: string }
  const uitsluitingen = (ms?.uitsluitingen ?? []) as Uitsluiting[]
  const voorbehoud = (ms?.voorbehoud ?? []) as Voorbehoud[]
  const opmerkingen = ((ms?.opmerkingen as string) ?? '').trim()
  const deelnameNames = (rows: unknown): Set<string> =>
    new Set(
      (Array.isArray(rows) ? rows : [])
        .filter((r) => (r as { deelgenomen?: boolean }).deelgenomen)
        .map((r) => { const p = (r as { player?: { name?: string } | number }).player; return typeof p === 'object' ? (p?.name ?? '') : '' })
        .filter(Boolean),
    )
  const deelHome = deelnameNames(ms?.homeLineup)
  const deelAway = deelnameNames(ms?.awayLineup)
  const uitsluitNaam = (u: Uitsluiting) => (typeof u.player === 'object' ? (u.player?.name ?? u.naam ?? '—') : (u.naam ?? '—'))

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
                    <li key={p.shirtNumber}><span className="rn">{p.shirtNumber}</span> {p.name}{deelHome.has(p.name) && <span className="roster-o" title="Heeft deelgenomen"> ●O</span>}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>{sheet.teams.away.name}</h3>
                <ul>
                  {sheet.rosters.away.map((p) => (
                    <li key={p.shirtNumber}><span className="rn">{p.shirtNumber}</span> {p.name}{deelAway.has(p.name) && <span className="roster-o" title="Heeft deelgenomen"> ●O</span>}</li>
                  ))}
                </ul>
              </div>
            </div>
            {(deelHome.size > 0 || deelAway.size > 0) && <p className="sheet-dim sheet-legend">●O = heeft effectief deelgenomen</p>}
          </div>
        </section>

        {officialRows.length > 0 && (
          <section className="sheet-block">
            <h2>Officials</h2>
            <div className="sheet-officials">
              {officialRows.map(([k, label]) => (
                <div key={k} className="off-row"><span className="off-lbl">{label}</span><span className="off-val">{officials[k]}</span></div>
              ))}
            </div>
          </section>
        )}

        {forfaitUitslag !== 'geen' && (
          <section className="sheet-block">
            <h2>Forfait</h2>
            <p className="sheet-forfait">{forfaitLabel[forfaitUitslag] ?? 'Forfait'}</p>
          </section>
        )}

        {uitsluitingen.length > 0 && (
          <section className="sheet-block">
            <h2>Uitsluitingen</h2>
            <table className="sheet-goals">
              <thead><tr><th>Speler</th><th>Reden</th><th>Score</th><th>Speeltijd</th></tr></thead>
              <tbody>
                {uitsluitingen.map((u, i) => (
                  <tr key={i}><td>{uitsluitNaam(u)}</td><td>{u.reden ?? '—'}</td><td>{u.score ?? '—'}</td><td>{u.speeltijd ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {voorbehoud.length > 0 && (
          <section className="sheet-block">
            <h2>Voorbehoud</h2>
            <table className="sheet-goals">
              <thead><tr><th>Naam</th><th>Reden</th><th>Score</th></tr></thead>
              <tbody>
                {voorbehoud.map((v, i) => (
                  <tr key={i}><td>{v.naam ?? '—'}</td><td>{v.reden ?? '—'}</td><td>{v.score ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {opmerkingen && (
          <section className="sheet-block">
            <h2>Opmerkingen / kwetsuren</h2>
            <p className="sheet-opmerkingen">{opmerkingen}</p>
          </section>
        )}

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
