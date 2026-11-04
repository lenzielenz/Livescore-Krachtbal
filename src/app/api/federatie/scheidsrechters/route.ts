import { randomBytes } from 'node:crypto'

import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { meld } from '@/lib/meldingen'
import { HERSTEL_GELDIG_MS, herstelLink, vervaltOp } from '@/lib/wachtwoord-reset'

// Een scheidsrechter toevoegen in één keer (vanuit "Snel doen" en /beheer/scheidsrechters), enkel de federatie:
//   POST { naam, email?, federationNumber?, type? }
//     → { ok, officialId, link?, vervalt?, nieuw?, gekoppeld? }
// Zonder e-mailadres: enkel het dossier (official), toe te wijzen aan wedstrijden. Mét e-mailadres:
// ook een account met de rol scheidsrechter, gekoppeld aan het dossier, plus een eenmalige link
// waarmee de persoon zelf een wachtwoord kiest — zoals bij het uitnodigen van een clubbeheerder.
// Bestaat het account al, dan krijgt het de rol erbij en een melding; een federatie-/adminaccount
// wordt nooit overgenomen.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TYPES = ['scheidsrechter', 'grensrechter', 'aantekenaar', 'tijdopnemer'] as const
type OfficialType = (typeof TYPES)[number]

export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const { payload } = t
  const body = await leesJson(req)
  if (!body) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })

  const naam = String(body.naam ?? '').replace(/\s+/g, ' ').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  const nummer = String(body.federationNumber ?? '').trim()
  const type: OfficialType = (TYPES as readonly string[]).includes(String(body.type)) ? (body.type as OfficialType) : 'scheidsrechter'
  if (naam.length < 3) return Response.json({ error: 'Geef de naam van de scheidsrechter.' }, { status: 400 })
  if (email && !EMAIL.test(email)) return Response.json({ error: 'Geef een geldig e-mailadres, of laat het leeg.' }, { status: 400 })

  try {
    // Dubbele dossiers vermijden: zelfde naam en type bestaat al.
    const dubbel = await payload.find({ collection: 'officials', where: { and: [{ name: { equals: naam } }, { type: { equals: type } }] }, limit: 1, depth: 0, overrideAccess: true })
    if (dubbel.docs[0]) return Response.json({ error: `${naam} staat al in de lijst.` }, { status: 409 })

    let userId: number | null = null
    let nieuw = false
    if (email) {
      const bestaand = (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
      if (bestaand) {
        const rollen = (Array.isArray(bestaand.roles) ? bestaand.roles : []) as string[]
        if (rollen.includes('admin') || rollen.includes('federatie')) {
          return Response.json({ error: 'Dit account heeft een federatie- of adminrol; koppel het via Accounts.' }, { status: 409 })
        }
        if (bestaand.official != null) return Response.json({ error: 'Dit account is al aan een official gekoppeld.' }, { status: 409 })
        await payload.update({
          collection: 'users',
          id: bestaand.id,
          data: { roles: [...new Set([...rollen.filter((r) => r !== 'viewer'), 'scheidsrechter'])] as never, ...(!bestaand.name ? { name: naam } : {}) },
          overrideAccess: true,
        })
        userId = Number(bestaand.id)
      } else {
        const u = await payload.create({
          collection: 'users',
          data: { email, name: naam, password: randomBytes(24).toString('base64url'), roles: ['scheidsrechter'] as never },
          overrideAccess: true,
        })
        userId = Number(u.id)
        nieuw = true
      }
    }

    // De afterChange-hook van Officials zet users.official mee terug.
    const official = await payload.create({
      collection: 'officials',
      data: { name: naam, type, federationNumber: nummer || null, user: userId },
      overrideAccess: true,
    })

    if (!email) return Response.json({ ok: true, officialId: official.id })

    let link: string | null = null
    let vervalt: string | null = null
    if (nieuw) {
      const token = await payload.forgotPassword({ collection: 'users', data: { email }, disableEmail: true, expiration: HERSTEL_GELDIG_MS })
      if (token) {
        const basis = process.env.PUBLIC_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || ''
        link = herstelLink(token, basis)
        vervalt = vervaltOp(Date.now()).toISOString()
      }
    } else if (userId != null) {
      await meld(payload, [userId], {
        titel: '🧑‍⚖️ Je bent nu scheidsrechter',
        tekst: 'De federatie koppelde je account aan je scheidsrechtersdossier. Je ziet je wedstrijden en QR in het portaal.',
        url: '/scheidsrechter/portaal',
      })
    }
    return Response.json({ ok: true, officialId: official.id, gekoppeld: true, nieuw, link, vervalt })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
