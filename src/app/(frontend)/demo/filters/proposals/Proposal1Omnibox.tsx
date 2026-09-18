'use client'

import { DateNav, FavPopover, MatchGroups, ReeksSelect, useDemoFilters } from '../shared'
import type { DayMatch } from '../../../live/LiveBoard'
import type { Speeldag } from '@/lib/speeldagen'

/**
 * Voorstel 1 — "Omnibox eerst": één grote zoekbalk is de hoofdingang (ploeg, club óf reeks typen
 * vindt meteen iets — pastBijZoekterm doorzoekt alle drie). Geen aparte 220px-zijbalk meer: alles
 * wat je zoekt/filtert past in de zoekbalk zelf + één smalle rij snelfilters eronder. Wint ruimte
 * doordat er nergens meer een blijvende lijst/kolom staat — enkel wat je nu actief gebruikt.
 */
export function Proposal1Omnibox({
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

  return (
    <div className="fp1">
      <DateNav date={date} today={today} speeldagen={speeldagen} basePath="/demo/filters" />

      <div className="fp1-search">
        <span className="fp1-search-ico" aria-hidden>🔍</span>
        <input
          type="search"
          value={filters.query}
          onChange={(e) => filters.setQuery(e.target.value)}
          placeholder="Zoek een ploeg, club of reeks…"
          aria-label="Zoek een ploeg, club of reeks"
        />
        {filters.query && (
          <button type="button" className="lb-search-clear" onClick={() => filters.setQuery('')} aria-label="Wis zoekopdracht">✕</button>
        )}
      </div>

      <div className="fp1-chips">
        <ReeksSelect filters={filters} />
        {filters.liveCount > 0 && (
          <button type="button" className={`lb-reeks fav live ${filters.showLiveOnly ? 'on' : ''}`} onClick={() => filters.setOnlyLive((v) => !v)}>
            <span className="lb-livedot" /> Live
            <span className="lb-reeks-n">{filters.liveCount}</span>
          </button>
        )}
        {myClubId != null && (
          <button type="button" className={`lb-reeks fav ${filters.onlyMyClub ? 'on' : ''}`} onClick={() => filters.setOnlyMyClub((v) => !v)}>
            <span>🏠 Mijn club</span>
            {filters.myClubCount > 0 && <span className="lb-reeks-n">{filters.myClubCount}</span>}
          </button>
        )}
        <FavPopover filters={filters} />
      </div>

      <MatchGroups filters={filters} today={today} />
    </div>
  )
}
