'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import '../training.css'

export type AwPlayer = { id: number; name: string }
export type AwClub = { id: number; name: string; primaryTeamId: number | null; players: AwPlayer[] }
export type AwSession = {
  id: number
  datum: string
  clubId: number | null
  club: string | null
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
  clubs,
  fixedClubId,
  sessions,
  canWrite,
}: {
  clubs: AwClub[]
  fixedClubId: number | null
  sessions: AwSession[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [datum, setDatum] = useState(nowLocal())
  const [clubId, setClubId] = useState<number | null>(fixedClubId ?? clubs[0]?.id ?? null)
  const [duur, setDuur] = useState('')
  const [weer, setWeer] = useState('')
  const [temp, setTemp] = useState('')
  const [present, setPresent] = useState<Set<number>>(new Set())
  const [notitie, setNotitie] = useState('')
  const [shot, setShot] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [newNames, setNewNames] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addMsg, setAddMsg] = useState<string | null>(null)

  const club = useMemo(() => clubs.find((c) => c.id === clubId) ?? null, [clubs, clubId])
  const rosterPlayers = club?.players ?? []
  const primaryTeamId = club?.primaryTeamId ?? null

  // Vorige training van deze club → dezelfde aanwezigen voorvinken voor een snelle invoer.
  const lastSession = useMemo(
    () => sessions.find((s) => s.clubId === clubId && s.aanwezigen.length > 0) ?? null,
    [sessions, clubId],
  )
  useEffect(() => {
    const ids = new Set(rosterPlayers.map((p) => p.id))
    setPresent(new Set((lastSession?.aanwezigen ?? []).map((a) => a.id).filter((id) => ids.has(id))))
  }, [clubId, lastSession, rosterPlayers])

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
    if (primaryTeamId == null || list.length === 0 || addBusy) return
    setAddBusy(true)
    setAddMsg(null)
    try {
      const res = await fetch('/api/players/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: primaryTeamId, names: list }),
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
        body: JSON.stringify({ datum, club: clubId, duurMinuten: duur, weer, temperatuur: temp, aanwezigen, screenshot: shot, notitie }),
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

  if (clubs.length === 0) {
    return <p className="empty">Geen club gevonden voor je account.</p>
  }

  return (
    <div className="tr">
      {canWrite && (
        <section className="tr-entry">
          <h2 className="tr-h2">Nieuwe training{club ? ` · ${club.name}` : ''}</h2>
          <div className="tr-entry-grid">
            <label className="tr-field">
              <span>Datum &amp; uur</span>
              <input type="datetime-local" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </label>
            {fixedClubId == null && clubs.length > 1 && (
              <label className="tr-field">
                <span>Club</span>
                <select value={clubId ?? ''} onChange={(e) => setClubId(e.target.value ? Number(e.target.value) : null)}>
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
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
            <p className="sb-dim">Nog geen spelers voor deze club — voeg ze hieronder snel toe.</p>
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

          <details className="tr-addplayers" open={rosterPlayers.length === 0}>
            <summary>➕ Spelerslijst aanvullen</summary>
            {primaryTeamId == null ? (
              <p className="sb-dim">Maak eerst een ploeg aan voor deze club (Beheer → Spelers) om spelers te kunnen toevoegen.</p>
            ) : (
              <>
                <p className="sb-dim">Eén naam per lijn (of gescheiden door een komma). Rugnummers volgen automatisch; bestaande namen worden overgeslagen.</p>
                <textarea rows={4} value={newNames} onChange={(e) => setNewNames(e.target.value)} placeholder={'Jan\nPiet\nJonas'} />
                <div className="tr-addplayers-foot">
                  <button type="button" className="tr-save" onClick={addPlayers} disabled={addBusy || !newNames.trim()}>
                    {addBusy ? 'Toevoegen…' : 'Toevoegen aan club'}
                  </button>
                  {addMsg && <span className="tr-msg ok">{addMsg}</span>}
                </div>
              </>
            )}
          </details>

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
                  {s.club && <span>🛡️ {s.club}</span>}
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
