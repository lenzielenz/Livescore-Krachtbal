import type { Payload } from 'payload'

import { type Aanvraag, type Bron, type Dossier, type WachtOp, ontleedSleutel, sleutelVan } from './aanvragen-bord'
import { meld } from './meldingen'
import type { Dossier as DossierDoc } from '@/payload-types'

// De dossierlaag van het bord (/federatie/aanvragen): wie behandelt wat, op wie wachten we, tegen
// wanneer, notities — en de vrije taken van de federatie. Zie collections/Dossiers.ts voor de
// kernregel: een dossier zegt nooit of een aanvraag afgehandeld is; dat staat in de aanvraag zelf.

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const naamVan = (v: unknown): string => {
  if (!v || typeof v !== 'object') return ''
  const u = v as { name?: unknown; email?: unknown }
  const n = typeof u.name === 'string' ? u.name.trim() : ''
  return n || (typeof u.email === 'string' ? u.email.split('@')[0]! : '')
}

export type Behandelaar = { id: number; naam: string }

/** Wie kan een dossier behandelen: iedereen van de federatie en de admins. */
export async function behandelaars(payload: Payload): Promise<Behandelaar[]> {
  const res = await payload.find({
    collection: 'users',
    where: { or: [{ roles: { contains: 'federatie' } }, { roles: { contains: 'admin' } }] },
    depth: 0,
    limit: 50,
    overrideAccess: true,
  })
  return res.docs
    .map((u) => ({ id: Number(u.id), naam: naamVan(u) || `#${u.id}` }))
    .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
}

function naarView(d: DossierDoc): Dossier {
  const beh = d.behandelaar && typeof d.behandelaar === 'object' ? d.behandelaar : null
  return {
    id: Number(d.id),
    behandelaar: beh ? { id: Number(beh.id), naam: naamVan(beh) } : relId(d.behandelaar) != null ? { id: relId(d.behandelaar)!, naam: '' } : null,
    wachtOp: (d.wachtOp as WachtOp | null | undefined) ?? null,
    wachtOpTekst: d.wachtOpTekst ?? null,
    deadline: d.deadline ?? null,
    notities: (d.notities ?? []).map((n) => ({ door: naamVan(n.door) || '—', op: String(n.op ?? ''), tekst: String(n.tekst ?? '') })),
    afgerondOp: d.afgerondOp ?? null,
  }
}

/** Alle dossiers over aanvragen (niet de vrije taken), per sleutel. Honderden hoogstens: één query. */
export async function dossiersPerSleutel(payload: Payload): Promise<Map<string, Dossier>> {
  const res = await payload.find({
    collection: 'dossiers',
    where: { bron: { not_equals: 'taak' } },
    depth: 1,
    limit: 2000,
    pagination: false,
    overrideAccess: true,
  })
  const m = new Map<string, Dossier>()
  for (const d of res.docs) {
    if (d.bronId == null) continue
    m.set(sleutelVan(d.bron as Bron, Number(d.bronId)), naarView(d))
  }
  return m
}

/** De vrije taken als aanvragen op het bord: open, of afgerond in de laatste `dagenKlaar` dagen. */
export async function takenAlsAanvragen(payload: Payload, dagenKlaar = 14, nu: Date = new Date()): Promise<Aanvraag[]> {
  const grens = new Date(nu.getTime() - dagenKlaar * 86_400_000).toISOString()
  const res = await payload.find({
    collection: 'dossiers',
    where: { and: [{ bron: { equals: 'taak' } }, { or: [{ afgerondOp: { exists: false } }, { afgerondOp: { greater_than_equal: grens } }] }] },
    depth: 1,
    sort: '-createdAt',
    limit: 500,
    pagination: false,
    overrideAccess: true,
  })
  return res.docs.map((d) => {
    const open = !d.afgerondOp
    return {
      sleutel: sleutelVan('taak', Number(d.id)),
      bron: 'taak',
      bronId: Number(d.id),
      titel: String(d.titel ?? 'Taak'),
      detail: String(d.omschrijving ?? ''),
      club: null,
      sinds: String(d.createdAt),
      status: open ? 'Open' : 'Afgerond',
      statusCode: open ? 'open' : 'afgerond',
      open,
      afgeslotenOp: d.afgerondOp ?? null,
      wachtOpAuto: null,
      href: `/federatie/aanvragen?dossier=${sleutelVan('taak', Number(d.id))}`,
      dossier: naarView(d),
    }
  })
}

type Ik = { id: number | string; name?: unknown; email?: unknown }

async function vindOfMaak(payload: Payload, me: Ik, bron: Bron, bronId: number, titel?: string): Promise<DossierDoc> {
  const bestaand = await payload.find({
    collection: 'dossiers',
    where: { and: [{ bron: { equals: bron } }, { bronId: { equals: bronId } }] },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  if (bestaand.docs[0]) return bestaand.docs[0]
  return payload.create({
    collection: 'dossiers',
    data: { bron, bronId, titel: titel?.slice(0, 200) || null, aangemaaktDoor: Number(me.id) },
    overrideAccess: true,
  })
}

export type DossierActie =
  | { actie: 'toewijzen'; behandelaar: number | null }
  | { actie: 'wachten'; wachtOp: WachtOp; tekst?: string }
  | { actie: 'hervatten' }
  | { actie: 'notitie'; tekst: string }
  | { actie: 'deadline'; datum: string | null }
  | { actie: 'afronden' }
  | { actie: 'heropenen' }
  | { actie: 'verwijderen' }

export type Uitkomst = { ok: true; dossier?: Dossier } | { ok: false; status: number; error: string }

/** Eén wijziging aan het dossier van een aanvraag (of taak). Maakt het dossier aan als het nog niet bestaat. */
export async function dossierBijwerken(payload: Payload, me: Ik, sleutel: string, w: DossierActie, titel?: string): Promise<Uitkomst> {
  const s = ontleedSleutel(sleutel)
  if (!s) return { ok: false, status: 400, error: 'Onbekende aanvraag.' }

  let doc: DossierDoc
  if (s.bron === 'taak') {
    const t = await payload.findByID({ collection: 'dossiers', id: s.id, depth: 0, overrideAccess: true }).catch(() => null)
    if (!t || t.bron !== 'taak') return { ok: false, status: 404, error: 'Taak niet gevonden.' }
    doc = t
  } else {
    if (w.actie === 'afronden' || w.actie === 'heropenen' || w.actie === 'verwijderen') {
      return { ok: false, status: 400, error: 'Een aanvraag rond je af via haar eigen knop; enkel een vrije taak kan hier afgerond of verwijderd worden.' }
    }
    doc = await vindOfMaak(payload, me, s.bron, s.id, titel)
  }

  const nu = new Date().toISOString()
  const mijnId = Number(me.id)
  let data: Partial<DossierDoc> = {}
  switch (w.actie) {
    case 'toewijzen': {
      const naar = w.behandelaar == null ? null : Number(w.behandelaar)
      if (naar != null) {
        const u = await payload.findByID({ collection: 'users', id: naar, depth: 0, overrideAccess: true }).catch(() => null)
        const rollen = (u?.roles ?? []) as string[]
        if (!u || !rollen.some((r) => r === 'federatie' || r === 'admin')) return { ok: false, status: 400, error: 'Die persoon zit niet in de federatie.' }
      }
      data = { behandelaar: naar }
      break
    }
    case 'wachten':
      if (!['club', 'scheidsrechter', 'speler', 'extern'].includes(w.wachtOp)) return { ok: false, status: 400, error: 'Op wie wachten we?' }
      data = { wachtOp: w.wachtOp, wachtOpTekst: (w.tekst ?? '').trim().slice(0, 200) || null }
      break
    case 'hervatten':
      data = { wachtOp: null, wachtOpTekst: null }
      break
    case 'notitie': {
      const tekst = (w.tekst ?? '').trim().slice(0, 2000)
      if (!tekst) return { ok: false, status: 400, error: 'Een lege notitie bewaren we niet.' }
      const bestaande = (doc.notities ?? []).map((n) => ({ door: relId(n.door), op: n.op, tekst: n.tekst }))
      data = { notities: [...bestaande, { door: mijnId, op: nu, tekst }] as DossierDoc['notities'] }
      break
    }
    case 'deadline': {
      if (w.datum == null || w.datum === '') {
        data = { deadline: null }
      } else {
        const d = new Date(w.datum)
        if (!Number.isFinite(d.getTime())) return { ok: false, status: 400, error: 'Ongeldige datum.' }
        data = { deadline: d.toISOString() }
      }
      break
    }
    case 'afronden':
      data = { afgerondOp: nu, wachtOp: null, wachtOpTekst: null }
      break
    case 'heropenen':
      data = { afgerondOp: null }
      break
    case 'verwijderen':
      await payload.delete({ collection: 'dossiers', id: doc.id, overrideAccess: true })
      return { ok: true }
  }

  const bijgewerkt = await payload.update({ collection: 'dossiers', id: doc.id, data, depth: 1, overrideAccess: true })

  // Doorgeven aan een collega: die hoort het meteen (🔔 + push), met de link naar het dossier.
  if (w.actie === 'toewijzen' && w.behandelaar != null && Number(w.behandelaar) !== mijnId && Number(w.behandelaar) !== relId(doc.behandelaar)) {
    const wat = titel || doc.titel || 'een aanvraag'
    await meld(payload, [Number(w.behandelaar)], {
      titel: `📌 ${naamVan(me) || 'Een collega'} gaf je een dossier door`,
      tekst: wat,
      url: `/federatie/aanvragen?dossier=${encodeURIComponent(sleutel)}`,
    })
  }
  return { ok: true, dossier: naarView(bijgewerkt) }
}

/** Een vrije taak aanmaken: iets wat de federatie moet doen zonder dat er een aanvraag achter zit. */
export async function taakAanmaken(
  payload: Payload,
  me: Ik,
  t: { titel: string; omschrijving?: string; behandelaar?: number | null; deadline?: string | null },
): Promise<Uitkomst & { sleutel?: string }> {
  const titel = (t.titel ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (titel.length < 3) return { ok: false, status: 400, error: 'Geef de taak een titel.' }
  const deadline = t.deadline ? new Date(t.deadline) : null
  if (deadline && !Number.isFinite(deadline.getTime())) return { ok: false, status: 400, error: 'Ongeldige datum.' }
  const doc = await payload.create({
    collection: 'dossiers',
    data: {
      bron: 'taak',
      titel,
      omschrijving: (t.omschrijving ?? '').trim().slice(0, 2000) || null,
      behandelaar: t.behandelaar ?? null,
      deadline: deadline ? deadline.toISOString() : null,
      aangemaaktDoor: Number(me.id),
    },
    depth: 1,
    overrideAccess: true,
  })
  const sleutel = sleutelVan('taak', Number(doc.id))
  if (t.behandelaar != null && Number(t.behandelaar) !== Number(me.id)) {
    await meld(payload, [Number(t.behandelaar)], {
      titel: `📌 ${naamVan(me) || 'Een collega'} gaf je een taak`,
      tekst: titel,
      url: `/federatie/aanvragen?dossier=${encodeURIComponent(sleutel)}`,
    })
  }
  return { ok: true, dossier: naarView(doc), sleutel }
}
