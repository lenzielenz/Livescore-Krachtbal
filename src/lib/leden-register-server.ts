import type { Payload } from 'payload'

import { categorieVoorGeboortedatum } from './age-categories'
import {
  keuringDagen,
  keuringStand,
  type KeuringStand,
  type LidVelden,
  type LedenFilter,
  ledenWhere,
  legeTelling,
  tel,
  type Telling,
  toonVan,
  type Toon,
} from './leden-register'
import { huidigSeizoen } from './uitlening'
import type { AttestLezing } from './medische-kaart-lezen'

// Serverkant van het ledenregister (lib/leden-register.ts). Ontworpen voor duizenden leden:
//   · zoeken en bladeren: één query met paginering en enkel de nodige kolommen, plus één query voor
//     de namen van de ploegen en clubs op die pagina;
//   · tellingen per club: één lichte query over alle leden (enkel de statusvelden), één voor de
//     ploegen, één voor de clubs, één voor de clubstaf, één voor de laatste herinneringen — vijf in
//     totaal, ongeacht het aantal clubs (vroeger twee per club).
//
// De grote lijsten (alle leden, alle ploegen, alle clubstaf) gaan via payload.db.find: rechtstreeks de
// databanklaag, zonder hooks en veldverwerking per document. Voor tellingen is dat niet nodig, en het
// scheelt veel — gemeten op 5000 leden in een server-gerenderde pagina: 22 s via payload.find, 0,14 s zo.
// Toegang controleert de aanroeper (federatie); hier wordt niets teruggegeven dat een lid zelf leest.

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const dag = (v: unknown) => (v ? String(v).slice(0, 10) : '')

const STATUS_VELDEN = {
  team: true,
  soortLid: true,
  actief: true,
  vergunningsstatus: true,
  medischAttest: true,
  registratieStatus: true,
  medischeKeuringOp: true,
} as const

/** De ploegen per club: ploeg → club, en club → ploegen. Eén query. */
export async function ploegenEnClubs(payload: Payload): Promise<{ clubVanPloeg: Map<number, number>; ploegNaam: Map<number, string>; ploegenVanClub: Map<number, number[]> }> {
  const res = await payload.db.find<{ id: number; name?: string | null; club?: unknown }>({ collection: 'teams', limit: 0, pagination: false, select: { name: true, club: true } })
  const clubVanPloeg = new Map<number, number>()
  const ploegNaam = new Map<number, string>()
  const ploegenVanClub = new Map<number, number[]>()
  for (const t of res.docs) {
    const id = Number(t.id)
    ploegNaam.set(id, String(t.name ?? ''))
    const c = relId(t.club)
    if (c == null) continue
    clubVanPloeg.set(id, c)
    ploegenVanClub.set(c, [...(ploegenVanClub.get(c) ?? []), id])
  }
  return { clubVanPloeg, ploegNaam, ploegenVanClub }
}

export type RegisterRij = {
  id: number
  naam: string
  club: string
  clubId: number | null
  ploeg: string
  categorie: string
  geslacht: string
  vergunningsnummer: string
  toon: Toon
  keuring: KeuringStand
  keuringOp: string
  keuringDagen: number | null
  heeftAttest: boolean
  afkeurReden: string
}

export type Sortering = 'naam' | '-naam' | 'keuring' | '-gewijzigd'
const SORT: Record<Sortering, string> = { naam: 'name', '-naam': '-name', keuring: 'medischeKeuringOp', '-gewijzigd': '-updatedAt' }

export async function ledenZoeken(
  payload: Payload,
  f: LedenFilter,
  o: { pagina?: number; perPagina?: number; sort?: Sortering; nu?: Date } = {},
): Promise<{ rijen: RegisterRij[]; totaal: number; pagina: number; paginas: number }> {
  const nu = o.nu ?? new Date()
  // De API vraagt hoogstens 200 per pagina; de export alles in één keer.
  const perPagina = Math.min(Math.max(o.perPagina ?? 50, 1), 100_000)
  const [seizoen, pc] = await Promise.all([huidigSeizoen(payload, nu), ploegenEnClubs(payload)])
  const res = await payload.find({
    collection: 'players',
    where: ledenWhere(f, seizoen.startJaar, nu, f.club != null ? (pc.ploegenVanClub.get(f.club) ?? []) : []),
    sort: SORT[o.sort ?? 'naam'] ?? 'name',
    page: Math.max(1, Math.floor(o.pagina ?? 1)),
    limit: perPagina,
    depth: 0,
    select: {
      ...STATUS_VELDEN,
      name: true,
      birthDate: true,
      geslacht: true,
      vergunningsnummer: true,
      medischAttestBestand: true,
      afkeurReden: true,
    },
    overrideAccess: true,
  })
  const clubIds = [...new Set(res.docs.map((p) => pc.clubVanPloeg.get(relId(p.team) ?? -1)).filter((x): x is number => x != null))]
  const clubs = clubIds.length
    ? await payload.find({ collection: 'clubs', where: { id: { in: clubIds } }, depth: 0, limit: clubIds.length, pagination: false, select: { name: true }, overrideAccess: true })
    : { docs: [] }
  const clubNaam = new Map(clubs.docs.map((c) => [Number(c.id), String(c.name ?? '')]))
  return {
    totaal: res.totalDocs,
    pagina: res.page ?? 1,
    paginas: res.totalPages,
    rijen: res.docs.map((p) => {
      const ploeg = relId(p.team)
      const clubId = ploeg != null ? (pc.clubVanPloeg.get(ploeg) ?? null) : null
      return {
        id: Number(p.id),
        naam: String(p.name ?? ''),
        club: clubId != null ? (clubNaam.get(clubId) ?? '') : '',
        clubId,
        ploeg: ploeg != null ? (pc.ploegNaam.get(ploeg) ?? '') : '',
        categorie: categorieVoorGeboortedatum(p.birthDate as string | null, seizoen.startJaar) ?? '',
        geslacht: String(p.geslacht ?? ''),
        vergunningsnummer: String(p.vergunningsnummer ?? ''),
        toon: toonVan(p),
        keuring: keuringStand(p, nu),
        keuringOp: dag(p.medischeKeuringOp),
        keuringDagen: keuringDagen(p, nu),
        heeftAttest: relId(p.medischAttestBestand) != null,
        afkeurReden: String(p.afkeurReden ?? ''),
      }
    }),
  }
}

export type ClubTelling = Telling & { clubId: number; clubNaam: string; staf: { naam: string; rol: string }[]; laatstHerinnerd: string | null }

/** De tellingen per club en in totaal, plus wie de herinnering krijgt en wanneer de laatste ging. */
export async function ledenTellingen(payload: Payload, nu: Date = new Date()): Promise<{ clubs: ClubTelling[]; totaal: Telling }> {
  const [spelers, pc, clubsRes, stafRes] = await Promise.all([
    payload.db.find<LidVelden & { team?: unknown }>({ collection: 'players', where: { analyseOnly: { not_equals: true } }, limit: 0, pagination: false, select: STATUS_VELDEN }),
    ploegenEnClubs(payload),
    payload.find({ collection: 'clubs', where: { analyseOnly: { not_equals: true } }, depth: 0, limit: 5000, pagination: false, select: { name: true }, overrideAccess: true }),
    payload.db.find<{ id: number; name?: string | null; email?: string | null; roles?: unknown; club?: unknown }>({
      collection: 'users',
      where: { or: [{ roles: { contains: 'club-beheerder' } }, { roles: { contains: 'club-medewerker' } }] },
      limit: 0,
      pagination: false,
      select: { name: true, email: true, roles: true, club: true },
    }),
  ])
  const totaal = legeTelling()
  const perClub = new Map<number, Telling>()
  for (const p of spelers.docs) {
    const club = pc.clubVanPloeg.get(relId(p.team) ?? -1)
    tel(totaal, p, nu)
    if (club == null) continue
    const t = perClub.get(club) ?? legeTelling()
    tel(t, p, nu)
    perClub.set(club, t)
  }

  const stafVan = new Map<number, { id: number; naam: string; rol: string }[]>()
  for (const u of stafRes.docs) {
    const c = relId(u.club)
    if (c == null) continue
    const rollen = Array.isArray(u.roles) ? (u.roles as string[]) : []
    stafVan.set(c, [...(stafVan.get(c) ?? []), { id: Number(u.id), naam: String(u.name || u.email || '—'), rol: rollen.includes('club-beheerder') ? 'clubbeheerder' : 'clubmedewerker' }])
  }
  const alleStaf = [...stafVan.values()].flat().map((s) => s.id)
  const laatste = new Map<number, string>()
  if (alleStaf.length) {
    const m = await payload.find({
      collection: 'meldingen',
      where: { and: [{ user: { in: alleStaf } }, { titel: { like: 'Herinnering van de federatie' } }] },
      sort: '-createdAt',
      depth: 0,
      limit: 5000,
      pagination: false,
      select: { user: true, createdAt: true },
      overrideAccess: true,
    })
    for (const r of m.docs) {
      const u = relId(r.user)
      if (u != null && !laatste.has(u)) laatste.set(u, String(r.createdAt))
    }
  }

  const clubs: ClubTelling[] = clubsRes.docs
    .map((c) => {
      const id = Number(c.id)
      const staf = stafVan.get(id) ?? []
      const data = staf.map((s) => laatste.get(s.id)).filter((x): x is string => Boolean(x)).sort()
      return {
        ...(perClub.get(id) ?? legeTelling()),
        clubId: id,
        clubNaam: String(c.name ?? ''),
        staf: staf.map((s) => ({ naam: s.naam, rol: s.rol })),
        laatstHerinnerd: data.length ? data[data.length - 1]! : null,
      }
    })
    .filter((c) => c.totaal > 0 || c.staf.length > 0)
  return { clubs, totaal }
}

export type LidDossier = {
  id: number
  naam: string
  voornaam: string
  achternaam: string
  geboortedatum: string
  categorie: string
  geslacht: string
  email: string
  ouderEmail: string
  ouder2Email: string
  club: { id: number | null; naam: string }
  ploeg: { id: number | null; naam: string }
  rugnummer: number | null
  soortLid: string
  vergunningsnummer: string
  vergunningsstatus: string
  registratieStatus: string
  ingediendOp: string
  beoordeeldOp: string
  afkeurReden: string
  hogerSpelenVerbod: boolean
  medischAttest: boolean
  actief: boolean
  toon: Toon
  keuring: KeuringStand
  keuringOp: string
  keuringDagen: number | null
  vernieuwdNaBeoordeling: boolean
  attest: { url: string; op: string; viaQr: boolean; lezing: AttestLezing | null } | null
  login: boolean
  ouderLogin: boolean
  kaarten: { status: string; op: string }[]
  ongevallen: { id: number; titel: string; status: string; op: string }[]
  uitleningen: { id: number; status: string; competitie: string; naar: string }[]
  sancties: { aantal: number; reden: string; op: string }[]
}

/** Alles over één lid op één plek: gegevens, status, documenten, dossiers. */
export async function lidDossier(payload: Payload, id: number, nu: Date = new Date()): Promise<LidDossier | null> {
  const p = await payload.findByID({ collection: 'players', id, depth: 2, overrideAccess: true }).catch(() => null)
  if (!p) return null
  const ploeg = p.team && typeof p.team === 'object' ? p.team : null
  const club = ploeg?.club && typeof ploeg.club === 'object' ? ploeg.club : null
  const attest = p.medischAttestBestand && typeof p.medischAttestBestand === 'object' ? p.medischAttestBestand : null
  const seizoen = await huidigSeizoen(payload, nu)
  const [users, ouders, kaarten, ongevallen, uitleningen, sancties] = await Promise.all([
    payload.count({ collection: 'users', where: { player: { equals: id } }, overrideAccess: true }),
    payload.count({ collection: 'users', where: { kinderen: { in: [id] } }, overrideAccess: true }),
    payload.find({ collection: 'medische-kaart-aanvragen', where: { player: { equals: id } }, sort: '-createdAt', depth: 0, limit: 10, overrideAccess: true }),
    payload.find({ collection: 'accidents', where: { player: { equals: id } }, sort: '-createdAt', depth: 0, limit: 20, overrideAccess: true }),
    payload.find({ collection: 'uitleningen', where: { speler: { equals: id } }, sort: '-createdAt', depth: 1, limit: 10, overrideAccess: true }),
    payload.find({ collection: 'sanctions', where: { player: { equals: id } }, sort: '-createdAt', depth: 0, limit: 20, overrideAccess: true }),
  ])
  const naam = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')
  return {
    id,
    naam: String(p.name ?? ''),
    voornaam: String(p.voornaam ?? ''),
    achternaam: String(p.achternaam ?? ''),
    geboortedatum: dag(p.birthDate),
    categorie: categorieVoorGeboortedatum(p.birthDate as string | null, seizoen.startJaar) ?? '',
    geslacht: String(p.geslacht ?? ''),
    email: String(p.email ?? ''),
    ouderEmail: String(p.ouderEmail ?? ''),
    ouder2Email: String(p.ouder2Email ?? ''),
    club: { id: relId(club) ?? relId(ploeg?.club), naam: String(club?.name ?? '') },
    ploeg: { id: relId(ploeg), naam: String(ploeg?.name ?? '') },
    rugnummer: p.shirtNumber != null ? Number(p.shirtNumber) : null,
    soortLid: String(p.soortLid ?? 'speler'),
    vergunningsnummer: String(p.vergunningsnummer ?? ''),
    vergunningsstatus: String(p.vergunningsstatus ?? 'geen'),
    registratieStatus: String(p.registratieStatus ?? ''),
    ingediendOp: dag(p.ingediendOp),
    beoordeeldOp: dag(p.beoordeeldOp),
    afkeurReden: String(p.afkeurReden ?? ''),
    hogerSpelenVerbod: Boolean(p.hogerSpelenVerbod),
    medischAttest: Boolean(p.medischAttest),
    actief: p.actief !== false,
    toon: toonVan(p),
    keuring: keuringStand(p, nu),
    keuringOp: dag(p.medischeKeuringOp),
    keuringDagen: keuringDagen(p, nu),
    // Een keuring die de club na de goedkeuring vernieuwde: de federatie zag dat attest nog niet.
    vernieuwdNaBeoordeling: Boolean(p.beoordeeldOp && p.medischeKeuringOp && dag(p.medischeKeuringOp) > dag(p.beoordeeldOp)),
    attest: attest?.filename ? { url: `/api/medische-attesten/file/${encodeURIComponent(String(attest.filename))}`, op: dag(attest.createdAt), viaQr: Boolean(attest.herkendViaQr), lezing: (attest.lezing as AttestLezing | null) ?? null } : null,
    login: users.totalDocs > 0,
    ouderLogin: ouders.totalDocs > 0,
    kaarten: kaarten.docs.map((k) => ({ status: String(k.status ?? ''), op: dag(k.createdAt) })),
    ongevallen: ongevallen.docs.map((a) => ({ id: Number(a.id), titel: String(a.titel ?? 'Ongeval'), status: String(a.status ?? ''), op: dag((a as { ongevalDatum?: unknown }).ongevalDatum ?? a.createdAt) })),
    uitleningen: uitleningen.docs.map((u) => ({ id: Number(u.id), status: String(u.status ?? ''), competitie: String(u.competitie ?? u.seizoen ?? ''), naar: naam(u.naarClub) })),
    sancties: sancties.docs.map((s) => ({ aantal: Number(s.aantal ?? 0), reden: String((s as { reden?: unknown }).reden ?? ''), op: dag(s.createdAt) })),
  }
}

/** CSV (puntkomma, BOM) van het register met het huidige filter. Geen medische bestanden, enkel de status. */
export function registerCsv(rijen: RegisterRij[]): string {
  const kop = ['Naam', 'Club', 'Ploeg', 'Categorie', 'Geslacht', 'Vergunningsnummer', 'Toestand', 'Keuring op', 'Keuring']
  const cel = (v: unknown) => {
    const s = String(v ?? '')
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lijnen = rijen.map((r) => [r.naam, r.club, r.ploeg, r.categorie, r.geslacht, r.vergunningsnummer, r.toon, r.keuringOp, r.keuring].map(cel).join(';'))
  return '﻿' + [kop.join(';'), ...lijnen].join('\r\n')
}
