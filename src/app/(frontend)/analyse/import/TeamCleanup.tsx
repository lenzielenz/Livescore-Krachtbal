'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

export type CleanupTeam = { id: number; name: string; reeks: string; club: string; players: number; matches: number }

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '').trim()

export function TeamCleanup({ teams }: { teams: CleanupTeam[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [onlyDup, setOnlyDup] = useState(true)

  // Markeer ploegen waarvan de naam (genormaliseerd) meermaals voorkomt — die zijn verdacht dubbel.
  const dupNames = useMemo(() => {
    const count = new Map<string, number>()
    for (const t of teams) count.set(norm(t.name), (count.get(norm(t.name)) ?? 0) + 1)
    return count
  }, [teams])

  const shown = useMemo(() => {
    const list = onlyDup ? teams.filter((t) => (dupNames.get(norm(t.name)) ?? 0) > 1) : teams
    return [...list].sort((a, b) => a.name.localeCompare(b.name) || a.club.localeCompare(b.club))
  }, [teams, onlyDup, dupNames])

  const remove = async (t: CleanupTeam) => {
    const extra = t.players > 0 ? ` en haar ${t.players} speler(s)` : ''
    const warn = t.matches > 0 ? `\n\nLET OP: ${t.matches} wedstrijd(en) verwijzen naar deze ploeg en verliezen die koppeling.` : ''
    if (!window.confirm(`Ploeg "${t.name}"${extra} definitief verwijderen?${warn}`)) return
    setBusyId(t.id)
    setMsg(null)
    try {
      const res = await fetch('/api/teams/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ teamId: t.id, deletePlayers: true }),
      })
      const json = await res.json()
      if (res.ok && json.ok) {
        setMsg(`✓ "${t.name}" verwijderd (${json.deletedPlayers} speler(s)).`)
        router.refresh()
      } else {
        setMsg(json.error || 'Verwijderen mislukt.')
      }
    } catch {
      setMsg('Netwerkfout — probeer opnieuw.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="tc">
      <label className="tc-filter">
        <input type="checkbox" checked={onlyDup} onChange={(e) => setOnlyDup(e.target.checked)} /> Toon enkel ploegen met een dubbele naam
      </label>
      {msg && <p className="imp-note">{msg}</p>}
      {shown.length === 0 ? (
        <p className="imp-note">{onlyDup ? 'Geen ploegen met een dubbele naam gevonden.' : 'Geen ploegen.'}</p>
      ) : (
        <div className="tc-list">
          {shown.map((t) => (
            <div key={t.id} className={`tc-row ${(dupNames.get(norm(t.name)) ?? 0) > 1 ? 'dup' : ''}`}>
              <div className="tc-info">
                <span className="tc-name">{t.name}</span>
                <span className="tc-meta">{[t.club, t.reeks].filter(Boolean).join(' · ')} — {t.players} spelers · {t.matches} wedstrijden</span>
              </div>
              <button type="button" className="tc-del" disabled={busyId === t.id} onClick={() => remove(t)}>
                {busyId === t.id ? 'Bezig…' : '🗑 Verwijder'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
