'use client'

import { useRouter } from 'next/navigation'

// Reeks- + ploegkeuze voor het ploegrapport. Bij een nieuwe reeks vervalt de ploegselectie.
export function PloegPicker({
  reeks,
  reeksOptions,
  teamOptions,
  team,
}: {
  reeks: string
  reeksOptions: { value: string; label: string }[]
  teamOptions: { value: string; label: string }[]
  team: string
}) {
  const router = useRouter()
  return (
    <div className="rep-pickers">
      <select
        className="rang-picker"
        value={reeks}
        onChange={(e) => router.push(`/analyse/ploeg?reeks=${e.target.value}`)}
        aria-label="Kies een reeks"
      >
        {reeksOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        className="rang-picker"
        value={team}
        onChange={(e) => router.push(`/analyse/ploeg?reeks=${reeks}${e.target.value ? `&team=${e.target.value}` : ''}`)}
        aria-label="Kies een ploeg"
      >
        <option value="">— Kies een ploeg —</option>
        {teamOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
