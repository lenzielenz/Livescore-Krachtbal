'use client'

import { useEffect, useState } from 'react'

// Stap-voor-stap uitleg voor de live-registratie. Toont enkel bij een demo-/oefenwedstrijd.
// Eenmaal weggeklikt onthouden we dat per wedstrijd (localStorage); heropenen kan via de ?-knop.

type Step = { titel: string; tekst: string }

const STEPS: Step[] = [
  {
    titel: '1 · Wie zet op?',
    tekst:
      'De timer staat op slot (🔒). Tik erop en kies welke ploeg opzet. Daarna is de klok vrij. Bij een echte wedstrijd moet eerst de opstelling én het akkoord van de scheidsrechter in orde zijn.',
  },
  {
    titel: '2 · Klok starten',
    tekst: 'Tik op de timer om de klok te starten of te pauzeren. De tijd telt op vanaf 00:00.',
  },
  {
    titel: '3 · Een worp aantekenen',
    tekst:
      'Tik op het veld waar de bal valt. Er verschijnt een "?"-stip. Daarna kies je wie wierp en of het nek (+1) of rug (+2) was, en grond of gevangen.',
  },
  {
    titel: '4 · Doelpunt, kruisje of bal buiten',
    tekst:
      'Het systeem berekent zelf de uitkomst uit de plek en de worp. Bij een bal buiten vraagt het of de tegenstander de bal nog aanraakte.',
  },
  {
    titel: '5 · Time-out & wissel',
    tekst:
      'Met de zijbalken links/rechts geef je een vrijworp (VW) of een wissel (⇄). Bovenaan tik je T.O. voor een time-out (max. 2 per helft).',
  },
  {
    titel: '6 · Einde helft & einde wedstrijd',
    tekst:
      'Met "Einde 1e helft" ga je naar de rust; in de 2e helft zet de andere ploeg op. "Einde" sluit de wedstrijd af.',
  },
  {
    titel: '7 · Wie heeft gespeeld?',
    tekst:
      'Na "Einde" duid je per ploeg aan wie effectief gespeeld heeft. Dat komt op het wedstrijdblad (O-markering).',
  },
]

export function DemoTutorial({ matchId }: { matchId: number }) {
  // Per OPERATOR (niet per wedstrijd): zo krijgt een eerste-keer-jurylid de uitleg ook op een
  // ECHTE wedstrijd, en daarna blijft enkel de "? Uitleg"-knop staan (AUDIT §3 onboarding).
  void matchId
  const key = `kb-tutorial-seen`
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  // Bij het allereerste gebruik automatisch openen.
  useEffect(() => {
    try {
      if (!localStorage.getItem(key)) setOpen(true)
    } catch {
      setOpen(true)
    }
  }, [key])

  const close = () => {
    setOpen(false)
    try {
      localStorage.setItem(key, '1')
    } catch {
      /* localStorage niet beschikbaar — niet erg */
    }
  }

  const reopen = () => {
    setStep(0)
    setOpen(true)
  }

  if (!open) {
    return (
      <button type="button" className="sk-demo-help" onClick={reopen} title="Uitleg demo opnieuw tonen">
        ? Uitleg
      </button>
    )
  }

  const s = STEPS[step]
  const last = step === STEPS.length - 1

  return (
    <div className="sk-demo-overlay">
      <div className="sk-demo-card">
        <div className="sk-demo-badge">DEMO · oefenen</div>
        <h3>{s.titel}</h3>
        <p>{s.tekst}</p>
        <div className="sk-demo-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`sk-demo-dot ${i === step ? 'on' : ''}`} />
          ))}
        </div>
        <div className="sk-demo-btns">
          <button type="button" className="sk-btn" onClick={close}>
            Overslaan
          </button>
          {step > 0 && (
            <button type="button" className="sk-btn" onClick={() => setStep((n) => n - 1)}>
              ← Vorige
            </button>
          )}
          {last ? (
            <button type="button" className="sk-btn primary" onClick={close}>
              Begrepen — start de demo
            </button>
          ) : (
            <button type="button" className="sk-btn primary" onClick={() => setStep((n) => n + 1)}>
              Volgende →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
