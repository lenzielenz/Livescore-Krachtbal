'use client'

import { useRouter } from 'next/navigation'

import { SEASON_COOKIE } from '@/lib/seasons'

// Globale seizoenkeuze voor de hele analyse: schrijft een cookie en herlaadt, zodat élke
// analyse-pagina (server-side) op het gekozen seizoen filtert. "Alle seizoenen" = geen filter.
export function SeizoenGlobalPicker({ seasons, current }: { seasons: string[]; current: string }) {
  const router = useRouter()
  if (seasons.length === 0) return null
  const onChange = (v: string) => {
    document.cookie = `${SEASON_COOKIE}=${encodeURIComponent(v)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }
  return (
    <label className="an-season-pick" title="Geldt voor de hele analyse">
      <span aria-hidden>📅</span>
      <select value={current} onChange={(e) => onChange(e.target.value)} aria-label="Kies seizoen voor de analyse">
        <option value="all">Alle seizoenen</option>
        {seasons.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  )
}
