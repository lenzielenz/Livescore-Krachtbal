'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Team = { id: number; name: string; sub?: string }

// Trainer/coach duidt zijn eigen ploeg(en) aan — daarna focust "Mijn club" op die ploeg(en).
export function MyTeamsPicker({ teams, initial }: { teams: Team[]; initial: number[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<number[]>(initial)
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  // Standaard een klein, opgevouwen menu — je duidt je ploeg(en) maar zelden aan. Eén klik en het
  // wordt groot om te kiezen; "Klaar" vouwt het weer dicht.
  const [open, setOpen] = useState(false)

  if (teams.length <= 1) return null // niets te kiezen

  const save = async (next: number[]) => {
    setSelected(next)
    setSaving(true)
    try {
      await fetch('/api/club/my-teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamIds: next }),
      })
      startTransition(() => router.refresh())
    } finally {
      setSaving(false)
    }
  }

  const toggle = (id: number) => save(selected.includes(id) ? selected.filter((t) => t !== id) : [...selected, id])

  const summary =
    selected.length > 0
      ? teams.filter((t) => selected.includes(t.id)).map((t) => (t.sub ? `${t.name} (${t.sub})` : t.name)).join(' · ')
      : 'Alle ploegen van de club'

  // Ingeklapt: een compacte, klikbare balk. Open: titel + de keuzepillen.
  if (!open) {
    return (
      <section className="myteams collapsed">
        <button type="button" className="myteams-bar" onClick={() => setOpen(true)}>
          <span className="myteams-title">🎯 Mijn ploeg(en)</span>
          <span className="myteams-bar-current">{summary}</span>
          <span className="myteams-bar-chev" aria-hidden>Wijzigen ›</span>
        </button>
      </section>
    )
  }

  return (
    <section className="myteams">
      <div className="myteams-head">
        <span className="myteams-title">🎯 Mijn ploeg(en)</span>
        <button type="button" className="myteams-toggle" onClick={() => setOpen(false)}>Klaar</button>
      </div>
      <p className="myteams-hint">Duid je eigen ploeg(en) aan — dan focust deze pagina meteen daarop. Kies niets om alles te zien.</p>
      <div className="myteams-pills">
        {teams.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`myteams-pill${selected.includes(t.id) ? ' on' : ''}`}
            onClick={() => toggle(t.id)}
            disabled={saving || pending}
            aria-pressed={selected.includes(t.id)}
          >
            <span className="myteams-pill-name">{selected.includes(t.id) ? '✓ ' : ''}{t.name}</span>
            {t.sub && <span className="myteams-pill-sub">{t.sub}</span>}
          </button>
        ))}
      </div>
    </section>
  )
}
