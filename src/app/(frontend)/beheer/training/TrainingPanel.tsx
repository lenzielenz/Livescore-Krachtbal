'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { TRAINING_METRICS, type TrainingMeting, type TrainingMetricKey } from '@/lib/training-metrics'
import { ProgressieChart } from './ProgressieChart'
import './training.css'

export type TrainingPlayer = { id: number; name: string; team: string; club: string }

const todayISO = () => new Date().toISOString().slice(0, 10)

export function TrainingPanel({
  players,
  metingen,
  canWrite,
}: {
  players: TrainingPlayer[]
  metingen: TrainingMeting[]
  canWrite: boolean
}) {
  const router = useRouter()
  const [spelerId, setSpelerId] = useState<number | null>(players[0]?.id ?? null)
  const [datum, setDatum] = useState(todayISO())
  const [waarden, setWaarden] = useState<Record<TrainingMetricKey, string>>({
    snelheidVooruit: '',
    snelheidAchteruit: '',
    worp4: '',
    worp9: '',
    worp18: '',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Metingen van de geselecteerde speler, chronologisch (oud → nieuw) voor de grafieken.
  const playerMetingen = useMemo(() => {
    if (spelerId == null) return []
    return metingen
      .filter((m) => m.speler === spelerId)
      .slice()
      .sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())
  }, [metingen, spelerId])

  const selectedPlayer = players.find((p) => p.id === spelerId) ?? null

  const setVal = (k: TrainingMetricKey, v: string) => setWaarden((prev) => ({ ...prev, [k]: v }))

  const save = async () => {
    if (spelerId == null || busy) return
    if (TRAINING_METRICS.every((m) => !waarden[m.key].trim())) {
      setMsg({ ok: false, text: 'Vul minstens één meetwaarde in.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speler: spelerId, datum, ...waarden }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setMsg({ ok: true, text: 'Meting opgeslagen.' })
        setWaarden({ snelheidVooruit: '', snelheidAchteruit: '', worp4: '', worp9: '', worp18: '' })
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
      <div className="tr-toolbar">
        <label className="tr-field">
          <span>Speler</span>
          <select value={spelerId ?? ''} onChange={(e) => setSpelerId(Number(e.target.value))}>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.team ? ` — ${p.team}` : ''}
              </option>
            ))}
          </select>
        </label>
        {selectedPlayer && (selectedPlayer.club || selectedPlayer.team) && (
          <span className="tr-playermeta">
            {[selectedPlayer.club, selectedPlayer.team].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      {canWrite && (
        <section className="tr-entry">
          <h2 className="tr-h2">Nieuwe meting</h2>
          <div className="tr-entry-grid">
            <label className="tr-field">
              <span>Datum</span>
              <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
            </label>
            {TRAINING_METRICS.map((m) => (
              <label className="tr-field" key={m.key}>
                <span>
                  {m.kort} <small>({m.unit})</small>
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={waarden[m.key]}
                  onChange={(e) => setVal(m.key, e.target.value)}
                  placeholder="—"
                />
              </label>
            ))}
            <button type="button" className="tr-save" onClick={save} disabled={busy}>
              {busy ? 'Opslaan…' : 'Meting opslaan'}
            </button>
          </div>
          {msg && <p className={`tr-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</p>}
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
                      <td>{new Date(mt.datum).toLocaleDateString('nl-BE')}</td>
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
