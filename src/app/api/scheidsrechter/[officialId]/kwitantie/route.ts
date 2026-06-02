import { hasRole, isFederationLevel } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'
import { generateRefereeReceiptPdf } from '@/lib/submit/pdf-vergoeding'
import { buildKwitantieData } from '@/lib/vergoeding-data'

// Kwitantie scheidsrechter (formulier_2): €13/wedstrijd + €0,4327/km over een periode.
export async function GET(req: Request, { params }: { params: Promise<{ officialId: string }> }) {
  const { officialId } = await params
  try {
    const payload = await getPayloadClient()
    const { user } = await payload.auth({ headers: req.headers })
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    if (!isFederationLevel(user) && !hasRole(user, 'scheidsrechter')) {
      return Response.json({ error: 'Enkel scheidsrechter/federatie.' }, { status: 403 })
    }

    const url = new URL(req.url)
    const from = url.searchParams.get('from') ?? undefined
    const to = url.searchParams.get('to') ?? undefined

    const data = await buildKwitantieData(payload, officialId, from, to)
    const pdf = await generateRefereeReceiptPdf(data)
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="kwitantie-scheidsrechter-${officialId}.pdf"`,
      },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
