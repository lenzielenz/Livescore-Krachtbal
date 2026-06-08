'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Team = { id: number; name: string }

// Trainer/coach duidt zijn eigen ploeg(en) aan — daarna focust "Mijn club" op die ploeg(en).
export function MyTeamsPicker({ teams, initial }: { teams: Team[]; initial: number[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<number[]>(initial)
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(initial.length === 0)

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

  return (
    <section className="myteams">
      <div className="myteams-head">
        <span className="myteams-title">🎯 Mijn ploeg(en)</span>
        <button type="button" className="myteams-toggle" onClick={() => setOpen((o) => !o)}>
          {open ? 'Klaar' : selected.length > 0 ? 'Wijzigen' : 'Kiezen'}
        </button>
      </div>
      {open ? (
        <>
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
                {selected.includes(t.id) ? '✓ ' : ''}{t.name}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="myteams-current">
          {selected.length > 0
            ? teams.filter((t) => selected.includes(t.id)).map((t) => t.name).join(' · ')
            : 'Alle ploegen van de club'}
        </p>
      )}
    </section>
  )
}
