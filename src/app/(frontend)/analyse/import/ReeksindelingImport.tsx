'use client'

import { useState } from 'react'

type Report = {
  commit?: boolean
  entries?: number
  toUpdate?: number
  committed?: number
  unmatchedTeams?: string[]
  unmatchedCount?: number
  samples?: string[]
  errors?: string[]
  error?: string
}

export function ReeksindelingImport() {
  const [b64, setB64] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  const onFile = (f: File | null) => {
    if (!f) return
    setFileName(f.name)
    setReport(null)
    const reader = new FileReader()
    reader.onload = () => setB64(String(reader.result || ''))
    reader.readAsDataURL(f)
  }

  const run = async (commit: boolean) => {
    if (!b64) return
    setBusy(true)
    try {
      const res = await fetch('/api/reeksindeling/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pdfBase64: b64, commit }),
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
        <input type="file" accept=".pdf,application/pdf" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
        <span>{fileName || 'Kies de reeksindeling-PDF…'}</span>
      </label>
      <div className="imp-actions">
        <button type="button" className="sk-btn" disabled={busy || !b64} onClick={() => run(false)}>{busy ? 'Bezig…' : '👁 Voorbeeld'}</button>
        <button type="button" className="sk-btn primary" disabled={busy || !b64} onClick={() => run(true)}>{busy ? 'Bezig…' : '⬆ Thuisuren instellen'}</button>
      </div>

      {report && (report.error ? (
        <p className="wb-msg">{report.error}</p>
      ) : (
        <div className="imp-report">
          <div className="rep-cards">
            <div className="rep-card"><span className="rep-num">{report.entries ?? 0}</span><span className="rep-lbl">Regels</span></div>
            <div className="rep-card"><span className="rep-num">{report.toUpdate ?? 0}</span><span className="rep-lbl">Ploegen</span></div>
            <div className="rep-card"><span className="rep-num">{report.commit ? (report.committed ?? 0) : '—'}</span><span className="rep-lbl">Ingesteld</span></div>
          </div>
          <p className="imp-note">{report.commit ? `✓ ${report.committed} thuisuren ingesteld.` : 'Voorbeeld — nog niets opgeslagen.'}</p>
          {report.unmatchedCount ? (
            <details className="imp-det">
              <summary>⚠ {report.unmatchedCount} ploegen niet gevonden (overgeslagen)</summary>
              <p>{(report.unmatchedTeams ?? []).join(' · ')}</p>
            </details>
          ) : null}
          {report.samples && report.samples.length > 0 && (
            <details className="imp-det" open>
              <summary>Voorbeeld van herkende thuisuren</summary>
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
