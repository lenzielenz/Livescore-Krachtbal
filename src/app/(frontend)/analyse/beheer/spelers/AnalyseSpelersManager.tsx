'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export type TeamOption = { id: number; name: string; reeksLabel: string }
export type AnalyseSpeler = { id: number; name: string; shirtNumber: number; position: string; teamId: number | null }
type PositionOption = { value: string; label: string }

async function call(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch('/api/analyse/players', {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (res.ok) return null
  const data = await res.json().catch(() => ({}))
  return data.error || 'Er ging iets mis.'
}

// Beheer van de roster per analyse-ploeg: kies een ploeg, voeg spelers toe (rugnummer, naam,
// verplichte positie) en verwijder ze. De positie voedt de analyse-rapporten.
export function AnalyseSpelersManager({ teams, spelers, positionOptions }: { teams: TeamOption[]; spelers: AnalyseSpeler[]; positionOptions: PositionOption[] }) {
  const router = useRouter()
  const [teamId, setTeamId] = useState(teams[0]?.id ? String(teams[0].id) : '')
  const [num, setNum] = useState('')
  const [name, setName] = useState('')
  const [position, setPosition] = useState(positionOptions[0]?.value ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const posLabel = useMemo(() => new Map(positionOptions.map((o) => [o.value, o.label])), [positionOptions])
  const roster = useMemo(
    () => spelers.filter((s) => String(s.teamId) === teamId).sort((a, b) => a.shirtNumber - b.shirtNumber),
    [spelers, teamId],
  )

  const add = async () => {
    if (!teamId || !name.trim() || !num.trim() || !position) return
    setBusy(true)
    setErr(null)
    const error = await call('POST', { teamId: Number(teamId), name: name.trim(), shirtNumber: Number(num), position })
    setBusy(false)
    if (error) { setErr(error); return }
    setNum('')
    setName('')
    router.refresh()
  }

  const remove = async (s: AnalyseSpeler) => {
    if (!window.confirm(`Speler "#${s.shirtNumber} ${s.name}" verwijderen?`)) return
    setBusy(true)
    setErr(null)
    const error = await call('DELETE', { id: s.id })
    setBusy(false)
    if (error) { setErr(error); return }
    router.refresh()
  }

  const changePosition = async (s: AnalyseSpeler, value: string) => {
    setBusy(true)
    setErr(null)
    const error = await call('PATCH', { id: s.id, position: value })
    setBusy(false)
    if (error) { setErr(error); return }
    router.refresh()
  }

  if (teams.length === 0) {
    return (
      <div className="anb-panel" data-tone="accent">
        <p className="empty">
          Maak eerst een <Link href="/analyse/beheer/ploegen" style={{ color: 'var(--accent)' }}>ploeg</Link> aan om er spelers aan toe te voegen.
        </p>
      </div>
    )
  }

  return (
    <div className="anb-panel" data-tone="accent">
      <label className="rad-field anb-teampick">
        <span>Ploeg</span>
        <select className="rang-picker" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((t) => (<option key={t.id} value={t.id}>{t.name} — {t.reeksLabel}</option>))}
        </select>
      </label>

      <form className="anb-addrow wrap" onSubmit={(e) => { e.preventDefault(); void add() }}>
        <input className="rang-picker anb-num" inputMode="numeric" placeholder="nr" value={num} onChange={(e) => setNum(e.target.value.replace(/[^0-9]/g, ''))} aria-label="Rugnummer" />
        <input className="rang-picker" placeholder="Naam" value={name} onChange={(e) => setName(e.target.value)} aria-label="Naam" />
        <select className="rang-picker" value={position} onChange={(e) => setPosition(e.target.value)} aria-label="Positie">
          {positionOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
        </select>
        <button type="submit" className="sk-demo-cta" disabled={busy || !name.trim() || !num.trim() || !position}>➕ Speler toevoegen</button>
      </form>
      {err && <p className="nam-error">{err}</p>}

      {roster.length === 0 ? (
        <p className="empty">Nog geen spelers in deze ploeg.</p>
      ) : (
        <ul className="anb-list">
          {roster.map((s) => (
            <li key={s.id} className="anb-row">
              <span className="anb-name"><b className="anb-shirt">{s.shirtNumber}</b> {s.name}</span>
              <span className="anb-actions">
                <select className="rang-picker anb-possel" value={s.position} onChange={(e) => void changePosition(s, e.target.value)} aria-label="Positie" disabled={busy}>
                  {!posLabel.has(s.position) && <option value={s.position}>{s.position || '— positie —'}</option>}
                  {positionOptions.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
                <button type="button" className="anb-mini danger" onClick={() => void remove(s)} aria-label="Verwijderen">🗑</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
