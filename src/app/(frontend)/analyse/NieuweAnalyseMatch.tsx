'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Team = { id: number; name: string; reeks: string }

// Maakt een "enkel voor analyse"-wedstrijd aan (niet live zichtbaar). Je kan ze meteen
// opnemen, of voorbereiden (aanmaken en in de lijst zetten) om later te activeren.
export function NieuweAnalyseMatch({ teams, reeksOptions }: { teams: Team[]; reeksOptions: { value: string; label: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reeks, setReeks] = useState(reeksOptions[0]?.value ?? '')
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prepared, setPrepared] = useState<string | null>(null)

  const reeksTeams = useMemo(() => teams.filter((t) => t.reeks === reeks), [teams, reeks])
  const teamName = (id: string) => teams.find((t) => String(t.id) === id)?.name ?? ''

  // mode 'record' → meteen naar de scoreopnemer; 'prepare' → aanmaken en in de lijst laten staan.
  async function submit(mode: 'record' | 'prepare') {
    setError(null)
    setPrepared(null)
    if (!home || !away || home === away) {
      setError('Kies een verschillende thuis- en uitploeg.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/analyse/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reeks, homeTeam: Number(home), awayTeam: Number(away), date: new Date(date).toISOString() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Aanmaken mislukt.')
      if (mode === 'record') {
        router.push(`/scorekeeper/${data.id}`)
        return
      }
      // Voorbereid: reset de ploegkeuze zodat je er meteen nog een kan klaarzetten,
      // en ververs de lijst zodat de nieuwe wedstrijd onderaan verschijnt.
      setPrepared(`${teamName(home)} – ${teamName(away)} voorbereid. Activeer ze hieronder bij “Wedstrijd manueel opnemen”.`)
      setHome('')
      setAway('')
      setBusy(false)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="sk-demo-cta nam-open" onClick={() => setOpen(true)}>
        ➕ Nieuwe analysewedstrijd
      </button>
    )
  }

  return (
    <div className="nam-form">
      <div className="nam-row">
        <label className="rad-field">
          <span>Reeks</span>
          <select className="rang-picker" value={reeks} onChange={(e) => { setReeks(e.target.value); setHome(''); setAway('') }}>
            {reeksOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="rad-field">
          <span>Datum</span>
          <input className="rang-picker" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <div className="nam-row">
        <label className="rad-field">
          <span>Thuisploeg</span>
          <select className="rang-picker" value={home} onChange={(e) => setHome(e.target.value)}>
            <option value="">— Kies —</option>
            {reeksTeams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
        </label>
        <label className="rad-field">
          <span>Uitploeg</span>
          <select className="rang-picker" value={away} onChange={(e) => setAway(e.target.value)}>
            <option value="">— Kies —</option>
            {reeksTeams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
        </label>
      </div>
      {error && <p className="nam-error">{error}</p>}
      {prepared && <p className="nam-ok">✓ {prepared}</p>}
      <div className="nam-actions">
        <button type="button" className="sk-demo-cta" disabled={busy} onClick={() => submit('record')}>
          {busy ? 'Bezig…' : '▶ Aanmaken & opnemen'}
        </button>
        <button type="button" className="nam-prepare" disabled={busy} onClick={() => submit('prepare')}>
          💾 Voorbereiden
        </button>
        <button type="button" className="nam-cancel" onClick={() => setOpen(false)}>Sluiten</button>
      </div>
      {reeksTeams.length === 0 && <p className="nam-hint">Geen ploegen in deze reeks. Maak ze aan via Beheer.</p>}
    </div>
  )
}
