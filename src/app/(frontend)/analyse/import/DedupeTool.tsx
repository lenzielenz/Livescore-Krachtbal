'use client'

import { useState } from 'react'

type Report = {
  commit?: boolean
  teamGroups?: number
  teamsToMerge?: number
  clubGroups?: number
  clubsToMerge?: number
  teamMerges?: { keep: string; reeks: string; merge: string[] }[]
  clubMerges?: { keep: string; merge: string[] }[]
  matchGroups?: number
  matchesToMerge?: number
  matchMerges?: { keep: number; weg: number[]; uitslagVan: number | null }[]
  committed?: { teamsMerged: number; clubsMerged: number; matchesMoved: number; playersMoved: number; matchesMerged?: number; matchesNotRemoved?: number }
  error?: string
}

export function DedupeTool() {
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  const run = async (commit: boolean) => {
    setBusy(true)
    try {
      const res = await fetch('/api/teams/dedupe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ commit }),
      })
      setReport(await res.json())
    } catch (e) {
      setReport({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="imp">
      <div className="imp-actions">
        <button type="button" className="sk-btn" disabled={busy} onClick={() => run(false)}>{busy ? 'Bezig…' : '👁 Voorbeeld'}</button>
        <button type="button" className="sk-btn primary" disabled={busy} onClick={() => run(true)}>{busy ? 'Bezig…' : '🧹 Samenvoegen'}</button>
      </div>

      {report && (report.error ? (
        <p className="wb-msg">{report.error}</p>
      ) : (
        <div className="imp-report">
          <div className="rep-cards">
            <div className="rep-card"><span className="rep-num">{report.teamsToMerge ?? 0}</span><span className="rep-lbl">Dubbele ploegen</span></div>
            <div className="rep-card"><span className="rep-num">{report.clubsToMerge ?? 0}</span><span className="rep-lbl">Dubbele clubs</span></div>
            <div className="rep-card"><span className="rep-num">{report.matchesToMerge ?? 0}</span><span className="rep-lbl">Dubbele wedstr.</span></div>
            <div className="rep-card"><span className="rep-num">{report.commit ? (report.committed?.matchesMoved ?? 0) : '—'}</span><span className="rep-lbl">Wedstr. verhuisd</span></div>
            <div className="rep-card"><span className="rep-num">{report.commit ? (report.committed?.playersMoved ?? 0) : '—'}</span><span className="rep-lbl">Spelers verhuisd</span></div>
          </div>
          <p className="imp-note">
            {report.commit
              ? `✓ ${report.committed?.teamsMerged ?? 0} ploegen, ${report.committed?.clubsMerged ?? 0} clubs en ${report.committed?.matchesMerged ?? 0} dubbele wedstrijden samengevoegd.${report.committed?.matchesNotRemoved ? ` ${report.committed.matchesNotRemoved} wedstrijd(en) kon(den) niet weg — bekijk ze in het beheer.` : ''}`
              : 'Voorbeeld — nog niets gewijzigd. Controleer de samenvoegingen hieronder.'}
          </p>
          {report.teamMerges && report.teamMerges.length > 0 && (
            <details className="imp-det" open>
              <summary>Ploegen samenvoegen ({report.teamGroups})</summary>
              <ul>{report.teamMerges.map((m, i) => <li key={i}><b>{m.keep}</b> ← {m.merge.join(' · ')} <em>({m.reeks})</em></li>)}</ul>
            </details>
          )}
          {report.clubMerges && report.clubMerges.length > 0 && (
            <details className="imp-det">
              <summary>Clubs samenvoegen ({report.clubGroups})</summary>
              <ul>{report.clubMerges.map((m, i) => <li key={i}><b>{m.keep}</b> ← {m.merge.join(' · ')}</li>)}</ul>
            </details>
          )}
          {report.matchMerges && report.matchMerges.length > 0 && (
            <details className="imp-det">
              <summary>Dubbele wedstrijden ({report.matchGroups})</summary>
              <ul>
                {report.matchMerges.map((m, i) => (
                  <li key={i}>
                    <a href={`/match/${m.keep}`}>#{m.keep}</a> blijft ← {m.weg.map((w) => `#${w}`).join(' · ')} verdwijnt
                    {m.uitslagVan != null && <em> (uitslag van #{m.uitslagVan} overgenomen)</em>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {(report.teamsToMerge ?? 0) === 0 && (report.clubsToMerge ?? 0) === 0 && (report.matchesToMerge ?? 0) === 0 && <p className="imp-note">✓ Geen dubbels gevonden.</p>}
        </div>
      ))}
    </div>
  )
}
