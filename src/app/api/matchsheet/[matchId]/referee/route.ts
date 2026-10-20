import type { Payload } from 'payload'

import { hasRole, isFederationLevel } from '@/lib/access'
import { refereeMayHandleMatch, type AuthedUser } from '@/lib/api-auth'
import { volgBladStatus } from '@/lib/blad-status'
import { KEURING_ITEMS } from '@/lib/keuring'
import { clubStaf, meld } from '@/lib/meldingen'
import { countLineup, SELECTIE_MIN } from '@/lib/match-readiness'
import { buildRoster, getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import type { MatchSheetStatus } from '@/lib/matchsheet-workflow'
import { getPayloadClient } from '@/lib/payload-client'
import { matchPersonalCode, verifyCredential } from '@/lib/referee-credentials'
import { buildFixedSimpleScore, EMPTY_SIMPLE_SCORE } from '@/lib/simple-score'
import { forfaitScore } from '@/lib/standings'

/** De rijen van een opstelling met het speler-id en de controle-vlag. */
const rijenVan = (v: unknown): { player: number | null; ibGecontroleerd: boolean }[] =>
  (Array.isArray(v) ? v : []).map((r) => {
    const row = r as { player?: unknown; ibGecontroleerd?: boolean }
    const pid = row.player && typeof row.player === 'object' ? (row.player as { id: number }).id : (row.player as number | null)
    return { player: pid == null ? null : Number(pid), ibGecontroleerd: Boolean(row.ibGecontroleerd) }
  })

const relId = (rel: unknown): number | string | null =>
  rel == null ? null : typeof rel === 'object' ? (rel as { id: number | string }).id : (rel as number | string)

type ReleaseResult = { ok: true; naam: string | null; via: string } | { ok: false; error: string }

// Lost de identiteit van de vrijgevende scheidsrechter op uit een gescande QR of ingetikte code.
// Toegelaten zijn enkel de toegewezen of backup-SR van deze wedstrijd; bij geen toewijzing geldt
// elke geldige persoonlijke QR (backwards compatible). De per-wedstrijdcode blijft als backup.
async function resolveRelease(
  payload: Payload,
  sheet: { vrijgaveCode?: unknown; assignedReferee?: unknown; backupReferee?: unknown },
  input: { qr?: string; code?: string; naam?: string | null },
): Promise<ReleaseResult> {
  const secret = process.env.PAYLOAD_SECRET || ''
  const code = (input.code ?? '').trim()

  // Backup: de geheime per-wedstrijdcode die de federatie aan de SR bezorgt.
  if (code && sheet.vrijgaveCode && code === String(sheet.vrijgaveCode)) {
    return { ok: true, naam: input.naam ?? null, via: 'wedstrijdcode' }
  }

  const allowed = [relId(sheet.assignedReferee), relId(sheet.backupReferee)].filter(
    (x): x is number | string => x != null,
  )
  const officialName = async (officialId: number | string): Promise<string | null> => {
    if (allowed.length && !allowed.some((id) => String(id) === String(officialId))) return null
    const off = await payload.findByID({ collection: 'officials', id: officialId, depth: 0 }).catch(() => null)
    return (off?.name as string | undefined) ?? null
  }

  // Persoonlijke QR of tijdelijke delegatie-QR (ook geaccepteerd als ze in het codeveld geplakt wordt).
  for (const raw of [input.qr, code]) {
    if (!raw) continue
    const cred = verifyCredential(secret, raw)
    if (!cred) continue
    if (cred.kind === 'delegation' && cred.expired) {
      return { ok: false, error: 'De tijdelijke code is vervallen.' }
    }
    const name = await officialName(cred.officialId)
    if (name == null) {
      return { ok: false, error: 'Deze QR hoort niet bij de (toegewezen) scheidsrechter van deze wedstrijd.' }
    }
    return { ok: true, naam: cred.kind === 'delegation' ? `${name} (vervanging)` : name, via: cred.kind }
  }

  // Ingetikte korte persoonlijke code van de toegewezen/backup-SR.
  if (code) {
    const matched = matchPersonalCode(secret, code, allowed)
    if (matched) {
      const name = await officialName(matched)
      if (name != null) return { ok: true, naam: name, via: 'persoonlijke-code' }
    }
  }

  return { ok: false, error: 'Geen geldige QR of code.' }
}

// Scheidsrechter-/federatie-acties op het blad: statusovergang en materiële keuring.
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  let body: {
    action?: string
    to?: string
    side?: string
    playerId?: number
    ok?: boolean
    alle?: boolean
    keuring?: Record<string, string>
    bevestigd?: boolean
    officials?: Record<string, string>
    refereeKm?: number
    forfait?: Record<string, unknown>
    uitslag?: string
    akkoord?: boolean
    naam?: string
    code?: string
    qr?: string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

    // De scheidsrechter van DEZE wedstrijd (toegewezen of backup; zonder toewijzing elke
    // scheidsrechter) — niet zomaar elk scheidsrechtersaccount bij elke wedstrijd.
    const referee =
      isFederationLevel(user) || (hasRole(user, 'scheidsrechter') && (await refereeMayHandleMatch(payload, user as unknown as AuthedUser, matchId)))
    // Vrijgeven mag óók vanaf het aantekenscherm (scorekeeper-tablet): de gescande QR/code van
    // de scheidsrechter ís de toestemming. Alle andere acties blijven SR/federatie-only.
    if (body.action !== 'wedstrijdstart' && body.action !== 'wedstrijdeinde' && !referee) {
      return Response.json({ error: 'Enkel scheidsrechter/federatie.' }, { status: 403 })
    }

    const sheet = await getOrCreateMatchSheet(payload, matchId)

    if (body.action === 'status') {
      const to = body.to as MatchSheetStatus
      // De status-machine + override-log worden afgedwongen in de collection-hook.
      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: { status: to },
        user,
        overrideAccess: false,
      })
      return Response.json({ ok: true, status: updated.status })
    }

    if (body.action === 'controle') {
      // De scheidsrechter controleert een speler op de lijst (identiteit, alles in orde) — of
      // trekt die controle in. Per kant en per speler, of alle spelers van een kant tegelijk.
      if (sheet.status === 'ingediend') return Response.json({ error: 'Het blad is ingediend (Item 37).' }, { status: 409 })
      const side = body.side === 'away' ? 'away' : 'home'
      const key = side === 'home' ? 'homeLineup' : 'awayLineup'
      const ok = body.ok !== false
      const rijen = ((sheet[key] as Record<string, unknown>[] | undefined) ?? []).map((r) => {
        const pid = r.player && typeof r.player === 'object' ? (r.player as { id: number }).id : (r.player as number)
        const raak = body.alle === true || Number(body.playerId) === Number(pid)
        return { player: pid, rugnummer: r.rugnummer ?? null, deelgenomen: Boolean(r.deelgenomen), ibGecontroleerd: raak ? ok : Boolean(r.ibGecontroleerd) }
      })
      await payload.update({ collection: 'matchsheets', id: sheet.id, data: { [key]: rijen }, overrideAccess: true })
      return Response.json({ ok: true, gecontroleerd: rijen.filter((r) => r.ibGecontroleerd).map((r) => r.player) })
    }

    if (body.action === 'keuring') {
      // `bevestigd`: undefined laat de bevestiging ongemoeid; true vergrendelt, false ontgrendelt.
      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: {
          keuring: body.keuring ?? {},
          ...(typeof body.bevestigd === 'boolean' ? { keuringBevestigd: body.bevestigd } : {}),
        },
        user,
        overrideAccess: false,
      })
      // Bevestigd met een of meer punten NIET OK: de thuisclub (die het terrein inricht) en de
      // federatie horen het meteen — het staat ook op het blad. Wat er volgt (een boete), beslist de
      // federatie volgens haar boetelijst.
      if (body.bevestigd === true) {
        const nietOk = KEURING_ITEMS.filter((k) => (updated.keuring as Record<string, string> | undefined)?.[k.name] === 'niet_ok').map((k) => k.label)
        if (nietOk.length) await meldKeuringNietOk(payload, matchId, nietOk)
      }
      return Response.json({ ok: true, keuring: updated.keuring, bevestigd: Boolean(updated.keuringBevestigd) })
    }

    if (body.action === 'forfait') {
      // Forfait-uitslag van de wedstrijd: de niet-forfaiterende ploeg wint met 30–0 (dubbel: 0–0).
      // De score wordt meteen op de wedstrijd gezet zodat ze overal (live, rangschikking) klopt.
      const uitslag = (['geen', 'thuis', 'uit', 'dubbel'] as const).find((u) => u === body.uitslag) ?? 'geen'
      const vorige = (sheet.forfait as { uitslag?: string } | undefined)?.uitslag ?? 'geen'
      await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: { forfait: { uitslag } },
        user,
        overrideAccess: false,
      })
      const score = forfaitScore(uitslag)
      // De wedstrijd-update gebeurt met overrideAccess: enkel SR/federatie raakt tot hier, en de
      // matches-collectie laat een SR-account zelf geen update toe.
      if (score) {
        await payload.update({
          collection: 'matches',
          id: matchId,
          data: { status: 'finished', simpleScore: buildFixedSimpleScore(score.home, score.away) as unknown as Record<string, unknown> },
          overrideAccess: true,
        })
      } else if (vorige !== 'geen') {
        // Forfait teruggedraaid: zet de wedstrijd terug op gepland en wis de forfait-score.
        await payload.update({
          collection: 'matches',
          id: matchId,
          data: { status: 'scheduled', simpleScore: EMPTY_SIMPLE_SCORE as unknown as Record<string, unknown> },
          overrideAccess: true,
        })
      }
      const status = await volgBladStatus(payload, matchId)
      return Response.json({ ok: true, uitslag, score, status })
    }

    if (body.action === 'officials') {
      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: { officials: body.officials ?? {} },
        user,
        overrideAccess: false,
      })
      return Response.json({ ok: true, officials: updated.officials })
    }

    if (body.action === 'wedstrijdstart') {
      // Akkoord van de scheidsrechter dat de wedstrijd mag starten (controle vooraf).
      const akkoord = Boolean(body.akkoord)
      let naam: string | null = body.naam ?? null

      if (akkoord) {
        // Vrijgeven = de wedstrijd mag starten. Dat kan pas als er iets te controleren viel: beide
        // opstellingen (min. 3 spelers, reglement §4) en een bevestigde materiële keuring. Ook voor de federatie:
        // die kan bij de start nog bewust overslaan (allowUnready), maar een akkoord blijft een akkoord.
        const tekort: string[] = []
        if (countLineup(sheet.homeLineup) < SELECTIE_MIN) tekort.push('opstelling thuis')
        if (countLineup(sheet.awayLineup) < SELECTIE_MIN) tekort.push('opstelling uit')
        if (!sheet.keuringBevestigd) tekort.push('materiële keuring bevestigen')
        // Elke speler op de lijst: door de scheidsrechter gecontroleerd ("jij bent die speler") én
        // nog altijd speelgerechtigd volgens het reglement (vergunning, keuring, knipjes, vastspelen).
        const nietGecontroleerd = [...rijenVan(sheet.homeLineup), ...rijenVan(sheet.awayLineup)].filter((r) => !r.ibGecontroleerd).length
        if (nietGecontroleerd) tekort.push(`${nietGecontroleerd} speler${nietGecontroleerd === 1 ? '' : 's'} nog te controleren`)
        for (const side of ['home', 'away'] as const) {
          const roster = await buildRoster(payload, matchId, side)
          const geblokkeerd = new Map((roster?.players ?? []).filter((p) => p.selectability.level === 'block').map((p) => [p.id, p]))
          for (const r of rijenVan(side === 'home' ? sheet.homeLineup : sheet.awayLineup)) {
            const p = r.player != null ? geblokkeerd.get(r.player) : undefined
            if (p) tekort.push(`${p.name} mag niet spelen (${p.selectability.reasons.join(' ')})`)
          }
        }
        if (tekort.length) return Response.json({ error: `Nog niet vrij te geven: ${tekort.join(', ')}.` }, { status: 409 })
        const m = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
        if (m?.status === 'finished') return Response.json({ error: 'De wedstrijd is al afgelopen.' }, { status: 409 })
      }

      if (akkoord && !isFederationLevel(user)) {
        // De scheidsrechter bewijst zijn aanwezigheid: scan zijn persoonlijke QR (of die van
        // een tijdelijke 'ziek'-delegatie), of voer een code in als backup. Federatie/admin kan
        // altijd zonder. De QR/code bepaalt zelf wie tekent (en moet de toegewezen SR zijn).
        const result = await resolveRelease(payload, sheet, { qr: body.qr, code: body.code, naam })
        if (!result.ok) return Response.json({ error: result.error }, { status: 403 })
        naam = result.naam ?? naam
      } else if (!akkoord && !referee) {
        // Akkoord intrekken kan enkel een scheidsrechter/federatie.
        return Response.json({ error: 'Enkel scheidsrechter/federatie.' }, { status: 403 })
      } else if (!akkoord) {
        const m = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
        if (m && m.status !== 'scheduled') {
          return Response.json({ error: 'De wedstrijd is al gestart; het akkoord intrekken kan niet meer.' }, { status: 409 })
        }
      }

      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: {
          wedstrijdstart: {
            akkoord,
            naam,
            tijdstip: akkoord ? new Date().toISOString() : null,
          },
        },
        user,
        overrideAccess: false,
      })
      // Vrijgegeven → het blad staat op "wedstrijdklaar" (en terug op concept bij intrekken).
      const status = await volgBladStatus(payload, matchId)
      return Response.json({ ok: true, wedstrijdstart: updated.wedstrijdstart, naam, status })
    }

    if (body.action === 'wedstrijdeinde') {
      // Scheidsrechter bekrachtigt de officiële eindstand (los van het start-akkoord). Zelfde
      // bewijs van aanwezigheid als wedstrijdstart: QR/persoonlijke code (federatie/admin zonder).
      const akkoord = Boolean(body.akkoord)
      let naam: string | null = body.naam ?? null

      if (akkoord && !isFederationLevel(user)) {
        const result = await resolveRelease(payload, sheet, { qr: body.qr, code: body.code, naam })
        if (!result.ok) return Response.json({ error: result.error }, { status: 403 })
        naam = result.naam ?? naam
      } else if (!akkoord && !referee) {
        return Response.json({ error: 'Enkel scheidsrechter/federatie.' }, { status: 403 })
      }

      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: {
          wedstrijdeinde: {
            akkoord,
            naam,
            tijdstip: akkoord ? new Date().toISOString() : null,
          },
        },
        user,
        overrideAccess: false,
      })
      return Response.json({ ok: true, wedstrijdeinde: updated.wedstrijdeinde, naam })
    }

    if (body.action === 'vergoeding') {
      // De forfait-UITSLAG hoort bij de 'forfait'-actie (die ook de score zet) — hier enkel
      // de onkosten-velden, zodat dit formulier de uitslag niet stilletjes overschrijft.
      const onkosten = { ...((body.forfait ?? {}) as Record<string, unknown>) }
      delete onkosten.uitslag
      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: { refereeKm: body.refereeKm ?? null, forfait: onkosten },
        user,
        overrideAccess: false,
      })
      return Response.json({ ok: true, refereeKm: updated.refereeKm, forfait: updated.forfait })
    }

    return Response.json({ error: `Onbekende actie: ${body.action}` }, { status: 400 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}

/** Keuring met NIET OK: melding aan de thuisclub en de federatie. */
async function meldKeuringNietOk(payload: Payload, matchId: string, nietOk: string[]) {
  const m = await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!m) return
  const thuis = m.homeTeam && typeof m.homeTeam === 'object' ? (m.homeTeam as { club?: unknown; name?: string }) : null
  const club = thuis?.club && typeof thuis.club === 'object' ? Number((thuis.club as { id: number }).id) : (thuis?.club as number | null) ?? null
  const fed = await payload.find({ collection: 'users', where: { roles: { contains: 'federatie' } }, depth: 0, limit: 25, overrideAccess: true })
  await meld(payload, [...(await clubStaf(payload, club)), ...fed.docs.map((u) => Number(u.id))], {
    titel: `⚠️ Keuring niet in orde: ${String(m.title ?? '')}`,
    tekst: `Niet in orde volgens de scheidsrechter: ${nietOk.join(', ')}.`,
    url: `/scheidsrechter/${matchId}`,
  })
}
