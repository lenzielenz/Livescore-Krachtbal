import type { Payload } from 'payload'

import { clubMagBewerken, ontbreektVoorIndienen, type RegistratieInput } from './registratie'

// De schrijfkant van de spelersregistratie (lib/registratie.ts): wat de club en de federatie mogen
// veranderen. Gedeeld door de routes en de integratietest. Alles schrijft met overrideAccess: de
// velden zelf zijn federatie-only (collections/Players.ts), precies zodat ze enkel langs hier wijzigen.

export type Uitkomst = { ok: true; id: number } | { ok: false; status: number; error: string }

type SpelerDoc = Record<string, unknown> & { id: number }

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

/** De ploeg-id's van deze club (competitie; analyse-ploegen tellen niet). */
export async function clubPloegen(payload: Payload, clubId: number | string): Promise<Set<number>> {
  const res = await payload.find({
    collection: 'teams',
    where: { and: [{ club: { equals: clubId } }, { analyseOnly: { not_equals: true } }] },
    depth: 0,
    limit: 500,
    pagination: false,
  })
  return new Set(res.docs.map((t) => Number(t.id)))
}

/** Velden die bepalen of een registratie volledig is, zoals de pure logica ze verwacht. */
export function registratieInput(p: Record<string, unknown>): RegistratieInput {
  return {
    voornaam: p.voornaam as string | null,
    achternaam: p.achternaam as string | null,
    birthDate: p.birthDate as string | null,
    geslacht: p.geslacht as string | null,
    soortLid: p.soortLid as string | null,
    medischeKeuringOp: p.medischeKeuringOp as string | null,
    heeftAttest: relId(p.medischAttestBestand) != null,
    registratieStatus: p.registratieStatus as string | null,
    vergunningsstatus: p.vergunningsstatus as string | null,
    medischAttest: p.medischAttest as boolean | null,
    actief: p.actief as boolean | null,
  }
}

export type LidGegevens = {
  playerId?: number | null
  teamId: number
  voornaam: string
  achternaam: string
  birthDate: string
  geslacht: string
  soortLid: string
  shirtNumber?: number | null
  medischeKeuringOp?: string | null
}

const GESLACHTEN = new Set(['m', 'v'])
const SOORTEN = new Set(['speler', 'lid'])
const isDatum = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(new Date(s).getTime())

/**
 * Een lid toevoegen of bijwerken door de club. Enkel in een ploeg van de eigen club. Terwijl de
 * federatie beslist (status 'ingediend') ligt het lid vast. Na goedkeuring liggen naam,
 * geboortedatum en geslacht vast — die bepalen de vergunning; een nieuwe keuring kan wel.
 */
export async function lidOpslaan(payload: Payload, clubId: number | string, g: LidGegevens): Promise<Uitkomst> {
  const voornaam = g.voornaam.replace(/\s+/g, ' ').trim()
  const achternaam = g.achternaam.replace(/\s+/g, ' ').trim()
  if (!voornaam || !achternaam) return { ok: false, status: 400, error: 'Voornaam en naam zijn verplicht.' }
  if (!isDatum(g.birthDate)) return { ok: false, status: 400, error: 'Geef een geldige geboortedatum.' }
  if (!GESLACHTEN.has(g.geslacht)) return { ok: false, status: 400, error: 'Kies het geslacht.' }
  if (!SOORTEN.has(g.soortLid)) return { ok: false, status: 400, error: 'Kies speler of gewoon lid.' }
  if (g.medischeKeuringOp && !isDatum(g.medischeKeuringOp)) {
    return { ok: false, status: 400, error: 'Geef een geldige keuringsdatum.' }
  }

  const ploegen = await clubPloegen(payload, clubId)
  if (!ploegen.has(Number(g.teamId))) return { ok: false, status: 403, error: 'Deze ploeg hoort niet bij jouw club.' }

  let bestaand: SpelerDoc | null = null
  if (g.playerId != null) {
    bestaand = (await payload
      .findByID({ collection: 'players', id: g.playerId, depth: 0, overrideAccess: true })
      .catch(() => null)) as SpelerDoc | null
    if (!bestaand || !ploegen.has(relId(bestaand.team) ?? -1)) {
      return { ok: false, status: 404, error: 'Lid niet gevonden in jouw club.' }
    }
    if (!clubMagBewerken(bestaand.registratieStatus as string)) {
      return { ok: false, status: 409, error: 'Dit lid ligt bij de federatie ter goedkeuring en kan nu niet gewijzigd worden.' }
    }
    if (bestaand.registratieStatus === 'goedgekeurd' || bestaand.vergunningsstatus === 'geldig') {
      const dag = (v: unknown) => (v ? new Date(String(v)).toISOString().slice(0, 10) : '')
      const gewijzigd =
        (bestaand.voornaam && bestaand.voornaam !== voornaam) ||
        (bestaand.achternaam && bestaand.achternaam !== achternaam) ||
        (bestaand.birthDate && dag(bestaand.birthDate) !== g.birthDate.slice(0, 10)) ||
        (bestaand.geslacht && bestaand.geslacht !== g.geslacht)
      if (gewijzigd) {
        return {
          ok: false,
          status: 409,
          error: 'Naam, geboortedatum en geslacht van een goedgekeurd lid wijzigt enkel de federatie.',
        }
      }
    }
  }

  // Rugnummer: opgegeven, of het eerstvolgende vrije nummer in de ploeg.
  let shirtNumber = g.shirtNumber != null && Number.isFinite(Number(g.shirtNumber)) ? Number(g.shirtNumber) : null
  if (shirtNumber == null) {
    if (bestaand && relId(bestaand.team) === Number(g.teamId)) shirtNumber = Number(bestaand.shirtNumber ?? 0)
    else {
      const ploeg = await payload.find({ collection: 'players', where: { team: { equals: g.teamId } }, depth: 0, limit: 500 })
      shirtNumber = ploeg.docs.reduce((mx, p) => Math.max(mx, Number(p.shirtNumber) || 0), 0) + 1
    }
  }

  const data = {
    team: Number(g.teamId),
    voornaam,
    achternaam,
    birthDate: g.birthDate,
    geslacht: g.geslacht as 'm' | 'v',
    soortLid: g.soortLid as 'speler' | 'lid',
    shirtNumber,
    medischeKeuringOp: g.medischeKeuringOp || null,
  }
  if (bestaand) {
    await payload.update({ collection: 'players', id: bestaand.id, data, overrideAccess: true })
    return { ok: true, id: bestaand.id }
  }
  const nieuw = await payload.create({
    collection: 'players',
    data: { ...data, name: `${voornaam} ${achternaam}`, registratieStatus: 'concept', vergunningsstatus: 'geen' },
    overrideAccess: true,
  })
  return { ok: true, id: Number(nieuw.id) }
}

export type IndienResultaat = { ingediend: number[]; overgeslagen: { id: number; naam: string; reden: string }[] }

/** Leden van de eigen club indienen bij de federatie. Wie nog niet volledig is, wordt overgeslagen (met reden). */
export async function ledenIndienen(
  payload: Payload,
  clubId: number | string,
  playerIds: number[],
  nu: Date = new Date(),
): Promise<IndienResultaat> {
  const ploegen = await clubPloegen(payload, clubId)
  const res = await payload.find({
    collection: 'players',
    where: { id: { in: playerIds } },
    depth: 0,
    limit: playerIds.length || 1,
    overrideAccess: true,
  })
  const uit: IndienResultaat = { ingediend: [], overgeslagen: [] }
  for (const p of res.docs as unknown as SpelerDoc[]) {
    const naam = String(p.name ?? '')
    if (!ploegen.has(relId(p.team) ?? -1)) {
      uit.overgeslagen.push({ id: p.id, naam, reden: 'niet van jouw club' })
      continue
    }
    if (p.registratieStatus === 'ingediend') {
      uit.overgeslagen.push({ id: p.id, naam, reden: 'al ingediend' })
      continue
    }
    const mist = ontbreektVoorIndienen(registratieInput(p), nu)
    if (mist.length) {
      uit.overgeslagen.push({ id: p.id, naam, reden: `nog aanvullen: ${mist.join(', ')}` })
      continue
    }
    const speler = (p.soortLid ?? 'speler') !== 'lid'
    await payload.update({
      collection: 'players',
      id: p.id,
      data: {
        registratieStatus: 'ingediend',
        ingediendOp: nu.toISOString(),
        afkeurReden: null,
        ...(speler && p.vergunningsstatus !== 'geldig' ? { vergunningsstatus: 'aangevraagd' as const } : {}),
      },
      overrideAccess: true,
    })
    uit.ingediend.push(p.id)
  }
  return uit
}

export type Besluit = { besluit: 'goedkeuren' | 'afkeuren'; reden?: string; vergunningsnummers?: Record<string, string> }

/**
 * De federatie beslist over ingediende registraties. Goedkeuren maakt een speler speelgerechtigd
 * (vergunning geldig + medische keuring aanwezig); afkeuren stuurt het lid met een reden terug naar
 * de club. Enkel leden met status 'ingediend' — een dubbele klik beslist niet twee keer.
 */
export async function registratiesBeoordelen(
  payload: Payload,
  beoordelaarId: number | string,
  playerIds: number[],
  b: Besluit,
  nu: Date = new Date(),
): Promise<{ verwerkt: number[]; overgeslagen: number[] }> {
  const reden = (b.reden ?? '').trim()
  if (b.besluit === 'afkeuren' && !reden) throw new Error('Geef een reden voor de afkeuring; de club ziet die.')
  const res = await payload.find({
    collection: 'players',
    where: { id: { in: playerIds } },
    depth: 0,
    limit: playerIds.length || 1,
    overrideAccess: true,
  })
  const verwerkt: number[] = []
  const overgeslagen: number[] = []
  for (const p of res.docs as unknown as SpelerDoc[]) {
    if (p.registratieStatus !== 'ingediend') {
      overgeslagen.push(p.id)
      continue
    }
    const speler = (p.soortLid ?? 'speler') !== 'lid'
    const nummer = b.vergunningsnummers?.[String(p.id)]?.trim()
    const gemeen = { beoordeeldOp: nu.toISOString(), beoordeeldDoor: Number(beoordelaarId) }
    const data =
      b.besluit === 'goedkeuren'
        ? {
            ...gemeen,
            registratieStatus: 'goedgekeurd' as const,
            afkeurReden: null,
            ...(speler ? { vergunningsstatus: 'geldig' as const, medischAttest: true } : {}),
            ...(nummer ? { vergunningsnummer: nummer } : {}),
          }
        : {
            ...gemeen,
            registratieStatus: 'afgekeurd' as const,
            afkeurReden: reden,
            // Nooit goedgekeurd: de aanvraag vervalt. Al speelgerechtigd (bv. een nieuwe keuring
            // die niet in orde is): de federatie beslist apart via de ledenkeuring.
            ...(p.vergunningsstatus === 'aangevraagd' ? { vergunningsstatus: 'geen' as const } : {}),
          }
    await payload.update({ collection: 'players', id: p.id, data, overrideAccess: true })
    verwerkt.push(p.id)
  }
  return { verwerkt, overgeslagen }
}
