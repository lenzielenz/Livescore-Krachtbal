'use client'

import { useEffect, useRef, useState } from 'react'

import { DateNav, FavPopover, MatchGroups, ReeksSelect, useDemoFilters } from '../shared'
import type { DayMatch } from '../../../live/LiveBoard'
import type { Speeldag } from '@/lib/speeldagen'

/**
 * Voorstel 2 — "Compacte werkbalk": één horizontale, sticky rij bovenaan i.p.v. een zijbalk +
 * aparte livetabs + aparte zoekbalk. Reeks/Mijn club/Live/Favorieten staan er gelijkwaardig naast
 * elkaar (net als vandaag), maar de 3 losse "★"-knoppen zijn samengevoegd tot één "★ Favorieten"
 * met een klein menu. Zoeken zit achter een icoon dat pas plaats inneemt zodra je erop tikt — de
 * werkbalk blijft zo altijd even breed, ongeacht of je aan het zoeken bent.
 */
export function Proposal2Toolbar({
  date, today, matches, speeldagen, myClubId, userId,
}: {
  date: string
  today: string
  matches: DayMatch[]
  speeldagen: Speeldag[]
  myClubId: number | null
  userId: number | string | null
}) {
  const filters = useDemoFilters(matches, myClubId, userId)
  const [searchOpen, setSearchOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  return (
    <div className="fp2">
      <DateNav date={date} today={today} speeldagen={speeldagen} basePath="/demo/filters" />

      <div className="fp2-toolbar">
        <ReeksSelect filters={filters} label="Reeks" />
        {myClubId != null && (
          <button type="button" className={`lb-reeks fav ${filters.onlyMyClub ? 'on' : ''}`} onClick={() => filters.setOnlyMyClub((v) => !v)}>
            <span>🏠 Mijn club</span>
            {filters.myClubCount > 0 && <span className="lb-reeks-n">{filters.myClubCount}</span>}
          </button>
        )}
        {filters.liveCount > 0 && (
          <button type="button" className={`lb-reeks fav live ${filters.showLiveOnly ? 'on' : ''}`} onClick={() => filters.setOnlyLive((v) => !v)}>
            <span className="lb-livedot" /> Live
            <span className="lb-reeks-n">{filters.liveCount}</span>
          </button>
        )}
        <FavPopover filters={filters} />

        <div className={`fp2-search ${searchOpen ? 'open' : ''}`}>
          {searchOpen ? (
            <>
              <input
                ref={inputRef}
                type="search"
                value={filters.query}
                onChange={(e) => filters.setQuery(e.target.value)}
                onBlur={() => !filters.query && setSearchOpen(false)}
                placeholder="Zoek een ploeg of reeks…"
                aria-label="Zoek een ploeg of reeks"
              />
              <button type="button" className="lb-search-clear" onClick={() => { filters.setQuery(''); setSearchOpen(false) }} aria-label="Sluit zoeken">✕</button>
            </>
          ) : (
            <button type="button" className="fp2-search-btn" onClick={() => setSearchOpen(true)} aria-label="Zoek een ploeg of reeks">🔍</button>
          )}
        </div>
      </div>

      <MatchGroups filters={filters} />
    </div>
  )
}
