'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import '../training.css'

export type AwPlayer = { id: number; name: string; teamId: number | null; teamName: string }
export type AwTeam = { id: number; name: string }
export type AwSession = {
  id: number
  datum: string
  teamId: number | null
  team: string | null
  duurMinuten: number | null
  weer: string | null
  temperatuur: number | null
  aanwezigen: { id: number; name: string }[]
  notitie: string | null
}

const WEER_LABEL: Record<string, string> = {
  zonnig: '☀️ Zonnig',
  bewolkt: '⛅ Bewolkt',
  regen: '🌧️ Regen',
  wind: '💨 Wind',
  sneeuw: '❄️ Sneeuw',
  mist: '🌫️ Mist',
}
const WEER_OPTIES = Object.entries(WEER_LABEL)

// Lokale datetime-waarde (YYYY-MM-DDTHH:mm) voor het datetime-local-veld, op het huidige uur.
function nowLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function fmtDatum(s: string): string {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('nl-BE', { dateStyle: 'medium', timeStyle: 'short' })
}

export function AanwezigheidPanel({
  teams,
  players,
  sessions,
  canWrite,
}: {
  teams: AwTeam[]
  players: AwPlayer[]
  sessions: AwSession[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [datum, setDatum] = useState(nowLocal())
  const [teamId, setTeamId] = useState<number | null>(teams[0]?.id ?? null)
  const [duur, setDuur] = useState('')
  const [weer, setWeer] = useState('')
  const [temp, setTemp] = useState('')
  const [present, setPresent] = useState<Set<number>>(new Set())
  const [notitie, setNotitie] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Spelers van de gekozen ploeg (of alle, als er geen ploeg gekozen is).
  const rosterPlayers = useMemo(
    () => (teamId == null ? players : players.filter((p) => p.teamId === teamId)),
    [players, teamId],
  )

  const toggle = (id: number) =>
    setPresent((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allOn = () => setPresent(new Set(rosterPlayers.map((p) => p.id)))
  const allOff = () => setPresent(new Set())

  const presentCount = rosterPlayers.filter((p) => present.has(p.id)).length

  const save = async () => {
    if (busy) return
    const aanwezigen = rosterPlayers.filter((p) => present.has(p.id)).map((p) => p.id)
    if (aanwezigen.length === 0) {
      setMsg({ ok: false, text: 'Vink minstens één aanwezige speler aan.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/training/sessie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datum, team: teamId, duurMinuten: duur, weer, temperatuur: temp, aanwezigen, notitie }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setMsg({ ok: true, text: `Training opgeslagen — ${aanwezigen.length} aanwezig.` })
        setPresent(new Set())
        setDuur('')
        setWeer('')
        setTemp('')
        setNotitie('')
        router.refresh()
      } else {
        setMsg({ ok: false, text: json.error || 'Opslaan mislukt.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Netwerkfout — probeer opnieuw.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tr">
      {canWrite && (
        <section className="tr-entry">
          <h2 className="tr-h2">Nieuwe training</h2>
          <div className="tr-entry-grid">
            <label className="tr-field">
              <span>Datum &amp; uur</span>
              <input type="datetime-local" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </label>
            {teams.length > 0 && (
              <label className="tr-field">
                <span>Ploeg</span>
                <select value={teamId ?? ''} onChange={(e) => { setTeamId(e.target.value ? Number(e.target.value) : null); setPresent(new Set()) }}>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="tr-field">
              <span>Duur <small>(min)</small></span>
              <input type="number" inputMode="numeric" min="0" value={duur} onChange={(e) => setDuur(e.target.value)} placeholder="—" />
            </label>
            <label className="tr-field">
              <span>Weer</span>
              <select value={weer} onChange={(e) => setWeer(e.target.value)}>
                <option value="">—</option>
                {WEER_OPTIES.map(([v, lbl]) => (
                  <option key={v} value={v}>{lbl}</option>
                ))}
              </select>
            </label>
            <label className="tr-field">
              <span>Temp. <small>(°C)</small></span>
              <input type="number" inputMode="numeric" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="—" />
            </label>
          </div>

          <div className="tr-att-head">
            <span className="tr-att-title">Aanwezig <span className="tr-att-count">{presentCount}/{rosterPlayers.length}</span></span>
            <span className="tr-att-actions">
              <button type="button" onClick={allOn}>Allen</button>
              <button type="button" onClick={allOff}>Geen</button>
            </span>
          </div>
          {rosterPlayers.length === 0 ? (
            <p className="sb-dim">Geen spelers voor deze ploeg.</p>
          ) : (
            <div className="tr-att-grid">
              {rosterPlayers.map((p) => (
                <label key={p.id} className={`tr-att-chip ${present.has(p.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={present.has(p.id)} onChange={() => toggle(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          )}

          <label className="tr-field" style={{ marginTop: 12 }}>
            <span>Notitie</span>
            <input type="text" value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Optioneel" />
          </label>

          <div style={{ marginTop: 12 }}>
            <button type="button" className="tr-save" onClick={save} disabled={busy}>
              {busy ? 'Opslaan…' : 'Training opslaan'}
            </button>
            {msg && <p className={`tr-msg ${msg.ok ? 'ok' : 'err'}`} style={{ display: 'inline-block', marginLeft: 12 }}>{msg.text}</p>}
          </div>
        </section>
      )}

      <section>
        <h2 className="tr-h2">Trainingen</h2>
        {sessions.length === 0 ? (
          <p className="sb-dim">Nog geen trainingen geregistreerd.</p>
        ) : (
          <div className="tr-sessions">
            {sessions.map((s) => (
              <div key={s.id} className="tr-session">
                <div className="tr-session-top">
                  <span className="tr-session-date">{fmtDatum(s.datum)}</span>
                  <span className="tr-session-count">👥 {s.aanwezigen.length}</span>
                </div>
                <div className="tr-session-meta">
                  {s.team && <span>🛡️ {s.team}</span>}
                  {s.duurMinuten != null && <span>⏱️ {s.duurMinuten} min</span>}
                  {s.weer && <span>{WEER_LABEL[s.weer] ?? s.weer}</span>}
                  {s.temperatuur != null && <span>🌡️ {s.temperatuur}°C</span>}
                </div>
                <div className="tr-session-names">
                  {s.aanwezigen.map((a) => a.name).join(', ') || '—'}
                </div>
                {s.notitie && <div className="tr-session-note">{s.notitie}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
