'use client'

import { useState } from 'react'

import { KEURING_ITEMS, KEURING_OPTIONS } from '@/lib/keuring'
import { MATCHSHEET_STATUS_OPTIONS, nextStatus, type MatchSheetStatus } from '@/lib/matchsheet-workflow'

const statusLabel = (s: string) =>
  MATCHSHEET_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s

export function RefereePanel({
  matchId,
  initialStatus,
  initialKeuring,
}: {
  matchId: string
  initialStatus: string
  initialKeuring: Record<string, string>
}) {
  const [status, setStatus] = useState<MatchSheetStatus>(initialStatus as MatchSheetStatus)
  const [keuring, setKeuring] = useState<Record<string, string>>(initialKeuring)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const post = async (body: Record<string, unknown>) => {
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/matchsheet/${matchId}/referee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    setBusy(false)
    return { ok: res.ok, json }
  }

  const saveKeuring = async () => {
    const { ok, json } = await post({ action: 'keuring', keuring })
    setMsg(ok ? 'Keuring bewaard.' : json.error || 'Mislukt.')
  }

  const goTo = async (to: MatchSheetStatus) => {
    const { ok, json } = await post({ action: 'status', to })
    if (ok) {
      setStatus(json.status)
      setMsg(`Status → ${statusLabel(json.status)}.`)
    } else {
      setMsg(json.error || 'Statuswijziging mislukt.')
    }
  }

  const next = nextStatus(status)

  return (
    <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Materiële keuring</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {KEURING_ITEMS.map((item) => (
            <li key={item.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{item.label}</span>
              <select
                value={keuring[item.name] ?? 'ok'}
                onChange={(e) => setKeuring((k) => ({ ...k, [item.name]: e.target.value }))}
              >
                {KEURING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <button onClick={saveKeuring} disabled={busy} className="btn btn--style-primary" style={btn}>
          Keuring bewaren
        </button>
      </section>

      <section style={card}>
        <h2 style={{ marginTop: 0 }}>Status</h2>
        <p>
          Huidige status: <strong>{statusLabel(status)}</strong>
        </p>
        {next && (
          <button onClick={() => goTo(next)} disabled={busy} className="btn btn--style-primary" style={btn}>
            → Naar &quot;{statusLabel(next)}&quot;
          </button>
        )}
        <p style={{ fontSize: 13, color: '#666', marginTop: 12 }}>Manueel overschrijven (override, gelogd):</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MATCHSHEET_STATUS_OPTIONS.filter((o) => o.value !== status && o.value !== 'ingediend').map((o) => (
            <button
              key={o.value}
              onClick={() => goTo(o.value)}
              disabled={busy}
              style={{ ...btnSmall, opacity: o.value === next ? 0.5 : 1 }}
            >
              {o.label}
            </button>
          ))}
        </div>
        {msg && <p style={{ marginTop: 12, fontSize: 13 }}>{msg}</p>}
      </section>
    </div>
  )
}

const card: React.CSSProperties = { border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, background: '#fff' }
const btn: React.CSSProperties = { marginTop: 12, padding: '8px 16px', cursor: 'pointer' }
const btnSmall: React.CSSProperties = {
  padding: '4px 10px',
  cursor: 'pointer',
  border: '1px solid #ccc',
  borderRadius: 6,
  background: '#f5f5f5',
  fontSize: 13,
}
