import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { authUser, isAssignedReferee, matchSideClubs } from '@/lib/api-auth'
import { getOrCreateMatchSheet } from '@/lib/matchsheet-data'
import { getPayloadClient } from '@/lib/payload-client'

const SIGNERS = ['kapiteinThuis', 'kapiteinUit', 'scheidsrechter'] as const
type Signer = (typeof SIGNERS)[number]

// Bewaart een digitale handtekening (akkoord + naam + canvas data-URL + tijdstip).
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

    const maySign =
      isFederationLevel(user) || hasRole(user, 'scheidsrechter', 'kapitein', 'club-beheerder')
    if (!maySign) return Response.json({ error: 'Geen rechten om af te tekenen.' }, { status: 403 })

    // Bind elke handtekening aan de juiste identiteit (voorkomt vervalsing — AUDIT §5):
    // kapitein thuis/uit enkel door de eigen club, scheidsrechter enkel door de toegewezen SR.
    if (!isFederationLevel(user)) {
      if (who === 'scheidsrechter') {
        if (!(await isAssignedReferee(payload, user, matchId))) {
          return Response.json({ error: 'Enkel de toegewezen scheidsrechter kan hier tekenen.' }, { status: 403 })
        }
      } else {
        const clubs = await matchSideClubs(payload, matchId)
        const need = who === 'kapiteinThuis' ? clubs.home : clubs.away
        const own = userClubId(user)
        if (need == null || own == null || String(need) !== String(own)) {
          return Response.json({ error: 'Je kan enkel voor je eigen ploeg tekenen.' }, { status: 403 })
        }
      }
    }

    const sheet = await getOrCreateMatchSheet(payload, matchId)
    if (sheet.status === 'ingediend') {
      return Response.json({ error: 'Blad is ingediend (Item 37).' }, { status: 409 })
    }

    await payload.update({
      collection: 'matchsheets',
      id: sheet.id,
      data: {
        [who]: {
          naam: body.naam ?? '',
          handtekening: body.handtekening ?? '',
          akkoord: Boolean(body.akkoord),
          tijdstip: body.akkoord ? new Date().toISOString() : null,
        },
      },
      overrideAccess: true,
    })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
