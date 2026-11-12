import type { Payload } from 'payload'

import { hasRole, isFederationLevel, userClubId } from './access'
import { categorieVoorGeboortedatum, type AgeCategory } from './age-categories'
import type { AuthedUser } from './api-auth'
import { accountsVanSpeler, clubStaf, federatieAccounts, meld } from './meldingen'
import { seasonFromDate } from './seasons'

// Uitlenen van jeugdspelers (RCVK item 45, collections/Uitleningen.ts).
//
//   1. De uitlenende club stelt de overeenkomst op (speler, adres, de ploeg en dus de competitie waar
//      hij gaat spelen) en tekent.                                   → wacht_ontvanger
//   2. De ontvangende club tekent.                                   → wacht_federatie (op het bord)
//   3. De federatie bevestigt (of weigert, met reden).               → bevestigd / geweigerd
//
// Elke stap verwittigt wie daarna aan zet is; bij de bevestiging krijgen beide clubs, de speler (of zijn
// ouders) en de federatie de overeenkomst (PDF, /api/uitlening/[id]/pdf). Een bevestigde uitlening
// zet de speler op de selectielijst van die ploeg, voor dat seizoen (lib/matchsheet-data.ts). De speler
// blijft lid van zijn club: zijn club en ploeg veranderen niet.
//
// Intrekken: een club zolang de federatie nog niet bevestigde; de federatie altijd (dat beëindigt ook
// een lopende uitlening).

export type UitleenStatus = 'wacht_ontvanger' | 'wacht_federatie' | 'bevestigd' | 'geweigerd' | 'ingetrokken'
export const LOPENDE_STATUSSEN: readonly UitleenStatus[] = ['wacht_ontvanger', 'wacht_federatie', 'bevestigd']
export const UITLEEN_STATUS_LABEL: Record<UitleenStatus, string> = {
  wacht_ontvanger: 'Wacht op de handtekening van de ontvangende club',
  wacht_federatie: 'Ondertekend door beide clubs — bij de federatie',
  bevestigd: 'Bevestigd door de federatie',
  geweigerd: 'Geweigerd door de federatie',
  ingetrokken: 'Ingetrokken',
}

/** Jeugd = tot en met U18 (U20 en senioren zijn geen jeugd). */
const JEUGD: readonly AgeCategory[] = ['U6', 'U8', 'U10', 'U12', 'U14', 'U16', 'U18'] as AgeCategory[]

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const schoon = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
type Fout = { ok: false; status: number; error: string }
const fout = (status: number, error: string): Fout => ({ ok: false, status, error })

/** Puur: de jeugdcategorie van een speler, of null als hij geen jeugdspeler is (of geen geboortedatum heeft). */
export function jeugdCategorie(geboortedatum: unknown, seizoenStartJaar: number): AgeCategory | null {
  const cat = categorieVoorGeboortedatum(geboortedatum as string | null, seizoenStartJaar)
  return cat && JEUGD.includes(cat) ? cat : null
}

/** Puur: past de overeenkomst bij het reglement? Geeft de reden als het niet mag, anders null. */
export function uitleenBezwaar(o: {
  spelerClub: number | null
  naarClub: number | null
  spelerCategorie: AgeCategory | null
  ploegCategorie: string | null
  adres: string
  lopend: boolean
}): string | null {
  if (o.spelerCategorie == null) return 'Enkel jeugdspelers (tot en met U18) kunnen uitgeleend worden (RCVK item 45). Controleer de geboortedatum.'
  if (o.spelerClub == null) return 'De speler hoort bij geen club.'
  if (o.naarClub == null) return 'Die ploeg hoort bij geen club.'
  if (o.spelerClub === o.naarClub) return 'Een uitlening gaat naar een andere club; binnen de eigen club speel je gewoon hoger.'
  if (!o.ploegCategorie || !(JEUGD as readonly string[]).includes(o.ploegCategorie)) return 'Een jeugdspeler wordt uitgeleend aan een jeugdploeg.'
  if (o.adres.length < 5) return 'Het adres van de speler hoort in de overeenkomst.'
  if (o.lopend) return 'Er loopt al een uitlening voor deze speler dit seizoen.'
  return null
}

/** Het lopende seizoen: uit de globale seizoensinstelling, anders uit de datum. */
export async function huidigSeizoen(payload: Payload, nu: Date = new Date()): Promise<{ label: string; startJaar: number }> {
  const g = (await payload.findGlobal({ slug: 'season', depth: 0 }).catch(() => null)) as { startYear?: number } | null
  const startJaar = typeof g?.startYear === 'number' ? g.startYear : Number(seasonFromDate(nu).slice(0, 4))
  return { label: `${startJaar}-${startJaar + 1}`, startJaar }
}

const isStafVan = (user: unknown, club: number | null) =>
  club != null && String(userClubId(user)) === String(club) && hasRole(user, 'club-beheerder', 'club-medewerker')

export type OpstelInvoer = { spelerId?: unknown; naarPloegId?: unknown; adres?: unknown; naam?: unknown }

/** Stap 1: de uitlenende club stelt de overeenkomst op en tekent. */
export async function uitleningOpstellen(payload: Payload, user: AuthedUser, inv: OpstelInvoer, nu: Date = new Date()): Promise<{ ok: true; id: number } | Fout> {
  const spelerId = Number(inv.spelerId)
  const ploegId = Number(inv.naarPloegId)
  if (!Number.isInteger(spelerId) || !Number.isInteger(ploegId)) return fout(400, 'Kies een speler en de ploeg waar hij gaat spelen.')
  const [speler, ploeg] = await Promise.all([
    payload.findByID({ collection: 'players', id: spelerId, depth: 0, overrideAccess: true }).catch(() => null),
    payload.findByID({ collection: 'teams', id: ploegId, depth: 1, overrideAccess: true }).catch(() => null),
  ])
  if (!speler || !ploeg) return fout(404, 'Speler of ploeg niet gevonden.')
  const vanClub = relId(speler.club)
  if (!isStafVan(user, vanClub) && !isFederationLevel(user)) return fout(403, 'Enkel de staf van de club van de speler stelt de overeenkomst op.')
  const naam = schoon(inv.naam, 80)
  if (naam.length < 2) return fout(400, 'Teken de overeenkomst met je naam.')

  const seizoen = await huidigSeizoen(payload, nu)
  const naarClub = relId(ploeg.club)
  const lopend = await payload.count({
    collection: 'uitleningen',
    where: { and: [{ speler: { equals: spelerId } }, { seizoen: { equals: seizoen.label } }, { status: { in: [...LOPENDE_STATUSSEN] } }] },
    overrideAccess: true,
  })
  const cat = jeugdCategorie(speler.birthDate, seizoen.startJaar)
  const adres = schoon(inv.adres, 160)
  const bezwaar = uitleenBezwaar({
    spelerClub: vanClub,
    naarClub,
    spelerCategorie: cat,
    ploegCategorie: (ploeg.category as string | null) ?? null,
    adres,
    lopend: lopend.totalDocs > 0,
  })
  if (bezwaar) return fout(400, bezwaar)

  const clubNaam = (c: unknown) => (c && typeof c === 'object' ? String((c as { name?: unknown }).name ?? '') : '')
  const doc = await payload.create({
    collection: 'uitleningen',
    data: {
      speler: spelerId,
      vanClub: vanClub!,
      naarClub: naarClub!,
      naarPloeg: ploegId,
      seizoen: seizoen.label,
      spelerNaam: String(speler.name ?? ''),
      adres,
      geboortedatum: (speler.birthDate as string | null) ?? null,
      categorie: cat,
      competitie: `${String(ploeg.reeks ?? ploeg.category ?? '')} ${seizoen.label}`.trim(),
      status: 'wacht_ontvanger',
      tekenVan: { door: Number(user.id), naam, op: nu.toISOString() },
    },
    overrideAccess: true,
  })
  await meld(payload, await clubStaf(payload, naarClub), {
    titel: `🤝 Uitlening te ondertekenen: ${String(speler.name ?? 'speler')}`,
    tekst: `Een andere club leent ${String(speler.name ?? 'een jeugdspeler')} uit aan ${String(ploeg.name ?? 'uw ploeg')} (${seizoen.label}). Lees en teken de overeenkomst${clubNaam(ploeg.club) ? ` namens ${clubNaam(ploeg.club)}` : ''}.`,
    url: '/club/uitleningen',
  }).catch(() => 0)
  return { ok: true, id: Number(doc.id) }
}

/** Stap 2: de ontvangende club tekent. Daarna ligt de overeenkomst bij de federatie. */
export async function uitleningTekenen(payload: Payload, user: AuthedUser, id: number, naamIn: unknown, nu: Date = new Date()): Promise<{ ok: true } | Fout> {
  const u = await payload.findByID({ collection: 'uitleningen', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!u) return fout(404, 'Overeenkomst niet gevonden.')
  // Een handtekening is van de club zelf: ook de federatie tekent niet in haar naam.
  if (!isStafVan(user, relId(u.naarClub))) return fout(403, 'Enkel de staf van de ontvangende club tekent.')
  if (u.status !== 'wacht_ontvanger') return fout(409, 'Deze overeenkomst wacht niet (meer) op uw handtekening.')
  const naam = schoon(naamIn, 80)
  if (naam.length < 2) return fout(400, 'Teken de overeenkomst met je naam.')
  await payload.update({
    collection: 'uitleningen',
    id,
    data: { status: 'wacht_federatie', tekenNaar: { door: Number(user.id), naam, op: nu.toISOString() } },
    overrideAccess: true,
  })
  const tekst = `${String(u.spelerNaam)} — ${String(u.competitie ?? u.seizoen)}`
  await meld(payload, await federatieAccounts(payload), {
    titel: '🤝 Uitlening te bevestigen',
    tekst: `${tekst}. Ondertekend door beide clubs.`,
    url: `/federatie/aanvragen?dossier=uitlening:${id}`,
  }).catch(() => 0)
  await meld(payload, await clubStaf(payload, relId(u.vanClub)), {
    titel: `🤝 Uitlening ondertekend door de ontvangende club`,
    tekst: `${tekst}. Nu ligt ze bij de federatie.`,
    url: '/club/uitleningen',
  }).catch(() => 0)
  return { ok: true }
}

async function iedereen(payload: Payload, u: { vanClub: unknown; naarClub: unknown; speler: unknown }): Promise<number[]> {
  const spelerId = relId(u.speler)
  return [
    ...(await clubStaf(payload, relId(u.vanClub))),
    ...(await clubStaf(payload, relId(u.naarClub))),
    ...(spelerId != null ? await accountsVanSpeler(payload, spelerId) : []),
  ]
}

/** Stap 3: de federatie bevestigt of weigert. Bij bevestigen krijgt iedereen de overeenkomst. */
export async function uitleningBehandelen(
  payload: Payload,
  me: AuthedUser,
  id: number,
  actie: 'bevestigen' | 'weigeren',
  toelichting = '',
  nu: Date = new Date(),
): Promise<{ ok: true } | Fout> {
  if (!isFederationLevel(me)) return fout(403, 'Enkel de federatie.')
  const u = await payload.findByID({ collection: 'uitleningen', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!u) return fout(404, 'Overeenkomst niet gevonden.')
  if (u.status !== 'wacht_federatie') return fout(409, u.status === 'wacht_ontvanger' ? 'De ontvangende club moet eerst tekenen.' : 'Deze overeenkomst is al behandeld.')
  const t = toelichting.trim().slice(0, 2000)
  if (actie === 'weigeren' && t.length < 3) return fout(400, 'Geef de reden van de weigering.')
  const status: UitleenStatus = actie === 'bevestigen' ? 'bevestigd' : 'geweigerd'
  await payload.update({
    collection: 'uitleningen',
    id,
    data: { status, behandeldDoor: Number(me.id), behandeldOp: nu.toISOString(), toelichting: t || null },
    overrideAccess: true,
  })
  await meld(payload, await iedereen(payload, u), {
    titel: actie === 'bevestigen' ? `🤝 Uitlening bevestigd: ${String(u.spelerNaam)}` : `🤝 Uitlening geweigerd: ${String(u.spelerNaam)}`,
    tekst:
      actie === 'bevestigen'
        ? `Geldig voor ${String(u.competitie ?? u.seizoen)}. De ondertekende overeenkomst staat bij de uitleningen van de club.`
        : t,
    url: `/club/uitleningen`,
  }).catch(() => 0)
  return { ok: true }
}

/** Intrekken: een club zolang de federatie niet bevestigde, de federatie altijd. */
export async function uitleningIntrekken(payload: Payload, user: AuthedUser, id: number, reden = '', nu: Date = new Date()): Promise<{ ok: true } | Fout> {
  const u = await payload.findByID({ collection: 'uitleningen', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!u) return fout(404, 'Overeenkomst niet gevonden.')
  const fed = isFederationLevel(user)
  const club = isStafVan(user, relId(u.vanClub)) || isStafVan(user, relId(u.naarClub))
  if (!fed && !club) return fout(403, 'Enkel een betrokken club of de federatie.')
  const st = String(u.status)
  if (st === 'geweigerd' || st === 'ingetrokken') return fout(409, 'Deze overeenkomst loopt niet meer.')
  if (st === 'bevestigd' && !fed) return fout(409, 'Een bevestigde uitlening beëindigt enkel de federatie. Vraag het haar.')
  await payload.update({
    collection: 'uitleningen',
    id,
    data: { status: 'ingetrokken', toelichting: reden.trim().slice(0, 2000) || null, ...(fed ? { behandeldDoor: Number(user.id), behandeldOp: nu.toISOString() } : {}) },
    overrideAccess: true,
  })
  const ontvangers = [...(await iedereen(payload, u)), ...(st === 'wacht_federatie' && !fed ? await federatieAccounts(payload) : [])].filter((x) => x !== Number(user.id))
  await meld(payload, ontvangers, {
    titel: `🤝 Uitlening ingetrokken: ${String(u.spelerNaam)}`,
    tekst: reden.trim() || String(u.competitie ?? u.seizoen),
    url: '/club/uitleningen',
  }).catch(() => 0)
  return { ok: true }
}

/** De spelers die dit seizoen bevestigd uitgeleend zijn aan deze ploeg, met de naam van hun eigen club. */
export async function uitgeleendAanPloeg(payload: Payload, ploegId: number, nu: Date = new Date()): Promise<Map<number, string>> {
  const seizoen = await huidigSeizoen(payload, nu)
  const res = await payload.find({
    collection: 'uitleningen',
    where: { and: [{ naarPloeg: { equals: ploegId } }, { seizoen: { equals: seizoen.label } }, { status: { equals: 'bevestigd' } }] },
    depth: 1,
    limit: 50,
    overrideAccess: true,
  })
  return new Map(
    res.docs
      .map((u) => [relId(u.speler), u.vanClub && typeof u.vanClub === 'object' ? String((u.vanClub as { name?: unknown }).name ?? '') : ''] as const)
      .filter((x): x is [number, string] => x[0] != null),
  )
}
