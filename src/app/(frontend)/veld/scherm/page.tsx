import Link from 'next/link'

import { buildMatchState, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksHalfDurationSeconds, reeksNaam, type Reeks } from '@/lib/reeksen'
import { readVeldMatchId } from '@/lib/screen-selection'
import { FieldScreen } from '../[id]/FieldScreen'
import { VeldSchermSync } from './VeldSchermSync'
import '../[id]/veld.css'

export const dynamic = 'force-dynamic'

const reeksLabel = (v: unknown) => (v ? reeksNaam(v) : null)

// Generiek veldscherm: toont de centraal gekozen wedstrijd (via /cast) op de veld-tv. De
// tv opent deze ene URL en blijft staan; wissel je de wedstrijd op je gsm, dan herlaadt
// dit scherm vanzelf. Zo hoef je de tv nooit aan te raken. Parallel aan /kantine/scherm.
export default async function VeldSchermPage() {
  const payload = await getPayloadClient()
  const id = await readVeldMatchId(payload)

  if (id) {
    try {
      const matchDoc = await payload.findByID({ collection: 'matches', id, depth: 0 }).catch(() => null)
      // Analysewedstrijden zijn privé en horen niet op het publieke veldscherm → val terug op leeg.
      if (matchDoc && !matchDoc.analyseOnly) {
        const [state, timeline] = await Promise.all([buildMatchState(payload, id), buildTimeline(payload, id)])
        const reeks = reeksLabel(matchDoc.reeks)
        const halfSeconds = matchDoc.reeks ? reeksHalfDurationSeconds(matchDoc.reeks as Reeks) : 1500
        return (
          <>
            <FieldScreen matchId={id} reeks={reeks} halfSeconds={halfSeconds} initial={{ state, timeline }} />
            <VeldSchermSync currentId={id} />
          </>
        )
      }
    } catch {
      // Gekozen wedstrijd bestaat niet meer → val terug op de lege staat.
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#06140d',
        color: '#ecf7f0',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'center',
        padding: '6vmin',
      }}
    >
      <div>
        <div style={{ fontSize: '7vmin', fontWeight: 800 }}>
          Krachtbal <span style={{ color: '#ffd873' }}>Live</span>
        </div>
        <p style={{ fontSize: '3vmin', opacity: 0.8, margin: '2vmin 0 0' }}>
          Nog geen wedstrijd gekozen voor het veldscherm.
        </p>
        <p style={{ fontSize: '2.4vmin', opacity: 0.65, margin: '1vmin 0 0' }}>
          Kies er één op <strong>/cast</strong> — dit scherm volgt vanzelf.
        </p>
        <Link
          href="/cast"
          style={{
            display: 'inline-block',
            marginTop: '4vmin',
            padding: '1.4vmin 3vmin',
            borderRadius: '1.4vmin',
            border: '1px solid #224a33',
            color: '#ffd873',
            fontSize: '2.4vmin',
            fontWeight: 700,
          }}
        >
          Open de bediening →
        </Link>
      </div>
      <VeldSchermSync currentId={null} />
    </div>
  )
}
