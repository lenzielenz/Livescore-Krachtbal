'use client'

import { useState } from 'react'

import { saveOrShareBlob } from '@/lib/client-download'

// Downloadt/deelt de volledige wedstrijd-analyse als PDF (samenvatting + automatische analyse).
export function MatchPdfButton({ matchId, fileLabel }: { matchId: number; fileLabel?: string }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const run = async () => {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch(`/api/analyse/match/${matchId}/pdf`)
      if (!res.ok) throw new Error('mislukt')
      const blob = await res.blob()
      const name = (fileLabel ? `analyse-${fileLabel}` : `analyse-wedstrijd-${matchId}`)
        .normalize('NFKD')
        .replace(/[^\w-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase()
      await saveOrShareBlob(blob, `${name}.pdf`, 'Krachtbal wedstrijd-analyse')
    } catch {
      setMsg('Download mislukt — probeer opnieuw.')
      setTimeout(() => setMsg(null), 3500)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="an-pdf-bar">
      <button type="button" className="sk-demo-cta" onClick={run} disabled={busy}>
        {busy ? '⏳ Analyse maken…' : '📄 Analyse downloaden / delen'}
      </button>
      {msg && <span className="an-pdf-msg">{msg}</span>}
    </div>
  )
}
