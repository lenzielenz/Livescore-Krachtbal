'use client'

import { useMemo, useState } from 'react'

// Vaste, openbare kantine-link per club: kies je club en deel/plak de link op de kantine-tv. Hij
// blijft heel het seizoen geldig en toont automatisch al jullie wedstrijden van die dag.
export function KantineClubLink({ clubs, myClubId }: { clubs: { id: number; name: string }[]; myClubId?: number | null }) {
  const [clubId, setClubId] = useState<number | null>(myClubId ?? (clubs.length === 1 ? clubs[0].id : null))
  const [copied, setCopied] = useState(false)

  const url = useMemo(() => {
    if (clubId == null) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/kantine/club/${clubId}`
  }, [clubId])

  if (clubs.length === 0) return null

  return (
    <section className="kt-clublink">
      <h2 className="kt-clublink-title">📺 Vaste link voor jouw kantinescherm</h2>
      <p className="kt-clublink-sub">
        Eén vaste, openbare link die heel het seizoen blijft werken. Hij toont automatisch álle
        wedstrijden van de club op die dag (de ene week meer dan de andere). Ideaal om op de
        kantine-tv te zetten en nooit meer aan te raken.
      </p>
      <div className="kt-clublink-row">
        <select
          className="kt-clublink-select"
          value={clubId ?? ''}
          onChange={(e) => { setClubId(e.target.value ? Number(e.target.value) : null); setCopied(false) }}
          aria-label="Club"
        >
          <option value="">— kies een club —</option>
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {url && (
          <>
            <input className="kt-clublink-url" value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="kt-clublink-btn"
              onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            >
              {copied ? '✓ Gekopieerd' : '🔗 Kopieer'}
            </button>
            <a className="kt-clublink-btn open" href={url} target="_blank" rel="noopener noreferrer">Openen ↗</a>
          </>
        )}
      </div>
    </section>
  )
}
