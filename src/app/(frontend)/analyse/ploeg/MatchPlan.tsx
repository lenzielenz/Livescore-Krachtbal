'use client'

import { PrintButton } from '@/components/PrintButton'
import type { GamePlan } from '@/lib/gameplan'
import { MatchPlanShare } from './MatchPlanShare'

// Matchplan-dossier: de scouting-TL;DR als hero bovenaan het ploegrapport. Drie luiken
// (wie kort houden · hoe verdedigen · waar wij toeslaan) + drie sleutels + een kopzin.
// Print-knop drukt enkel dit dossier af (print-css verbergt de rest van de pagina).

const COLUMNS: { key: 'watch' | 'defend' | 'attack'; ico: string; title: string; hint: string; tone: string }[] = [
  { key: 'watch', ico: '🎯', title: 'Wie kort houden', hint: 'hun sleutelspelers', tone: 'watch' },
  { key: 'defend', ico: '🛡️', title: 'Hoe verdedigen', hint: 'stop hun aanval', tone: 'defend' },
  { key: 'attack', ico: '⚡', title: 'Waar wij toeslaan', hint: 'hun zwaktes', tone: 'attack' },
]

export function MatchPlan({ plan }: { plan: GamePlan }) {
  const hasContent = plan.watch.length + plan.defend.length + plan.attack.length > 0
  if (!hasContent) return null

  return (
    <section className="mp" id="matchplan">
      <div className="mp-top">
        <div className="mp-titlewrap">
          <span className="mp-kicker">📋 Matchplan</span>
          <h2 className="mp-title">tegen {plan.opponent}</h2>
        </div>
        <div className="mp-actions">
          <PrintButton mode="plan" label="🖨️ Print" />
          <MatchPlanShare plan={plan} />
        </div>
      </div>

      <p className="mp-headline">{plan.headline}</p>

      {plan.tags.length > 0 && (
        <div className="mp-tags">
          {plan.tags.map((t) => (
            <span className="mp-tag" key={t}>{t}</span>
          ))}
          <span className="mp-conf">uit {plan.matchesAnalyzed} {plan.matchesAnalyzed === 1 ? 'wedstrijd' : 'wedstrijden'}</span>
        </div>
      )}

      <div className="mp-cols">
        {COLUMNS.map((col) => {
          const items = plan[col.key]
          if (items.length === 0) return null
          return (
            <div className={`mp-col mp-col-${col.tone}`} key={col.key}>
              <h3 className="mp-col-head">
                <span aria-hidden>{col.ico}</span> {col.title}
                <span className="mp-col-hint">{col.hint}</span>
              </h3>
              <ul className="mp-list">
                {items.map((it, i) => (
                  <li key={i}>
                    <span className="mp-item-title">{it.title}</span>
                    <span className="mp-item-detail">{it.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>

      {plan.keys.length > 0 && (
        <div className="mp-keys">
          <span className="mp-keys-lbl">Sleutels</span>
          {plan.keys.map((k, i) => (
            <span className="mp-key" key={i}>
              <span className="mp-key-n">{i + 1}</span> {k}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
