import { authUser, hasRole, isFederationLevel } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'
import { generateAccidentPdf, type AccidentPdfData } from '@/lib/submit/pdf-ongeval'

// Aangifte lichamelijk ongeval (formulier_14) als PDF.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const payload = await getPayloadClient()
    const user = await authUser(payload, req)
    if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
    // Geen IDOR: medische dossiers enkel voor federatie/admin + scheidsrechter (zie Accidents.read).
    if (!(isFederationLevel(user) || hasRole(user, 'scheidsrechter'))) {
      return Response.json({ error: 'Geen rechten.' }, { status: 403 })
    }

    const doc = await payload.findByID({ collection: 'accidents', id, depth: 1 }).catch(() => null)
    if (!doc) return Response.json({ error: 'Aangifte niet gevonden.' }, { status: 404 })

    const match = doc.match as { title?: string } | number | null
    const fmtDate = (d: unknown) => {
      if (!d || typeof d !== 'string') return undefined
      const dt = new Date(d)
      return Number.isNaN(dt.getTime()) ? undefined : dt.toLocaleString('nl-BE')
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
