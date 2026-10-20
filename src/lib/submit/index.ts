// Orchestratie van het indienen van een wedstrijdblad (WEDSTRIJDBLAD-PROMPT §workflow ingediend):
// valideer handtekeningen → genereer PDF → mail naar beide clubs → upload naar federatie (adapter)
// → zet status definitief op 'ingediend' (onwijzigbaar, Item 37).

import type { Payload } from 'payload'

import type { User } from '@/payload-types'
import { buildMatchSheet } from '../match-engine'
import { KEURING_ITEMS } from '../keuring'
import { MATCHSHEET_STATUS_OPTIONS } from '../matchsheet-workflow'
import { OFFICIAL_FUNCTIE_KEYS, OFFICIAL_LABELS, validateOfficials } from '../officials-rules'
import type { Reeks } from '../reeksen'
import { federationUpload } from './federation'
import { mailMatchSheet } from './mail'
import { generateMatchSheetPdf, type MatchSheetPdfData, type PdfLineupRow } from './pdf'
import { formatDateTimeBE } from '../datetime'

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

// Datumstring leesbaar maken (nl-BE); ongeldige/lege waarde valt terug op de ruwe input.
const fmtDate = (v?: string): string | undefined => {
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : formatDateTimeBE(d)
}

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

const lineupRows = (rows: unknown, kapitein: number | null = null): PdfLineupRow[] =>
  ((rows ?? []) as { rugnummer?: number; player?: { id?: number; name?: string } | number; deelgenomen?: boolean }[]).map(
    (r) => ({
      rugnummer: r.rugnummer,
      name: typeof r.player === 'object' ? (r.player?.name ?? '—') : `#${r.player}`,
      deelgenomen: r.deelgenomen,
      kapitein: kapitein != null && relId(r.player) === kapitein,
    }),
  )

// Een handtekening voor de PDF: het tijdstip leesbaar (nl-BE) in plaats van de ruwe ISO-datum.
const sigVoorPdf = (group: unknown) => {
  const s = sigOf(group)
  return { ...s, tijdstip: fmtDate(s.tijdstip) }
}

const STATUS_LABEL: Record<string, string> = Object.fromEntries(MATCHSHEET_STATUS_OPTIONS.map((o) => [o.value, o.label]))

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
  const refSig = sigVoorPdf(sheet?.scheidsrechter)
  const homeClub = match?.homeTeam && typeof match.homeTeam === 'object' ? (match.homeTeam as { club?: unknown }).club : null
  const terrein = homeClub && typeof homeClub === 'object' ? String((homeClub as { accommodatie?: unknown; name?: unknown }).accommodatie || (homeClub as { name?: unknown }).name || '') : ''
  const status = String(sheet?.status ?? 'concept')
  // Forfait: wie niet opdaagde, tekent niet (er was niemand) — dat staat zo op het blad.
  const ff = String((sheet?.forfait as { uitslag?: string } | undefined)?.uitslag ?? 'geen')
  const forfait =
    ff === 'thuis' ? `${built.teams.home.name} niet opgedaagd` : ff === 'uit' ? `${built.teams.away.name} niet opgedaagd` : ff === 'dubbel' ? 'beide ploegen niet opgedaagd' : undefined
  const nvt = (afwezig: boolean) => (afwezig ? { nvt: 'Niet van toepassing (forfait)' } : {})
  const aangeduid = sheet?.assignedReferee && typeof sheet.assignedReferee === 'object' ? String((sheet.assignedReferee as { name?: unknown }).name ?? '') : ''
  const eind = (sheet?.wedstrijdeinde ?? {}) as { akkoord?: boolean; naam?: string; tijdstip?: string }
  return {
    titel: String(sheet?.titel ?? built.match.title ?? `Wedstrijd ${matchId}`),
    datum: formatDateTimeBE(new Date(built.match.date)),
    categorie: built.match.category ?? '',
    reeks: reeks ?? undefined,
    terrein: terrein || undefined,
    wedstrijdNr: String(matchId),
    status: { label: STATUS_LABEL[status] ?? status, op: status === 'ingediend' ? fmtDate((sheet as { ingediendOp?: string } | undefined)?.ingediendOp ?? String(sheet?.updatedAt ?? '')) : undefined },
    scheidsrechter: refSig.naam || aangeduid || undefined,
    forfait,
    score: built.totals,
    eindscoreBevestiging: { akkoord: Boolean(eind.akkoord), naam: eind.naam || undefined, tijdstip: fmtDate(eind.tijdstip) },
    halfScores: built.halfScores,
    crosses: built.crosses,
    timeouts: built.timeouts,
    goals: built.goals.map((g) => ({ half: g.half, gameClock: g.gameClock, side: g.side, shirtNumber: g.shirtNumber, playerName: g.playerName, points: g.points, type: g.type })),
    substitutions: built.substitutions.map((s) => ({ half: s.half, gameClock: s.gameClock, side: s.side, wissel: s.wissel })),
    homeTeam: built.teams.home.name,
    awayTeam: built.teams.away.name,
    homeLineup: lineupRows(sheet?.homeLineup, relId(match?.homeCaptain)),
    awayLineup: lineupRows(sheet?.awayLineup, relId(match?.awayCaptain)),
    officials: OFFICIAL_FUNCTIE_KEYS.map((key) => ({ label: OFFICIAL_LABELS[key], naam: officials[key] ?? '' })),
    keuring: KEURING_ITEMS.map((k) => ({ label: k.label, waarde: keuring[k.name] ?? 'ok' })),
    uitsluitingen: ((sheet?.uitsluitingen ?? []) as { naam?: string; reden?: string }[]).map((u) => `${u.naam ?? '—'} — ${u.reden ?? ''}`),
    voorbehoud: ((sheet?.voorbehoud ?? []) as { naam?: string; reden?: string }[]).map((v) => `${v.naam ?? '—'} — ${v.reden ?? ''}`),
    opmerkingen: (sheet?.opmerkingen as string) ?? undefined,
    handtekeningen: [
      { label: 'Kapitein thuis', sig: { ...sigVoorPdf(sheet?.kapiteinThuis), ...nvt(ff === 'thuis' || ff === 'dubbel') } },
      { label: 'Kapitein uit', sig: { ...sigVoorPdf(sheet?.kapiteinUit), ...nvt(ff === 'uit' || ff === 'dubbel') } },
      { label: 'Scheidsrechter', sig: { ...refSig, naam: refSig.naam || aangeduid || undefined } },
    ],
  }
}

/** Genereert (regenereert) de wedstrijdblad-PDF op aanvraag — voor archief/her-export. */
export async function renderMatchSheetPdf(payload: Payload, matchId: number | string): Promise<Uint8Array | null> {
  const data = await buildMatchSheetPdfData(payload, matchId)
  if (!data) return null
  return generateMatchSheetPdf(data)
}

/** Het noodblad (verder op papier als het toestel uitvalt), vooraf ingevuld met de huidige stand. */
export async function renderNoodbladPdf(payload: Payload, matchId: number | string): Promise<Uint8Array | null> {
  const data = await buildMatchSheetPdfData(payload, matchId)
  if (!data) return null
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  const { generateNoodbladPdf } = await import('./pdf-noodblad')
  return generateNoodbladPdf(data, { half: match?.currentHalf ?? 1, status: String(match?.status ?? 'scheduled') })
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

  // Pas na het eindsignaal (of een forfait) valt er iets in te dienen.
  const matchDoc = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
  const forfaitUitslag = (sheet.forfait as { uitslag?: string } | undefined)?.uitslag ?? 'geen'
  const forfait = forfaitUitslag !== 'geen'
  if (matchDoc?.status !== 'finished' && !forfait) {
    return { ok: false, error: 'De wedstrijd is nog niet afgelopen.' }
  }

  // De kapiteins van de ploegen die er waren, én de scheidsrechter, moeten aftekenen. Bij forfait
  // tekent de afwezige ploeg niet (er is niemand); bij dubbel forfait enkel de scheidsrechter.
  const kapThuis = sigOf(sheet.kapiteinThuis)
  const kapUit = sigOf(sheet.kapiteinUit)
  const thuisAanwezig = forfaitUitslag !== 'thuis' && forfaitUitslag !== 'dubbel'
  const uitAanwezig = forfaitUitslag !== 'uit' && forfaitUitslag !== 'dubbel'
  if ((thuisAanwezig && !kapThuis.akkoord) || (uitAanwezig && !kapUit.akkoord)) {
    return { ok: false, error: forfait ? 'De kapitein van de aanwezige ploeg moet eerst aftekenen.' : 'Beide kapiteins moeten eerst aftekenen.' }
  }
  if (!sigOf(sheet.scheidsrechter).akkoord) {
    return { ok: false, error: 'De scheidsrechter moet eerst aftekenen.' }
  }

  // Wie speelde (O-markering) telt voor het vastspelen en het referendum: de scheidsrechter
  // bevestigt het na de wedstrijd. Zonder die bevestiging zou het blad niemand als speler tellen.
  if (!forfait) {
    const gespeeld = (rows: unknown) => (Array.isArray(rows) ? rows : []).some((r) => (r as { deelgenomen?: boolean }).deelgenomen)
    if (!gespeeld(sheet.homeLineup) || !gespeeld(sheet.awayLineup)) {
      return { ok: false, error: 'Bevestig eerst wie er speelde (scheidsrechterspagina, "Wie speelde").' }
    }
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

  // Eén bron van waarheid voor de PDF-inhoud: dezelfde builder als de her-export-route,
  // zodat het ingediende blad en een latere her-export gegarandeerd identiek opgebouwd zijn.
  const pdfData = await buildMatchSheetPdfData(payload, matchId)
  if (!pdfData) {
    return { ok: false, error: 'Kon het wedstrijdblad niet opbouwen — inzenden geblokkeerd.' }
  }

  const pdf = await generateMatchSheetPdf(pdfData)
  const filename = `wedstrijdblad-${matchId}.pdf`

  // Bevroren PDF-snapshot opslaan in de media-collectie (archief). Optioneel: faalt de opslag
  // (bv. geen schrijfbare media-map), dan blijft de her-export-route regenereren uit de data.
  let pdfMediaId: number | undefined
  try {
    const media = await payload.create({
      collection: 'media',
      file: { data: Buffer.from(pdf), mimetype: 'application/pdf', name: filename, size: pdf.length },
      data: { alt: `Wedstrijdblad ${pdfData.titel}` },
      overrideAccess: true,
    })
    pdfMediaId = media.id as number
  } catch {
    /* opslag optioneel — her-export regenereert sowieso */
  }

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
    data: { status: 'ingediend', ...(pdfMediaId ? { pdf: pdfMediaId } : {}) },
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
