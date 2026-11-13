import { authUser } from '@/lib/api-auth'
import { attestPubliek } from '@/lib/attest-server'
import { getPayloadClient } from '@/lib/payload-client'
import { clientIp, rateLimit } from '@/lib/sse-hub'

// Een medisch attest opladen — ook ZONDER login (de algemene link /attest en de QR-link /k/<code>).
// Multipart: bestand, code? (van /k/<code>), en bij een blanco attest naam, geboortedatum, club, email?.
// Antwoord (lib/attest-server.ts → PubliekUitkomst):
//   { ok: true, status: 'goedgekeurd' | 'nakijken', naam: "Kaat K.", reden, seizoen, meldingen }
//   { ok: false, fout }                        → iets klopt niet, met uitleg
//   { ok: false, nodig: 'gegevens', blanco }   → geen lid gevonden: vraag naam + geboortedatum en stuur opnieuw
// Wie zonder login oplaadt, leert nooit meer over het lid dan "Kaat K.". Een ingelogd lid of ouder wordt als
// uploader onthouden (via: 'lid').
export async function POST(req: Request) {
  // Ruim genoeg voor een gezin met een paar kinderen en wat herkansingen; niet om de federatie te overspoelen.
  if (!rateLimit(`attest-publiek:${clientIp(req)}`, 20, 15 * 60_000)) {
    return Response.json({ ok: false, fout: 'Even geduld: te veel attesten na elkaar. Probeer het over een kwartier opnieuw.' }, { status: 429 })
  }
  const form = await req.formData().catch(() => null)
  if (!form) return Response.json({ ok: false, fout: 'Ongeldige upload.' }, { status: 400 })
  const payload = await getPayloadClient()
  const user = await authUser(payload, req).catch(() => null)
  const tekst = (k: string) => (form.get(k) != null ? String(form.get(k)) : '')
  const heeftGegevens = tekst('naam').trim() !== ''
  const uit = await attestPubliek(payload, form.get('bestand'), {
    code: tekst('code') || null,
    gegevens: heeftGegevens ? { naam: tekst('naam'), geboortedatum: tekst('geboortedatum'), club: tekst('club'), email: tekst('email') } : null,
    userId: user ? Number(user.id) : null,
  })
  return Response.json(uit, { status: uit.ok || 'nodig' in uit ? 200 : 400 })
}
