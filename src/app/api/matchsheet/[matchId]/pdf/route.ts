import { authUser, hasRole, isFederationLevel } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { renderMatchSheetPdf } from '@/lib/submit'

// Her-export van het officiële wedstrijdblad als PDF (archief / geschillen). Regenereert uit de
// (na indienen bevroren) gegevens, zodat een afgewerkt blad altijd opnieuw beschikbaar is.
export async function GET(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!(isFederationLevel(user) || hasRole(user, 'scheidsrechter', 'club-beheerder'))) {
      return Response.json({ error: 'Geen rechten.' }, { status: 403 })
    }

    const pdf = await renderMatchSheetPdf(payload, matchId)
    if (!pdf) return Response.json({ error: 'Wedstrijdblad niet gevonden.' }, { status: 404 })

    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="wedstrijdblad-${matchId}.pdf"`,
      },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
