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

// PDF-tekst client-side uitlezen (inflate de Flate-streams met DecompressionStream) zodat we
// enkel de kleine tekst naar de server hoeven te sturen i.p.v. de hele (grote) base64-PDF.
async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  for (const fmt of ['deflate', 'deflate-raw'] as const) {
    try {
      const ds = new DecompressionStream(fmt)
      const ab = await new Response(new Blob([bytes.slice()]).stream().pipeThrough(ds)).arrayBuffer()
      return new Uint8Array(ab)
    } catch {
      /* probeer volgende formaat */
    }
  }
  return null
}
async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf)
  const lat = new TextDecoder('latin1').decode(bytes)
  const parts: string[] = []
  const re = /stream\r?\n/g
  let m: RegExpExecArray | null
  while ((m = re.exec(lat))) {
    const start = m.index + m[0].length
    const end = lat.indexOf('endstream', start)
    if (end < 0) continue
    const seg = bytes.subarray(start, end)
    const inf = await inflate(seg)
    const txt = inf ? new TextDecoder('latin1').decode(inf) : lat.slice(start, end)
    for (const mm of txt.matchAll(/\(((?:[^()\\]|\\.)*)\)/g)) parts.push(mm[1].replace(/\\([()\\])/g, '$1'))
  }
  return parts.join('').replace(/ /g, '')
}

export function ReeksindelingImport() {
  const [text, setText] = useState('')
  const [b64, setB64] = useState('')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  const onFile = async (f: File | null) => {
    if (!f) return
    setFileName(f.name)
    setReport(null)
    setText('')
    setB64('')
    try {
      const buf = await f.arrayBuffer()
      const t = await extractPdfText(buf)
      if (t && t.length > 50) {
        setText(t)
        return
      }
    } catch {
      /* val terug op base64 */
    }
    // Fallback: stuur de volledige base64-PDF.
    const reader = new FileReader()
    reader.onload = () => setB64(String(reader.result || ''))
    reader.readAsDataURL(f)
  }

  const run = async (commit: boolean) => {
    if (!text && !b64) return
    setBusy(true)
    try {
      const res = await fetch('/api/reeksindeling/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(text ? { text, commit } : { pdfBase64: b64, commit }),
      })
      setReport(await res.json())
    } catch (e) {
      setReport({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const ready = Boolean(text || b64)

  return (
    <div className="imp">
      <label className="imp-file">
        <input type="file" accept=".pdf,application/pdf" onChange={(e) => void onFile(e.target.files?.[0] ?? null)} />
        <span>{fileName || 'Kies de reeksindeling-PDF…'}</span>
      </label>
      <div className="imp-actions">
        <button type="button" className="sk-btn" disabled={busy || !ready} onClick={() => run(false)}>{busy ? 'Bezig…' : '👁 Voorbeeld'}</button>
        <button type="button" className="sk-btn primary" disabled={busy || !ready} onClick={() => run(true)}>{busy ? 'Bezig…' : '⬆ Thuisuren instellen'}</button>
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
