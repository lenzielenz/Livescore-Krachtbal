import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { generateAccidentPdf, type AccidentPdfData } from '@/lib/submit/pdf-ongeval'
import { formatDateTimeBE } from '@/lib/datetime'

// Aangifte lichamelijk ongeval (formulier_14) als PDF.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    // Geen IDOR: we lezen met de rechten van de gebruiker (Accidents.read) — federatie,
    // scheidsrechter, de club van de speler, de speler zelf of zijn ouder. Anders: niet gevonden.
    const doc = await payload
      .findByID({ collection: 'accidents', id, depth: 1, user, overrideAccess: false })
      .catch(() => null)
    if (!doc) return Response.json({ error: 'Aangifte niet gevonden.' }, { status: 404 })

    const match = doc.match as { title?: string } | number | null
    const fmtDate = (d: unknown) => {
      if (!d || typeof d !== 'string') return undefined
      const dt = new Date(d)
      return Number.isNaN(dt.getTime()) ? undefined : formatDateTimeBE(dt)
    }

    const data: AccidentPdfData = {
      titel: String(doc.titel ?? 'Ongevalsaangifte'),
      wedstrijd: typeof match === 'object' && match ? match.title ?? undefined : undefined,
      slachtoffer: {
        naam: String(doc.slachtofferNaam ?? '—'),
        geboortedatum: fmtDate(doc.slachtofferGeboortedatum),
        adres: (doc.slachtofferAdres as string) ?? undefined,
        beroep: (doc.slachtofferBeroep as string) ?? undefined,
      },
      ongeval: {
        plaats: (doc.ongevalPlaats as string) ?? undefined,
        datum: fmtDate(doc.ongevalDatum),
        omstandigheden: (doc.omstandigheden as string) ?? undefined,
      },
      getuigen: ((doc.getuigen ?? []) as { naam?: string; adres?: string }[]).map((g) => ({
        naam: g.naam,
        adres: g.adres,
      })),
      opmerkingen: (doc.opmerkingen as string) ?? undefined,
    }

    const pdf = await generateAccidentPdf(data)
    return new Response(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ongevalsaangifte-${id}.pdf"`,
      },
    })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
