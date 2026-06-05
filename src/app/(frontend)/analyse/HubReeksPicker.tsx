'use client'

import { useRouter } from 'next/navigation'

// Reeks-keuze voor de league-leaderboards op de analyse-hub.
export function HubReeksPicker({ reeks, options }: { reeks: string; options: { value: string; label: string }[] }) {
  const router = useRouter()
  return (
    <select className="rang-picker" value={reeks} onChange={(e) => router.push(`/analyse?reeks=${e.target.value}#toppers`)} aria-label="Reeks">
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
