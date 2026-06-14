'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

async function post(body: unknown): Promise<{ ok?: boolean; error?: string; pool?: { id: string } }> {
  const res = await fetch('/api/club/pool', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
  return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; pool?: { id: string } }
}

export function PoolCreate({ scopeOptions }: { scopeOptions: { value: string; label: string }[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [scope, setScope] = useState('club')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    setMsg(null)
    const r = await post({ action: 'create', name: name.trim(), scope })
    setBusy(false)
    if (r.ok && r.pool) router.push(`/club/voorspel?pool=${r.pool.id}`)
    else setMsg(r.error || 'Aanmaken mislukt.')
  }
  return (
    <form className="vs-poolform" onSubmit={submit}>
      <input className="vs-poolname" value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam van je pool…" maxLength={60} aria-label="Naam van de pool" />
      <select className="vs-poolscope" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope van de pool">
        {scopeOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <button type="submit" className="vs-save" disabled={busy}>{busy ? '…' : 'Start pool'}</button>
      {msg && <span className="vs-msg">{msg}</span>}
    </form>
  )
}

export function PoolJoin() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setMsg(null)
    const r = await post({ action: 'join', code: code.trim() })
    setBusy(false)
    if (r.ok && r.pool) router.push(`/club/voorspel?pool=${r.pool.id}`)
    else setMsg(r.error || 'Joinen mislukt.')
  }
  return (
    <form className="vs-poolform" onSubmit={submit}>
      <input className="vs-poolname" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Pool-code…" maxLength={6} aria-label="Pool-code" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }} />
      <button type="submit" className="vs-save" disabled={busy}>{busy ? '…' : 'Join'}</button>
      {msg && <span className="vs-msg">{msg}</span>}
    </form>
  )
}

export function PoolLeave({ poolId }: { poolId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const leave = async () => {
    if (!confirm('Deze pool verlaten?')) return
    setBusy(true)
    await post({ action: 'leave', poolId })
    router.push('/club/voorspel')
  }
  return <button type="button" className="vs-poolleave" onClick={leave} disabled={busy}>Pool verlaten</button>
}
