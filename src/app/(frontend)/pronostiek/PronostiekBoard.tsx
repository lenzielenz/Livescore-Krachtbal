'use client'

import { useMemo, useState } from 'react'

import { catchUpWeekends, type LeaderRow } from '@/lib/prediction-score'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Klassement met een "waar sta ik?"-zoekbalk en een sprong-naar-mij-knop — onmisbaar zodra er
// honderden deelnemers zijn. Toont je achterstand tot de leider én hoeveel sterke weekends dat
// ongeveer is, zodat je de hoop op de eerste plaats niet verliest.
export function PronostiekBoard({
  rows,
  myUserId,
  swingPerWeekend,
  totalPlayers,
}: {
  rows: LeaderRow[]
  myUserId: number | null
  /** Realistische voorsprong die je per weekend op een rivaal kan pakken. */
  swingPerWeekend: number
  totalPlayers: number
}) {
  const [q, setQ] = useState('')
  const [flash, setFlash] = useState(false)

  // Vaste rang op basis van het volledige (gesorteerde) klassement — zoeken hernummert dus niet.
  const ranked = useMemo(() => rows.map((r, i) => ({ ...r, rank: i + 1 })), [rows])
  const me = myUserId != null ? ranked.find((r) => r.userId === myUserId) : undefined
  const leaderPoints = ranked[0]?.points ?? 0
  const deficit = me ? leaderPoints - me.points : 0
  const weekends = catchUpWeekends(deficit, swingPerWeekend)

  const filtered = q.trim() ? ranked.filter((r) => norm(r.name).includes(norm(q))) : ranked

  const jumpToMe = () => {
    if (myUserId == null) return
    const el = document.getElementById(`vs-${myUserId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFlash(true)
      window.setTimeout(() => setFlash(false), 1600)
    }
  }

  return (
    <>
      <div className="vs-panel">
        <div className="vs-panel-meta">{totalPlayers} {totalPlayers === 1 ? 'deelnemer' : 'deelnemers'}</div>
        {me && (
          <div className="vs-hope">
            {me.rank === 1 ? (
              <span>🥇 Je staat op kop — knap! Verdedig je plek dit weekend.</span>
            ) : (
              <span>
                Je staat <b>#{me.rank}</b> · <b>{deficit}</b> ptn achter de leider — ongeveer{' '}
                <b>{weekends}</b> sterk{weekends === 1 ? '' : 'e'} weekend{weekends === 1 ? '' : 's'} en je knokt terug naar de top. 💪
              </span>
            )}
          </div>
        )}

        <div className="vs-search">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Zoek een naam… (waar sta ik?)"
            aria-label="Zoek een naam in het klassement"
          />
          {q && (
            <button type="button" className="vs-search-clear" onClick={() => setQ('')} aria-label="Wis zoekopdracht">
              ✕
            </button>
          )}
          {me && (
            <button type="button" className="vs-jump" onClick={jumpToMe}>
              📍 Spring naar mij
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty">Geen deelnemer gevonden voor “{q.trim()}”.</p>
      ) : (
        <div className="vs-board vs-board-search">
          {filtered.map((r) => (
            <div
              key={r.userId}
              id={`vs-${r.userId}`}
              className={`vs-row${r.userId === myUserId ? ' me' : ''}${r.rank === 1 ? ' leader' : ''}${flash && r.userId === myUserId ? ' flash' : ''}`}
            >
              <span className="vs-rank">{r.rank === 1 ? '🥇' : r.rank}</span>
              <span className="vs-who">{r.name}{r.userId === myUserId ? ' (jij)' : ''}</span>
              <span className="vs-stat" title="Exacte uitslagen">🎯 {r.exact}</span>
              <span className="vs-stat" title="Wedstrijden voorspeld">{r.predictions}×</span>
              <span className="vs-pts">{r.points}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
