'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Account = {
  id: number
  name: string | null
  email: string
  roles: string[]
  clubId: number | null
  analyseAccess: boolean
  trainingAccess: boolean
  officialId: number | null
  analyseCount: number
}
type RoleOption = { label: string; value: string }
type Official = { id: number; name: string }

// Volgorde voor de groepering (hoogste rol bepaalt de groep van een account).
const TYPE_ORDER = ['admin', 'federatie', 'scheidsrechter', 'club-beheerder', 'club-medewerker', 'club-lid', 'scorekeeper', 'kapitein', 'viewer'] as const
const TYPE_LABEL: Record<string, string> = {
  admin: 'Admins',
  federatie: 'Federatie',
  scheidsrechter: 'Scheidsrechters',
  'club-beheerder': 'Clubs',
  'club-medewerker': 'Clubmedewerkers',
  'club-lid': 'Clubleden',
  scorekeeper: 'Aantekenaars',
  kapitein: 'Kapiteins',
  viewer: 'Supporters',
}

function primaryType(roles: string[]): string {
  return TYPE_ORDER.find((t) => roles.includes(t)) ?? 'viewer'
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function AccountRow({ acc, clubs, officials, roleOptions }: { acc: Account; clubs: { id: number; name: string }[]; officials: Official[]; roleOptions: RoleOption[] }) {
  const [roles, setRoles] = useState<string[]>(acc.roles)
  const [clubId, setClubId] = useState<string>(acc.clubId != null ? String(acc.clubId) : '')
  const [officialId, setOfficialId] = useState<string>(acc.officialId != null ? String(acc.officialId) : '')
  const [analyse, setAnalyse] = useState<boolean>(acc.analyseAccess)
  const [training, setTraining] = useState<boolean>(acc.trainingAccess)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const isReferee = roles.includes('scheidsrechter')
  const dirty =
    roles.slice().sort().join(',') !== acc.roles.slice().sort().join(',') ||
    clubId !== (acc.clubId != null ? String(acc.clubId) : '') ||
    officialId !== (acc.officialId != null ? String(acc.officialId) : '') ||
    analyse !== acc.analyseAccess ||
    training !== acc.trainingAccess

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
        body: JSON.stringify({ userId: acc.id, roles, clubId: clubId || null, officialId: officialId || null, analyseAccess: analyse, trainingAccess: training }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) setMsg(data.error ?? 'Bewaren mislukt.')
      else {
        acc.roles = roles
        acc.clubId = clubId ? Number(clubId) : null
        acc.officialId = officialId ? Number(officialId) : null
        acc.analyseAccess = analyse
        acc.trainingAccess = training
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
        {acc.analyseCount > 0 && (
          <span className="acc-badge" title="Aantal analyse-opnames van deze gebruiker">
            📈 {acc.analyseCount} {acc.analyseCount === 1 ? 'opname' : 'opnames'}
          </span>
        )}
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
        <button
          type="button"
          className={`acc-chip ${training ? 'on' : ''}`}
          onClick={() => { setMsg(null); setTraining((v) => !v) }}
          title="Toegang tot het trainingsluik (progressie + aanwezigheid)"
        >
          🏋️ Training
        </button>
        <select className="acc-club" value={clubId} onChange={(e) => { setMsg(null); setClubId(e.target.value) }} aria-label="Club">
          <option value="">— Geen club —</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {isReferee && (
          <select className="acc-club" value={officialId} onChange={(e) => { setMsg(null); setOfficialId(e.target.value) }} aria-label="Scheidsrechtersdossier" title="Koppel het scheidsrechtersdossier (zo werkt de persoonlijke QR/code)">
            <option value="">🟨 Geen dossier —</option>
            {officials.map((o) => (
              <option key={o.id} value={o.id}>🟨 {o.name}</option>
            ))}
          </select>
        )}
        <button type="button" className="acc-save" disabled={!dirty || saving} onClick={save}>
          {saving ? 'Bezig…' : 'Bewaren'}
        </button>
        {msg && <span className="acc-msg">{msg}</span>}
      </div>
    </div>
  )
}

// Tool om de analyse-opnames van de ene gebruiker bij een andere te brengen (data samenbrengen).
function AnalyseTransfer({ users }: { users: Account[] }) {
  const router = useRouter()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const label = (u: Account) => `${u.name || u.email.split('@')[0]} (${u.email})`
  const owners = users.filter((u) => u.analyseCount > 0)

  const run = async () => {
    setMsg(null)
    if (!from || !to) return setMsg('Kies een van- en naar-gebruiker.')
    if (from === to) return setMsg('Van en naar mogen niet dezelfde zijn.')
    const fromUser = users.find((u) => String(u.id) === from)
    const toUser = users.find((u) => String(u.id) === to)
    if (!window.confirm(`Alle ${fromUser?.analyseCount ?? ''} analyse-opnames van ${fromUser ? label(fromUser) : ''} overdragen naar ${toUser ? label(toUser) : ''}?`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/analyse/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ fromUserId: Number(from), toUserId: Number(to) }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; moved?: number }
      if (!res.ok) setMsg(data.error ?? 'Overdragen mislukt.')
      else {
        setMsg(`✓ ${data.moved ?? 0} opname(s) overgedragen.`)
        setFrom('')
        setTo('')
        router.refresh()
      }
    } catch {
      setMsg('Er ging iets mis.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="acc-group acc-transfer">
      <h2 className="acc-group-head">🔗 Analyse-data samenbrengen</h2>
      <p className="acc-transfer-help">
        Elke analist heeft z'n eigen analyse-opnames. Wil je de data van meerdere mensen samenbrengen
        onder één persoon (bv. een centraal analyse-account)? Kies van wie je de opnames haalt en naar
        wie ze gaan. De opnames blijven volledig behouden — enkel de eigenaar verandert.
      </p>
      <div className="acc-transfer-row">
        <label className="acc-transfer-field">
          <span>Van (eigenaar)</span>
          <select className="acc-club" value={from} onChange={(e) => { setMsg(null); setFrom(e.target.value) }}>
            <option value="">— Kies —</option>
            {owners.map((u) => (
              <option key={u.id} value={u.id}>{label(u)} · {u.analyseCount} opname(s)</option>
            ))}
          </select>
        </label>
        <span className="acc-transfer-arrow" aria-hidden>→</span>
        <label className="acc-transfer-field">
          <span>Naar (nieuwe eigenaar)</span>
          <select className="acc-club" value={to} onChange={(e) => { setMsg(null); setTo(e.target.value) }}>
            <option value="">— Kies —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{label(u)}</option>
            ))}
          </select>
        </label>
        <button type="button" className="acc-save" disabled={busy || !from || !to} onClick={run}>
          {busy ? 'Bezig…' : 'Overdragen'}
        </button>
      </div>
      {owners.length === 0 && <p className="empty">Nog geen analyse-opnames om samen te brengen.</p>}
      {msg && <span className="acc-msg">{msg}</span>}
    </section>
  )
}

export function AccountsManager({ users, clubs, officials, roleOptions }: { users: Account[]; clubs: { id: number; name: string }[]; officials: Official[]; roleOptions: RoleOption[] }) {
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
              <AccountRow key={acc.id} acc={acc} clubs={clubs} officials={officials} roleOptions={roleOptions} />
            ))}
          </section>
        ))
      )}

      <AnalyseTransfer users={users} />
    </div>
  )
}
