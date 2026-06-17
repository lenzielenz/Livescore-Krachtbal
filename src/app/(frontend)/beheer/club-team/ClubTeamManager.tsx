'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import './club-team.css'

export type TeamRole = 'none' | 'club-lid' | 'club-medewerker'
export type PlayerOption = { id: number; name: string; shirtNumber: number | null }
export type Member = { id: number; name: string | null; email: string; role: TeamRole; playerId: number | null }

const LABEL: Record<TeamRole, string> = {
  none: 'Supporter',
  'club-lid': 'Lid van de club',
  'club-medewerker': 'Club-medewerker',
}
const ORDER: TeamRole[] = ['none', 'club-lid', 'club-medewerker']

async function postTeam(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/club/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    return { ok: res.ok, error: data.error }
  } catch {
    return { ok: false, error: 'Er ging iets mis.' }
  }
}

const playerLabel = (p: PlayerOption) => `${p.shirtNumber != null ? `#${p.shirtNumber} ` : ''}${p.name}`

function MemberRow({ m, players }: { m: Member; players: PlayerOption[] }) {
  const router = useRouter()
  const [role, setRole] = useState<TeamRole>(m.role)
  const [playerId, setPlayerId] = useState<string>(m.playerId != null ? String(m.playerId) : '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const changeRole = async (next: TeamRole) => {
    if (next === role || busy) return
    const prev = role
    setRole(next)
    setBusy(true)
    setMsg(null)
    const { ok, error } = await postTeam({ userId: m.id, role: next })
    setBusy(false)
    if (!ok) {
      setRole(prev)
      setMsg(error ?? 'Bewaren mislukt.')
    } else setMsg('✓ Bewaard')
  }

  const changePlayer = async (next: string) => {
    if (next === playerId || busy) return
    const prev = playerId
    setPlayerId(next)
    setBusy(true)
    setMsg(null)
    const { ok, error } = await postTeam({ userId: m.id, playerId: next || '' })
    setBusy(false)
    if (!ok) {
      setPlayerId(prev)
      setMsg(error ?? 'Bewaren mislukt.')
    } else setMsg('✓ Bewaard')
  }

  const remove = async () => {
    if (busy) return
    if (!window.confirm(`${m.name || m.email} uit de club halen? Hun clubrol en speler-koppeling vervallen — het account zelf blijft bestaan.`)) return
    setBusy(true)
    setMsg(null)
    const { ok, error } = await postTeam({ userId: m.id, remove: true })
    if (!ok) {
      setBusy(false)
      setMsg(error ?? 'Verwijderen mislukt.')
    } else {
      router.refresh()
    }
  }

  return (
    <div className="ct-row">
      <div className="ct-id">
        <span className="ct-name">{m.name || m.email.split('@')[0]}</span>
        <span className="ct-email">{m.email}</span>
        <span className="ct-tags">
          {role === 'none' && <span className="ct-tag">geen clubrol</span>}
          {!playerId && <span className="ct-tag">geen speler</span>}
        </span>
      </div>
      <div className="ct-actions">
        <div className="ct-pick" role="group" aria-label={`Rol van ${m.name || m.email}`}>
          {ORDER.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={busy}
              className={`ct-chip ${role === opt ? 'on' : ''}`}
              onClick={() => changeRole(opt)}
            >
              {LABEL[opt]}
            </button>
          ))}
        </div>
        <div className="ct-actions-row">
          {players.length > 0 && (
            <label className="ct-link">
              <span className="ct-link-lbl">Speler</span>
              <select
                className="ct-select"
                value={playerId}
                disabled={busy}
                onChange={(e) => changePlayer(e.target.value)}
                title="Koppel dit lid aan z'n speler-dossier (zo ziet een lid enkel z'n eigen training)"
              >
                <option value="">— geen —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {playerLabel(p)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="ct-remove" disabled={busy} onClick={remove} title="Dit lid uit de club halen">
            × Uit club
          </button>
          {msg && <span className="ct-msg">{msg}</span>}
        </div>
      </div>
    </div>
  )
}

function AddByEmail() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<TeamRole, 'none'>>('club-lid')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const add = async () => {
    const e = email.trim()
    if (!e || busy) return
    setBusy(true)
    setMsg(null)
    const { ok, error } = await postTeam({ email: e, role })
    setBusy(false)
    if (!ok) {
      setMsg(error ?? 'Toevoegen mislukt.')
    } else {
      setEmail('')
      setMsg('✓ Toegevoegd')
      router.refresh()
    }
  }

  return (
    <div className="ct-add">
      <h2 className="ct-add-title">Lid toevoegen op e-mail</h2>
      <p className="ct-add-hint">
        Voor iemand die al een account heeft maar (nog) niet bij jouw club hoort. Het account mag niet
        bij een andere club zitten en geen hogere rol hebben.
      </p>
      <div className="ct-add-row">
        <input
          className="ct-select ct-add-email"
          type="email"
          placeholder="e-mailadres"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <select className="ct-select" value={role} onChange={(e) => setRole(e.target.value as Exclude<TeamRole, 'none'>)} disabled={busy}>
          <option value="club-lid">Lid van de club</option>
          <option value="club-medewerker">Club-medewerker</option>
        </select>
        <button type="button" className="ct-chip on" onClick={add} disabled={busy || !email.trim()}>
          {busy ? '…' : 'Toevoegen'}
        </button>
        {msg && <span className="ct-msg">{msg}</span>}
      </div>
    </div>
  )
}

export function ClubTeamManager({ members, players }: { members: Member[]; players: PlayerOption[] }) {
  return (
    <>
      <AddByEmail />
      {members.length === 0 ? (
        <p className="empty">
          Nog geen leden in je club om een rol te geven. Leden verschijnen hier zodra ze zich
          registreren met jouw club — of voeg er een toe op e-mail hierboven.
        </p>
      ) : (
        <div className="ct-list">
          {members.map((m) => (
            <MemberRow key={m.id} m={m} players={players} />
          ))}
        </div>
      )}
    </>
  )
}
