'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

// 📷 Supporters delen hun foto's van de tornooidag. Na het insturen zien ze de foto niet terug —
// alles komt samen op één plek bij de organisatie. Niet ingelogd? Vriendelijk doorverwijzen.
export function FotoUpload({ groep, ingelogd }: { groep: string; ingelogd: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)

  if (!ingelogd) {
    return (
      <Link href={`/inloggen?next=/tornooi/groep/${encodeURIComponent(groep)}`} className="trn-btn">
        📷 Deel je foto’s van de dag
      </Link>
    )
  }

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    setMelding(null)
    try {
      const form = new FormData()
      form.set('groep', groep)
      for (const f of Array.from(files)) form.append('fotos', f)
      const res = await fetch('/api/tornooi-foto', { method: 'POST', credentials: 'include', body: form })
      const data = (await res.json().catch(() => ({}))) as { aantal?: number; error?: string }
      if (!res.ok) throw new Error(data.error || 'Insturen mislukt.')
      const n = data.aantal ?? files.length
      setMelding(`✅ Bedankt! ${n === 1 ? 'Je foto is' : `${n} foto’s zijn`} bezorgd aan de organisatie.`)
    } catch (e) {
      setMelding(`⚠️ ${(e as Error).message}`)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <span className="trn-fotoupload">
      <button type="button" className="trn-btn" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? '⏳ Insturen…' : '📷 Deel je foto’s van de dag'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void upload(e.target.files)}
      />
      {melding && <span className="trn-foto-melding" role="status">{melding}</span>}
    </span>
  )
}
