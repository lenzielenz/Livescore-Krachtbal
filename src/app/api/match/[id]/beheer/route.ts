import { hasRole, isFederationLevel } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { ploegRechtzetten } from '@/lib/ploeg-rechtzetten'
import { naarInvoervelden, naarIso, nieuwSeizoen } from '@/lib/wedstrijd-beheer'

// Een wedstrijd rechtzetten vanaf de wedstrijdpagina zelf (enkel federatie/admin):
//   • action 'tijdstip' — datum en aanvangsuur corrigeren;
//   • action 'ploeg'    — de naam van de thuis- of uitploeg corrigeren en/of haar club aanduiden.
//
// Waarom dit mag op een afgelopen wedstrijd. De finished-guard beschermt de wedstrijdstaat: score,
// worpen, balbezit, status. Die raakt deze route niet — ze schrijft uitsluitend `date`/`seizoen` op
// de wedstrijd en `name`/`club` op de ploeg. Een verkeerd geïmporteerde datum zit net op wedstrijden
// die al gespeeld zijn; die niet kunnen rechtzetten zou de guard tot een fout maken in plaats van
// een bescherming.
//
// Analysewedstrijden horen hier niet thuis: die zijn privé en hebben hun eigen beheer onder
// /analyse/beheer. Een federatielid dat hier per ongeluk op uitkomt, mag daar niet in schrijven.

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const matchId = Number(id)
  if (!Number.isFinite(matchId)) return Response.json({ error: 'Ongeldige wedstrijd.' }, { status: 400 })

  let body: {
    action?: string
    datum?: unknown
    uur?: unknown
    kant?: unknown
    naam?: unknown
    clubId?: unknown
    reeks?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'federatie')) {
      return Response.json({ error: 'Enkel federatie/admin.' }, { status: 403 })
    }

    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 0 }).catch(() => null)
    if (!match) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
    if ((match as { analyseOnly?: boolean }).analyseOnly) {
      return Response.json({ error: 'Analysewedstrijden beheer je onder /analyse/beheer.' }, { status: 400 })
    }

    // ── Datum en uur ──
    if (body.action === 'tijdstip') {
      const uit = naarIso(body.datum, body.uur)
      if ('fout' in uit) return Response.json({ error: uit.fout }, { status: 400 })

      const oud = (match as { date?: unknown }).date
      const seizoen = nieuwSeizoen(oud as string, uit.iso, (match as { seizoen?: unknown }).seizoen)
      await payload.update({
        collection: 'matches',
        id: matchId,
        data: { date: uit.iso, ...(seizoen ? { seizoen } : {}) },
        overrideAccess: true,
      })
      return Response.json({ ok: true, date: uit.iso, seizoen, velden: naarInvoervelden(uit.iso) })
    }

    // ── Ploegnaam en club ──
    if (body.action === 'ploeg') {
      const kant = body.kant === 'home' || body.kant === 'away' ? body.kant : null
      if (!kant) return Response.json({ error: 'Kies de thuis- of de uitploeg.' }, { status: 400 })
      const teamId = rel(kant === 'home' ? (match as { homeTeam?: unknown }).homeTeam : (match as { awayTeam?: unknown }).awayTeam)
      if (teamId == null) return Response.json({ error: 'Die ploeg staat niet bij deze wedstrijd.' }, { status: 404 })

      // Dezelfde controles als op de ploegpagina zelf — gedeeld, zodat de twee ingangen niet uit
      // elkaar kunnen lopen.
      const uit = await ploegRechtzetten(payload, teamId, { naam: body.naam, clubId: body.clubId, reeks: body.reeks })
      if (!uit.ok) return Response.json({ error: uit.fout }, { status: uit.status })
      return Response.json(uit)
    }

    return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
