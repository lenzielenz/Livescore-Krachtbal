'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

export type RefMatch = {
  id: number
  home: string
  away: string
  reeks: string
  date: string | null
  status: string
  assignedRefId: number | null
  assignedRefName: string | null
}

export type RefOfficial = { id: number; name: string }

// Wedstrijdenlijst in het scheidsrechtersportaal: alle wedstrijden, met de mogelijkheid om een
// vrije wedstrijd zelf op te nemen of de eigen wedstrijd door te geven aan een andere SR.
export function RefereeMatches({
  matches,
  officials,
  myOfficialId,
  isFederation,
}: {
  matches: RefMatch[]
  officials: RefOfficial[]
  myOfficialId: number | null
  isFederation: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [handoff, setHandoff] = useState<number | null>(null) // matchId waarvoor de doorgeef-keuze open staat
  const [filter, setFilter] = useState<'all' | 'mine' | 'free'>('all')

  const shown = useMemo(() => {
    return matches.filter((m) => {
      if (filter === 'mine') return myOfficialId != null && m.assignedRefId === myOfficialId
      if (filter === 'free') return m.assignedRefId == null
      return true
    })
  }, [matches, filter, myOfficialId])

  const act = async (matchId: number, action: string, targetOfficialId?: number) => {
    setBusy(matchId)
    setMsg(null)
    try {
      const res = await fetch(`/api/scheidsrechter/wedstrijd/${matchId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, targetOfficialId }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Mislukt')
      setHandoff(null)
      router.refresh()
    } catch (err) {
      setMsg((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleString('nl-BE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
  const statusLabel = (s: string) => (s === 'live' ? 'LIVE' : s === 'finished' ? 'Afgelopen' : 'Gepland')

  return (
    <section className="wb-card rm">
      <div className="rm-head">
        <h2>Wedstrijden</h2>
        <div className="rm-filters">
          {(['all', 'free', 'mine'] as const).map((f) => (
            <button key={f} type="button" className={`rm-filter ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Alle' : f === 'free' ? 'Zonder SR' : 'Van mij'}
            </button>
          ))}
        </div>
      </div>
      <p className="wb-sub">
        Vrije wedstrijden kan je zelf opnemen. Een wedstrijd die je toegewezen kreeg, kan je doorgeven aan een
        andere scheidsrechter als je niet kan. De federatie kan altijd toewijzen.
      </p>
      {msg && <p className="wb-msg" style={{ color: '#e0533d' }}>{msg}</p>}

      {shown.length === 0 ? (
        <p className="wb-sub">Geen wedstrijden in deze selectie.</p>
      ) : (
        <ul className="rm-list">
          {shown.map((m) => {
            const mine = myOfficialId != null && m.assignedRefId === myOfficialId
            const free = m.assignedRefId == null
            const canHandoff = isFederation || mine
            return (
              <li key={m.id} className={`rm-row ${m.status}`}>
                <div className="rm-info">
                  <span className="rm-teams">{m.home} <span className="rm-vs">—</span> {m.away}</span>
                  <span className="rm-meta">{m.reeks} · {fmtDate(m.date)} · <span className={`rm-status ${m.status}`}>{statusLabel(m.status)}</span></span>
                  <span className={`rm-ref ${free ? 'free' : ''}`}>
                    {free ? '⚠️ Geen scheidsrechter' : `🟡 ${m.assignedRefName}${mine ? ' (jij)' : ''}`}
                  </span>
                </div>
                <div className="rm-actions">
                  {/* Vrije wedstrijd: een SR neemt ze zelf; de federatie wijst ze toe. */}
                  {free && myOfficialId != null && (
                    <button type="button" className="wb-btn wb-btn-primary rm-btn" disabled={busy === m.id} onClick={() => act(m.id, 'claim')}>
                      {busy === m.id ? '…' : 'Ik neem deze'}
                    </button>
                  )}
                  {/* Doorgeven (toegewezen wedstrijd) of toewijzen (federatie, vrije wedstrijd) via dezelfde keuze. */}
                  {((!free && canHandoff) || (free && isFederation)) && (
                    handoff === m.id ? (
                      <span className="rm-handoff">
                        <select
                          className="wb-input rm-select"
                          defaultValue=""
                          onChange={(e) => e.target.value && act(m.id, 'handoff', Number(e.target.value))}
                          aria-label={free ? 'Toewijzen aan' : 'Doorgeven aan'}
                        >
                          <option value="" disabled>Kies scheidsrechter…</option>
                          {officials.filter((o) => o.id !== m.assignedRefId).map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                        <button type="button" className="wb-link-btn" onClick={() => setHandoff(null)}>annuleer</button>
                      </span>
                    ) : (
                      <button type="button" className="wb-btn rm-btn" disabled={busy === m.id} onClick={() => setHandoff(m.id)}>
                        {free ? 'Toewijzen' : 'Doorgeven'}
                      </button>
                    )
                  )}
                  {!free && canHandoff && (
                    <button type="button" className="wb-link-btn rm-release" disabled={busy === m.id} onClick={() => act(m.id, 'release')}>
                      vrijgeven
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
