'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export type TeamOption = { id: number; name: string; reeksLabel: string; clubId: number | null; clubName: string }
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
// Een ploeg hoort bij een club én speelt in een reeks. Groepeer op club (club-loze ploegen staan
// op zichzelf) zodat we eerst de club en dan de reeks kunnen kiezen i.p.v. één lange lijst.
const clubKeyOf = (t: TeamOption): string => (t.clubId != null ? `c${t.clubId}` : `t${t.id}`)
const clubLabelOf = (t: TeamOption): string => t.clubName || t.name || 'Club'

export function AnalyseSpelersManager({ teams, spelers, positionOptions }: { teams: TeamOption[]; spelers: AnalyseSpeler[]; positionOptions: PositionOption[] }) {
  const router = useRouter()
  const [clubKey, setClubKey] = useState(teams[0] ? clubKeyOf(teams[0]) : '')
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

  // Unieke clubs (in de volgorde waarin de ploegen binnenkomen) en de reeksen binnen de gekozen club.
  const clubs = useMemo(() => {
    const seen = new Map<string, string>()
    for (const t of teams) if (!seen.has(clubKeyOf(t))) seen.set(clubKeyOf(t), clubLabelOf(t))
    return [...seen].map(([key, label]) => ({ key, label }))
  }, [teams])
  const reeksen = useMemo(() => teams.filter((t) => clubKeyOf(t) === clubKey), [teams, clubKey])

  // Bij clubwissel meteen naar de eerste reeks van die club springen (anders wijst teamId nog naar
  // de vorige club en toont de roster verkeerde spelers).
  const pickClub = (key: string) => {
    setClubKey(key)
    const first = teams.find((t) => clubKeyOf(t) === key)
    if (first) setTeamId(String(first.id))
  }

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
      <div className="anb-teampick anb-teampick-split">
        <label className="rad-field">
          <span>Club</span>
          <select className="rang-picker" value={clubKey} onChange={(e) => pickClub(e.target.value)}>
            {clubs.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
          </select>
        </label>
        <label className="rad-field">
          <span>Reeks</span>
          <select className="rang-picker" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {reeksen.map((t) => (<option key={t.id} value={t.id}>{t.reeksLabel || t.name || 'Reeks'}</option>))}
          </select>
        </label>
      </div>

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
