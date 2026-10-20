import type { Payload } from 'payload'

import { competitionWhere } from './analyse-access'
import { herinneringTekst, herinneringVoor, ledenPerClub, type ClubLedenRij, type Herinnering, type OverzichtLid } from './leden-overzicht'
import { clubStaf, meld } from './meldingen'
import { registratieIcoon } from './registratie'
import { emailVanaf } from './registratie-server'

// Serverkant van het ledenoverzicht (lib/leden-overzicht.ts): alle competitieleden met hun club en
// toestand, en een herinnering versturen naar de staf van één club (🔔 + push, lib/meldingen.ts).

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const dag = (v: unknown) => (v ? String(v).slice(0, 10) : '')

export async function alleLeden(payload: Payload): Promise<OverzichtLid[]> {
  const [res, vanaf] = await Promise.all([
    payload.find({ collection: 'players', where: competitionWhere(), depth: 2, limit: 5000, pagination: false, overrideAccess: true }),
    emailVanaf(payload),
  ])
  return res.docs.map((p) => {
    const team = p.team && typeof p.team === 'object' ? p.team : null
    const club = team?.club && typeof team.club === 'object' ? team.club : null
    const ic = registratieIcoon(
      {
        voornaam: String(p.voornaam ?? ''),
        achternaam: String(p.achternaam ?? ''),
        birthDate: dag(p.birthDate),
        geslacht: String(p.geslacht ?? ''),
        soortLid: String(p.soortLid ?? 'speler'),
        medischeKeuringOp: dag(p.medischeKeuringOp),
        email: String(p.email ?? ''),
        heeftAttest: Boolean(p.medischAttestBestand),
        registratieStatus: String(p.registratieStatus ?? ''),
        vergunningsstatus: String(p.vergunningsstatus ?? 'geen'),
        medischAttest: Boolean(p.medischAttest),
        actief: p.actief !== false,
      },
      undefined,
      vanaf,
    )
    const reden = ic.toon === 'fout' ? String(p.afkeurReden ?? '') : ic.toon === 'todo' ? ic.label.replace(/^Nog aanvullen: /, 'ontbreekt: ').replace(/^Klaar om in te dienen$/, 'klaar, nog niet ingediend') : ''
    return {
      id: Number(p.id),
      naam: String(p.name ?? ''),
      clubId: relId(club) ?? relId(team?.club),
      clubNaam: String(club?.name ?? '—'),
      toon: ic.toon,
      reden,
      keuringOp: dag(p.medischeKeuringOp),
    }
  })
}

export type Ontvanger = { id: number; naam: string; rol: string }

/** Wie de herinnering van deze club krijgt: de club-beheerders en club-medewerkers. */
export async function ontvangersVan(payload: Payload, clubId: number): Promise<Ontvanger[]> {
  const ids = await clubStaf(payload, clubId)
  if (!ids.length) return []
  const res = await payload.find({ collection: 'users', where: { id: { in: ids } }, depth: 0, limit: 100, pagination: false, overrideAccess: true })
  return res.docs.map((u) => ({
    id: Number(u.id),
    naam: String(u.name || u.email || '—'),
    rol: Array.isArray(u.roles) && u.roles.includes('club-beheerder') ? 'clubbeheerder' : 'clubmedewerker',
  }))
}

/** Wanneer kreeg deze club laatst een herinnering? Afgeleid uit de meldingen van haar staf. */
export async function laatstHerinnerd(payload: Payload, ontvangers: number[]): Promise<string | null> {
  if (!ontvangers.length) return null
  const res = await payload.find({
    collection: 'meldingen',
    where: { and: [{ user: { in: ontvangers } }, { titel: { like: 'Herinnering van de federatie' } }] },
    sort: '-createdAt',
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })
  return res.docs[0] ? String(res.docs[0].createdAt) : null
}

export async function herinneringVersturen(
  payload: Payload,
  clubId: number,
): Promise<{ club: ClubLedenRij | null; herinnering: Herinnering | null; aan: Ontvanger[] }> {
  const { clubs } = ledenPerClub(await alleLeden(payload))
  const club = clubs.find((c) => c.clubId === clubId) ?? null
  const herinnering = club ? herinneringVoor(club) : null
  if (!club || !herinnering) return { club, herinnering: null, aan: [] }
  const aan = await ontvangersVan(payload, clubId)
  await meld(payload, aan.map((o) => o.id), { titel: herinnering.titel, tekst: herinneringTekst(herinnering), url: herinnering.url })
  return { club, herinnering, aan }
}
