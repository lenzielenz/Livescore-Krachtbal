import { authUser } from '@/lib/api-auth'
import { formatDateBE, formatDateTimeBE } from '@/lib/datetime'
import { getPayloadClient } from '@/lib/payload-client'
import { generateGetuigschriftPdf } from '@/lib/submit/pdf-ongeval'

// Het geneeskundig getuigschrift bij een aangifte, vooraf ingevuld met de gegevens van de speler,
// om door de dokter te laten invullen. Zelfde toegang als de aangifte (Accidents.read): geen IDOR.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const doc = await payload.findByID({ collection: 'accidents', id, depth: 1, user, overrideAccess: false }).catch(() => null)
  if (!doc) return Response.json({ error: 'Aangifte niet gevonden.' }, { status: 404 })
  const match = doc.match && typeof doc.match === 'object' ? (doc.match as { title?: string }) : null
  const pdf = await generateGetuigschriftPdf({
    naam: String(doc.slachtofferNaam ?? ''),
    geboortedatum: doc.slachtofferGeboortedatum ? formatDateBE(new Date(String(doc.slachtofferGeboortedatum))) : undefined,
    datum: doc.ongevalDatum ? formatDateTimeBE(new Date(String(doc.ongevalDatum))) : undefined,
    wedstrijd: match?.title ?? undefined,
    omstandigheden: (doc.omstandigheden as string) ?? undefined,
  })
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="geneeskundig-getuigschrift-${id}.pdf"`,
    },
  })
}
