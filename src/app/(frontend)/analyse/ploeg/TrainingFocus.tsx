import Link from 'next/link'

import type { FocusItem } from '@/lib/training-focus'

// Trainingsfocus: de gemeten werkpunten als concrete trainingssuggesties, met een brug naar het
// trainingsluik. Pure render.

const METRIC_LABEL: Record<NonNullable<FocusItem['metric']>, string> = {
  snelheidVooruit: 'Snelheid vooruit',
  snelheidAchteruit: 'Snelheid achteruit',
  worp4: 'Worp 4 m',
  worp9: 'Worp 9 m',
  worp18: 'Worp 18 m',
}

export function TrainingFocus({ items }: { items: FocusItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="tfoc">
      <h2 className="an-sub">
        🏋️ Trainingsfocus <span className="an-chart-hint">werkpunten → op het veld</span>
      </h2>
      <div className="tfoc-grid">
        {items.map((it, i) => (
          <div className="tfoc-card" key={i}>
            <div className="tfoc-head">
              <span className="tfoc-title">{it.title}</span>
              {it.metric && <span className="tfoc-metric">{METRIC_LABEL[it.metric]}</span>}
            </div>
            <p className="tfoc-why">{it.why}</p>
            <p className="tfoc-drill"><span aria-hidden>▸</span> {it.drill}</p>
          </div>
        ))}
      </div>
      <Link href="/beheer/training" className="tfoc-cta">🎯 Zet om in trainingsdoelen →</Link>
    </section>
  )
}
