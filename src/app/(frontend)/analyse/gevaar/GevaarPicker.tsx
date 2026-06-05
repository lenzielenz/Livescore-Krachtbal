'use client'

import { useRouter } from 'next/navigation'

// Reeks- + spelerkeuze voor de gevaarzone-kaart. Nieuwe reeks → spelerkeuze vervalt.
export function GevaarPicker({
  reeks,
  reeksOptions,
  playerOptions,
  player,
}: {
  reeks: string
  reeksOptions: { value: string; label: string }[]
  playerOptions: { value: string; label: string }[]
  player: string
}) {
  const router = useRouter()
  return (
    <div className="rep-pickers">
      <select
        className="rang-picker"
        value={reeks}
        onChange={(e) => router.push(`/analyse/gevaar?reeks=${e.target.value}`)}
        aria-label="Kies een reeks"
      >
        {reeksOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        className="rang-picker"
        value={player}
        onChange={(e) => router.push(`/analyse/gevaar?reeks=${reeks}${e.target.value ? `&speler=${e.target.value}` : ''}`)}
        aria-label="Kies een speler"
      >
        <option value="">— Kies een speler —</option>
        {playerOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
