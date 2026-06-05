'use client'

import { useRouter } from 'next/navigation'

// Reeks-keuze voor de verwachte-punten-analyse.
export function VerwachtPicker({ reeks, options }: { reeks: string; options: { value: string; label: string }[] }) {
  const router = useRouter()
  return (
    <select
      className="rang-picker"
      value={reeks}
      onChange={(e) => router.push(`/analyse/verwacht?reeks=${e.target.value}`)}
      aria-label="Kies een reeks"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
