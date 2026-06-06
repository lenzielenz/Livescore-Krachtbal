'use client'

import { useRouter } from 'next/navigation'

// Cascade-keuze voor het spelerdossier: eerst de reeks, dan de club, dan de speler.
// Een hoger niveau wijzigen reset de lagere keuzes.
export function DossierPicker({
  reeks,
  reeksOptions,
  club,
  clubOptions,
  player,
  playerOptions,
}: {
  reeks: string
  reeksOptions: { value: string; label: string }[]
  club: string
  clubOptions: { value: string; label: string }[]
  player: string
  playerOptions: { value: string; label: string }[]
}) {
  const router = useRouter()
  const go = (params: { reeks: string; club?: string; speler?: string }) => {
    const q = new URLSearchParams({ reeks: params.reeks })
    if (params.club) q.set('club', params.club)
    if (params.speler) q.set('speler', params.speler)
    router.push(`/analyse/speler?${q.toString()}`)
  }
  return (
    <div className="rep-pickers">
      <select className="rang-picker" value={reeks} onChange={(e) => go({ reeks: e.target.value })} aria-label="Kies een reeks">
        {reeksOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        className="rang-picker"
        value={club}
        onChange={(e) => go({ reeks, club: e.target.value || undefined })}
        aria-label="Kies een club"
      >
        <option value="">— Kies een club —</option>
        {clubOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        className="rang-picker"
        value={player}
        onChange={(e) => go({ reeks, club: club || undefined, speler: e.target.value || undefined })}
        aria-label="Kies een speler"
        disabled={!club}
      >
        <option value="">{club ? '— Kies een speler —' : '— Kies eerst een club —'}</option>
        {playerOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
