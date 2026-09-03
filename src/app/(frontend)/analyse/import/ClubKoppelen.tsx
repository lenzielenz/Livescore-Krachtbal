'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import type { Plan } from '@/lib/clubs-koppelen'

type Report = {
  commit?: boolean
  plan?: Plan
  verhuisd?: number
  aangemaakt?: number
  verwijderd?: number
  errors?: string[]
  error?: string
}

// Ploegen aan hun echte club koppelen: "KBC St. Michiels A-1" en "… B-2" horen bij de club
// "KBC St. Michiels", niet elk bij een eigen club. Eerst het voorbeeld, dan uitvoeren.
export function ClubKoppelen() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<Report | null>(null)

  const run = async (commit: boolean) => {
    if (commit && !window.confirm('Ploegen naar hun echte club verhuizen en de leeg geraakte clubs verwijderen?')) return
    setBusy(true)
    try {
      const res = await fetch('/api/clubs/koppelen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ commit }),
      })
      setReport(await res.json())
      if (commit) router.refresh()
    } catch (e) {
      setReport({ error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const plan = report?.plan
  const niets = plan && plan.verhuizingen.length === 0 && plan.opTeRuimen.length === 0

  return (
    <div className="imp">
      <div className="imp-actions">
        <button type="button" className="sk-btn" disabled={busy} onClick={() => run(false)}>{busy ? 'Bezig…' : '👁 Voorbeeld'}</button>
        <button type="button" className="sk-btn primary" disabled={busy || !plan || niets} onClick={() => run(true)}>{busy ? 'Bezig…' : '🏷️ Koppelen'}</button>
      </div>

      {report && (report.error ? (
        <p className="wb-msg">{report.error}</p>
      ) : plan ? (
        <div className="imp-report">
          <div className="rep-cards">
            <div className="rep-card"><span className="rep-num">{plan.verhuizingen.length}</span><span className="rep-lbl">Ploegen te verhuizen</span></div>
            <div className="rep-card"><span className="rep-num">{plan.nieuweClubs.length}</span><span className="rep-lbl">Nieuwe clubs</span></div>
            <div className="rep-card"><span className="rep-num">{plan.opTeRuimen.length}</span><span className="rep-lbl">Lege clubs weg</span></div>
          </div>
          <p className="imp-note">
            {report.commit
              ? `✓ ${report.verhuisd} ploeg(en) verhuisd, ${report.aangemaakt} club(s) aangemaakt, ${report.verwijderd} lege club(s) verwijderd.`
              : niets
                ? '✓ Elke ploeg staat al bij haar club.'
                : 'Voorbeeld — nog niets gewijzigd. Een ploeg hoort bij de club waarvan haar naam het ploegkenmerk (A, B, A-1, B-2 …) laat vallen.'}
          </p>
          {plan.verhuizingen.length > 0 && (
            <details className="imp-det" open>
              <summary>Verhuizingen ({plan.verhuizingen.length})</summary>
              <ul>
                {plan.verhuizingen.map((v) => (
                  <li key={v.ploegId}>
                    <strong>{v.ploegNaam}</strong>: {v.vanClubNaam} → {v.naarClubNaam}{v.naarClubId == null ? ' (nieuw)' : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {plan.opTeRuimen.length > 0 && (
            <details className="imp-det"><summary>Lege clubs die weg mogen ({plan.opTeRuimen.length})</summary><p>{plan.opTeRuimen.map((c) => c.naam).join(' · ')}</p></details>
          )}
          {plan.behouden.length > 0 && (
            <details className="imp-det" open>
              <summary>Nakijken ({plan.behouden.length})</summary>
              <ul>{plan.behouden.map((c) => <li key={c.id}><strong>{c.naam}</strong> — {c.reden}</li>)}</ul>
            </details>
          )}
          {plan.doelenZonderLogo.length > 0 && (
            <p className="imp-note">
              🖼️ Nog geen logo bij: {plan.doelenZonderLogo.join(', ')}. Eén logo op de club volstaat — al haar ploegen tonen het.
            </p>
          )}
          {report.errors && report.errors.length > 0 && <p className="wb-msg">{report.errors.join(' · ')}</p>}
        </div>
      ) : null)}
    </div>
  )
}
