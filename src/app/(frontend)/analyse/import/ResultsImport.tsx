'use client'

import { useState } from 'react'

type Report = {
  ok?: boolean
  commit?: boolean
  parsed?: number
  played?: number
  toCreate?: number
  toUpdate?: number
  committed?: number
  teamsCreated?: number
  teamsToCreate?: number
  skippedReeks?: string[]
  unmatchedTeams?: string[]
  unmatchedCount?: number
  samples?: string[]
  errors?: string[]
  error?: string
}

export function ResultsImport() {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [createTeams, setCreateTeams] = useState(true)
  const [report, setReport] = useState<Report | null>(null)

  const onFile = async (f: File | null) => {
    if (!f) return
    setFileName(f.name)
    setText(await f.text())
    setReport(null)
  }

  const run = async (commit: boolean) => {
    if (!text.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/results/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ text, commit, createTeams }),
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
      <label className="imp-file">
        <input type="file" accept=".xls,.html,.htm,.txt" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        <span>{fileName || 'Kies het wedstrijden-bestand (.xls / .html)…'}</span>
      </label>

      <label className="imp-check">
        <input type="checkbox" checked={createTeams} onChange={(e) => setCreateTeams(e.target.checked)} />
        Ontbrekende ploegen automatisch aanmaken (met club)
      </label>

      <div className="imp-actions">
        <button type="button" className="sk-btn" disabled={busy || !text.trim()} onClick={() => run(false)}>
          {busy ? 'Bezig…' : '👁 Voorbeeld (niets opslaan)'}
        </button>
        <button type="button" className="sk-btn primary" disabled={busy || !text.trim()} onClick={() => run(true)}>
          {busy ? 'Bezig…' : '⬆ Importeren'}
        </button>
      </div>

      {report && (
        report.error ? (
          <p className="wb-msg">{report.error}</p>
        ) : (
          <div className="imp-report">
            <div className="rep-cards">
              <div className="rep-card"><span className="rep-num">{report.played ?? 0}</span><span className="rep-lbl">Gespeeld</span></div>
              <div className="rep-card"><span className="rep-num">{report.toCreate ?? 0}</span><span className="rep-lbl">Nieuw</span></div>
              <div className="rep-card"><span className="rep-num">{report.toUpdate ?? 0}</span><span className="rep-lbl">Bijwerken</span></div>
              <div className="rep-card"><span className="rep-num">{report.commit ? (report.teamsCreated ?? 0) : (report.teamsToCreate ?? 0)}</span><span className="rep-lbl">Ploegen {report.commit ? 'gemaakt' : 'nieuw'}</span></div>
              <div className="rep-card"><span className="rep-num">{report.commit ? (report.committed ?? 0) : '—'}</span><span className="rep-lbl">Opgeslagen</span></div>
            </div>
            <p className="imp-note">
              {report.commit
                ? `✓ ${report.committed} wedstrijden weggeschreven.`
                : 'Voorbeeld — er is nog niets opgeslagen. Controleer hieronder en klik "Importeren".'}
            </p>
            {report.unmatchedCount ? (
              <details className="imp-det">
                <summary>⚠ {report.unmatchedCount} ploegen niet gevonden (overgeslagen)</summary>
                <p>{(report.unmatchedTeams ?? []).join(' · ')}</p>
                <p className="imp-hint">Deze ploegen bestaan (nog) niet in de juiste reeks. Zet eerst de reeksindeling klaar.</p>
              </details>
            ) : null}
            {report.skippedReeks && report.skippedReeks.length > 0 && (
              <details className="imp-det">
                <summary>↷ Overgeslagen reeksen: {report.skippedReeks.length}</summary>
                <p>{report.skippedReeks.join(' · ')}</p>
              </details>
            )}
            {report.samples && report.samples.length > 0 && (
              <details className="imp-det" open>
                <summary>Voorbeeld van herkende uitslagen</summary>
                <ul>{report.samples.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </details>
            )}
            {report.errors && report.errors.length > 0 && (
              <details className="imp-det"><summary>Fouten</summary><ul>{report.errors.map((s, i) => <li key={i}>{s}</li>)}</ul></details>
            )}
          </div>
        )
      )}
    </div>
  )
}
