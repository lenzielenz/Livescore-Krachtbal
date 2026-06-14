'use client'

import { useRouter } from 'next/navigation'

// Keuze waarover je voorspelt en het klassement loopt: de hele club, één ploeg, of de hele reeks.
export function ScopePicker({ scope, options }: { scope: string; options: { value: string; label: string }[] }) {
  const router = useRouter()
  return (
    <label className="vs-scope">
      <span aria-hidden>🎯</span>
      <select value={scope} onChange={(e) => router.push(`/club/voorspel?scope=${encodeURIComponent(e.target.value)}`)} aria-label="Waarover voorspellen">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
