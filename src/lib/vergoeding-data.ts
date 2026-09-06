// Server-helpers die de gegevens voor de vergoedings-PDF's verzamelen:
// kwitantie scheidsrechter (per official + periode) en forfait-onkostenblad (per wedstrijd).

import type { Payload } from 'payload'

import { REEKS_OPTIONS } from './reeksen'
import { FORFAIT_MAX_AUTOS, berekenForfait, berekenKwitantie } from './vergoeding'
import type { ForfaitData, KwitantieData, KwitantieRegel } from './submit/pdf-vergoeding'
import { formatDateBE, formatTimeBE } from './datetime'

function reeksLabel(code: unknown): string {
  const found = REEKS_OPTIONS.find((o) => o.value === code)
  return found ? found.value : String(code ?? '—')
}

function dmy(date: string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? '—' : formatDateBE(d)
}

function hm(date: string | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  return Number.isNaN(d.getTime()) ? '—' : formatTimeBE(d)
}

const teamName = (t: unknown): string =>
  typeof t === 'object' && t ? ((t as { name?: string }).name ?? '—') : '—'

/** Kwitantie-gegevens voor één scheidsrechter over een periode (op basis van toegewezen bladen). */
export async function buildKwitantieData(
  payload: Payload,
  officialId: number | string,
  from?: string,
  to?: string,
): Promise<KwitantieData> {
  const official = await payload.findByID({ collection: 'officials', id: officialId, depth: 0 }).catch(() => null)
  const sheets = await payload.find({
    collection: 'matchsheets',
    where: { assignedReferee: { equals: Number(officialId) } },
    depth: 2,
    limit: 500,
  })

  const fromTime = from ? new Date(from).getTime() : -Infinity
  const toTime = to ? new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1 : Infinity

  const regels: KwitantieRegel[] = []
  let totaalKm = 0
  for (const sheet of sheets.docs) {
    const match = sheet.match as
      | { id?: number; date?: string; reeks?: string; homeTeam?: unknown; awayTeam?: unknown }
      | number
      | null
    if (!match || typeof match === 'number') continue
    const t = match.date ? new Date(match.date).getTime() : NaN
    if (!Number.isNaN(t) && (t < fromTime || t > toTime)) continue
    const km = (sheet.refereeKm as number) ?? 0
    totaalKm += km
    regels.push({
      wedstrijdnr: String(match.id ?? sheet.id),
      datum: dmy(match.date),
      uur: hm(match.date),
      reeks: reeksLabel(match.reeks),
      thuis: teamName(match.homeTeam),
      uit: teamName(match.awayTeam),
      km,
    })
  }

  regels.sort((a, b) => a.datum.localeCompare(b.datum))

  const periode = from || to ? `${from ? dmy(from) : '…'} – ${to ? dmy(to) : '…'}` : 'alle wedstrijden'

  return {
    scheidsrechter: (official as { name?: string } | null)?.name ?? `Official ${officialId}`,
    federationNumber: (official as { federationNumber?: string } | null)?.federationNumber ?? undefined,
    periode,
    regels,
    berekening: berekenKwitantie(regels.length, totaalKm),
  }
}

/** Forfait-onkostenblad voor één wedstrijd (op basis van het wedstrijdblad). */
export async function buildForfaitData(payload: Payload, matchId: number | string): Promise<ForfaitData | null> {
  const found = await payload.find({
    collection: 'matchsheets',
    where: { match: { equals: Number(matchId) } },
    depth: 2,
    limit: 1,
  })
  const sheet = found.docs[0]
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1 }).catch(() => null)
  if (!match) return null

  const forfait = (sheet?.forfait ?? {}) as {
    uitslag?: 'geen' | 'thuis' | 'uit' | 'dubbel'
    gemeldThuis?: boolean
    gemeldUit?: boolean
    aantalAutos?: number
    km?: number
  }
  // Het forfaitblad geldt enkel bij een effectief forfait (FF). Geen FF → geen blad (AUDIT §5).
  if (!forfait.uitslag || forfait.uitslag === 'geen') return null
  const km = forfait.km ?? 0

  return {
    titel: String(match.title ?? `Wedstrijd ${matchId}`),
    wedstrijdnr: String(match.id),
    datum: dmy(match.date as string),
    uur: hm(match.date as string),
    reeks: reeksLabel(match.reeks),
    thuis: teamName(match.homeTeam),
    uit: teamName(match.awayTeam),
    uitslag: forfait.uitslag,
    gemeldThuis: Boolean(forfait.gemeldThuis),
    gemeldUit: Boolean(forfait.gemeldUit),
    // Re-valideer de max op API-niveau (het admin-veld max is geen harde grens bij directe writes).
    aantalAutos: Math.min(FORFAIT_MAX_AUTOS, Math.max(0, forfait.aantalAutos ?? 0)),
    km,
    berekening: berekenForfait(1, km),
  }
}
