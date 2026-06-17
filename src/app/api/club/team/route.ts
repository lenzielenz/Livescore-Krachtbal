import { hasRole, userClubId, type UserRole } from '@/lib/access'
import { authUser } from '@/lib/api-auth'
import { getPayloadClient } from '@/lib/payload-client'

// Clubteam-beheer door een CLUB-BEHEERDER: ken de club-subrollen (club-medewerker / club-lid) toe
// aan leden van de EIGEN club, koppel een lid aan z'n speler-dossier, of haal een lid op e-mail erbij.
// Strikt afgeschermd tegen escalatie:
//  - enkel een club-beheerder (admins gebruiken /beheer/accounts);
//  - enkel accounts in/van de EIGEN club — nooit een account met een hogere rol (admin/federatie/
//    scheidsrechter/club-beheerder) of een account dat al bij een andere club zit;
//  - enkel de twee club-subrollen; de overige rollen van het account blijven ongemoeid.
const CLUB_SUBROLES = ['club-medewerker', 'club-lid'] as const
type ClubSubRole = (typeof CLUB_SUBROLES)[number]
const PROTECTED = ['admin', 'federatie', 'scheidsrechter', 'club-beheerder']

const relId = (v: unknown): number | string | null =>
  v && typeof v === 'object' ? ((v as { id?: number | string }).id ?? null) : (v as number | string | null)

const roleArr = (u: unknown): string[] =>
  Array.isArray((u as { roles?: unknown }).roles) ? (u as { roles: string[] }).roles : []

// Behoud de bestaande rollen, vervang enkel de club-subrol. Nooit zonder rol achterlaten.
function withClubRole(current: string[], role: string): UserRole[] {
  const next = current.filter((r) => !CLUB_SUBROLES.includes(r as ClubSubRole))
  if (role !== 'none') next.push(role)
  return (next.length ? next : ['viewer']) as UserRole[]
}

export async function POST(req: Request) {
  const payload = await getPayloadClient()
  const user = await authUser(payload, req)
  if (!hasRole(user, 'club-beheerder')) {
    return Response.json(
      { error: user ? 'Enkel een club-beheerder kan het clubteam beheren.' : 'Niet ingelogd.' },
      { status: user ? 403 : 401 },
    )
  }
  const myClub = userClubId(user)
  if (myClub == null) {
    return Response.json({ error: 'Je account is niet aan een club gekoppeld.' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  }

  // ── Branch 1: een lid erbij halen op e-mailadres (ook als die nog geen club koos) ──
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email) {
    const role = String(body.role ?? 'club-lid')
    if (!CLUB_SUBROLES.includes(role as ClubSubRole)) {
      return Response.json({ error: 'Kies een geldige club-rol.' }, { status: 400 })
    }
    const found = await payload
      .find({ collection: 'users', where: { email: { equals: email } }, limit: 1, depth: 0 })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    const target = found.docs[0]
    if (!target) {
      return Response.json(
        { error: 'Geen account met dit e-mailadres. Vraag de persoon eerst een gratis account aan te maken.' },
        { status: 404 },
      )
    }
    const current = roleArr(target)
    if (current.some((r) => PROTECTED.includes(r))) {
      return Response.json({ error: 'Dit account heeft een hogere rol — vraag de federatie.' }, { status: 403 })
    }
    const tClub = relId((target as { club?: unknown }).club)
    if (tClub != null && String(tClub) !== String(myClub)) {
      return Response.json({ error: 'Dit account hoort al bij een andere club.' }, { status: 403 })
    }
    try {
      await payload.update({
        collection: 'users',
        id: (target as { id: number }).id,
        data: { club: Number(myClub), roles: withClubRole(current, role) },
        overrideAccess: true,
      })
    } catch {
      return Response.json({ error: 'Toevoegen mislukt.' }, { status: 500 })
    }
    return Response.json({ ok: true })
  }

  // ── Branch 2/3: op een bestaand lid van de eigen club (op userId) ──
  const userId = Number(body.userId)
  if (!Number.isFinite(userId)) return Response.json({ error: 'Ongeldig account.' }, { status: 400 })

  const target = await payload.findByID({ collection: 'users', id: userId, depth: 0 }).catch(() => null)
  if (!target) return Response.json({ error: 'Account niet gevonden.' }, { status: 404 })
  if (String(relId((target as { club?: unknown }).club) ?? '') !== String(myClub)) {
    return Response.json({ error: 'Je kan enkel leden van je eigen club beheren.' }, { status: 403 })
  }
  const current = roleArr(target)
  if (current.some((r) => PROTECTED.includes(r))) {
    return Response.json({ error: 'Dit account beheer je niet hier (hogere rol — vraag de federatie).' }, { status: 403 })
  }

  // Branch 2: koppel/ontkoppel het speler-dossier (zodat een lid enkel z'n eigen training ziet).
  if ('playerId' in body) {
    const raw = body.playerId
    if (raw == null || raw === '') {
      try {
        await payload.update({ collection: 'users', id: userId, data: { player: null }, overrideAccess: true })
      } catch {
        return Response.json({ error: 'Bijwerken mislukt.' }, { status: 500 })
      }
      return Response.json({ ok: true })
    }
    const playerId = Number(raw)
    if (!Number.isFinite(playerId)) return Response.json({ error: 'Ongeldige speler.' }, { status: 400 })
    // De speler moet tot de EIGEN club horen (anders koppel je een vreemde speler).
    const inClub = await payload
      .find({
        collection: 'players',
        where: { and: [{ id: { equals: playerId } }, { 'team.club': { equals: myClub } }] },
        limit: 1,
        depth: 0,
      })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    if (!inClub.docs[0]) {
      return Response.json({ error: 'Die speler hoort niet bij jouw club.' }, { status: 403 })
    }
    try {
      await payload.update({ collection: 'users', id: userId, data: { player: playerId }, overrideAccess: true })
    } catch {
      return Response.json({ error: 'Bijwerken mislukt.' }, { status: 500 })
    }
    return Response.json({ ok: true })
  }

  // Branch 3: zet de club-subrol.
  const role = String(body.role ?? 'none')
  if (role !== 'none' && !CLUB_SUBROLES.includes(role as ClubSubRole)) {
    return Response.json({ error: 'Ongeldige rol.' }, { status: 400 })
  }
  try {
    await payload.update({ collection: 'users', id: userId, data: { roles: withClubRole(current, role) }, overrideAccess: true })
  } catch {
    return Response.json({ error: 'Bijwerken mislukt.' }, { status: 500 })
  }
  return Response.json({ ok: true })
}
