'use client'

import { useMemo, useState } from 'react'

import type { FunctieDef } from '@/lib/function-grants'

export type Grant = {
  id: number
  userId: number
  userLabel: string
  functie: string
  clubId: number | null
  clubName: string | null
}

type UserOpt = { id: number; label: string }
type ClubOpt = { id: number; name: string }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function AddGrantForm({
  users,
  clubs,
  functies,
  onAdded,
}: {
  users: UserOpt[]
  clubs: ClubOpt[]
  functies: FunctieDef[]
  onAdded: (g: Grant) => void
}) {
  const [query, setQuery] = useState('')
  const [userId, setUserId] = useState('')
  const [functie, setFunctie] = useState(functies[0]?.value ?? '')
  const [clubId, setClubId] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const def = functies.find((f) => f.value === functie)
  const matches = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return users.slice(0, 20)
    return users.filter((u) => norm(u.label).includes(q)).slice(0, 20)
  }, [users, query])

  const submit = async () => {
    setErr(null)
    const uid = Number(userId)
    if (!Number.isFinite(uid)) {
      setErr('Kies eerst een gebruiker.')
      return
    }
    if (def?.clubGebonden && !clubId) {
      setErr('Kies een club voor deze functie.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/rechten', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: uid, functie, clubId: def?.clubGebonden ? Number(clubId) : null }),
      })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: number; error?: string }
      if (!res.ok || !data.ok) {
        setErr(data.error ?? 'Toekennen mislukt.')
        return
      }
      const u = users.find((x) => x.id === uid)
      const c = def?.clubGebonden ? clubs.find((x) => x.id === Number(clubId)) : null
      onAdded({ id: data.id as number, userId: uid, userLabel: u?.label ?? '—', functie, clubId: c?.id ?? null, clubName: c?.name ?? null })
      setQuery('')
      setUserId('')
    } catch {
      setErr('Toekennen mislukt — probeer opnieuw.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="acc-add">
      <h2 className="acc-group-head">Nieuwe toekenning</h2>
      <div className="led-toolbar">
        <input
          className="acc-search"
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setUserId('') }}
          placeholder="Zoek een gebruiker op naam of e-mail…"
          aria-label="Zoek gebruiker"
        />
        <select className="acc-club" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Gebruiker" disabled={matches.length === 0}>
          <option value="">— kies uit {matches.length} gevonden —</option>
          {matches.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </select>
        <select className="acc-club" value={functie} onChange={(e) => { setFunctie(e.target.value); setClubId('') }} aria-label="Functie">
          {functies.map((f) => (
            <option key={f.value} value={f.value}>{f.label} ({f.groep})</option>
          ))}
        </select>
        {def?.clubGebonden && (
          <select className="acc-club" value={clubId} onChange={(e) => setClubId(e.target.value)} aria-label="Club">
            <option value="">— kies een club —</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <button type="button" className="acc-chip" disabled={saving || !userId} onClick={() => void submit()}>
          {saving ? 'Bezig…' : '+ Toekennen'}
        </button>
      </div>
      {err && <p className="acc-msg" style={{ color: '#ff9b9b' }}>{err}</p>}
    </div>
  )
}

function GrantRow({ grant, onRemoved }: { grant: Grant; onRemoved: (id: number) => void }) {
  const [busy, setBusy] = useState(false)
  const remove = async () => {
    if (!confirm(`"${grant.functie}" intrekken bij ${grant.userLabel}?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/rechten?id=${grant.id}`, { method: 'DELETE', credentials: 'include' })
      if (res.ok) onRemoved(grant.id)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="led-row">
      <span className="led-id">
        <span className="led-name">{grant.userLabel}</span>
        <span className="led-team">{grant.functie}{grant.clubName ? ` · ${grant.clubName}` : ''}</span>
      </span>
      <div className="led-controls">
        <button type="button" className="acc-chip danger-on" disabled={busy} onClick={() => void remove()}>
          {busy ? 'Bezig…' : '✕ Intrekken'}
        </button>
      </div>
    </div>
  )
}

export function RechtenManager({
  grants: initial,
  users,
  clubs,
  functies,
}: {
  grants: Grant[]
  users: UserOpt[]
  clubs: ClubOpt[]
  functies: FunctieDef[]
}) {
  const [grants, setGrants] = useState(initial)
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = norm(query.trim())
    const filtered = grants.filter((g) => !q || norm(`${g.userLabel} ${g.functie} ${g.clubName ?? ''}`).includes(q))
    const map = new Map<string, Grant[]>()
    for (const g of filtered) {
      const def = functies.find((f) => f.value === g.functie)
      const key = def?.label ?? g.functie
      const arr = map.get(key) ?? []
      arr.push(g)
      map.set(key, arr)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [grants, query, functies])

  return (
    <div className="led-wrap">
      <AddGrantForm users={users} clubs={clubs} functies={functies} onAdded={(g) => setGrants((gs) => [g, ...gs])} />

      <div className="led-toolbar" style={{ marginTop: 20 }}>
        <input
          className="acc-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek in de toekenningen…"
          aria-label="Zoek toekenning"
        />
        <span className="led-stat">{grants.length} toekenning{grants.length === 1 ? '' : 'en'}</span>
      </div>

      {groups.length === 0 ? (
        <p className="empty">Nog geen functies toegekend.</p>
      ) : (
        groups.map(([label, list]) => (
          <section key={label} className="led-group">
            <h2 className="acc-group-head">{label} <span className="acc-count">{list.length}</span></h2>
            {list.map((g) => (
              <GrantRow key={g.id} grant={g} onRemoved={(id) => setGrants((gs) => gs.filter((x) => x.id !== id))} />
            ))}
          </section>
        ))
      )}
    </div>
  )
}
