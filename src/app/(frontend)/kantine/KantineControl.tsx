'use client'

import Link from 'next/link'
import { useState } from 'react'

import { CastKnop } from '@/components/CastKnop'

import { type KantineMatch } from './KantineBoard'

// Kiezer: vink wedstrijden aan die op het kantinescherm moeten verschijnen. De selectie wordt
// centraal bewaard (server), zodat je op je gsm kiest en het op de kantine-tv verschijnt.
export function KantineControl({ matches, initialSelected }: { matches: KantineMatch[]; initialSelected: number[] }) {
  const [sel, setSel] = useState<Set<number>>(new Set(initialSelected))
  const [saving, setSaving] = useState(false)

  const save = async (next: Set<number>) => {
    setSaving(true)
    try {
      await fetch('/api/kantine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...next] }),
      })
    } catch {
      /* stil — volgende toggle probeert opnieuw */
    } finally {
      setSaving(false)
    }
  }

  const toggle = (id: number) => {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      void save(next)
      return next
    })
  }

  return (
    <div className="kt-control">
      <div className="kt-control-bar">
        <p className="kt-control-help">Vink aan wat op het kantinescherm komt.</p>
        {/* Rechtstreeks casten vanaf de bediening: hier sta je toch al te kiezen wát er op de
            tv komt, dus hoort de knop om hem érop te krijgen hier ook. */}
        <CastKnop pad="/kantine/scherm" sleutel="kantine" label="📺 Cast naar tv" />
        <Link href="/kantine/scherm" className="kt-screen-btn">📺 Open kantinescherm →</Link>
      </div>

      {matches.length === 0 ? (
        <p className="kt-empty">Geen wedstrijden vandaag.</p>
      ) : (
        <div className="kt-pick-list">
          {matches.map((m) => {
            const on = sel.has(m.id)
            return (
              <button
                type="button"
                key={m.id}
                className={`kt-pick ${on ? 'on' : ''} ${m.status === 'live' ? 'live' : ''}`}
                onClick={() => toggle(m.id)}
              >
                <span className="kt-pick-top">
                  <span className={`kt-pick-badge ${m.status}`}>
                    {m.status === 'live' ? '● LIVE' : m.status === 'finished' ? 'Einde' : m.time}
                  </span>
                  <span className="kt-pick-reeks">{m.reeks}</span>
                </span>
                <span className="kt-pick-match">
                  <span className="kt-pick-team">{m.home.name}</span>
                  <span className="kt-pick-vs">vs</span>
                  <span className="kt-pick-team">{m.away.name}</span>
                </span>
                <span className="kt-pick-check" aria-hidden>{on ? '✓' : '+'}</span>
              </button>
            )
          })}
        </div>
      )}

      <p className="kt-control-status">{saving ? 'Opslaan…' : `${sel.size} geselecteerd voor het kantinescherm`}</p>
    </div>
  )
}
