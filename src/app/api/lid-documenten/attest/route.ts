import { authUser } from '@/lib/api-auth'
import { formatDateBE } from '@/lib/datetime'
import { factuurInstellingen } from '@/lib/facturatie-server'
import { ficheLezen, magFiche } from '@/lib/ledenfiche'
import { lidmaatschappenBijwerken, lidmaatschapVan } from '@/lib/lidmaatschap'
import { getPayloadClient } from '@/lib/payload-client'
import { generateAttestLidmaatschapPdf } from '@/lib/submit/pdf-attest-lidmaatschap'

// Attest van lidmaatschap (PDF) voor de mutualiteit of de werkgever: GET ?playerId=&seizoen=. Het lid zelf, de
// ouders, de club en de federatie. Enkel als het lid in dat seizoen aangesloten was (lib/lidmaatschap.ts).
export async function GET(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!user) return Response.json({ error: 'Niet ingelogd.' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const playerId = Number(q.get('playerId'))
  if (!Number.isSafeInteger(playerId) || !(await magFiche(payload, user, playerId))) return Response.json({ error: 'Niet gevonden.' }, { status: 404 })
  const seizoen = q.get('seizoen')
  // Wie net goedgekeurd werd, staat er misschien nog niet in: eerst bijwerken (licht en idempotent).
  let lm = await lidmaatschapVan(payload, playerId, seizoen)
  if (!lm) {
    await lidmaatschappenBijwerken(payload).catch(() => null)
    lm = await lidmaatschapVan(payload, playerId, seizoen)
  }
  if (!lm) return Response.json({ error: 'Dit lid is (in dat seizoen) niet aangesloten bij de federatie.' }, { status: 404 })
  const [fiche, inst, p] = await Promise.all([
    ficheLezen(payload, playerId),
    factuurInstellingen(payload),
    payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }),
  ])
  const adres = [fiche?.straat, [fiche?.postcode, fiche?.gemeente].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const pdf = await generateAttestLidmaatschapPdf({
    federatie: { naam: inst.naam, adres: inst.adres, ondernemingsnummer: inst.ondernemingsnummer },
    lid: { naam: String(p.name ?? ''), geboortedatum: p.birthDate ? formatDateBE(String(p.birthDate)) : null, adres: adres || null },
    club: lm.club,
    seizoen: lm.seizoen,
    vanaf: formatDateBE(lm.vanaf),
    tot: lm.tot ? formatDateBE(lm.tot) : null,
    soort: lm.soort,
    datum: formatDateBE(new Date()),
  })
  return new Response(Buffer.from(pdf), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="attest-lidmaatschap-${lm.seizoen}.pdf"`, 'Cache-Control': 'private, no-store' },
  })
}
