'use client'

import { useState } from 'react'

import { toast } from '@/components/Toaster'

type Result = { line: string; ok: boolean; reason?: string }

export function PlanningImport() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ created: number; total: number; results: Result[] } | null>(null)

  const submit = async () => {
    setBusy(true)
    setRes(null)
    try {
      const r = await fetch('/api/planning/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'Import mislukt.')
      setRes(d)
      toast('success', `${d.created}/${d.total} wedstrijden aangemaakt.`)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const skipped = res?.results.filter((r) => !r.ok) ?? []

  return (
    <div className="plan">
      <p className="wb-intro">
        Plak het speelplan — één wedstrijd per regel:{' '}
        <strong>datum ; reeks ; thuisploeg ; uitploeg</strong> (gescheiden door <code>;</code> of tab).
        Datum als <code>dd/mm/jjjj uu:mm</code>. Ploegnamen moeten overeenkomen met de geregistreerde ploegen;
        de reeks met de code (bv. 1NAH) of de naam.
      </p>
      <textarea
        className="plan-area"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'02/06/2026 14:00 ; 1NAH ; KBK Temse ; KBC Male\n02/06/2026 16:00 ; 1NAH ; ...'}
      />
      <div className="plan-actions">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? 'Importeren…' : 'Importeren'}
        </button>
        {res && <span className="plan-summary">✓ {res.created}/{res.total} aangemaakt</span>}
      </div>
      {skipped.length > 0 && (
        <div className="plan-errors">
          <h3>{skipped.length} regel(s) overgeslagen</h3>
          <ul>
            {skipped.map((r, i) => (
              <li key={i}>
                <span className="plan-err-reason">{r.reason}</span>
                <span className="plan-err-line">{r.line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
