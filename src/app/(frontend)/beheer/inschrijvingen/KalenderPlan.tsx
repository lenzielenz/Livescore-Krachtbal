'use client'

import Link from 'next/link'
import { useState } from 'react'

import { toast } from '@/components/Toaster'
import { formatDateBE } from '@/lib/datetime'
import type { KalenderPlan as Plan } from '@/lib/kalender-plan-server'

/** Voorstel → nakijken (wat lukte niet, koppels samen) → aanmaken. */
export function KalenderPlan({ ronde }: { ronde: number }) {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [kies, setKies] = useState<string[] | null>(null)
  const [bezig, setBezig] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const vraag = async (bevestig: boolean) => {
    setBezig(true)
    try {
      const res = await fetch('/api/federatie/kalender-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ronde, reeksen: kies ?? undefined, bevestig }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string; plan?: Plan; aangemaakt?: number; overgeslagen?: number }
      if (!res.ok) return toast('error', j.error ?? 'Mislukt.')
      if (bevestig) {
        toast('success', `${j.aangemaakt} wedstrijden aangemaakt${j.overgeslagen ? `, ${j.overgeslagen} stonden er al` : ''}.`)
        setPlan(null)
      } else {
        setPlan(j.plan ?? null)
        if (!kies && j.plan) setKies(j.plan.reeksen.filter((r) => r.ploegen >= 2).map((r) => r.reeks))
      }
    } catch {
      toast('error', 'Geen verbinding.')
    } finally {
      setBezig(false)
    }
  }

  const naam = (id: number) => plan?.namen[id] ?? `#${id}`
  const hard = plan?.problemen.filter((p) => p.ernst === 'hard') ?? []
  const zacht = plan?.problemen.filter((p) => p.ernst === 'zacht') ?? []
  const perWeekend = new Map<string, Plan['wedstrijden']>()
  for (const w of plan?.wedstrijden ?? []) perWeekend.set(w.weekend, [...(perWeekend.get(w.weekend) ?? []), w])

  return (
    <div className="ft-wrap">
      <p className="ft-stat">
        Maakt een volledige heen- en terugronde per reeks. Gekoppelde ploegen (bv. heren en dames van dezelfde club) spelen hetzelfde weekend tegen dezelfde club, op hetzelfde terrein, na
        elkaar. Weekends dat een terrein niet vrij is, worden vermeden. Eerst een voorstel — er wordt niets bewaard tot je bevestigt. Verwerk eerst de inschrijvingen.
      </p>
      {plan && (
        <div className="ft-balk" style={{ position: 'static', flexWrap: 'wrap' }}>
          {plan.reeksen.map((r) => (
            <label key={r.reeks} className="ft-stat" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={kies?.includes(r.reeks) ?? true}
                onChange={(e) => setKies((k) => (e.target.checked ? [...(k ?? []), r.reeks] : (k ?? []).filter((x) => x !== r.reeks)))}
              />
              {r.reeks} ({r.ploegen})
            </label>
          ))}
        </div>
      )}
      <div className="ft-balk" style={{ position: 'static' }}>
        <button type="button" className="ft-btn ft-primair" disabled={bezig} onClick={() => void vraag(false)}>
          {plan ? 'Opnieuw berekenen' : 'Voorstel maken'}
        </button>
        {plan && (
          <button type="button" className="ft-btn" disabled={bezig || plan.wedstrijden.length === 0} onClick={() => void vraag(true)}>
            ✅ Kalender aanmaken ({plan.wedstrijden.length} wedstrijden)
          </button>
        )}
        <Link href="/beheer/planner" className="ft-btn">
          Naar de planner →
        </Link>
      </div>
      {plan && (
        <>
          <section className="ft-kaart">
            <strong>
              {plan.stats.wedstrijden} wedstrijden · {plan.stats.reeksen} reeksen · {plan.weekends.length} weekends
            </strong>
            <span className="ft-stat">
              Koppels samen: {plan.stats.koppelsSamen} van {plan.stats.koppels} wedstrijden
              {plan.stats.koppels ? ` (${Math.round((plan.stats.koppelsSamen / plan.stats.koppels) * 100)}%)` : ''}.
              {' '}Een koppel valt enkel samen tegen clubs die in beide reeksen een gekoppelde ploeg hebben.
            </span>
            {hard.length === 0 && zacht.length === 0 && <span>✅ Alle wensen gerespecteerd.</span>}
            {hard.map((p, i) => (
              <span key={`h${i}`} className="ft-fout">
                ⛔ {p.tekst}
              </span>
            ))}
            {zacht.map((p, i) => (
              <span key={`z${i}`} className="ft-stat">
                ⚠️ {p.tekst}
              </span>
            ))}
          </section>
          <div className="ft-dagen">
            {[...perWeekend].map(([wk, lijst]) => (
              <section key={wk} className="ft-dag">
                <button type="button" className="ft-btn" style={{ justifyContent: 'space-between' }} onClick={() => setOpen(open === wk ? null : wk)}>
                  <span>
                    Weekend {formatDateBE(wk)} · {lijst.length} wedstrijden
                  </span>
                  <span>{open === wk ? '▲' : '▼'}</span>
                </button>
                {open === wk && (
                  <div className="ft-lijst">
                    {lijst.map((w) => (
                      <div key={`${w.reeks}-${w.thuis}-${w.uit}`} className="ft-rij" style={w.koppel ? { borderLeft: '4px solid var(--accent)' } : undefined}>
                        <span className="ft-stat">
                          {formatDateBE(w.datum, { weekday: 'short', day: 'numeric', month: 'short' })} {w.uur}
                        </span>
                        <span className="ft-wedstrijd">
                          <strong>
                            {naam(w.thuis)} – {naam(w.uit)}
                          </strong>
                          <span className="ft-stat">
                            {w.reeks} · speeldag {w.speeldag}
                            {w.koppel ? ' · 🔗 gekoppeld' : ''}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
