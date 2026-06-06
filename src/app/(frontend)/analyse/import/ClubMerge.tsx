'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type MergeClub = { id: number; name: string }

// Twee clubs handmatig samenvoegen: alles van "van" verhuist naar "naar", daarna verdwijnt "van".
// Voor dubbels die te verschillend geschreven zijn voor de automatische opkuis.
export function ClubMerge({ clubs }: { clubs: MergeClub[] }) {
  const router = useRouter()
  const [from, setFrom] = useState('')
  const [into, setInto] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const nameOf = (id: string) => clubs.find((c) => String(c.id) === id)?.name ?? ''

  const merge = async () => {
    if (!from || !into || from === into || busy) return
    if (!window.confirm(`"${nameOf(from)}" samenvoegen in "${nameOf(into)}"?\n\nAlle ploegen, trainingen en accounts van "${nameOf(from)}" verhuizen naar "${nameOf(into)}"; daarna wordt "${nameOf(from)}" verwijderd.`)) return
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/clubs/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fromClubId: Number(from), intoClubId: Number(into) }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok) {
        setMsg(`✓ Samengevoegd — ${json.movedTeams} ploeg(en) verhuisd naar "${nameOf(into)}".`)
        setFrom('')
        setInto('')
        router.refresh()
      } else {
        setMsg(json.error || 'Samenvoegen mislukt.')
      }
    } catch {
      setMsg('Netwerkfout — probeer opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  if (clubs.length < 2) return <p className="imp-note">Te weinig clubs om samen te voegen.</p>

  return (
    <div className="cm">
      <div className="cm-row">
        <label className="rad-field">
          <span>Voeg deze club…</span>
          <select className="rang-picker" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Bronclub">
            <option value="">— Kies —</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <span className="cm-arrow" aria-hidden>→</span>
        <label className="rad-field">
          <span>…samen met deze club (blijft behouden)</span>
          <select className="rang-picker" value={into} onChange={(e) => setInto(e.target.value)} aria-label="Doelclub">
            <option value="">— Kies —</option>
            {clubs.filter((c) => String(c.id) !== from).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="cm-foot">
        <button type="button" className="sk-btn primary" disabled={busy || !from || !into || from === into} onClick={merge}>
          {busy ? 'Bezig…' : '🔗 Samenvoegen'}
        </button>
        {msg && <span className="imp-note">{msg}</span>}
      </div>
    </div>
  )
}
