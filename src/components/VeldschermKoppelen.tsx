'use client'

import { useState } from 'react'

// Koppel de gestarte wedstrijd aan een fysiek veldscherm via de 6-cijferige code die op dat
// scherm staat. Zelfde flow als in SimpleScorekeeper (/scorekeeper/[id]), maar hier ook
// beschikbaar op de publieke wedstrijdpagina voor wie de wedstrijd mag aantekenen — handig
// wanneer je de wedstrijd niet vanuit het aantekenscherm start (bv. supporters-modus).
export function VeldschermKoppelen({ matchId }: { matchId: number }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const koppel = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setMsg({ ok: false, text: 'Voer de 6-cijferige code van het veldscherm in.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/veldscherm/koppel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: code.trim(), matchId }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? 'Koppelen mislukt.' })
        return
      }
      setMsg({ ok: true, text: 'Veldscherm gekoppeld!' })
      setCode('')
      setTimeout(() => setOpen(false), 1500)
    } catch {
      setMsg({ ok: false, text: 'Koppelen mislukt — probeer opnieuw.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="veld-koppel">
      <div className="veld-koppel-main">
        <button
          type="button"
          className="veld-koppel-btn"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open ? 'true' : 'false'}
        >
          📡 Veldscherm koppelen
        </button>
      </div>
      {open && (
        <div className="veld-koppel-form" role="group" aria-label="Veldscherm koppelen">
          <input
            className="veld-koppel-input"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <button type="button" className="veld-koppel-submit" disabled={busy} onClick={() => void koppel()}>
            {busy ? 'Bezig…' : 'Koppel'}
          </button>
          {msg && <span className={`veld-koppel-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</span>}
        </div>
      )}
    </div>
  )
}
