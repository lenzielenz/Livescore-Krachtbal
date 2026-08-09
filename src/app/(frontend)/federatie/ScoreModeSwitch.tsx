'use client'

import { useState } from 'react'

import { toast } from '@/components/Toaster'
import type { ScoreMode } from '@/lib/score-mode'
import './score-mode-switch.css'

const UITLEG: Record<ScoreMode, { titel: string; emoji: string; kort: string; punten: string[] }> = {
  federatie: {
    titel: 'Federatie',
    emoji: '📋',
    kort: 'De volledige, officiële flow.',
    punten: [
      'Opstelling en scheidsrechtersakkoord vóór de aftrap',
      'Enkel gemachtigde aantekenaars muteren de score',
      'Aftekenen door kapiteins en scheidsrechter achteraf',
      'Elke uitslag geldt meteen als officieel',
    ],
  },
  supporters: {
    titel: 'Supporters',
    emoji: '📣',
    kort: 'Vrije livescore — iedereen kan meehelpen.',
    punten: [
      'Elke ingelogde supporter kan een wedstrijd openen en de score doorgeven',
      'Geen scheidsrechter of wedstrijdblad nodig',
      'Wie als eerste aantekent, houdt de wedstrijd; anderen bevestigen of betwisten',
      'De stand toont 🟡 tot ze bevestigd is',
    ],
  },
}

/**
 * Zichtbare schakelaar voor de globale aantekenmodus. Stond vroeger enkel in de Payload-admin
 * (Instellingen → "Wie tekent aan?"), wat betekende dat je ervoor uit de app moest. Hij geldt voor
 * álle wedstrijden tegelijk, dus vragen we een bevestiging vóór het omzetten.
 */
export function ScoreModeSwitch({ initial }: { initial: ScoreMode }) {
  const [mode, setMode] = useState<ScoreMode>(initial)
  const [busy, setBusy] = useState<ScoreMode | null>(null)

  const zetOm = async (next: ScoreMode) => {
    if (busy || next === mode) return
    const uitleg = UITLEG[next]
    if (!confirm(`Alle wedstrijden overzetten naar "${uitleg.titel}"?\n\n${uitleg.kort}`)) return
    setBusy(next)
    try {
      const r = await fetch('/api/settings/score-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      const d = (await r.json()) as { error?: string; mode?: ScoreMode }
      if (!r.ok || !d.mode) throw new Error(d.error ?? 'Omzetten mislukt.')
      setMode(d.mode)
      toast('success', `Aantekenmodus staat nu op "${UITLEG[d.mode].titel}".`)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="sms" aria-label="Aantekenmodus">
      <div className="sms-head">
        <h2 className="sms-title">Wie tekent aan?</h2>
        <span className={`sms-now ${mode}`}>
          {UITLEG[mode].emoji} {UITLEG[mode].titel}
        </span>
      </div>
      <p className="sms-lead">
        Geldt voor <strong>alle</strong> wedstrijden tegelijk. Je kan altijd terugschakelen — een
        wedstrijd die al aangetekend is, behoudt gewoon zijn score.
      </p>

      <div className="sms-opts">
        {(['federatie', 'supporters'] as const).map((m) => {
          const u = UITLEG[m]
          const actief = mode === m
          return (
            <div key={m} className={`sms-opt ${m} ${actief ? 'on' : ''}`}>
              <div className="sms-opt-head">
                <span className="sms-opt-emoji" aria-hidden>{u.emoji}</span>
                <div>
                  <b>{u.titel}</b>
                  <i>{u.kort}</i>
                </div>
              </div>
              <ul className="sms-opt-list">
                {u.punten.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <button
                type="button"
                className={`sms-btn ${actief ? 'is-on' : ''}`}
                onClick={() => void zetOm(m)}
                disabled={actief || busy !== null}
                aria-pressed={actief}
              >
                {actief ? '✓ Staat aan' : busy === m ? 'Omzetten…' : `Zet ${u.titel} aan`}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
