import { notFound } from 'next/navigation'

import { loadAds } from '@/lib/ads'
import { buildMatchState, buildTimeline } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksHalfDurationSeconds, reeksNaam, type Reeks } from '@/lib/reeksen'
import { getPublicFieldScreenState, todaysHomeMatches } from '@/lib/field-screens-data'
import { FieldScreen } from '../../[id]/FieldScreen'
import { FieldScreenSync } from './FieldScreenSync'
import { VeldWachtscherm } from './VeldWachtscherm'
import '../../[id]/veld.css'
import './veld-club.css'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = { scheduled: 'Gepland', live: 'Live', finished: 'Afgelopen' }
const statusLabel = (v: string) => STATUS_LABEL[v] ?? v

// Eén vaste tv-link per veld van een club (/veld/club/[id] — [id] is het veldscherm, niet de
// wedstrijd). Zolang niets gekoppeld is: de dagplanning van de club + de koppelcode. Zodra een
// aantekenaar die code invoert bij het starten van een wedstrijd, springt dit scherm naar het
// volledige scorebord (hetzelfde FieldScreen-component als /veld/[matchId]) — en weer terug zodra
// de wedstrijd afloopt (de afterChange-hook op Matches.ts ontkoppelt + geeft een nieuwe code).
export default async function VeldClubSchermPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const fieldScreenId = Number(id)
  if (!Number.isFinite(fieldScreenId)) notFound()

  const payload = await getPayloadClient()
  const screen = await getPublicFieldScreenState(payload, fieldScreenId)
  if (!screen) notFound()

  if (screen.pairedMatchId) {
    try {
      const matchDoc = await payload.findByID({ collection: 'matches', id: screen.pairedMatchId, depth: 0 }).catch(() => null)
      if (matchDoc && !matchDoc.analyseOnly && matchDoc.status !== 'finished') {
        const [state, timeline] = await Promise.all([
          buildMatchState(payload, screen.pairedMatchId),
          buildTimeline(payload, screen.pairedMatchId),
        ])
        const reeks = matchDoc.reeks ? reeksNaam(matchDoc.reeks) : null
        const halfSeconds = matchDoc.reeks ? reeksHalfDurationSeconds(matchDoc.reeks as Reeks) : 1500
        const ads = await loadAds(payload, 'veldscherm')
        return (
          <>
            <FieldScreen matchId={screen.pairedMatchId} reeks={reeks} halfSeconds={halfSeconds} ads={ads} initial={{ state, timeline }} />
            <FieldScreenSync fieldScreenId={fieldScreenId} pairedMatchId={screen.pairedMatchId} />
          </>
        )
      }
    } catch {
      // Gekoppelde wedstrijd bestaat niet meer of kon niet geladen worden → val terug op het wachtscherm.
    }
  }

  const matches = screen.clubId != null ? await todaysHomeMatches(payload, screen.clubId) : []
  return (
    <>
      <VeldWachtscherm clubName={screen.clubName} veldNaam={screen.naam} code={screen.pairingCode} matches={matches} statusLabel={statusLabel} />
      <FieldScreenSync fieldScreenId={fieldScreenId} pairedMatchId={null} />
    </>
  )
}
