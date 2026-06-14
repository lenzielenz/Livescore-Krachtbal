'use client'

import { useRouter } from 'next/navigation'

import { SEASON_COOKIE } from '@/lib/seasons'

// Globale seizoenkeuze voor de hele analyse: schrijft een cookie en herlaadt, zodat élke
// analyse-pagina (server-side) op het gekozen seizoen filtert. "Alle seizoenen" = geen filter.
// Je kan ook een nieuw, nog leeg seizoen starten (startable) — handig aan het begin van een seizoen.
export function SeizoenGlobalPicker({
  seasons,
  startable = [],
  newSeason = null,
  current,
}: {
  seasons: string[]
  /** Nog niet bestaande seizoenen die je kan starten (verschijnen als "— nieuw"). */
  startable?: string[]
  /** Het meest voor de hand liggende nieuwe seizoen om te starten (knop). */
  newSeason?: string | null
  current: string
}) {
  const router = useRouter()
  const pick = (v: string) => {
    document.cookie = `${SEASON_COOKIE}=${encodeURIComponent(v)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }
  if (seasons.length === 0 && startable.length === 0) return null
  return (
    <div className="an-season-wrap">
      <label className="an-season-pick" title="Geldt voor de hele analyse">
        <span aria-hidden>📅</span>
        <select value={current} onChange={(e) => pick(e.target.value)} aria-label="Kies seizoen voor de analyse">
          <option value="all">Alle seizoenen</option>
          {seasons.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          {startable.map((s) => (
            <option key={s} value={s}>{s} — nieuw</option>
          ))}
        </select>
      </label>
      {newSeason && current !== newSeason && (
        <button type="button" className="an-season-new" onClick={() => pick(newSeason)} title={`Start seizoen ${newSeason}`}>
          ➕ Nieuw seizoen
        </button>
      )}
    </div>
  )
}
