'use client'

import type { GeweigerdeTik } from '@/lib/use-action-queue'
import { formatTimeBE } from '@/lib/datetime'

import './wachtrij.css'

/** Leesbare naam van een actie, voor de lijst "niet verwerkt". */
function wat(op: Record<string, unknown>): string {
  const a = String(op.action ?? '')
  const kant = op.side === 'away' ? 'uit' : op.side === 'home' ? 'thuis' : ''
  if (a === 'simplegoal') return `+${op.points ?? 1} ${kant}${op.shirtNumber != null ? ` (#${op.shirtNumber})` : ''}`
  if (a === 'simplestart' || a === 'start') return 'Start'
  if (a === 'simplehalf' || a === 'half') return 'Volgende helft'
  if (a === 'finish') return 'Einde wedstrijd'
  if (a === 'simplecross') return `Kruisje ${kant}`
  if (a === 'simpletimeout' || a === 'timeout') return `Time-out ${kant}`
  if (a === 'setlineup') return `Wissel ${kant}`
  if (a === 'throw') return 'Worp'
  return a || 'Actie'
}

/**
 * Wat er met de tikken gebeurt die niet meteen lukten (lib/use-action-queue.ts):
 * - een oude wachtrij van een vorige sessie: eerst vragen of ze nog verstuurd moeten worden;
 * - tikken die de server weigerde: zichtbaar, met "opnieuw" of "weggooien" — nooit stil weg.
 */
export function WachtrijMeldingen({
  geweigerd,
  opnieuw,
  weggooien,
  oudeWachtrij,
  oudeVersturen,
  oudeWeggooien,
}: {
  geweigerd: GeweigerdeTik[]
  opnieuw: (opId: string) => void
  weggooien: (opId: string) => void
  oudeWachtrij: { aantal: number; sinds: number } | null
  oudeVersturen: () => void
  oudeWeggooien: () => void
}) {
  if (!oudeWachtrij && geweigerd.length === 0) return null
  return (
    <div className="wq-wrap" role="alert">
      {oudeWachtrij && (
        <div className="wq-kaart">
          <strong>
            Er staan nog {oudeWachtrij.aantal} tik{oudeWachtrij.aantal === 1 ? '' : 'ken'} van {formatTimeBE(new Date(oudeWachtrij.sinds))} op dit
            toestel.
          </strong>
          <span>Werd er intussen op een ander toestel verder aangetekend? Gooi ze dan weg, anders tellen ze dubbel.</span>
          <div className="wq-knoppen">
            <button type="button" className="wq-knop" onClick={oudeVersturen}>
              Toch versturen
            </button>
            <button type="button" className="wq-knop wq-gevaar" onClick={oudeWeggooien}>
              Weggooien
            </button>
          </div>
        </div>
      )}
      {geweigerd.map((g) => (
        <div key={String(g.op.opId)} className="wq-kaart">
          <strong>Niet verwerkt: {wat(g.op)}</strong>
          <span>{g.melding}</span>
          <div className="wq-knoppen">
            <button type="button" className="wq-knop" onClick={() => opnieuw(String(g.op.opId))}>
              Opnieuw
            </button>
            <button type="button" className="wq-knop wq-gevaar" onClick={() => weggooien(String(g.op.opId))}>
              Weggooien
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
