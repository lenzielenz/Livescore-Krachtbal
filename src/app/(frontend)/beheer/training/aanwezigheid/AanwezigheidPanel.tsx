'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { seasonFromDate } from '@/lib/seasons'
import { trainingGroupOf } from '@/lib/training-groups'
import '../training.css'

export type AwPlayer = { id: number; name: string; reeks: string; reeksNaam: string }
export type AwReeksTeam = { reeks: string; reeksNaam: string; teamId: number }
export type AwClub = {
  id: number
  name: string
  primaryTeamId: number | null
  reeksTeams: AwReeksTeam[]
  players: AwPlayer[]
}
export type AwSession = {
  id: number
  datum: string
  clubId: number | null
  club: string | null
  reeks: string
  duurMinuten: number | null
  weer: string | null
  temperatuur: number | null
  aanwezigen: { id: number; name: string }[]
  screenshot: string | null
  notitie: string | null
}

type ReeksGroup = { reeks: string; naam: string; teamId: number | null; players: AwPlayer[] }

const WEER_LABEL: Record<string, string> = {
  zonnig: '☀️ Zonnig',
  bewolkt: '⛅ Bewolkt',
  regen: '🌧️ Regen',
  wind: '💨 Wind',
  sneeuw: '❄️ Sneeuw',
  mist: '🌫️ Mist',
}
const WEER_OPTIES = Object.entries(WEER_LABEL)

const ALG = '__alg__' // token voor de "Algemeen"-tab

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
  currentSeason,
}: {
  clubs: AwClub[]
  fixedClubId: number | null
  sessions: AwSession[]
  canWrite: boolean
  currentSeason: string
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
  const [q, setQ] = useState('')

  const club = useMemo(() => clubs.find((c) => c.id === clubId) ?? null, [clubs, clubId])

  // Trainingsgroepen van de club: senior dames/heren samen, jeugd per reeks. (`reeks` op een groep
  // is hier de GROEPSLEUTEL, bv. 'dames'/'heren'/'U12'.)
  const reeksGroups = useMemo<ReeksGroup[]>(() => {
    if (!club) return []
    const byKey = new Map<string, ReeksGroup>()
    for (const rt of club.reeksTeams) {
      const g = trainingGroupOf(rt.reeks)
      const ex = byKey.get(g.key) ?? { reeks: g.key, naam: g.label, teamId: rt.teamId, players: [] }
      if (ex.teamId == null) ex.teamId = rt.teamId
      byKey.set(g.key, ex)
    }
    for (const p of club.players) {
      if (!p.reeks) continue
      const g = trainingGroupOf(p.reeks)
      const ex = byKey.get(g.key) ?? { reeks: g.key, naam: g.label, teamId: club.primaryTeamId, players: [] }
      ex.players.push(p)
      byKey.set(g.key, ex)
    }
    return [...byKey.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  }, [club])

  const hasReeksen = reeksGroups.length > 0
  // Actieve tab: een reekscode of ALG (Algemeen). Zonder reeksen blijft alles clubbreed.
  const [tab, setTab] = useState<string>(hasReeksen ? reeksGroups[0].reeks : ALG)
  useEffect(() => {
    setTab(hasReeksen ? reeksGroups[0].reeks : ALG)
  }, [clubId, hasReeksen, reeksGroups])

  const isAlg = tab === ALG
  const activeGroup = isAlg ? null : reeksGroups.find((g) => g.reeks === tab) ?? null
  // Roster waarop je aanwezigheid aanvinkt / telt: de reeks, of de hele club bij Algemeen.
  const roster = isAlg ? club?.players ?? [] : activeGroup?.players ?? []
  const addTeamId = isAlg ? club?.primaryTeamId ?? null : activeGroup?.teamId ?? club?.primaryTeamId ?? null

  // Seizoenen: uit de trainingsdatums van deze club + het huidige seizoen, nieuw → oud.
  const seasons = useMemo(() => {
    const set = new Set<string>([currentSeason])
    for (const s of sessions) if (s.clubId === clubId) set.add(seasonFromDate(new Date(s.datum)))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [sessions, clubId, currentSeason])
  const [season, setSeason] = useState(currentSeason)
  useEffect(() => {
    if (!seasons.includes(season)) setSeason(seasons[0] ?? currentSeason)
  }, [seasons, season, currentSeason])

  // Sessies binnen de huidige scope (club + seizoen + reeks/algemeen), nieuw → oud.
  const scopedSessions = useMemo(
    () =>
      sessions.filter(
        (s) =>
          s.clubId === clubId &&
          seasonFromDate(new Date(s.datum)) === season &&
          (isAlg || trainingGroupOf(s.reeks).key === tab),
      ),
    [sessions, clubId, season, isAlg, tab],
  )

  // Statistiek over het seizoen: opkomst per training + aanwezigheid per speler.
  const stats = useMemo(() => {
    const rosterIds = new Set(roster.map((p) => p.id))
    const trainingen = scopedSessions.length
    const presentPer = scopedSessions.map((s) => s.aanwezigen.filter((a) => rosterIds.has(a.id)).length)
    const totalPresent = presentPer.reduce((a, b) => a + b, 0)
    const avgPresent = trainingen ? totalPresent / trainingen : 0
    const rosterSize = roster.length
    const avgPct = rosterSize ? (avgPresent / rosterSize) * 100 : 0
    const perPlayer = roster
      .map((p) => {
        const attended = scopedSessions.filter((s) => s.aanwezigen.some((a) => a.id === p.id)).length
        return { id: p.id, name: p.name, attended, pct: trainingen ? (attended / trainingen) * 100 : 0 }
      })
      .sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name, 'nl'))
    return { trainingen, avgPresent, avgPct, rosterSize, perPlayer }
  }, [roster, scopedSessions])

  // Vorige training in deze scope → dezelfde aanwezigen voorvinken voor snelle invoer.
  const lastSession = useMemo(
    () =>
      sessions.find((s) => s.clubId === clubId && (isAlg || trainingGroupOf(s.reeks).key === tab) && s.aanwezigen.length > 0) ?? null,
    [sessions, clubId, isAlg, tab],
  )
  useEffect(() => {
    const ids = new Set(roster.map((p) => p.id))
    setPresent(new Set((lastSession?.aanwezigen ?? []).map((a) => a.id).filter((id) => ids.has(id))))
  }, [clubId, tab, lastSession, roster])

  // De invoervorm tonen we in een reeks-tab; bij Algemeen enkel als de club nog géén reeksen heeft
  // (dan is "Algemeen" clubbreed en blijft invoeren mogelijk zoals voorheen).
  const showForm = canWrite && (!isAlg || !hasReeksen)

  const toggle = (id: number) =>
    setPresent((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const allOn = () => setPresent(new Set(roster.map((p) => p.id)))
  const allOff = () => setPresent(new Set())
  const presentCount = roster.filter((p) => present.has(p.id)).length

  // Vaste gangers bovenaan: hoe vaker iemand kwam (in deze scope), hoe hoger in de lijst.
  const freqByPlayer = useMemo(() => {
    const f = new Map<number, number>()
    for (const s of sessions) {
      if (s.clubId !== clubId || (!isAlg && trainingGroupOf(s.reeks).key !== tab)) continue
      for (const a of s.aanwezigen) f.set(a.id, (f.get(a.id) ?? 0) + 1)
    }
    return f
  }, [sessions, clubId, isAlg, tab])

  const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g') // diakritische tekens negeren bij zoeken
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(COMBINING, '')
  const byFreq = (a: AwPlayer, b: AwPlayer) =>
    (freqByPlayer.get(b.id) ?? 0) - (freqByPlayer.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'nl')
  // Aanwezig bovenaan (geen scrollen); de rest gesorteerd op gangers, met een zoekfilter.
  const presentList = roster.filter((p) => present.has(p.id)).sort(byFreq)
  const absentAll = roster.filter((p) => !present.has(p.id)).sort(byFreq)
  const absentList = q.trim() ? absentAll.filter((p) => norm(p.name).includes(norm(q))) : absentAll

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
    if (addTeamId == null || list.length === 0 || addBusy) return
    setAddBusy(true)
    setAddMsg(null)
    try {
      const res = await fetch('/api/players/quick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: addTeamId, names: list }),
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
    const aanwezigen = roster.filter((p) => present.has(p.id)).map((p) => p.id)
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
        body: JSON.stringify({
          datum,
          club: clubId,
          reeks: isAlg ? '' : (roster.find((p) => p.reeks)?.reeks ?? ''),
          duurMinuten: duur,
          weer,
          temperatuur: temp,
          aanwezigen,
          screenshot: shot,
          notitie,
        }),
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

  const scopeLabel = isAlg ? 'Algemeen' : activeGroup?.naam ?? ''

  return (
    <div className="tr">
      {/* Enkel een account zonder eigen club mag de club kiezen; anders volgt die uit de login. */}
      {fixedClubId == null && clubs.length > 1 && (
        <label className="tr-field" style={{ maxWidth: 280 }}>
          <span>Club</span>
          <select value={clubId ?? ''} onChange={(e) => setClubId(e.target.value ? Number(e.target.value) : null)}>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      {/* Reeks-keuze: Algemeen + één tab per leeftijdsgroep van de club. */}
      <div className="tr-reekstabs">
        <button type="button" className={`tr-reekstab${isAlg ? ' on' : ''}`} onClick={() => setTab(ALG)}>
          📊 Algemeen
        </button>
        {reeksGroups.map((g) => (
          <button
            key={g.reeks}
            type="button"
            className={`tr-reekstab${tab === g.reeks ? ' on' : ''}`}
            onClick={() => setTab(g.reeks)}
          >
            {g.naam} <span className="tr-reekstab-n">{g.players.length}</span>
          </button>
        ))}
      </div>

      {/* Seizoenkiezer (scope voor de statistiek). */}
      <label className="tr-field tr-seasonpick">
        <span>Seizoen</span>
        <select value={season} onChange={(e) => setSeason(e.target.value)}>
          {seasons.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>

      {showForm && (
        <section className="tr-entry">
          <h2 className="tr-h2">
            Nieuwe training{club ? ` · ${club.name}` : ''}
            {!isAlg && scopeLabel ? ` · ${scopeLabel}` : ''}
          </h2>
          <div className="tr-entry-grid">
            <label className="tr-field">
              <span>Datum &amp; uur</span>
              <input type="datetime-local" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </label>
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
            <span className="tr-att-title">Aanwezig <span className="tr-att-count">{presentCount}/{roster.length}</span></span>
            <span className="tr-att-actions">
              <button type="button" onClick={allOn}>Allen</button>
              <button type="button" onClick={allOff}>Geen</button>
            </span>
          </div>
          {roster.length === 0 ? (
            <p className="sb-dim">Nog geen spelers in deze groep — voeg ze hieronder snel toe.</p>
          ) : (
            <>
              {/* Aanwezig: tikbare chips, altijd bovenaan zodat je niet hoeft te scrollen. */}
              {presentList.length > 0 ? (
                <div className="tr-att-grid tr-att-present">
                  {presentList.map((p) => (
                    <button type="button" key={p.id} className="tr-att-chip on" onClick={() => toggle(p.id)}>
                      <span className="tr-att-tick" aria-hidden>✓</span> {p.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="sb-dim">Tik hieronder de spelers aan die er waren — ze springen meteen naar boven.</p>
              )}

              {/* Overige spelers: gangers bovenaan + zoekveld om snel iemand te vinden. */}
              {absentAll.length > 0 && (
                <div className="tr-att-rest">
                  <div className="tr-att-resthead">
                    <span className="sb-dim">Voeg toe</span>
                    <input
                      className="tr-att-search"
                      type="search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="🔍 Zoek speler…"
                    />
                  </div>
                  <div className="tr-att-grid">
                    {absentList.map((p) => (
                      <button type="button" key={p.id} className="tr-att-chip" onClick={() => toggle(p.id)}>
                        <span className="tr-att-plus" aria-hidden>＋</span> {p.name}
                      </button>
                    ))}
                  </div>
                  {absentList.length === 0 && <p className="sb-dim">Geen speler gevonden voor “{q}”.</p>}
                </div>
              )}
            </>
          )}

          <details className="tr-addplayers" open={roster.length === 0}>
            <summary>➕ Spelerslijst aanvullen</summary>
            {addTeamId == null ? (
              <p className="sb-dim">Maak eerst een ploeg aan voor deze reeks (Beheer → Ploegen) om spelers te kunnen toevoegen.</p>
            ) : (
              <>
                <p className="sb-dim">Eén naam per lijn (of gescheiden door een komma). Rugnummers volgen automatisch; bestaande namen worden overgeslagen.</p>
                <textarea rows={4} value={newNames} onChange={(e) => setNewNames(e.target.value)} placeholder={'Jan\nPiet\nJonas'} />
                <div className="tr-addplayers-foot">
                  <button type="button" className="tr-save" onClick={addPlayers} disabled={addBusy || !newNames.trim()}>
                    {addBusy ? 'Toevoegen…' : 'Toevoegen'}
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

      {/* Statistiek over het gekozen seizoen voor de actieve scope. */}
      <section>
        <h2 className="tr-h2">
          {isAlg ? 'Opkomst clubbreed' : `Opkomst · ${scopeLabel}`} <small className="sb-dim">· seizoen {season}</small>
        </h2>
        {stats.trainingen === 0 ? (
          <p className="sb-dim">Nog geen trainingen in dit seizoen.</p>
        ) : (
          <>
            <div className="tr-statcards">
              <div className="tr-statcard">
                <span className="tr-stat-n">{stats.trainingen}</span>
                <span className="tr-stat-l">trainingen</span>
              </div>
              <div className="tr-statcard">
                <span className="tr-stat-n">{stats.avgPresent.toFixed(1)}</span>
                <span className="tr-stat-l">gem. aanwezig{stats.rosterSize ? ` / ${stats.rosterSize}` : ''}</span>
              </div>
              <div className="tr-statcard">
                <span className="tr-stat-n">{Math.round(stats.avgPct)}%</span>
                <span className="tr-stat-l">van de {isAlg ? 'club' : 'groep'} kwam trainen</span>
              </div>
            </div>
            {stats.perPlayer.length > 0 && (
              <div className="tr-attbars">
                {stats.perPlayer.map((p) => (
                  <div key={p.id} className="tr-attbar">
                    <span className="tr-attbar-name">{p.name}</span>
                    <span className="tr-attbar-track">
                      <span className="tr-attbar-fill" style={{ width: `${p.pct}%` }} />
                    </span>
                    <span className="tr-attbar-val">{p.attended}/{stats.trainingen} · {Math.round(p.pct)}%</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="tr-h2">Trainingen{isAlg ? '' : ` · ${scopeLabel}`}</h2>
        {scopedSessions.length === 0 ? (
          <p className="sb-dim">Nog geen trainingen geregistreerd in dit seizoen.</p>
        ) : (
          <div className="tr-sessions">
            {scopedSessions.map((s) => (
              <div key={s.id} className="tr-session">
                <div className="tr-session-top">
                  <span className="tr-session-date">{fmtDatum(s.datum)}</span>
                  <span className="tr-session-count">👥 {s.aanwezigen.length}</span>
                </div>
                <div className="tr-session-meta">
                  {isAlg && s.reeks && <span>🏷️ {trainingGroupOf(s.reeks).label}</span>}
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
