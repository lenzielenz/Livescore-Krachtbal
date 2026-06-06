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

  // Groepen dubbele ploegen (zelfde genormaliseerde naam), voor het samenvoegen.
  const dupGroups = useMemo(() => {
    const m = new Map<string, CleanupTeam[]>()
    for (const t of teams) {
      const k = norm(t.name)
      const list = m.get(k) ?? []
      list.push(t)
      m.set(k, list)
    }
    return [...m.values()].filter((g) => g.length > 1).sort((a, b) => a[0].name.localeCompare(b[0].name))
  }, [teams])

  // Welke ploeg uit een groep behouden we? Die met de meeste wedstrijden, dan spelers, dan laagste id.
  const keeperOf = (g: CleanupTeam[]) =>
    g.slice().sort((a, b) => b.matches - a.matches || b.players - a.players || a.id - b.id)[0]

  const shown = useMemo(() => {
    const list = onlyDup ? teams.filter((t) => (dupNames.get(norm(t.name)) ?? 0) > 1) : teams
    return [...list].sort((a, b) => a.name.localeCompare(b.name) || a.club.localeCompare(b.club))
  }, [teams, onlyDup, dupNames])

  const mergeGroup = async (g: CleanupTeam[]) => {
    const keep = keeperOf(g)
    const others = g.filter((t) => t.id !== keep.id)
    if (!window.confirm(`${others.length} dubbele "${keep.name}" samenvoegen tot één ploeg?\n\nSpelers en wedstrijden verhuizen naar de behouden ploeg (${keep.club || 'geen club'} · ${keep.matches} wedstrijden); de dubbele records worden verwijderd.`)) return
    setBusyId(keep.id)
    setMsg(null)
    try {
      let movedPlayers = 0
      let movedMatches = 0
      for (const o of others) {
        const res = await fetch('/api/teams/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action: 'merge', fromTeamId: o.id, intoTeamId: keep.id }),
        })
        const json = await res.json()
        if (!res.ok || !json.ok) {
          setMsg(json.error || 'Samenvoegen mislukt.')
          setBusyId(null)
          return
        }
        movedPlayers += json.movedPlayers ?? 0
        movedMatches += json.movedMatches ?? 0
      }
      setMsg(`✓ "${keep.name}" samengevoegd: ${others.length} dubbel(s) verwijderd, ${movedPlayers} speler(s) en ${movedMatches} wedstrijd(en) verhuisd.`)
      router.refresh()
    } catch {
      setMsg('Netwerkfout — probeer opnieuw.')
    } finally {
      setBusyId(null)
    }
  }

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
      {onlyDup ? (
        dupGroups.length === 0 ? (
          <p className="imp-note">Geen ploegen met een dubbele naam gevonden.</p>
        ) : (
          <div className="tc-groups">
            {dupGroups.map((g) => {
              const keep = keeperOf(g)
              return (
                <div key={keep.id} className="tc-group">
                  <div className="tc-group-head">
                    <span className="tc-name">{keep.name} <span className="tc-dupn">{g.length}×</span></span>
                    <button type="button" className="tc-merge" disabled={busyId === keep.id} onClick={() => mergeGroup(g)}>
                      {busyId === keep.id ? 'Bezig…' : '⤵ Voeg samen tot 1'}
                    </button>
                  </div>
                  <div className="tc-list">
                    {g.slice().sort((a, b) => (b.matches - a.matches) || (b.players - a.players)).map((t) => (
                      <div key={t.id} className={`tc-row ${t.id === keep.id ? 'keep' : 'dup'}`}>
                        <div className="tc-info">
                          <span className="tc-name">
                            {t.id === keep.id && <span className="tc-keepbadge" title="Wordt behouden">✓ behouden</span>} {t.name}
                          </span>
                          <span className="tc-meta">{[t.club, t.reeks].filter(Boolean).join(' · ')} — {t.players} spelers · {t.matches} wedstrijden</span>
                        </div>
                        <button type="button" className="tc-del" disabled={busyId !== null} onClick={() => remove(t)}>
                          {busyId === t.id ? 'Bezig…' : '🗑'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : shown.length === 0 ? (
        <p className="imp-note">Geen ploegen.</p>
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
