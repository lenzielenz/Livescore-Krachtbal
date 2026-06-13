'use client'

import { FieldSchema, type FieldMarker } from '@/components/FieldSchema'
import type { AttackPatternsResult, Zone } from '@/lib/attack-patterns'

// Aanvalspatronen: toont het balbezit als KETEN (opzet → worpen → doelworp), de terugkerende
// scoringsroutes, één tekenbare voorbeeldaanval op het veld, en de afgeleide verdedigingstips.
// Visueel afgestemd op de rest van de analyse (gev-/an-/rep-klassen) met een eigen ap-laag.

const ZONE_NL: Record<Zone, string> = { links: 'links', midden: 'midden', rechts: 'rechts' }

const C = {
  setup: '#cbd5e1',
  throw: '#4cc9f0',
  goal: '#06d6a0',
  goalRug: '#ffd166',
  loss: '#ef476f',
}

function ZoneBars({ zones }: { zones: { links: number; midden: number; rechts: number } }) {
  const tot = zones.links + zones.midden + zones.rechts || 1
  return (
    <div className="ap-zbars">
      {(['links', 'midden', 'rechts'] as const).map((z) => (
        <div className="ap-zbar" key={z} title={`${ZONE_NL[z]}: ${Math.round((zones[z] / tot) * 100)}%`}>
          <span className="ap-zbar-track">
            <span className="ap-zbar-fill" style={{ height: `${Math.round((zones[z] / tot) * 100)}%` }} />
          </span>
          <span className="ap-zbar-lbl">{z[0].toUpperCase()}</span>
        </div>
      ))}
    </div>
  )
}

export function AanvalsPatronen({ data, teamName }: { data: AttackPatternsResult; teamName: string }) {
  if (data.possessions < 4) {
    return (
      <section className="ap">
        <h2 className="an-sub">
          🧠 Aanvalspatronen <span className="an-chart-hint">hoe hun balbezit verloopt → en wat je ertegen doet</span>
        </h2>
        <p className="empty">Nog te weinig balbezit-data voor {teamName} om betrouwbare patronen te tonen.</p>
      </section>
    )
  }

  const setupTot = data.setupSplit.own + data.setupSplit.opponent || 1
  const ownPct = Math.round((data.setupSplit.own / setupTot) * 100)

  const ex = data.example
  const markers: FieldMarker[] =
    ex?.steps.map((s, i) => {
      const prev = i > 0 ? ex.steps[i - 1] : null
      const color =
        s.kind === 'setup'
          ? C.setup
          : s.kind === 'goal'
            ? s.type === 'rug'
              ? C.goalRug
              : C.goal
            : s.kind === 'loss'
              ? C.loss
              : C.throw
      return {
        x: s.x,
        y: s.y,
        color,
        r: s.kind === 'goal' ? 6 : s.kind === 'setup' ? 3.5 : 5,
        label: s.kind === 'setup' ? undefined : s.kind === 'goal' ? '★' : s.label,
        fromX: prev ? prev.x : undefined,
        fromY: prev ? prev.y : undefined,
      }
    }) ?? []

  return (
    <section className="ap">
      <h2 className="an-sub">
        🧠 Aanvalspatronen <span className="an-chart-hint">hoe hun balbezit verloopt → en wat je ertegen doet</span>
      </h2>

      <div className="rep-cards">
        <div className="rep-card">
          <span className="rep-num">{data.scoringPossessions}</span>
          <span className="rep-lbl">Scorende aanvallen</span>
        </div>
        <div className="rep-card">
          <span className="rep-num">{data.avgThrowsToGoal || '—'}</span>
          <span className="rep-lbl">Worpen per doelpunt</span>
        </div>
        <div className="rep-card">
          <span className="rep-num">{ownPct}%</span>
          <span className="rep-lbl">Opzet eigen helft</span>
        </div>
        <div className="rep-card">
          <span className="rep-num">{data.possessions}</span>
          <span className="rep-lbl">Balbezitten</span>
        </div>
      </div>

      {/* Flow-rail: hoe een aanval typisch verloopt, kolom per kolom. */}
      <div className="ap-flow">
        <div className="ap-step ap-step-setup">
          <span className="ap-step-lbl">Opzet</span>
          <span className="ap-step-dom">{ownPct >= 50 ? 'Eigen helft' : 'Tegenhelft'}</span>
          <div className="ap-split">
            <span className="ap-split-seg own" style={{ width: `${ownPct}%` }} title={`Eigen helft ${ownPct}%`} />
            <span className="ap-split-seg opp" style={{ width: `${100 - ownPct}%` }} title={`Tegenhelft ${100 - ownPct}%`} />
          </div>
          <span className="ap-step-cnt">{ownPct}% eigen · {100 - ownPct}% tegen</span>
        </div>
        {data.flow.map((step) => (
          <div className="ap-step" key={step.key}>
            <span className="ap-step-arrow" aria-hidden>›</span>
            <span className="ap-step-lbl">{step.label}</span>
            <span className="ap-step-dom">{step.dominant ? `${ZONE_NL[step.dominant.zone]} ${step.dominant.pct}%` : '—'}</span>
            <ZoneBars zones={step.zones} />
            <span className="ap-step-cnt">{step.count} worpen</span>
          </div>
        ))}
      </div>

      {/* Terugkerende scoringsroutes. */}
      {data.patterns.length > 0 && (
        <>
          <h3 className="ap-h3">Terugkerende routes <span className="an-chart-hint">meest scorende paden</span></h3>
          <div className="ap-routes">
            {data.patterns.map((p, i) => (
              <div className="ap-route" key={i}>
                <span className="ap-route-rank">{i + 1}</span>
                <span className="ap-route-path">
                  <span className="ap-route-setup">{p.setupSide === 'own' ? 'Eigen helft' : 'Tegenhelft'}</span>
                  {p.zones.map((z, j) => (
                    <span className="ap-route-z" key={j}>
                      <span className="ap-route-chev" aria-hidden>→</span> {ZONE_NL[z]}
                    </span>
                  ))}
                  <span className="ap-route-chev" aria-hidden>→</span> <span className="ap-route-goal">doel</span>
                </span>
                <span className="ap-route-stats">
                  <strong>{p.goals}×</strong> doel · {p.conversion}% raak
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="ap-grid">
        {/* Voorbeeldaanval op het veld. */}
        {ex && markers.length >= 2 && (
          <div className="ap-example">
            <h3 className="ap-h3">Zo ziet een aanval eruit <span className="an-chart-hint">een echte scorende aanval</span></h3>
            <FieldSchema
              className="gev-field"
              markers={markers}
              ends={{ bottom: { text: '▼ Doel', color: C.goal } }}
            />
            <ol className="ap-steplist">
              {ex.steps.map((s, i) => (
                <li key={i} className={`ap-stepline ap-stepline-${s.kind}`}>
                  <span className="ap-stepdot" style={{ background: s.kind === 'setup' ? C.setup : s.kind === 'goal' ? (s.type === 'rug' ? C.goalRug : C.goal) : s.kind === 'loss' ? C.loss : C.throw }} />
                  {s.kind === 'setup' ? (
                    <span>Opzet vanaf de {ex.setupSideLabel}</span>
                  ) : s.kind === 'goal' ? (
                    <span>
                      <strong>Doel</strong>{s.type === 'rug' ? ' (rugworp +2)' : ' (nekworp +1)'}
                      {s.zone ? ` via ${ZONE_NL[s.zone]}` : ''}{s.distance != null ? ` · ${Math.round(s.distance)} m` : ''}
                    </span>
                  ) : (
                    <span>
                      Worp {s.label}{s.zone ? ` naar ${ZONE_NL[s.zone]}` : ''}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Verdedigingstips: wat doen we ertegen. */}
        {data.tips.length > 0 && (
          <div className="ap-tips">
            <h3 className="ap-h3">🛡️ Wat je ertegen doet <span className="an-chart-hint">automatisch uit hun patronen</span></h3>
            <ul className="ap-tips-list">
              {data.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
