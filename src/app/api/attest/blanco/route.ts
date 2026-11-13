import { basisUrl } from '@/lib/oauth'
import { getPayloadClient } from '@/lib/payload-client'
import { blancoAttest, generateMedischeKaartPdf } from '@/lib/submit/pdf-medische-kaart'
import { huidigSeizoen } from '@/lib/uitlening'

// Het blanco medisch attest (PDF), voor iedereen: zonder login, zonder persoonsgegevens. De QR wijst naar
// /attest; een opgeladen blanco attest gaat naar de federatie, die het lid opzoekt (lib/attest-server.ts).
export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const seizoen = await huidigSeizoen(payload)
  const pdf = await generateMedischeKaartPdf([blancoAttest(basisUrl(req), seizoen.label)])
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="medisch-attest-blanco-${seizoen.label}.pdf"`,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
