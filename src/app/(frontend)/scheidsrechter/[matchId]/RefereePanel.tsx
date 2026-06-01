'use client'

import { useState } from 'react'

import { KEURING_ITEMS, KEURING_OPTIONS } from '@/lib/keuring'
import { MATCHSHEET_STATUS_OPTIONS, nextStatus, type MatchSheetStatus } from '@/lib/matchsheet-workflow'

const statusLabel = (s: string) =>
  MATCHSHEET_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s

const OFFICIAL_FUNCTIES: { name: string; label: string }[] = [
  { name: 'aantekenaar', label: 'Aantekenaar / scorer' },
  { name: 'tijdopnemer', label: 'Tijdopnemer' },
  { name: 'grensrechterThuis', label: 'Grensrechter (thuis)' },
  { name: 'grensrechterUit', label: 'Grensrechter (uit)' },
  { name: 'terreinafgevaardigde', label: 'Terreinafgevaardigde' },
  { name: 'coachThuis', label: 'Coach (thuis)' },
  { name: 'coachUit', label: 'Coach (uit)' },
]

export function RefereePanel({
  matchId,
  initialStatus,
  initialKeuring,
  initialOfficials,
  officialsHint,
}: {
  matchId: string
  initialStatus: string
  initialKeuring: Record<string, string>
  initialOfficials: Record<string, string>
  officialsHint: string | null
}) {
  const [status, setStatus] = useState<MatchSheetStatus>(initialStatus as MatchSheetStatus)
  const [keuring, setKeuring] = useState<Record<string, string>>(initialKeuring)
  const [officials, setOfficials] = useState<Record<string, string>>(initialOfficials)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const saveOfficials = async () => {
    const { ok, json } = await post({ action: 'officials', officials })
    setMsg(ok ? 'Officials bewaard.' : json.error || 'Mislukt.')
  }

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
    <div className="wb-grid">
      <section className="wb-card">
        <h2>Officials</h2>
        {officialsHint && <p className="wb-sub">{officialsHint}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OFFICIAL_FUNCTIES.map((f) => (
            <label key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.8rem', color: 'var(--dim)' }}>
              {f.label}
              <input
                className="wb-input"
                placeholder="Volledige naam + voornaam"
                value={officials[f.name] ?? ''}
                onChange={(e) => setOfficials((o) => ({ ...o, [f.name]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <button onClick={saveOfficials} disabled={busy} className="wb-btn wb-btn-primary" style={{ marginTop: 14 }}>
          Officials bewaren
        </button>
      </section>

      <section className="wb-card">
        <h2>Materiële keuring</h2>
        <div>
          {KEURING_ITEMS.map((item) => (
            <div key={item.name} className="wb-check">
              <span>{item.label}</span>
              <select
                className="wb-select"
                aria-label={item.label}
                value={keuring[item.name] ?? 'ok'}
                onChange={(e) => setKeuring((k) => ({ ...k, [item.name]: e.target.value }))}
              >
                {KEURING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <button onClick={saveKeuring} disabled={busy} className="wb-btn wb-btn-primary" style={{ marginTop: 14 }}>
          Keuring bewaren
        </button>
      </section>

      <section className="wb-card">
        <h2>Status</h2>
        <p className="wb-sub">
          Huidige status: <span className="wb-status">{statusLabel(status)}</span>
        </p>
        {next && (
          <button onClick={() => goTo(next)} disabled={busy} className="wb-btn wb-btn-primary">
            → Naar &quot;{statusLabel(next)}&quot;
          </button>
        )}
        <p className="wb-sub" style={{ marginTop: 16 }}>Manueel overschrijven (override, gelogd):</p>
        <div className="wb-btn-row" style={{ marginTop: 0 }}>
          {MATCHSHEET_STATUS_OPTIONS.filter((o) => o.value !== status && o.value !== 'ingediend').map((o) => (
            <button key={o.value} onClick={() => goTo(o.value)} disabled={busy} className="wb-btn" style={{ padding: '6px 12px', fontSize: '0.82rem' }}>
              {o.label}
            </button>
          ))}
        </div>
        {msg && <p className="wb-msg">{msg}</p>}
      </section>
    </div>
  )
}
