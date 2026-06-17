'use client'

import { useState } from 'react'

import './club-team.css'

export type TeamRole = 'none' | 'club-lid' | 'club-medewerker'
export type Member = { id: number; name: string | null; email: string; role: TeamRole }

const LABEL: Record<TeamRole, string> = {
  none: 'Supporter',
  'club-lid': 'Lid van de club',
  'club-medewerker': 'Club-medewerker',
}
const ORDER: TeamRole[] = ['none', 'club-lid', 'club-medewerker']

function MemberRow({ m }: { m: Member }) {
  const [role, setRole] = useState<TeamRole>(m.role)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const change = async (next: TeamRole) => {
    if (next === role || saving) return
    const prev = role
    setRole(next)
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/club/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: m.id, role: next }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setRole(prev)
        setMsg(data.error ?? 'Bewaren mislukt.')
      } else {
        setMsg('✓ Bewaard')
      }
    } catch {
      setRole(prev)
      setMsg('Er ging iets mis.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ct-row">
      <div className="ct-id">
        <span className="ct-name">{m.name || m.email.split('@')[0]}</span>
        <span className="ct-email">{m.email}</span>
      </div>
      <div className="ct-pick" role="group" aria-label={`Rol van ${m.name || m.email}`}>
        {ORDER.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={saving}
            className={`ct-chip ${role === opt ? 'on' : ''}`}
            onClick={() => change(opt)}
          >
            {LABEL[opt]}
          </button>
        ))}
        {msg && <span className="ct-msg">{msg}</span>}
      </div>
    </div>
  )
}

export function ClubTeamManager({ members }: { members: Member[] }) {
  if (members.length === 0) {
    return (
      <p className="empty">
        Nog geen leden in je club om een rol te geven. Leden verschijnen hier zodra ze zich
        registreren en jouw club kiezen.
      </p>
    )
  }
  return (
    <div className="ct-list">
      {members.map((m) => (
        <MemberRow key={m.id} m={m} />
      ))}
    </div>
  )
}
