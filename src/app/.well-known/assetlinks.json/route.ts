import { assetLinksFromEnv } from '@/lib/assetlinks'

// https://<domein>/.well-known/assetlinks.json — Chrome haalt dit op om te controleren of de
// Android-app (TWA) bij dit domein hoort. Klopt het, dan verdwijnt de browserbalk in de app.
//
// Bewust een route en geen statisch bestand: de vingerafdruk van de ondertekeningssleutel is pas
// bekend nadat de app in de Play Console staat, en kan wijzigen (bv. een tweede sleutel tijdens
// een sleutelrotatie). Zo hoeft er niets herbouwd te worden — een omgevingsvariabele volstaat.
export const dynamic = 'force-dynamic'

export function GET() {
  const statements = assetLinksFromEnv()
  return new Response(JSON.stringify(statements, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      // Google's verificatie haalt dit periodiek op; een uur cache volstaat en houdt een
      // sleutelwissel snel doorvoerbaar.
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
