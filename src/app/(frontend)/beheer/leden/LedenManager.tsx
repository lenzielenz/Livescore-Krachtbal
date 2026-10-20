'use client'

import { useMemo, useState } from 'react'

import { isSpeelgerechtigd } from '@/lib/registratie'

export type Lid = {
  id: number
  name: string
  shirtNumber: number
  teamName: string
  clubName: string
  vergunningsstatus: string
  medischAttest: boolean
  hogerSpelenVerbod: boolean
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Speelgerechtigd: dezelfde definitie als de clublijst en de opstelling (lib/registratie.ts). Het
// doktersverbod telt niet mee: dat verbiedt enkel HOGER spelen, niet spelen.
function eligible(l: Lid): boolean {
  return isSpeelgerechtigd(l)
}

function LidRow({ lid }: { lid: Lid }) {
  const [verg, setVerg] = useState(lid.vergunningsstatus)
  const [med, setMed] = useState(lid.medischAttest)
  const [verbod, setVerbod] = useState(lid.hogerSpelenVerbod)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const save = async (patch: Partial<Pick<Lid, 'vergunningsstatus' | 'medischAttest' | 'hogerSpelenVerbod'>>) => {
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/leden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ playerId: lid.id, ...patch }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setMsg(data.error ?? 'Mislukt')
        return false
      }
      setMsg('✓')
      setTimeout(() => setMsg(null), 1500)
      return true
    } catch {
      setMsg('Fout')
      return false
    } finally {
      setSaving(false)
    }
  }

  const ok = isSpeelgerechtigd({ vergunningsstatus: verg, medischAttest: med })
  return (
    <div className="led-row">
      <span className={`led-bol ${ok ? 'ok' : verg === 'geldig' || med ? 'partial' : 'no'}`} title={ok ? 'Speelgerechtigd' : 'Niet (volledig) in orde'} />
      <span className="led-id">
        <span className="led-name">#{lid.shirtNumber} {lid.name}</span>
        <span className="led-team">{lid.teamName}</span>
      </span>
      <div className="led-controls">
        <label className="led-field">
          <span>Paspoort</span>
          <select
            className="acc-club"
            value={verg}
            disabled={saving}
            onChange={async (e) => {
              const v = e.target.value
              const prev = verg
              setVerg(v)
              if (!(await save({ vergunningsstatus: v }))) setVerg(prev)
            }}
          >
            <option value="geen">Geen</option>
            <option value="aangevraagd">Aangevraagd</option>
            <option value="geldig">Geldig</option>
          </select>
        </label>
        <button
          type="button"
          className={`acc-chip ${med ? 'on' : ''}`}
          disabled={saving}
          title="Medisch gekeurd door de dokter"
          onClick={async () => {
            const next = !med
            setMed(next)
            if (!(await save({ medischAttest: next }))) setMed(!next)
          }}
        >
          🩺 Medisch gekeurd
        </button>
        <button
          type="button"
          className={`acc-chip ${verbod ? 'danger-on' : ''}`}
          disabled={saving}
          title="Doktersverbod om hoger te spelen"
          onClick={async () => {
            const next = !verbod
            setVerbod(next)
            if (!(await save({ hogerSpelenVerbod: next }))) setVerbod(!next)
          }}
        >
          ⛔ Hoger-verbod
        </button>
        {msg && <span className="acc-msg">{msg}</span>}
      </div>
    </div>
  )
}

export function LedenManager({ leden }: { leden: Lid[] }) {
  const [query, setQuery] = useState('')
  const [onlyTodo, setOnlyTodo] = useState(false)

  const groups = useMemo(() => {
    const q = norm(query.trim())
    const filtered = leden.filter((l) => {
      if (onlyTodo && eligible(l)) return false
      if (!q) return true
      return norm(`${l.name} ${l.teamName} ${l.clubName}`).includes(q)
    })
    const map = new Map<string, Lid[]>()
    for (const l of filtered) {
      const arr = map.get(l.clubName) ?? []
      arr.push(l)
      map.set(l.clubName, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [leden, query, onlyTodo])

  const okCount = leden.filter(eligible).length

  return (
    <div className="led-wrap">
      <div className="led-toolbar">
        <input
          className="acc-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek op naam, ploeg of club…"
          aria-label="Zoek lid"
        />
        <label className="led-todo">
          <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} /> enkel nog te keuren
        </label>
        <span className="led-stat">{okCount}/{leden.length} speelgerechtigd</span>
      </div>
      {groups.length === 0 ? (
        <p className="empty">Geen leden gevonden.</p>
      ) : (
        groups.map(([club, list]) => (
          <section key={club} className="led-group">
            <h2 className="acc-group-head">{club} <span className="acc-count">{list.length}</span></h2>
            {list.map((l) => (
              <LidRow key={l.id} lid={l} />
            ))}
          </section>
        ))
      )}
    </div>
  )
}
