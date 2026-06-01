'use client'

import { useState } from 'react'

import './bulk.css'

interface Team {
  id: number
  label: string
}
interface Row {
  shirtNumber: string
  name: string
}

const emptyRows = (n: number): Row[] => Array.from({ length: n }, () => ({ shirtNumber: '', name: '' }))

export function BulkPlayers({ teams }: { teams: Team[] }) {
  const [teamId, setTeamId] = useState<number>(teams[0]?.id ?? 0)
  const [rows, setRows] = useState<Row[]>(emptyRows(6))
  const [paste, setPaste] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  const addRow = () => setRows((prev) => [...prev, { shirtNumber: '', name: '' }])

  const nextNumber = (current: Row[]): number => {
    const nums = current.map((r) => Number(r.shirtNumber)).filter((n) => Number.isFinite(n) && n > 0)
    return nums.length ? Math.max(...nums) + 1 : 1
  }

  // "Plak een lijst": elke regel "7 Jens" of "Jens" (nummer auto).
  const importPaste = () => {
    const lines = paste
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return
    setRows((prev) => {
      const filled = prev.filter((r) => r.name.trim())
      const out = [...filled]
      for (const line of lines) {
        const m = line.match(/^(\d+)[\s.\-)]+(.*)$/)
        if (m && m[2].trim()) {
          out.push({ shirtNumber: m[1], name: m[2].trim() })
        } else {
          out.push({ shirtNumber: String(nextNumber(out)), name: line })
        }
      }
      return [...out, ...emptyRows(2)]
    })
    setPaste('')
    setMsg(null)
  }

  const save = async () => {
    const players = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ shirtNumber: Number(r.shirtNumber), name: r.name.trim() }))
    if (players.length === 0) {
      setMsg({ kind: 'err', text: 'Vul minstens één speler in.' })
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/players/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, players }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Opslaan mislukt')
      setMsg({ kind: 'ok', text: `${data.created} speler(s) toegevoegd.` })
      setRows(emptyRows(6))
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bulk">
      <label className="bulk-field">
        <span>Ploeg</span>
        <select value={teamId} onChange={(e) => setTeamId(Number(e.target.value))}>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <table className="bulk-table">
        <thead>
          <tr>
            <th>Rugnr.</th>
            <th>Naam</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <input
                  type="number"
                  inputMode="numeric"
                  value={r.shirtNumber}
                  onChange={(e) => setRow(i, { shirtNumber: e.target.value })}
                  className="bulk-num"
                />
              </td>
              <td>
                <input
                  type="text"
                  value={r.name}
                  placeholder="Naam speler"
                  onChange={(e) => setRow(i, { name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && i === rows.length - 1) addRow()
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="bulk-addrow" onClick={addRow}>
        + rij
      </button>

      <details className="bulk-paste">
        <summary>Of plak een lijst (één speler per regel, bv. “7 Jens”)</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} placeholder={'7 Jens\n8 Wout\nLander'} />
        <button type="button" onClick={importPaste}>
          Toevoegen aan tabel
        </button>
      </details>

      {msg && <div className={`bulk-msg ${msg.kind}`}>{msg.text}</div>}

      <button type="button" className="bulk-save" disabled={busy} onClick={save}>
        {busy ? 'Bezig…' : 'Alle spelers opslaan'}
      </button>
    </div>
  )
}
