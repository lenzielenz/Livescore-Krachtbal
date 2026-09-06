'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { TeamLogo } from '@/components/TeamLogo'
import type { LogoFit } from '@/lib/logo-fit'
import { seasonFromDate } from '@/lib/seasons'
import { DeleteMatchButton } from './DeleteMatchButton'
import './analyse-archive.css'
import { formatDateBE } from '@/lib/datetime'

type ArchiveTeam = { name: string; logoUrl: string | null; logoFit?: LogoFit | null; primary: string | null }
export type ArchiveRow = {
  id: number
  reeks: string
  date: string
  score: { home: number; away: number }
  /** Hangt er al een opname aan deze wedstrijd? */
  hasVideo?: boolean
  /** Mag deze gebruiker er een video aan toevoegen? */
  canAddVideo?: boolean
  home: ArchiveTeam
  away: ArchiveTeam
}

// Afgelopen analysewedstrijden, schaalbaar getoond: zoek op ploeg + filter op reeks, en gegroepeerd
// per seizoen in inklapbare blokken (nieuwste open, oudere dicht). Zo blijft de lijst kort, hoeveel
// wedstrijden je ook opneemt — zónder iets te verwijderen (alle data blijft bewaard).
export function AnalyseArchive({ rows, canDelete }: { rows: ArchiveRow[]; canDelete: boolean }) {
  const [q, setQ] = useState('')
  const [reeks, setReeks] = useState('all')

  const reeksen = useMemo(
    () => Array.from(new Set(rows.map((r) => r.reeks).filter(Boolean))).sort(),
    [rows],
  )

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (reeks !== 'all' && r.reeks !== reeks) return false
      if (!needle) return true
      return r.home.name.toLowerCase().includes(needle) || r.away.name.toLowerCase().includes(needle)
    })
  }, [rows, q, reeks])

  // Groepeer per seizoen, nieuwste eerst.
  const groups = useMemo(() => {
    const map = new Map<string, ArchiveRow[]>()
    for (const r of filtered) {
      const s = r.date ? seasonFromDate(new Date(r.date)) : 'Onbekend'
      const arr = map.get(s)
      if (arr) arr.push(r)
      else map.set(s, [r])
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  if (rows.length === 0) {
    return <p className="empty">Nog geen afgelopen wedstrijden om te analyseren.</p>
  }

  const filtering = q.trim() !== '' || reeks !== 'all'

  return (
    <div className="an-archive">
      <div className="an-archive-bar">
        <input
          className="an-archive-search"
          type="search"
          placeholder="🔎 Zoek op ploeg…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Zoek een afgelopen analysewedstrijd op ploeg"
        />
        {reeksen.length > 1 && (
          <select
            className="an-archive-reeks"
            value={reeks}
            onChange={(e) => setReeks(e.target.value)}
            aria-label="Filter op reeks"
          >
            <option value="all">Alle reeksen</option>
            {reeksen.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
      </div>

      {groups.length === 0 ? (
        <p className="empty an-archive-empty">Geen wedstrijden gevonden voor deze zoekopdracht.</p>
      ) : (
        groups.map(([season, list], i) => (
          // Nieuwste seizoen open; tijdens zoeken/filteren alle treffers open.
          <details key={season} className="an-season" open={i === 0 || filtering}>
            <summary className="an-season-sum">
              <span className="an-season-name">📅 Seizoen {season}</span>
              <span className="an-season-count">{list.length}</span>
            </summary>
            <div className="an-list an-list-sm">
              {list.map((r) => (
                <Link key={r.id} href={r.hasVideo ? `/analyse/${r.id}` : `/analyse/${r.id}#video`} className="an-card">
                  <span className="an-card-reeks">{r.reeks}</span>
                  <span className="an-card-row">
                    <span className="an-team">
                      <TeamLogo name={r.home.name} logoUrl={r.home.logoUrl} logoFit={r.home.logoFit} side="home" size="xs" ringColor={r.home.primary} />
                      <span className="an-team-nm">{r.home.name}</span>
                    </span>
                    <span className="an-score">
                      {r.score.home}
                      <span className="an-dash">–</span>
                      {r.score.away}
                    </span>
                    <span className="an-team away">
                      <span className="an-team-nm">{r.away.name}</span>
                      <TeamLogo name={r.away.name} logoUrl={r.away.logoUrl} logoFit={r.away.logoFit} side="away" size="xs" ringColor={r.away.primary} />
                    </span>
                  </span>
                  {(r.hasVideo || r.canAddVideo) && (
                    <span className={`an-card-video${r.hasVideo ? ' on' : ''}`}>
                      {r.hasVideo ? '🎥 video' : '🎥 video toevoegen'}
                    </span>
                  )}
                  <span className="an-card-date">
                    {r.date ? formatDateBE(new Date(r.date), { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                  </span>
                  {canDelete && <DeleteMatchButton matchId={r.id} label={`${r.home.name} – ${r.away.name}`} />}
                </Link>
              ))}
            </div>
          </details>
        ))
      )}
    </div>
  )
}
