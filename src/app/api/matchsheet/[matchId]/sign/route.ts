import { hasRole, isFederationLevel } from '@/lib/access'
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
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })

    const maySign =
      isFederationLevel(user) || hasRole(user, 'scheidsrechter', 'kapitein', 'club-beheerder')
    if (!maySign) return Response.json({ error: 'Geen rechten om af te tekenen.' }, { status: 403 })

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
