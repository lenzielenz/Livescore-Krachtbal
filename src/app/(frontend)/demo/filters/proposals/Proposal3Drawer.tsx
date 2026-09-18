'use client'

import { useEffect } from 'react'

import { DateNav, MatchGroups, useDemoFilters } from '../shared'
import type { DayMatch } from '../../../live/LiveBoard'
import type { Speeldag } from '@/lib/speeldagen'

/**
 * Voorstel 3 — "Filterlade": enkel de zoekbalk blijft vast in beeld (het meest gebruikte pad — je
 * eigen ploeg typen); alle andere selectie (reeks, mijn club, live, favorieten) zit achter één
 * knop "Filters" die een lade/overlay opent. Wint de MEESTE ruimte voor de wedstrijden zelf (geen
 * blijvende zijbalk, geen blijvende werkbalk), ten koste van één extra tik voor wie ver wil
 * filteren. Het aantal actieve filters staat als badge op de knop, zodat je ziet of er iets
 * aanstaat zonder de lade te openen.
 */
export function Proposal3Drawer({
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

  useEffect(() => {
    if (!filters.drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && filters.setDrawerOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [filters.drawerOpen, filters.setDrawerOpen])

  return (
    <div className="fp3">
      <DateNav date={date} today={today} speeldagen={speeldagen} basePath="/demo/filters" />

      <div className="fp3-bar">
        <div className="fp3-search">
          <input
            type="search"
            value={filters.query}
            onChange={(e) => filters.setQuery(e.target.value)}
            placeholder="Zoek een ploeg of reeks…"
            aria-label="Zoek een ploeg of reeks"
          />
          {filters.query && (
            <button type="button" className="lb-search-clear" onClick={() => filters.setQuery('')} aria-label="Wis zoekopdracht">✕</button>
          )}
        </div>
        <button type="button" className="fp3-filter-btn" onClick={() => filters.setDrawerOpen(true)}>
          🔎 Filters
          {filters.activeCount > 0 && <span className="fp3-filter-badge">{filters.activeCount}</span>}
        </button>
      </div>

      {filters.drawerOpen && (
        <div className="fp3-overlay" onClick={() => filters.setDrawerOpen(false)}>
          <div className="fp3-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Filters">
            <div className="fp3-sheet-head">
              <h3>Filters</h3>
              <button type="button" className="fp3-sheet-close" onClick={() => filters.setDrawerOpen(false)} aria-label="Sluit">✕</button>
            </div>

            <div className="fp3-sheet-body">
              {filters.liveCount > 0 && (
                <section className="fp3-section">
                  <h4>Snelfilters</h4>
                  <div className="fp3-row">
                    <button type="button" className={`lb-reeks fav live ${filters.showLiveOnly ? 'on' : ''}`} onClick={() => filters.setOnlyLive((v) => !v)}>
                      <span className="lb-livedot" /> Nu live
                      <span className="lb-reeks-n">{filters.liveCount}</span>
                    </button>
                    {myClubId != null && (
                      <button type="button" className={`lb-reeks fav ${filters.onlyMyClub ? 'on' : ''}`} onClick={() => filters.setOnlyMyClub((v) => !v)}>
                        <span>🏠 Mijn club</span>
                        {filters.myClubCount > 0 && <span className="lb-reeks-n">{filters.myClubCount}</span>}
                      </button>
                    )}
                  </div>
                </section>
              )}

              <section className="fp3-section">
                <h4>Reeks</h4>
                <div className="fp3-reekslist">
                  <button type="button" className={`fp3-reeksrow ${filters.reeksFilter == null ? 'on' : ''}`} onClick={() => filters.setReeksFilter(null)}>
                    <span>Alle reeksen</span>
                    <span className="lb-reeks-n">{filters.base.length}</span>
                  </button>
                  {filters.reeksen.map(([r, n]) => (
                    <button
                      key={r}
                      type="button"
                      className={`fp3-reeksrow ${filters.reeksFilter === r ? 'on' : ''}`}
                      onClick={() => filters.setReeksFilter(filters.reeksFilter === r ? null : r)}
                    >
                      <span>{r}</span>
                      <span className="lb-reeks-n">{n}</span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="fp3-section">
                <h4>Favorieten</h4>
                <div className="fp3-row">
                  <button type="button" className={`lb-reeks fav ${filters.onlyFavTeams ? 'on' : ''}`} onClick={() => filters.setOnlyFavTeams((v) => !v)}>
                    <span>★ Ploegen</span>
                    {filters.favTeams.size > 0 && <span className="lb-reeks-n">{filters.favTeams.size}</span>}
                  </button>
                  <button type="button" className={`lb-reeks fav ${filters.onlyFavClubs ? 'on' : ''}`} onClick={() => filters.setOnlyFavClubs((v) => !v)}>
                    <span>★ Clubs</span>
                    {filters.favClubs.size > 0 && <span className="lb-reeks-n">{filters.favClubs.size}</span>}
                  </button>
                  <button type="button" className={`lb-reeks fav ${filters.onlyFavReeksen ? 'on' : ''}`} onClick={() => filters.setOnlyFavReeksen((v) => !v)}>
                    <span>★ Reeksen</span>
                    {filters.favReeksen.size > 0 && <span className="lb-reeks-n">{filters.favReeksen.size}</span>}
                  </button>
                </div>
              </section>
            </div>

            <div className="fp3-sheet-foot">
              <button type="button" className="lb-empty-btn" onClick={filters.clearFilters}>↺ Wis filters</button>
              <button type="button" className="lb-empty-btn primary" onClick={() => filters.setDrawerOpen(false)}>
                Toon {filters.base.filter((m) => !filters.reeksFilter || m.reeks === filters.reeksFilter).length} wedstrijden
              </button>
            </div>
          </div>
        </div>
      )}

      <MatchGroups filters={filters} />
    </div>
  )
}
