import { authUser, hasRole, isFederationLevel, mayScoreMatch } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { renderMatchSheetPdf, renderNoodbladPdf } from '@/lib/submit'
import { magWedstrijdbladZien } from '@/lib/wedstrijdblad-toegang'

// Her-export van het officiële wedstrijdblad als PDF (archief / geschillen). Regenereert uit de
// (na indienen bevroren) gegevens, zodat een afgewerkt blad altijd opnieuw beschikbaar is.
export async function GET(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    // ?nood=1 → het noodblad: verder op papier als het aantekentoestel uitvalt. Dat mag ook de
    // aantekenaar van deze wedstrijd afdrukken (hij zit aan de tafel als het toestel uitvalt).
    const nood = new URL(req.url).searchParams.get('nood') === '1'
    const magNood = nood && (await mayScoreMatch(payload, user, Number(matchId)))
    // Het gewone blad: iedereen die bij de wedstrijd betrokken is (lib/wedstrijdblad-toegang.ts).
    const magBlad = !nood && (await magWedstrijdbladZien(payload, user, matchId))
    if (!(magNood || magBlad || isFederationLevel(user) || (nood && hasRole(user, 'scheidsrechter', 'club-beheerder')))) {
      return Response.json({ error: 'Geen rechten.' }, { status: 403 })
    }

    const pdf = nood ? await renderNoodbladPdf(payload, matchId) : await renderMatchSheetPdf(payload, matchId)
    if (!pdf) return Response.json({ error: 'Wedstrijdblad niet gevonden.' }, { status: 404 })

    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${new URL(req.url).searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${nood ? 'noodblad' : 'wedstrijdblad'}-${matchId}.pdf"`,
      },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
