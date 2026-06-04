import type { Payload } from 'payload'

import { hasRole, isFederationLevel } from '@/lib/access'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import type { MatchSheetStatus } from '@/lib/matchsheet-workflow'
import { getPayloadClient } from '@/lib/payload-client'
import { matchPersonalCode, verifyCredential } from '@/lib/referee-credentials'

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
    keuring?: Record<string, string>
    officials?: Record<string, string>
    refereeKm?: number
    forfait?: Record<string, unknown>
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

    const referee = isFederationLevel(user) || hasRole(user, 'scheidsrechter')
    // Vrijgeven mag óók vanaf het aantekenscherm (scorekeeper-tablet): de gescande QR/code van
    // de scheidsrechter ís de toestemming. Alle andere acties blijven SR/federatie-only.
    if (body.action !== 'wedstrijdstart' && !referee) {
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

    if (body.action === 'keuring') {
      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: { keuring: body.keuring ?? {} },
        user,
        overrideAccess: false,
      })
      return Response.json({ ok: true, keuring: updated.keuring })
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
      return Response.json({ ok: true, wedstrijdstart: updated.wedstrijdstart, naam })
    }

    if (body.action === 'vergoeding') {
      const updated = await payload.update({
        collection: 'matchsheets',
        id: sheet.id,
        data: { refereeKm: body.refereeKm ?? null, forfait: body.forfait ?? {} },
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
