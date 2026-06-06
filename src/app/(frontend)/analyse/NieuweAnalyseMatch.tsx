'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Team = { id: number; name: string; reeks: string }
type Player = { id: number; name: string; shirtNumber: number }

// Eén ploegkolom: toon de (onthouden) spelers en voeg er nieuwe aan toe. Toegevoegde spelers
// worden in de ploeg bewaard en zijn in latere wedstrijden opnieuw selecteerbaar.
function RosterEditor({ matchId, side, label, roster, onAdd }: { matchId: number; side: 'home' | 'away'; label: string; roster: Player[]; onAdd: (p: Player) => void }) {
  const [num, setNum] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const add = async () => {
    setErr(null)
    if (!name.trim() || !num.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/match/${matchId}/add-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ side, name: name.trim(), shirtNumber: Number(num) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(data.error || 'Toevoegen mislukt.'); return }
      onAdd({ id: data.player.id, name: data.player.name, shirtNumber: data.player.shirtNumber })
      setNum('')
      setName('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="nam-team">
      <h4 className="nam-team-h">{label}</h4>
      <div className="nam-roster">
        {roster.length === 0 ? (
          <span className="nam-hint">Nog geen spelers — voeg ze hieronder toe.</span>
        ) : (
          roster.map((p) => (
            <span className="nam-chip" key={p.id}><b>{p.shirtNumber}</b> {p.name}</span>
          ))
        )}
      </div>
      <form className="nam-addrow" onSubmit={(e) => { e.preventDefault(); void add() }}>
        <input className="rang-picker nam-num" inputMode="numeric" placeholder="nr" value={num} onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, ''))} aria-label="Rugnummer" />
        <input className="rang-picker" placeholder="naam" value={name} onChange={(e) => setName(e.target.value)} aria-label="Naam" />
        <button type="submit" className="nam-prepare" disabled={busy || !name.trim() || !num.trim()}>+ Toevoegen</button>
      </form>
      {err && <p className="nam-error">{err}</p>}
    </div>
  )
}

// Maakt een "enkel voor analyse"-wedstrijd aan (niet live zichtbaar): kies reeks + thuis/uit,
// voeg de spelers toe (onthouden voor de toekomst) en neem ze meteen op of bewaar ze.
export function NieuweAnalyseMatch({ teams, reeksOptions }: { teams: Team[]; reeksOptions: { value: string; label: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reeks, setReeks] = useState(reeksOptions[0]?.value ?? '')
  const [home, setHome] = useState('')
  const [away, setAway] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stap 2: na aanmaken tonen we de ploegen met hun spelers.
  const [created, setCreated] = useState<{ id: number; homeRoster: Player[]; awayRoster: Player[]; homeName: string; awayName: string } | null>(null)

  // Ploegen van de reeks, ontdubbeld op naam (dubbele records van dezelfde club tonen we maar één keer).
  const reeksTeams = useMemo(() => {
    const byName = new Map<string, Team>()
    for (const t of teams) {
      if (t.reeks !== reeks) continue
      const key = t.name.trim().toLowerCase()
      if (!byName.has(key)) byName.set(key, t)
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'))
  }, [teams, reeks])
  const teamName = (id: string) => teams.find((t) => String(t.id) === id)?.name ?? ''

  async function create() {
    setError(null)
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
      setCreated({ id: data.id, homeRoster: data.homeRoster ?? [], awayRoster: data.awayRoster ?? [], homeName: teamName(home), awayName: teamName(away) })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setCreated(null)
    setHome('')
    setAway('')
    setError(null)
    router.refresh()
  }

  if (!open) {
    return (
      <button type="button" className="sk-demo-cta nam-open" onClick={() => setOpen(true)}>
        ➕ Nieuwe analysewedstrijd
      </button>
    )
  }

  // Stap 2 — spelers toevoegen.
  if (created) {
    return (
      <div className="nam-form">
        <p className="nam-ok">✓ {created.homeName} – {created.awayName} aangemaakt. Voeg de spelers toe (ze worden onthouden voor latere wedstrijden).</p>
        <div className="nam-teams">
          <RosterEditor matchId={created.id} side="home" label={`Thuis · ${created.homeName}`} roster={created.homeRoster} onAdd={(p) => setCreated((c) => c && { ...c, homeRoster: [...c.homeRoster, p] })} />
          <RosterEditor matchId={created.id} side="away" label={`Uit · ${created.awayName}`} roster={created.awayRoster} onAdd={(p) => setCreated((c) => c && { ...c, awayRoster: [...c.awayRoster, p] })} />
        </div>
        <div className="nam-actions">
          <button type="button" className="sk-demo-cta" onClick={() => router.push(`/scorekeeper/${created.id}`)}>▶ Opnemen</button>
          <button type="button" className="nam-prepare" onClick={reset}>✓ Klaar (voorbereid)</button>
        </div>
      </div>
    )
  }

  // Stap 1 — wie tegen wie.
  return (
    <div className="nam-form">
      <div className="nam-row">
        <label className="rad-field">
          <span>Reeks</span>
          <select className="rang-picker" value={reeks} onChange={(e) => { setReeks(e.target.value); setHome(''); setAway('') }}>
            {reeksOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
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
      <div className="nam-actions">
        <button type="button" className="sk-demo-cta" disabled={busy} onClick={create}>
          {busy ? 'Bezig…' : '➕ Aanmaken & spelers toevoegen'}
        </button>
        <button type="button" className="nam-cancel" onClick={() => setOpen(false)}>Sluiten</button>
      </div>
      {reeksTeams.length === 0 && <p className="nam-hint">Geen ploegen in deze reeks. Maak ze aan via Beheer.</p>}
    </div>
  )
}
