'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

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
  screenshot: string | null
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
  const [shot, setShot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // Snel een spelerslijst aanvullen (enkel namen).
  const [newNames, setNewNames] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addMsg, setAddMsg] = useState<string | null>(null)

  // Spelers van de gekozen ploeg (of alle, als er geen ploeg gekozen is).
  const rosterPlayers = useMemo(
    () => (teamId == null ? players : players.filter((p) => p.teamId === teamId)),
    [players, teamId],
  )

  // Vorige training van deze ploeg → handig om dezelfde aanwezigen snel terug te vinden.
  const lastSession = useMemo(
    () => sessions.find((s) => s.teamId === teamId && s.aanwezigen.length > 0) ?? null,
    [sessions, teamId],
  )
  // Bij ploegwissel: voorvink de aanwezigen van de vorige training (enkel wie nog in de lijst staat).
  useEffect(() => {
    const ids = new Set(rosterPlayers.map((p) => p.id))
    setPresent(new Set((lastSession?.aanwezigen ?? []).map((a) => a.id).filter((id) => ids.has(id))))
  }, [teamId, lastSession, rosterPlayers])

  // Bestand → verkleinde JPEG-data-URL (max 1280px), zodat hij compact in de DB past.
  const onFile = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const max = 1280
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, w, h)
        setShot(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  }

  const addPlayers = async () => {
    const list = newNames.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)
    if (teamId == null || list.length === 0 || addBusy) return
    setAddBusy(true)
    setAddMsg(null)
    try {
      const res = await fetch('/api/players/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, names: list }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setAddMsg(`${json.created} toegevoegd${json.skipped ? `, ${json.skipped} dubbel overgeslagen` : ''}.`)
        setNewNames('')
        router.refresh()
      } else {
        setAddMsg(json.error || 'Toevoegen mislukt.')
      }
    } catch {
      setAddMsg('Netwerkfout — probeer opnieuw.')
    } finally {
      setAddBusy(false)
    }
  }

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
        body: JSON.stringify({ datum, team: teamId, duurMinuten: duur, weer, temperatuur: temp, aanwezigen, screenshot: shot, notitie }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setMsg({ ok: true, text: `Training opgeslagen — ${aanwezigen.length} aanwezig.` })
        setPresent(new Set())
        setDuur('')
        setWeer('')
        setTemp('')
        setShot(null)
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
                <select value={teamId ?? ''} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}>
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

          {/* Screenshot van de WhatsApp-stemming (optioneel) — bewaard bij de training. */}
          <div className="tr-shot">
            <label className="tr-field">
              <span>📸 Screenshot WhatsApp-stemming <small>(optioneel)</small></span>
              <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
            {shot && (
              <div className="tr-shot-prev">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={shot} alt="Screenshot WhatsApp-stemming" />
                <button type="button" onClick={() => setShot(null)}>Verwijder</button>
              </div>
            )}
          </div>

          <div className="tr-att-head">
            <span className="tr-att-title">Aanwezig <span className="tr-att-count">{presentCount}/{rosterPlayers.length}</span></span>
            <span className="tr-att-actions">
              <button type="button" onClick={allOn}>Allen</button>
              <button type="button" onClick={allOff}>Geen</button>
            </span>
          </div>
          {rosterPlayers.length === 0 ? (
            <p className="sb-dim">Nog geen spelers voor deze ploeg — voeg ze hieronder snel toe.</p>
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

          {/* Spelerslijst van de club snel aanvullen (enkel namen). */}
          {teamId != null && (
            <details className="tr-addplayers" open={rosterPlayers.length === 0}>
              <summary>➕ Spelerslijst aanvullen</summary>
              <p className="sb-dim">Eén naam per lijn (of gescheiden door een komma). Rugnummers volgen automatisch; bestaande namen worden overgeslagen.</p>
              <textarea rows={4} value={newNames} onChange={(e) => setNewNames(e.target.value)} placeholder={'Jan\nPiet\nJonas'} />
              <div className="tr-addplayers-foot">
                <button type="button" className="tr-save" onClick={addPlayers} disabled={addBusy || !newNames.trim()}>
                  {addBusy ? 'Toevoegen…' : 'Toevoegen aan ploeg'}
                </button>
                {addMsg && <span className="tr-msg ok">{addMsg}</span>}
              </div>
            </details>
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
                {s.screenshot && (
                  <a className="tr-session-shot" href={s.screenshot} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.screenshot} alt="Screenshot WhatsApp-stemming" />
                  </a>
                )}
                {s.notitie && <div className="tr-session-note">{s.notitie}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
