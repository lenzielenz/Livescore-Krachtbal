import { randomBytes } from 'node:crypto'

import { federatieToegang, leesJson } from '@/lib/federatie-api'
import { HERSTEL_GELDIG_MS, herstelLink, vervaltOp } from '@/lib/wachtwoord-reset'

// Clubs en hun login (vanuit /beheer/clubs).
//   POST { actie: 'club', naam, plaats? } → { ok, id }
//   POST { actie: 'uitnodigen', clubId, email, naam } → { ok, link, vervalt, nieuw }
//
// Uitnodigen maakt (of hergebruikt) een account met de rol club-beheerder voor die club en geeft
// een eenmalige link terug waarmee de persoon zelf een wachtwoord kiest — dezelfde herstel-token als
// /wachtwoord-vergeten. Geen mail: de federatie bezorgt de link zelf. Een bestaand account met een
// hogere rol of van een andere club wordt nooit overgenomen.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const HOGER = ['admin', 'federatie']

export async function POST(req: Request) {
  const t = await federatieToegang(req)
  if (t.fout) return t.fout
  const { payload } = t
  const body = await leesJson(req)
  if (!body) return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })

  try {
    if (body.actie === 'club') {
      const naam = String(body.naam ?? '').replace(/\s+/g, ' ').trim()
      if (naam.length < 2) return Response.json({ error: 'Geef de naam van de club.' }, { status: 400 })
      const dubbel = await payload.find({ collection: 'clubs', where: { name: { equals: naam } }, limit: 1, depth: 0, overrideAccess: true })
      if (dubbel.docs.length) return Response.json({ error: 'Er bestaat al een club met die naam.' }, { status: 409 })
      const plaats = String(body.plaats ?? '').trim()
      const club = await payload.create({ collection: 'clubs', data: { name: naam, ...(plaats ? { plaats } : {}) }, overrideAccess: true })
      return Response.json({ ok: true, id: club.id })
    }

    if (body.actie === 'uitnodigen') {
      const clubId = Number(body.clubId)
      const email = String(body.email ?? '').trim().toLowerCase()
      const naam = String(body.naam ?? '').replace(/\s+/g, ' ').trim()
      if (!Number.isFinite(clubId)) return Response.json({ error: 'Kies een club.' }, { status: 400 })
      if (!EMAIL.test(email)) return Response.json({ error: 'Geef een geldig e-mailadres.' }, { status: 400 })
      const club = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0, overrideAccess: true }).catch(() => null)
      if (!club) return Response.json({ error: 'Club niet gevonden.' }, { status: 404 })

      const bestaand = (await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
      let nieuw = false
      if (bestaand) {
        const rollen = (Array.isArray(bestaand.roles) ? bestaand.roles : []) as string[]
        const eigenClub = bestaand.club == null || Number(typeof bestaand.club === 'object' ? bestaand.club.id : bestaand.club) === clubId
        if (rollen.some((r) => HOGER.includes(r))) {
          return Response.json({ error: 'Dit account heeft een federatie- of adminrol; wijzig het via Accounts.' }, { status: 409 })
        }
        if (!eigenClub) return Response.json({ error: 'Dit account hoort bij een andere club.' }, { status: 409 })
        const volgende = [...new Set([...rollen.filter((r) => r !== 'viewer'), 'club-beheerder'])]
        await payload.update({
          collection: 'users',
          id: bestaand.id,
          data: { club: clubId, roles: volgende as never, ...(naam && !bestaand.name ? { name: naam } : {}) },
          overrideAccess: true,
        })
      } else {
        if (!naam) return Response.json({ error: 'Geef de naam van de persoon.' }, { status: 400 })
        // Willekeurig wachtwoord dat niemand kent: de persoon kiest zelf een wachtwoord via de link.
        await payload.create({
          collection: 'users',
          data: { email, name: naam, password: randomBytes(24).toString('base64url'), club: clubId, roles: ['club-beheerder'] as never },
          overrideAccess: true,
        })
        nieuw = true
      }

      const token = await payload.forgotPassword({ collection: 'users', data: { email }, disableEmail: true, expiration: HERSTEL_GELDIG_MS })
      if (!token) return Response.json({ error: 'De link kon niet aangemaakt worden.' }, { status: 500 })
      const basis = process.env.PUBLIC_SERVER_URL || process.env.NEXT_PUBLIC_SERVER_URL || ''
      return Response.json({ ok: true, nieuw, link: herstelLink(token, basis), vervalt: vervaltOp(Date.now()).toISOString() })
    }

    return Response.json({ error: 'Onbekende actie.' }, { status: 400 })
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 })
  }
}
