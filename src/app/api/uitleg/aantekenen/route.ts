import { bouwAantekenHandleiding } from '@/lib/uitleg-pdf'

export const dynamic = 'force-dynamic'

// De handleiding "een wedstrijd aantekenen" als PDF, om af te drukken en op de tornooitafel te
// leggen. Openbaar: het is uitleg over knoppen, geen data — en wie aan de tafel zit, moet ze
// kunnen ophalen zonder eerst in te loggen (dat inloggen is nu net stap 1).
export async function GET() {
  const pdf = await bouwAantekenHandleiding()
  return new Response(pdf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="krachtbal-aantekenen.pdf"',
      // Eén dag cachen: de inhoud verandert enkel mee met een uitrol.
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
