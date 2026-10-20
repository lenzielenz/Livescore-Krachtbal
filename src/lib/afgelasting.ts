import type { Payload } from 'payload'

import { hasRole, isFederationLevel } from './access'
import { refereeMayHandleMatch, type AuthedUser } from './api-auth'
import { volgBladStatus } from './blad-status'
import { formatDateTimeBE } from './datetime'
import { clubStaf, meld, relId } from './meldingen'
import { sendPushToClubs } from './push'

// Afgelasting door de scheidsrechter (slecht terrein, weer). Hij legt de omstandigheden vast met
// foto's; de wedstrijd blijft gepland maar kan niet starten (match-start-window.ts). De federatie
// krijgt een melding, ziet de foto's en plant een nieuwe datum (of trekt de afgelasting in).
// Beide clubs horen telkens wat er gebeurt.

export const FOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
export const FOTO_MAX_BYTES = 10 * 1024 * 1024
export const FOTO_MAX = 6
const REDEN_TEKST: Record<string, string> = { terrein: 'terrein onbespeelbaar', weer: 'weersomstandigheden', ander: 'andere reden' }

export type Uitkomst = { ok: true; id: number } | { ok: false; status: number; error: string }

type Wedstrijd = { id: number; status?: string | null; date?: string | null; afgelast?: boolean | null; homeTeam?: unknown; awayTeam?: unknown; title?: string | null }

const naamVan = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')
const clubVan = (v: unknown) => (v && typeof v === 'object' ? relId((v as { club?: unknown }).club) : null)
const titel = (m: Wedstrijd) => `${naamVan(m.homeTeam) || '?'} – ${naamVan(m.awayTeam) || '?'}`

async function federatieAccounts(payload: Payload): Promise<number[]> {
  const res = await payload.find({ collection: 'users', where: { roles: { contains: 'federatie' } }, depth: 0, limit: 25, overrideAccess: true })
  return res.docs.map((u) => Number(u.id))
}

/** Mag deze gebruiker deze wedstrijd afgelasten? De federatie, of de scheidsrechter van de wedstrijd. */
export async function magAfgelasten(payload: Payload, user: AuthedUser | null, matchId: number): Promise<boolean> {
  if (!user) return false
  if (isFederationLevel(user)) return true
  return hasRole(user, 'scheidsrechter') && (await refereeMayHandleMatch(payload, user, matchId))
}

export async function afgelasten(
  payload: Payload,
  user: AuthedUser,
  matchId: number,
  inv: { reden: string; toelichting?: string | null; fotos: File[] },
): Promise<Uitkomst> {
  if (!(await magAfgelasten(payload, user, matchId))) {
    return { ok: false, status: 403, error: 'Enkel de scheidsrechter van deze wedstrijd (of de federatie) gelast af.' }
  }
  if (!REDEN_TEKST[inv.reden]) return { ok: false, status: 400, error: 'Kies de reden.' }
  const m = (await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)) as Wedstrijd | null
  if (!m) return { ok: false, status: 404, error: 'Wedstrijd niet gevonden.' }
  if (m.status !== 'scheduled') return { ok: false, status: 409, error: m.status === 'live' ? 'De wedstrijd is al bezig.' : 'De wedstrijd is al gespeeld.' }
  if (m.afgelast) return { ok: false, status: 409, error: 'Deze wedstrijd is al afgelast.' }
  // De foto's zijn het bewijs van de omstandigheden: de scheidsrechter voegt er minstens één toe.
  if (!inv.fotos.length && !isFederationLevel(user)) return { ok: false, status: 400, error: "Voeg minstens één foto van de omstandigheden toe." }
  if (inv.fotos.length > FOTO_MAX) return { ok: false, status: 400, error: `Maximaal ${FOTO_MAX} foto's.` }
  for (const f of inv.fotos) {
    if (!FOTO_TYPES.has(f.type)) return { ok: false, status: 400, error: 'Enkel foto’s (JPG, PNG, WebP, HEIC).' }
    if (f.size > FOTO_MAX_BYTES) return { ok: false, status: 400, error: 'Een foto is groter dan 10 MB.' }
  }

  const clubs = [clubVan(m.homeTeam), clubVan(m.awayTeam)].filter((c): c is number => c != null)
  const official = (user as { official?: unknown }).official
  const doc = await payload.create({
    collection: 'afgelastingen',
    data: {
      match: matchId,
      clubs,
      reden: inv.reden as 'terrein' | 'weer' | 'ander',
      toelichting: inv.toelichting?.trim() || null,
      oorspronkelijkeDatum: m.date ?? null,
      gemeldDoor: Number(user.id),
      scheidsrechterNaam: naamVan(official) || String((user as { name?: unknown }).name ?? '') || null,
      status: 'gemeld',
    },
    overrideAccess: true,
  })
  for (const [i, f] of inv.fotos.entries()) {
    const ext = f.type.split('/')[1] === 'jpeg' ? 'jpg' : f.type.split('/')[1]
    await payload.create({
      collection: 'afgelasting-fotos',
      data: { afgelasting: doc.id, clubs },
      file: { data: Buffer.from(await f.arrayBuffer()), mimetype: f.type, name: `afgelasting-${matchId}-${Date.now()}-${i + 1}.${ext}`, size: f.size },
      overrideAccess: true,
    })
  }

  // De wedstrijd ligt stil: afgelast, en een eventueel startakkoord vervalt.
  await payload.update({ collection: 'matches', id: matchId, data: { afgelast: true }, overrideAccess: true })
  const sheet = (await payload.find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
  if (sheet && (sheet.wedstrijdstart as { akkoord?: boolean } | undefined)?.akkoord) {
    await payload.update({ collection: 'matchsheets', id: sheet.id, data: { wedstrijdstart: { akkoord: false, naam: null, tijdstip: null } }, overrideAccess: true })
    await volgBladStatus(payload, matchId)
  }

  const reden = REDEN_TEKST[inv.reden]
  const t = titel(m)
  await meld(payload, [...(await federatieAccounts(payload)).filter((id) => id !== Number(user.id))], {
    titel: `⛈️ Afgelast: ${t}`,
    tekst: `Door de scheidsrechter: ${reden}. Bekijk de foto's en plan een nieuwe datum.`,
    url: '/beheer/afgelastingen',
  })
  const clubAccounts = (await Promise.all(clubs.map((c) => clubStaf(payload, c)))).flat()
  await meld(payload, clubAccounts, { titel: `⛈️ Afgelast: ${t}`, tekst: `${reden}. De federatie plant een nieuwe datum.`, url: `/match/${matchId}` })
  void sendPushToClubs(payload, clubs, { title: `⛈️ Afgelast: ${t}`, body: `${reden}. Nieuwe datum volgt.`, url: `/match/${matchId}`, tag: `afgelast-${matchId}` }).catch(() => null)
  return { ok: true, id: Number(doc.id) }
}

/** De federatie plant een nieuwe datum: de wedstrijd is weer gewoon gepland, de clubs horen het. */
export async function herplannen(payload: Payload, afgelastingId: number, nieuweDatum: string): Promise<Uitkomst> {
  const d = new Date(nieuweDatum)
  if (Number.isNaN(d.getTime())) return { ok: false, status: 400, error: 'Geef een geldige nieuwe datum.' }
  if (d.getTime() < Date.now()) return { ok: false, status: 400, error: 'De nieuwe datum ligt in het verleden.' }
  const a = await payload.findByID({ collection: 'afgelastingen', id: afgelastingId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!a) return { ok: false, status: 404, error: 'Afgelasting niet gevonden.' }
  if (a.status !== 'gemeld') return { ok: false, status: 409, error: 'Deze afgelasting is al behandeld.' }
  const matchId = relId(a.match)
  if (matchId == null) return { ok: false, status: 404, error: 'Wedstrijd niet gevonden.' }
  await payload.update({ collection: 'matches', id: matchId, data: { date: d.toISOString(), afgelast: false }, overrideAccess: true })
  await payload.update({
    collection: 'afgelastingen',
    id: afgelastingId,
    data: { status: 'herpland', nieuweDatum: d.toISOString(), behandeldOp: new Date().toISOString() },
    overrideAccess: true,
  })
  await meldClubs(payload, matchId, `🔁 Nieuwe datum: ${formatDateTimeBE(d.toISOString())}`)
  return { ok: true, id: afgelastingId }
}

/** De federatie trekt de afgelasting in (vergissing): de wedstrijd gaat door zoals gepland. */
export async function afgelastingIntrekken(payload: Payload, afgelastingId: number): Promise<Uitkomst> {
  const a = await payload.findByID({ collection: 'afgelastingen', id: afgelastingId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!a) return { ok: false, status: 404, error: 'Afgelasting niet gevonden.' }
  if (a.status !== 'gemeld') return { ok: false, status: 409, error: 'Deze afgelasting is al behandeld.' }
  const matchId = relId(a.match)
  if (matchId != null) await payload.update({ collection: 'matches', id: matchId, data: { afgelast: false }, overrideAccess: true })
  await payload.update({ collection: 'afgelastingen', id: afgelastingId, data: { status: 'ingetrokken', behandeldOp: new Date().toISOString() }, overrideAccess: true })
  if (matchId != null) await meldClubs(payload, matchId, '✅ Afgelasting ingetrokken: de wedstrijd gaat door zoals gepland.')
  return { ok: true, id: afgelastingId }
}

async function meldClubs(payload: Payload, matchId: number, tekst: string) {
  const m = (await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)) as Wedstrijd | null
  if (!m) return
  const clubs = [clubVan(m.homeTeam), clubVan(m.awayTeam)].filter((c): c is number => c != null)
  const accounts = (await Promise.all(clubs.map((c) => clubStaf(payload, c)))).flat()
  // Ook de toegewezen scheidsrechter (als hij een account heeft).
  const sheet = (await payload.find({ collection: 'matchsheets', where: { match: { equals: matchId } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
  const off = relId(sheet?.assignedReferee)
  const refs = off != null ? (await payload.find({ collection: 'users', where: { official: { equals: off } }, depth: 0, limit: 3, overrideAccess: true })).docs.map((u) => Number(u.id)) : []
  await meld(payload, [...accounts, ...refs], { titel: `${titel(m)}`, tekst, url: `/match/${matchId}` })
  void sendPushToClubs(payload, clubs, { title: titel(m), body: tekst, url: `/match/${matchId}`, tag: `afgelast-${matchId}` }).catch(() => null)
}

export type AfgelastingRij = {
  id: number
  matchId: number
  titel: string
  reeks: string
  oorspronkelijk: string | null
  reden: string
  toelichting: string | null
  scheidsrechter: string | null
  status: string
  nieuweDatum: string | null
  fotos: string[]
  gemeldOp: string
}

/** Afgelastingen met hun foto's (voor de federatie en de scheidsrechterspagina). */
export async function afgelastingenLijst(payload: Payload, where: Record<string, unknown>, limit = 100): Promise<AfgelastingRij[]> {
  const res = await payload.find({ collection: 'afgelastingen', where: where as never, sort: '-createdAt', depth: 2, limit, overrideAccess: true })
  if (!res.docs.length) return []
  const fotos = await payload.find({
    collection: 'afgelasting-fotos',
    where: { afgelasting: { in: res.docs.map((a) => a.id) } },
    depth: 0,
    limit: 600,
    overrideAccess: true,
  })
  return res.docs.map((a) => {
    const m = (a.match && typeof a.match === 'object' ? a.match : { id: a.match }) as Wedstrijd & { reeks?: string | null }
    return {
      id: Number(a.id),
      matchId: Number(m.id),
      titel: titel(m),
      reeks: String(m.reeks ?? ''),
      oorspronkelijk: a.oorspronkelijkeDatum ? String(a.oorspronkelijkeDatum) : null,
      reden: REDEN_TEKST[String(a.reden)] ?? String(a.reden),
      toelichting: a.toelichting ? String(a.toelichting) : null,
      scheidsrechter: a.scheidsrechterNaam ? String(a.scheidsrechterNaam) : null,
      status: String(a.status ?? 'gemeld'),
      nieuweDatum: a.nieuweDatum ? String(a.nieuweDatum) : null,
      fotos: fotos.docs
        .filter((f) => relId(f.afgelasting) === Number(a.id) && f.filename)
        .map((f) => `/api/afgelasting-fotos/file/${encodeURIComponent(String(f.filename))}`),
      gemeldOp: String(a.createdAt),
    }
  })
}
