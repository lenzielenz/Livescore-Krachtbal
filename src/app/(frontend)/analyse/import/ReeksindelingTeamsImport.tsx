'use client'

import { useState } from 'react'

import { seasonFromDate } from '@/lib/seasons'

type Report = {
  commit?: boolean
  seizoen?: string
  entries?: number
  clubsToCreate?: number
  teamsToCreate?: number
  existingTeams?: number
  thuisToSet?: number
  createdClubs?: number
  createdTeams?: number
  thuisSet?: number
  samples?: string[]
  errors?: string[]
  error?: string
}

// Seizoensopties rond het huidige seizoen.
function seasonOptions(): string[] {
  const cur = seasonFromDate(new Date())
  const startYear = Number(cur.split('-')[0])
  return [startYear - 1, startYear, startYear + 1].map((y) => `${y}-${y + 1}`)
}

export function ReeksindelingTeamsImport() {
  const [file, setFile] = useState<File | null>(null)
  const [seizoen, setSeizoen] = useState(() => seasonFromDate(new Date()))
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  const run = async (commit: boolean) => {
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('pdf', file)
      fd.append('commit', String(commit))
      fd.append('seizoen', seizoen)
      const res = await fetch('/api/reeksindeling/teams', { method: 'POST', credentials: 'include', body: fd })
      setReport(await res.json())
    } catch (e) {
      setReport({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="imp">
      <label className="rad-field" style={{ maxWidth: 240, marginBottom: 10 }}>
        <span>Seizoen</span>
        <select className="rang-picker" value={seizoen} onChange={(e) => setSeizoen(e.target.value)}>
          {seasonOptions().map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="imp-file">
        <input type="file" accept=".pdf,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null) }} />
        <span>{file?.name || 'Kies de reeksindeling-PDF…'}</span>
      </label>
      <div className="imp-actions">
        <button type="button" className="sk-btn" disabled={busy || !file} onClick={() => run(false)}>{busy ? 'Bezig…' : '👁 Voorbeeld'}</button>
        <button type="button" className="sk-btn primary" disabled={busy || !file} onClick={() => run(true)}>{busy ? 'Bezig…' : `⬆ Importeren (${seizoen})`}</button>
      </div>

      {report && (report.error ? (
        <p className="wb-msg">{report.error}</p>
      ) : (
        <div className="imp-report">
          <div className="rep-cards">
            <div className="rep-card"><span className="rep-num">{report.teamsToCreate ?? 0}</span><span className="rep-lbl">Nieuwe ploegen</span></div>
            <div className="rep-card"><span className="rep-num">{report.clubsToCreate ?? 0}</span><span className="rep-lbl">Nieuwe clubs</span></div>
            <div className="rep-card"><span className="rep-num">{report.thuisToSet ?? 0}</span><span className="rep-lbl">Speeluren</span></div>
            <div className="rep-card"><span className="rep-num">{report.commit ? (report.createdTeams ?? 0) : '—'}</span><span className="rep-lbl">Aangemaakt</span></div>
          </div>
          <p className="imp-note">
            {report.commit
              ? `✓ Seizoen ${report.seizoen}: ${report.createdClubs} club(s) en ${report.createdTeams} ploeg(en) aangemaakt, ${report.thuisSet} speeluur/-uren ingesteld.`
              : 'Voorbeeld — nog niets opgeslagen. Controleer hieronder.'}
          </p>
          {report.samples && report.samples.length > 0 && (
            <details className="imp-det" open>
              <summary>Voorbeeld van aan te maken ploegen</summary>
              <ul>{report.samples.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </details>
          )}
          {report.errors && report.errors.length > 0 && (
            <details className="imp-det"><summary>Fouten</summary><ul>{report.errors.map((s, i) => <li key={i}>{s}</li>)}</ul></details>
          )}
        </div>
      ))}
    </div>
  )
}
