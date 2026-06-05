'use client'

import { useMemo, useState } from 'react'

type Account = { id: number; name: string | null; email: string; roles: string[]; clubId: number | null; analyseAccess: boolean }
type RoleOption = { label: string; value: string }

// Volgorde voor de groepering (hoogste rol bepaalt de groep van een account).
const TYPE_ORDER = ['admin', 'federatie', 'scheidsrechter', 'club-beheerder', 'scorekeeper', 'kapitein', 'viewer'] as const
const TYPE_LABEL: Record<string, string> = {
  admin: 'Admins',
  federatie: 'Federatie',
  scheidsrechter: 'Scheidsrechters',
  'club-beheerder': 'Clubs',
  scorekeeper: 'Aantekenaars',
  kapitein: 'Kapiteins',
  viewer: 'Supporters',
}

function primaryType(roles: string[]): string {
  return TYPE_ORDER.find((t) => roles.includes(t)) ?? 'viewer'
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function AccountRow({ acc, clubs, roleOptions }: { acc: Account; clubs: { id: number; name: string }[]; roleOptions: RoleOption[] }) {
  const [roles, setRoles] = useState<string[]>(acc.roles)
  const [clubId, setClubId] = useState<string>(acc.clubId != null ? String(acc.clubId) : '')
  const [analyse, setAnalyse] = useState<boolean>(acc.analyseAccess)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const dirty =
    roles.slice().sort().join(',') !== acc.roles.slice().sort().join(',') ||
    clubId !== (acc.clubId != null ? String(acc.clubId) : '') ||
    analyse !== acc.analyseAccess

  const toggle = (r: string) => {
    setMsg(null)
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
  }

  const save = async () => {
    if (roles.length === 0) return setMsg('Kies minstens één rol.')
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: acc.id, roles, clubId: clubId || null, analyseAccess: analyse }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setMsg(data.error ?? 'Bewaren mislukt.')
      else {
        acc.roles = roles
        acc.clubId = clubId ? Number(clubId) : null
        acc.analyseAccess = analyse
        setMsg('✓ Bewaard')
      }
    } catch {
      setMsg('Er ging iets mis.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="acc-row">
      <div className="acc-id">
        <span className="acc-name">{acc.name || acc.email.split('@')[0]}</span>
        <span className="acc-email">{acc.email}</span>
      </div>
      <div className="acc-roles">
        {roleOptions.map((o) => (
          <button
            type="button"
            key={o.value}
            className={`acc-chip ${roles.includes(o.value) ? 'on' : ''}`}
            onClick={() => toggle(o.value)}
            title={o.label}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="acc-controls">
        <button
          type="button"
          className={`acc-chip ${analyse ? 'on' : ''}`}
          onClick={() => { setMsg(null); setAnalyse((v) => !v) }}
          title="Toegang tot de analysemodule"
        >
          📈 Analyse
        </button>
        <select className="acc-club" value={clubId} onChange={(e) => { setMsg(null); setClubId(e.target.value) }} aria-label="Club">
          <option value="">— Geen club —</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button type="button" className="acc-save" disabled={!dirty || saving} onClick={save}>
          {saving ? 'Bezig…' : 'Bewaren'}
        </button>
        {msg && <span className="acc-msg">{msg}</span>}
      </div>
    </div>
  )
}

export function AccountsManager({ users, clubs, roleOptions }: { users: Account[]; clubs: { id: number; name: string }[]; roleOptions: RoleOption[] }) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = norm(query.trim())
    const filtered = q ? users.filter((u) => norm(`${u.name ?? ''} ${u.email}`).includes(q)) : users
    const map = new Map<string, Account[]>()
    for (const u of filtered) {
      const t = primaryType(u.roles)
      const arr = map.get(t) ?? []
      arr.push(u)
      map.set(t, arr)
    }
    return TYPE_ORDER.filter((t) => map.has(t)).map((t) => [t, map.get(t)!] as const)
  }, [users, query])

  return (
    <div className="acc-wrap">
      <input
        className="acc-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Zoek op naam of e-mail…"
        aria-label="Zoek account"
      />
      {groups.length === 0 ? (
        <p className="empty">Geen accounts gevonden.</p>
      ) : (
        groups.map(([type, list]) => (
          <section key={type} className="acc-group">
            <h2 className="acc-group-head">{TYPE_LABEL[type]} <span className="acc-count">{list.length}</span></h2>
            {list.map((acc) => (
              <AccountRow key={acc.id} acc={acc} clubs={clubs} roleOptions={roleOptions} />
            ))}
          </section>
        ))
      )}
    </div>
  )
}
