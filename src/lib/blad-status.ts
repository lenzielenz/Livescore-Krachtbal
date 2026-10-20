import type { Payload } from 'payload'

import { MATCHSHEET_STATUSES, type MatchSheetStatus } from './matchsheet-workflow'

// De status van het wedstrijdblad volgt de wedstrijd zelf, zodat ze nooit achterblijft:
//   vrijgave scheidsrechter (wedstrijdstart.akkoord) → wedstrijdklaar
//   wedstrijd gestart (live)                        → bezig
//   wedstrijd afgelopen (of forfait)               → af_te_tekenen
//   akkoord ingetrokken vóór de start               → terug naar concept
// 'ingediend' wordt nooit aangeraakt (Item 37). Vroeger moest de scheidsrechter dat met de hand
// doorklikken; vergat hij het, dan bleef het blad op "concept" staan terwijl de wedstrijd al
// gespeeld was, en las de rest van het platform (clubpagina, aftekenen) een verkeerde stand.

/** Context-vlag waarmee de statushook (collections/MatchSheets.ts) een systeemovergang doorlaat. */
export const SYSTEEM_STATUS = 'bladStatusSysteem'

const rang = (s: string) => MATCHSHEET_STATUSES.indexOf(s as MatchSheetStatus)

/** De status die het blad hoort te hebben, gegeven de wedstrijd en het akkoord. Null = laten zoals het is. */
export function gewensteBladStatus(huidig: string, matchStatus: string | null | undefined, akkoord: boolean): MatchSheetStatus | null {
  if (huidig === 'ingediend') return null
  if (matchStatus === 'finished') return rang(huidig) < rang('af_te_tekenen') ? 'af_te_tekenen' : null
  if (matchStatus === 'live') return huidig === 'bezig' ? null : 'bezig'
  // Gepland:
  if (akkoord) return huidig === 'wedstrijdklaar' ? null : 'wedstrijdklaar'
  return rang(huidig) >= rang('wedstrijdklaar') ? 'concept' : null
}

/** Zet de blad-status gelijk met de wedstrijd. Geen blad (supporters, analyse) → niets. */
export async function volgBladStatus(payload: Payload, matchId: number | string): Promise<MatchSheetStatus | null> {
  const res = await payload.find({ collection: 'matchsheets', where: { match: { equals: Number(matchId) } }, depth: 0, limit: 1, overrideAccess: true })
  const sheet = res.docs[0]
  if (!sheet) return null
  const match = await payload.findByID({ collection: 'matches', id: Number(matchId), depth: 0, overrideAccess: true }).catch(() => null)
  if (!match) return null
  const akkoord = Boolean((sheet.wedstrijdstart as { akkoord?: boolean } | undefined)?.akkoord)
  const naar = gewensteBladStatus(String(sheet.status), match.status as string, akkoord)
  if (!naar) return sheet.status as MatchSheetStatus
  await payload.update({
    collection: 'matchsheets',
    id: sheet.id,
    data: { status: naar },
    overrideAccess: true,
    context: { [SYSTEEM_STATUS]: true },
  })
  return naar
}
