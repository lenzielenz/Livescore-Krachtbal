'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { TRAINING_METRICS, metricAttempts, type TrainingMeting, type TrainingMetricKey } from '@/lib/training-metrics'
import { trainingGroupOf } from '@/lib/training-groups'
import { ProgressieChart } from './ProgressieChart'
import './training.css'
import { dateStrBE, formatDateBE } from '@/lib/datetime'

export type TrainingPlayer = { id: number; name: string; team: string; club: string; reeks: string; reeksNaam: string }
export type TrainingDoel = { id: number; speler: number; metriek: string; doel: number }

const ALL = '__all__' // token: alle reeksen samen

// Belgische dag: toISOString geeft de UTC-dag, en die springt 's avonds al naar morgen.
const todayISO = () => dateStrBE()

// Lege invoer: per metriek een rij pogingen (worpen: 3 kansen, de rest: 1).
const emptyVals = (): Record<TrainingMetricKey, string[]> => {
  const o = {} as Record<TrainingMetricKey, string[]>
  for (const m of TRAINING_METRICS) o[m.key] = Array(metricAttempts(m)).fill('')
  return o
}
// Beste (verste) geldige poging, of null als er niets ingevuld is.
const bestOf = (arr: string[]): number | null => {
  const nums = arr.map((s) => parseFloat(s)).filter((n) => Number.isFinite(n) && n >= 0)
  return nums.length ? Math.max(...nums) : null
}

export function TrainingPanel({
  players,
  metingen,
  doelen = [],
  canWrite,
}: {
  players: TrainingPlayer[]
  metingen: TrainingMeting[]
  doelen?: TrainingDoel[]
  canWrite: boolean
}) {
  const router = useRouter()
  // Trainingsgroep-keuze: senior dames/heren trainen samen, jeugd per reeks → filter de spelerslijst.
  const reeksGroups = useMemo(() => {
    const m = new Map<string, { reeks: string; naam: string; n: number }>()
    for (const p of players) {
      if (!p.reeks) continue
      const g = trainingGroupOf(p.reeks)
      const ex = m.get(g.key) ?? { reeks: g.key, naam: g.label, n: 0 }
      ex.n++
      m.set(g.key, ex)
    }
    return [...m.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  }, [players])
  const inGroup = (p: TrainingPlayer, key: string) => trainingGroupOf(p.reeks).key === key
  const [tab, setTab] = useState<string>(ALL)
  const shownPlayers = tab === ALL ? players : players.filter((p) => inGroup(p, tab))
  const [spelerId, setSpelerId] = useState<number | null>(players[0]?.id ?? null)
  const selectTab = (t: string) => {
    setTab(t)
    const list = t === ALL ? players : players.filter((p) => inGroup(p, t))
    setSpelerId(list[0]?.id ?? null)
  }
  const [datum, setDatum] = useState(todayISO())
  const [waarden, setWaarden] = useState<Record<TrainingMetricKey, string[]>>(emptyVals)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // Doelen toevoegen.
  const [doelMetric, setDoelMetric] = useState<TrainingMetricKey>('worp18')
  const [doelValue, setDoelValue] = useState('')
  const [doelBusy, setDoelBusy] = useState(false)

  // Metingen van de geselecteerde speler, chronologisch (oud → nieuw) voor de grafieken.
  const playerMetingen = useMemo(() => {
    if (spelerId == null) return []
    return metingen
      .filter((m) => m.speler === spelerId)
      .slice()
      .sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())
  }, [metingen, spelerId])

  const selectedPlayer = players.find((p) => p.id === spelerId) ?? null

  // VBT-stijl records per metriek: huidige meting, persoonlijk record (PR), % van PR,
  // verschil t.o.v. de vorige meting en een relatief niveau (PR-niveau → vermoeid).
  const records = useMemo(() => {
    return TRAINING_METRICS.map((m) => {
      const vals = playerMetingen.filter((mt) => mt[m.key] != null).map((mt) => mt[m.key] as number)
      if (vals.length === 0) return null
      const latest = vals[vals.length - 1]
      const prev = vals.length > 1 ? vals[vals.length - 2] : null
      const pb = Math.max(...vals)
      const pctPB = pb ? Math.round((latest / pb) * 100) : 0
      const delta = prev != null ? Math.round((latest - prev) * 100) / 100 : null
      const level = pctPB >= 99 ? 'pr' : pctPB >= 92 ? 'top' : pctPB >= 85 ? 'ok' : 'low'
      return { m, latest, pb, pctPB, delta, level, n: vals.length }
    }).filter((r): r is NonNullable<typeof r> => r != null)
  }, [playerMetingen])

  // Aanloop–afstand-profiel (4/9/18 m): beste worp per aanloop — het krachtbal-equivalent
  // van een load-velocity-profiel.
  const worpProfile = useMemo(() => {
    const runs: { run: number; key: TrainingMetricKey }[] = [
      { run: 4, key: 'worp4' },
      { run: 9, key: 'worp9' },
      { run: 18, key: 'worp18' },
    ]
    return runs.map(({ run, key }) => {
      const vals = playerMetingen.filter((mt) => mt[key] != null).map((mt) => mt[key] as number)
      return { run, best: vals.length ? Math.max(...vals) : null, latest: vals.length ? vals[vals.length - 1] : null }
    })
  }, [playerMetingen])

  // Beste waarde per metriek (voor de voortgang naar een doel).
  const bestByMetric = useMemo(() => {
    const o = {} as Record<TrainingMetricKey, number | null>
    for (const m of TRAINING_METRICS) {
      const vals = playerMetingen.filter((mt) => mt[m.key] != null).map((mt) => mt[m.key] as number)
      o[m.key] = vals.length ? Math.max(...vals) : null
    }
    return o
  }, [playerMetingen])
  const playerDoelen = doelen.filter((d) => d.speler === spelerId)

  const addDoel = async () => {
    const v = parseFloat(doelValue)
    if (spelerId == null || !Number.isFinite(v) || v <= 0 || doelBusy) return
    setDoelBusy(true)
    try {
      const res = await fetch('/api/training/doel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speler: spelerId, metriek: doelMetric, doel: v }),
      })
      if (res.ok) {
        setDoelValue('')
        router.refresh()
      }
    } finally {
      setDoelBusy(false)
    }
  }
  const delDoel = async (id: number) => {
    if (doelBusy) return
    setDoelBusy(true)
    try {
      const res = await fetch('/api/training/doel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      })
      if (res.ok) router.refresh()
    } finally {
      setDoelBusy(false)
    }
  }

  const setVal = (k: TrainingMetricKey, i: number, v: string) =>
    setWaarden((prev) => {
      const arr = [...prev[k]]
      arr[i] = v
      return { ...prev, [k]: arr }
    })

  const save = async () => {
    if (spelerId == null || busy) return
    // Per metriek de beste poging; worpen tellen dus de verste van 3.
    const payloadVals: Record<string, number> = {}
    for (const m of TRAINING_METRICS) {
      const best = bestOf(waarden[m.key])
      if (best != null) payloadVals[m.key] = best
    }
    if (Object.keys(payloadVals).length === 0) {
      setMsg({ ok: false, text: 'Vul minstens één meetwaarde in.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speler: spelerId, datum, ...payloadVals }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setMsg({ ok: true, text: 'Meting opgeslagen.' })
        setWaarden(emptyVals())
        router.refresh() // verse data → grafieken updaten
      } else {
        setMsg({ ok: false, text: json.error || 'Opslaan mislukt.' })
      }
    } catch {
      setMsg({ ok: false, text: 'Netwerkfout — probeer opnieuw.' })
    } finally {
      setBusy(false)
    }
  }

  if (players.length === 0) {
    return <p className="empty">Geen spelers gevonden. Voeg eerst spelers toe (Beheer → Spelers).</p>
  }

  return (
    <div className="tr">
      {reeksGroups.length > 0 && (
        <div className="tr-reekstabs">
          <button type="button" className={`tr-reekstab${tab === ALL ? ' on' : ''}`} onClick={() => selectTab(ALL)}>
            Alle reeksen <span className="tr-reekstab-n">{players.length}</span>
          </button>
          {reeksGroups.map((g) => (
            <button
              key={g.reeks}
              type="button"
              className={`tr-reekstab${tab === g.reeks ? ' on' : ''}`}
              onClick={() => selectTab(g.reeks)}
            >
              {g.naam} <span className="tr-reekstab-n">{g.n}</span>
            </button>
          ))}
        </div>
      )}
      <div className="tr-toolbar">
        <label className="tr-field">
          <span>Speler</span>
          <select value={spelerId ?? ''} onChange={(e) => setSpelerId(Number(e.target.value))}>
            {shownPlayers.length === 0 && <option value="">— geen spelers —</option>}
            {shownPlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {selectedPlayer?.club && <span className="tr-playermeta">{selectedPlayer.club}</span>}
      </div>

      {canWrite && (
        <section className="tr-entry">
          <h2 className="tr-h2">Nieuwe meting</h2>
          <div className="tr-entry-grid">
            <label className="tr-field">
              <span>Datum</span>
              <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </label>
            {TRAINING_METRICS.map((m) =>
              m.pogingen ? (
                <div className="tr-field tr-poging" key={m.key}>
                  <span>
                    {m.kort} <small>({m.unit}) · 3 kansen, beste telt</small>
                  </span>
                  <div className="tr-poging-inputs">
                    {waarden[m.key].map((val, i) => (
                      <input
                        key={i}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={val}
                        onChange={(e) => setVal(m.key, i, e.target.value)}
                        placeholder={`${i + 1}e`}
                        aria-label={`${m.kort} — poging ${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <label className="tr-field" key={m.key}>
                  <span>
                    {m.kort} <small>({m.unit})</small>
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={waarden[m.key][0]}
                    onChange={(e) => setVal(m.key, 0, e.target.value)}
                    placeholder="—"
                  />
                </label>
              ),
            )}
            <button type="button" className="tr-save" onClick={save} disabled={busy}>
              {busy ? 'Opslaan…' : 'Meting opslaan'}
            </button>
          </div>
          {msg && <p className={`tr-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>}
        </section>
      )}

      {records.length > 0 && (
        <section>
          <h2 className="tr-h2">Records &amp; niveau {selectedPlayer ? `· ${selectedPlayer.name}` : ''}</h2>
          <div className="tr-vbt-cards">
            {records.map((r) => (
              <div key={r.m.key} className={`tr-vbt-card lvl-${r.level}`}>
                <span className="tr-vbt-lbl">{r.m.kort}</span>
                <span className="tr-vbt-now">{r.latest}<small> {r.m.unit}</small></span>
                <span className="tr-vbt-meta">
                  PR {r.pb} · {r.pctPB}% van PR
                  {r.delta != null && (
                    <span className={`tr-vbt-delta ${r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''}`}>
                      {r.delta > 0 ? '▲' : r.delta < 0 ? '▼' : ''}{r.delta !== 0 ? Math.abs(r.delta) : '='}
                    </span>
                  )}
                </span>
                <span className="tr-vbt-zone">
                  {r.level === 'pr' ? '🏆 PR-niveau' : r.level === 'top' ? '💪 Sterk' : r.level === 'ok' ? '✔ Op niveau' : '⚠️ Laag (vermoeid?)'}
                </span>
              </div>
            ))}
          </div>
          {worpProfile.some((w) => w.best != null) && (
            <div className="tr-profile">
              <h3 className="tr-profile-h">Aanloop–afstand-profiel <small>beste worp per aanloop</small></h3>
              {(() => {
                const W = 280
                const H = 120
                const PAD = 24
                const maxD = Math.max(1, ...worpProfile.map((w) => w.best ?? 0))
                const px = (run: number) => PAD + ((run - 4) / 14) * (W - 2 * PAD)
                const py = (d: number) => H - PAD - (d / maxD) * (H - 2 * PAD)
                const pts = worpProfile.filter((w) => w.best != null)
                const line = pts.map((w) => `${px(w.run).toFixed(1)},${py(w.best as number).toFixed(1)}`).join(' ')
                return (
                  <svg viewBox={`0 0 ${W} ${H}`} className="tr-profile-svg" role="img" aria-label="Aanloop-afstand profiel">
                    <polyline points={line} fill="none" stroke="var(--accent, #06d6a0)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    {pts.map((w) => (
                      <g key={w.run}>
                        <circle cx={px(w.run)} cy={py(w.best as number)} r={3.5} fill="var(--accent, #06d6a0)" />
                        <text x={px(w.run)} y={py(w.best as number) - 7} fontSize={9} textAnchor="middle" fill="var(--txt)">{w.best}m</text>
                        <text x={px(w.run)} y={H - 8} fontSize={9} textAnchor="middle" fill="var(--dim)">{w.run}m</text>
                      </g>
                    ))}
                  </svg>
                )
              })()}
            </div>
          )}
        </section>
      )}

      {spelerId != null && (
        <section>
          <h2 className="tr-h2">Doelen {selectedPlayer ? `· ${selectedPlayer.name}` : ''}</h2>
          {playerDoelen.length === 0 ? (
            <p className="sb-dim">Nog geen doelen ingesteld.</p>
          ) : (
            <div className="tr-doelen">
              {playerDoelen.map((d) => {
                const m = TRAINING_METRICS.find((x) => x.key === d.metriek)
                const best = bestByMetric[d.metriek as TrainingMetricKey] ?? 0
                const pct = d.doel ? Math.min(100, Math.round(((best ?? 0) / d.doel) * 100)) : 0
                const done = (best ?? 0) >= d.doel
                return (
                  <div className={`tr-doel ${done ? 'done' : ''}`} key={d.id}>
                    <span className="tr-doel-lbl">{m?.kort ?? d.metriek}</span>
                    <span className="tr-doel-track"><span className="tr-doel-fill" style={{ width: `${pct}%` }} /></span>
                    <span className="tr-doel-val">{best ?? 0}/{d.doel} {m?.unit}{done ? ' 🏆' : ''}</span>
                    {canWrite && <button type="button" className="tr-doel-x" onClick={() => delDoel(d.id)} aria-label="Verwijder doel">✕</button>}
                  </div>
                )
              })}
            </div>
          )}
          {canWrite && (
            <div className="tr-doel-add">
              <select value={doelMetric} onChange={(e) => setDoelMetric(e.target.value as TrainingMetricKey)} aria-label="Meetwaarde voor doel">
                {TRAINING_METRICS.map((m) => (
                  <option key={m.key} value={m.key}>{m.kort} ({m.unit})</option>
                ))}
              </select>
              <input type="number" inputMode="decimal" step="0.01" min="0" value={doelValue} onChange={(e) => setDoelValue(e.target.value)} placeholder="streefwaarde" aria-label="Streefwaarde" />
              <button type="button" className="tr-save" onClick={addDoel} disabled={doelBusy || !doelValue.trim()}>+ Doel</button>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="tr-h2">Progressie {selectedPlayer ? `· ${selectedPlayer.name}` : ''}</h2>
        <div className="tr-charts">
          {TRAINING_METRICS.map((m) => (
            <ProgressieChart
              key={m.key}
              label={m.label}
              unit={m.unit}
              points={playerMetingen
                .filter((mt) => mt[m.key] != null)
                .map((mt) => ({ datum: mt.datum, value: mt[m.key] as number }))}
            />
          ))}
        </div>
      </section>

      {playerMetingen.length > 0 && (
        <section>
          <h2 className="tr-h2">Metingen</h2>
          <div className="tr-tablewrap">
            <table className="tr-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  {TRAINING_METRICS.map((m) => (
                    <th key={m.key}>{m.kort}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {playerMetingen
                  .slice()
                  .reverse()
                  .map((mt, i) => (
                    <tr key={i}>
                      <td>{formatDateBE(new Date(mt.datum))}</td>
                      {TRAINING_METRICS.map((m) => (
                        <td key={m.key}>{mt[m.key] == null ? '—' : mt[m.key]}</td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
