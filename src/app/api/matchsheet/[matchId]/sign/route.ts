import { hasRole, isClubStaff, isFederationLevel, userClubId } from '@/lib/access'
import { authUser, refereeMayHandleMatch } from '@/lib/api-auth'
import { magOpstellingVoor } from '@/lib/club-functies'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'

const SIGNERS = ['kapiteinThuis', 'kapiteinUit', 'scheidsrechter'] as const
type Signer = (typeof SIGNERS)[number]

const idVan = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

// Bewaart een digitale handtekening (akkoord + naam + canvas data-URL + tijdstip). Na de wedstrijd
// tekenen beide kapiteins en de scheidsrechter af; daarna dient de scheidsrechter in.
//
// Wie mag tekenen (AUDIT §5: elke handtekening hoort bij de juiste persoon):
// - scheidsrechter: de toegewezen (of backup-)scheidsrechter, of de federatie;
// - kapitein van een kant: de federatie; de scheidsrechter van deze wedstrijd (de kapiteins tekenen
//   op zijn toestel — zo gaat het op het terrein); of iemand van die club: clubstaf, de coach van die
//   ploeg, een account met de rol kapitein, of de speler zelf als hij op het blad van die kant staat.
export async function POST(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  let body: { who?: string; naam?: string; handtekening?: string; akkoord?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }
  const who = body.who as Signer
  if (!SIGNERS.includes(who)) return Response.json({ error: 'Ongeldige ondertekenaar.' }, { status: 400 })

  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

    const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 2 }).catch(() => null)
    if (!match) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })
    const sheet = await getOrCreateMatchSheet(payload, matchId)
    if (sheet.status === 'ingediend') {
      return Response.json({ error: 'Blad is ingediend (Item 37).' }, { status: 409 })
    }
    // Aftekenen = akkoord met de eindstand: pas na het eindsignaal (of een forfait).
    const forfait = ((sheet.forfait as { uitslag?: string } | undefined)?.uitslag ?? 'geen') !== 'geen'
    if (match.status !== 'finished' && !forfait) {
      return Response.json({ error: 'De wedstrijd is nog niet afgelopen; aftekenen kan na het eindsignaal.' }, { status: 409 })
    }

    const federatie = isFederationLevel(user)
    const scheidsrechter = federatie || (hasRole(user, 'scheidsrechter') && (await refereeMayHandleMatch(payload, user, matchId)))

    if (who === 'scheidsrechter') {
      if (!scheidsrechter) {
        return Response.json({ error: 'Enkel de scheidsrechter van deze wedstrijd kan hier tekenen.' }, { status: 403 })
      }
    } else if (!scheidsrechter) {
      const side = who === 'kapiteinThuis' ? 'home' : 'away'
      const team = (side === 'home' ? match.homeTeam : match.awayTeam) as { id: number; club?: unknown; category?: string | null } | number
      const teamDoc = typeof team === 'object' ? team : null
      const club = idVan(teamDoc?.club)
      const eigenClub = club != null && String(userClubId(user) ?? '') === String(club)
      const lineup = (side === 'home' ? sheet.homeLineup : sheet.awayLineup) as { player?: unknown }[] | undefined
      const eigenSpeler = idVan((user as { player?: unknown }).player)
      const opBlad = eigenSpeler != null && (lineup ?? []).some((r) => idVan(r.player) === eigenSpeler)
      const mag =
        opBlad ||
        (eigenClub &&
          (isClubStaff(user) ||
            hasRole(user, 'kapitein') ||
            (teamDoc != null && magOpstellingVoor(user, { id: teamDoc.id, club: teamDoc.club, category: teamDoc.category }))))
      if (!mag) return Response.json({ error: 'Je kan enkel voor je eigen ploeg tekenen.' }, { status: 403 })
    }

    // Een gezette handtekening is definitief (Item 37); enkel de federatie kan ze nog vervangen.
    const huidig = sheet[who] as { akkoord?: boolean } | undefined
    if (huidig?.akkoord && !federatie) {
      return Response.json({ error: 'Deze handtekening staat er al.' }, { status: 409 })
    }
    const handtekening = String(body.handtekening ?? '')
    if (body.akkoord && !handtekening.startsWith('data:image/')) {
      return Response.json({ error: 'Plaats eerst een handtekening.' }, { status: 400 })
    }

    // De naam hoeft niet getypt te worden: de kapitein uit de opstelling, de toegewezen
    // scheidsrechter, of anders het ingelogde account. Tekent een kapitein op het toestel van de
    // scheidsrechter, dan staat zíjn naam op het blad, niet die van de scheidsrechter.
    const kap = who === 'kapiteinThuis' ? match.homeCaptain : who === 'kapiteinUit' ? match.awayCaptain : null
    const ref = who === 'scheidsrechter' ? sheet.assignedReferee : null
    const vooraf =
      (kap && typeof kap === 'object' ? String((kap as { name?: unknown }).name ?? '') : '') ||
      (ref && typeof ref === 'object' ? String((ref as { name?: unknown }).name ?? '') : '')
    const naam = body.naam?.trim() || vooraf.trim() || (who === 'scheidsrechter' || !scheidsrechter ? String((user as { name?: string }).name ?? '').trim() : '')
    if (body.akkoord && !naam) {
      return Response.json({ error: 'Geef de naam van de kapitein (of duid hem aan in de opstelling).' }, { status: 400 })
    }
    await payload.update({
      collection: 'matchsheets',
      id: sheet.id,
      data: {
        [who]: {
          naam,
          handtekening,
          akkoord: Boolean(body.akkoord),
          tijdstip: body.akkoord ? new Date().toISOString() : null,
        },
      },
      overrideAccess: true,
    })
    return Response.json({ ok: true, naam })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
