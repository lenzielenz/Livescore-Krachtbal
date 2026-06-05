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
  committed?: { teamsMerged: number; clubsMerged: number; matchesMoved: number; playersMoved: number }
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
            <div className="rep-card"><span className="rep-num">{report.commit ? (report.committed?.matchesMoved ?? 0) : '—'}</span><span className="rep-lbl">Wedstr. verhuisd</span></div>
            <div className="rep-card"><span className="rep-num">{report.commit ? (report.committed?.playersMoved ?? 0) : '—'}</span><span className="rep-lbl">Spelers verhuisd</span></div>
          </div>
          <p className="imp-note">{report.commit ? `✓ ${report.committed?.teamsMerged ?? 0} ploegen en ${report.committed?.clubsMerged ?? 0} clubs samengevoegd.` : 'Voorbeeld — nog niets gewijzigd. Controleer de samenvoegingen hieronder.'}</p>
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
          {(report.teamsToMerge ?? 0) === 0 && (report.clubsToMerge ?? 0) === 0 && <p className="imp-note">✓ Geen dubbels gevonden.</p>}
        </div>
      ))}
    </div>
  )
}
