'use client'

import { useRouter } from 'next/navigation'

// Keuze voor het trainingsplan: eerst een reeks/ploeg, dan "Hele ploeg" of één speler.
export function PlanPicker({
  reeks,
  reeksOptions,
  speler,
  spelerOptions,
}: {
  reeks: string
  reeksOptions: { value: string; label: string }[]
  speler: string
  spelerOptions: { value: string; label: string }[]
}) {
  const router = useRouter()
  return (
    <div className="rep-pickers">
      <select className="rang-picker" value={reeks} onChange={(e) => router.push(`/beheer/training/plan?reeks=${encodeURIComponent(e.target.value)}`)} aria-label="Kies een reeks">
        {reeksOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        className="rang-picker"
        value={speler}
        onChange={(e) => router.push(`/beheer/training/plan?reeks=${encodeURIComponent(reeks)}&speler=${encodeURIComponent(e.target.value)}`)}
        aria-label="Kies hele ploeg of een speler"
      >
        <option value="team">🛡️ Hele ploeg</option>
        {spelerOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
