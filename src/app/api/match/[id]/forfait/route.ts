import { hasRole, isFederationLevel } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'
import { generateForfaitPdf } from '@/lib/submit/pdf-vergoeding'
import { buildForfaitData } from '@/lib/vergoeding-data'

// Onkostenblad forfait (formulier_3): €13/wedstrijd + €0,4259/km, per wedstrijd bij FF.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'scheidsrechter')) {
      return Response.json({ error: 'Enkel scheidsrechter/federatie.' }, { status: 403 })
    }

    const data = await buildForfaitData(payload, id)
    if (!data) return Response.json({ error: 'Wedstrijd niet gevonden.' }, { status: 404 })

    const pdf = await generateForfaitPdf(data)
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="forfait-onkostenblad-${id}.pdf"`,
      },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
