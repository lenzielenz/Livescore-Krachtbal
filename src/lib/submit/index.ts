// Orchestratie van het indienen van een wedstrijdblad (WEDSTRIJDBLAD-PROMPT §workflow ingediend):
// valideer handtekeningen → genereer PDF → mail naar beide clubs → upload naar federatie (adapter)
// → zet status definitief op 'ingediend' (onwijzigbaar, Item 37).

import type { Payload } from 'payload'

import type { User } from '@/payload-types'
import { buildMatchSheet } from '../match-engine'
import { KEURING_ITEMS } from '../keuring'
import { OFFICIAL_FUNCTIE_KEYS, OFFICIAL_LABELS, validateOfficials } from '../officials-rules'
import type { Reeks } from '../reeksen'
import { federationUpload } from './federation'
import { mailMatchSheet } from './mail'
import { generateMatchSheetPdf, type MatchSheetPdfData, type PdfLineupRow } from './pdf'

export type SubmitResult = {
  ok: boolean
  error?: string
  status?: string
  mail?: { sent: boolean; reason?: string }
  federation?: { uploaded: boolean; reason?: string }
}

const sigOf = (group: unknown) => {
  const g = (group ?? {}) as { naam?: string; akkoord?: boolean; tijdstip?: string; handtekening?: string }
  return { naam: g.naam, akkoord: Boolean(g.akkoord), tijdstip: g.tijdstip, handtekening: g.handtekening }
}

const lineupRows = (rows: unknown): PdfLineupRow[] =>
  ((rows ?? []) as { rugnummer?: number; player?: { name?: string } | number; deelgenomen?: boolean }[]).map(
    (r) => ({
      rugnummer: r.rugnummer,
      name: typeof r.player === 'object' ? (r.player?.name ?? '—') : `#${r.player}`,
      deelgenomen: r.deelgenomen,
    }),
  )

/**
 * Bouwt de PDF-data voor een wedstrijdblad uit de huidige (bij 'ingediend': bevroren) gegevens.
 * Gedeeld door submitMatchSheet én de her-export-route, zodat een afgewerkt blad altijd opnieuw
 * gegenereerd kan worden voor het archief (AUDIT §5).
 */
export async function buildMatchSheetPdfData(
  payload: Payload,
  matchId: number | string,
): Promise<MatchSheetPdfData | null> {
  const found = await payload.find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 2, limit: 1 })
  const sheet = found.docs[0]
  const built = await buildMatchSheet(payload, Number(matchId)).catch(() => null)
  if (!built) return null
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
  const reeks = match?.reeks as Reeks | undefined
  const officials = ((sheet?.officials ?? {}) as Record<string, string>) || {}
  const keuring = (sheet?.keuring ?? {}) as Record<string, string>
  const refSig = sigOf(sheet?.scheidsrechter)
  return {
    titel: String(sheet?.titel ?? built.match.title ?? `Wedstrijd ${matchId}`),
    datum: new Date(built.match.date).toLocaleString('nl-BE'),
    categorie: built.match.category ?? '',
    reeks: reeks ?? undefined,
    scheidsrechter: refSig.naam || undefined,
    score: built.totals,
    halfScores: built.halfScores,
    goals: built.goals.map((g) => ({ half: g.half, gameClock: g.gameClock, side: g.side, shirtNumber: g.shirtNumber, playerName: g.playerName, points: g.points })),
    homeTeam: built.teams.home.name,
    awayTeam: built.teams.away.name,
    homeLineup: lineupRows(sheet?.homeLineup),
    awayLineup: lineupRows(sheet?.awayLineup),
    officials: OFFICIAL_FUNCTIE_KEYS.map((key) => ({ label: OFFICIAL_LABELS[key], naam: officials[key] ?? '' })),
    keuring: KEURING_ITEMS.map((k) => ({ label: k.label, waarde: keuring[k.name] ?? 'ok' })),
    uitsluitingen: ((sheet?.uitsluitingen ?? []) as { naam?: string; reden?: string }[]).map((u) => `${u.naam ?? '—'} — ${u.reden ?? ''}`),
    voorbehoud: ((sheet?.voorbehoud ?? []) as { naam?: string; reden?: string }[]).map((v) => `${v.naam ?? '—'} — ${v.reden ?? ''}`),
    opmerkingen: (sheet?.opmerkingen as string) ?? undefined,
    handtekeningen: [
      { label: 'Kapitein thuis', sig: sigOf(sheet?.kapiteinThuis) },
      { label: 'Kapitein uit', sig: sigOf(sheet?.kapiteinUit) },
      { label: 'Scheidsrechter', sig: refSig },
    ],
  }
}

/** Genereert (regenereert) de wedstrijdblad-PDF op aanvraag — voor archief/her-export. */
export async function renderMatchSheetPdf(payload: Payload, matchId: number | string): Promise<Uint8Array | null> {
  const data = await buildMatchSheetPdfData(payload, matchId)
  if (!data) return null
  return generateMatchSheetPdf(data)
}

export async function submitMatchSheet(
  payload: Payload,
  matchId: number | string,
  user: User,
): Promise<SubmitResult> {
  const found = await payload.find({
    collection: 'matchsheets',
    where: { match: { equals: matchId } },
    depth: 2,
    limit: 1,
  })
  const sheet = found.docs[0]
  if (!sheet) return { ok: false, error: 'Geen wedstrijdblad gevonden.' }
  if (sheet.status === 'ingediend') return { ok: false, error: 'Al ingediend (Item 37).' }

  // Beide kapiteins moeten aftekenen.
  const kapThuis = sigOf(sheet.kapiteinThuis)
  const kapUit = sigOf(sheet.kapiteinUit)
  if (!kapThuis.akkoord || !kapUit.akkoord) {
    return { ok: false, error: 'Beide kapiteins moeten eerst aftekenen.' }
  }

  // Score uit de live-scoring. NIET stil doorgaan bij een fout: een ingediend (onwijzigbaar)
  // blad met een blanco score is erger dan een geblokkeerde inzending.
  const built = await buildMatchSheet(payload, Number(matchId)).catch(() => null)
  if (!built) {
    return { ok: false, error: 'Kon de score niet opbouwen — inzenden geblokkeerd om een blanco blad te vermijden.' }
  }

  // Clubs (voor mail) ophalen via de match → teams → clubs.
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)

  // Officials-functies valideren tegen de reeks-vereisten (Wedstrijdblad_invullen.pdf):
  // verplichte functies aanwezig + volledige naam/voornaam + coach ≠ grensrechter.
  const officials = (sheet.officials ?? {}) as Record<string, string>
  const reeks = match?.reeks as Reeks | undefined
  if (reeks) {
    const check = validateOfficials(reeks, officials)
    if (!check.ok) {
      return { ok: false, error: `Officials onvolledig: ${check.errors.join(' ')}` }
    }
  }
  const clubEmail = (team: unknown): string | null => {
    const t = team as { club?: { email?: string } } | null
    return t?.club?.email ?? null
  }
  const recipients = [clubEmail(match?.homeTeam), clubEmail(match?.awayTeam)].filter(
    (e): e is string => Boolean(e),
  )

  const keuring = (sheet.keuring ?? {}) as Record<string, string>
  const refSig = sigOf(sheet.scheidsrechter)
  const pdfData: MatchSheetPdfData = {
    titel: String(sheet.titel ?? built.match.title ?? `Wedstrijd ${matchId}`),
    datum: new Date(built.match.date).toLocaleString('nl-BE'),
    categorie: built.match.category ?? '',
    reeks: reeks ?? undefined,
    scheidsrechter: refSig.naam || undefined,
    score: built.totals,
    halfScores: built.halfScores,
    goals: built.goals.map((g) => ({
      half: g.half,
      gameClock: g.gameClock,
      side: g.side,
      shirtNumber: g.shirtNumber,
      playerName: g.playerName,
      points: g.points,
    })),
    homeTeam: built.teams.home.name,
    awayTeam: built.teams.away.name,
    homeLineup: lineupRows(sheet.homeLineup),
    awayLineup: lineupRows(sheet.awayLineup),
    officials: OFFICIAL_FUNCTIE_KEYS.map((key) => ({
      label: OFFICIAL_LABELS[key],
      naam: officials[key] ?? '',
    })),
    keuring: KEURING_ITEMS.map((k) => ({ label: k.label, waarde: keuring[k.name] ?? 'ok' })),
    uitsluitingen: ((sheet.uitsluitingen ?? []) as { naam?: string; reden?: string }[]).map(
      (u) => `${u.naam ?? '—'} — ${u.reden ?? ''}`,
    ),
    voorbehoud: ((sheet.voorbehoud ?? []) as { naam?: string; reden?: string }[]).map(
      (v) => `${v.naam ?? '—'} — ${v.reden ?? ''}`,
    ),
    opmerkingen: (sheet.opmerkingen as string) ?? undefined,
    handtekeningen: [
      { label: 'Kapitein thuis', sig: kapThuis },
      { label: 'Kapitein uit', sig: kapUit },
      { label: 'Scheidsrechter', sig: refSig },
    ],
  }

  const pdf = await generateMatchSheetPdf(pdfData)
  const filename = `wedstrijdblad-${matchId}.pdf`

  const mail = await mailMatchSheet({
    to: recipients,
    subject: `Wedstrijdblad — ${pdfData.titel}`,
    html: `<p>In bijlage het officiële wedstrijdblad van <strong>${pdfData.titel}</strong>.</p>`,
    pdf,
    filename,
  })

  const federation = await federationUpload({ matchId, data: pdfData })

  // Pas als laatste stap: definitief op 'ingediend' (daarna onwijzigbaar).
  const updated = await payload.update({
    collection: 'matchsheets',
    id: sheet.id,
    data: { status: 'ingediend' },
    user,
    overrideAccess: false,
  })

  return {
    ok: true,
    status: updated.status,
    mail: { sent: mail.sent, reason: mail.reason },
    federation: { uploaded: federation.uploaded, reason: federation.reason },
  }
}
