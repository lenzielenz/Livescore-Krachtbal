'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Report = {
  commit?: boolean
  emptyTeams?: number
  emptyClubs?: number
  deletedTeams?: number
  deletedClubs?: number
  teamSamples?: string[]
  clubSamples?: string[]
  errors?: string[]
  error?: string
}

// Bulk-opkuis: verwijder in één keer lege ploegen (geen spelers/wedstrijden) en lege clubs.
export function EmptyCleanup() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  const run = async (commit: boolean) => {
    if (commit && !window.confirm('Alle lege ploegen en clubs definitief verwijderen?')) return
    setBusy(true)
    try {
      const res = await fetch('/api/cleanup/empty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ commit }),
      })
      setReport(await res.json())
      if (commit) router.refresh()
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
        <button type="button" className="sk-btn primary" disabled={busy} onClick={() => run(true)}>{busy ? 'Bezig…' : '🧹 Opkuisen'}</button>
      </div>

      {report && (report.error ? (
        <p className="wb-msg">{report.error}</p>
      ) : (
        <div className="imp-report">
          <div className="rep-cards">
            <div className="rep-card"><span className="rep-num">{report.emptyTeams ?? 0}</span><span className="rep-lbl">Lege ploegen</span></div>
            <div className="rep-card"><span className="rep-num">{report.emptyClubs ?? 0}</span><span className="rep-lbl">Lege clubs</span></div>
            <div className="rep-card"><span className="rep-num">{report.commit ? (report.deletedTeams ?? 0) + (report.deletedClubs ?? 0) : '—'}</span><span className="rep-lbl">Verwijderd</span></div>
          </div>
          <p className="imp-note">
            {report.commit
              ? `✓ ${report.deletedTeams} ploeg(en) en ${report.deletedClubs} club(s) verwijderd.`
              : 'Voorbeeld — nog niets verwijderd. Lege ploegen = geen spelers én geen wedstrijden; lege clubs = geen ploegen en geen account.'}
          </p>
          {report.teamSamples && report.teamSamples.length > 0 && (
            <details className="imp-det" open><summary>Ploegen ({report.emptyTeams})</summary><p>{report.teamSamples.join(' · ')}{(report.emptyTeams ?? 0) > report.teamSamples.length ? ' · …' : ''}</p></details>
          )}
          {report.clubSamples && report.clubSamples.length > 0 && (
            <details className="imp-det"><summary>Clubs ({report.emptyClubs})</summary><p>{report.clubSamples.join(' · ')}{(report.emptyClubs ?? 0) > report.clubSamples.length ? ' · …' : ''}</p></details>
          )}
          {(report.emptyTeams ?? 0) === 0 && (report.emptyClubs ?? 0) === 0 && <p className="imp-note">✓ Niets te verwijderen.</p>}
        </div>
      ))}
    </div>
  )
}
