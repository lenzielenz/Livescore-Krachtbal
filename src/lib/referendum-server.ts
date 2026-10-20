import type { Payload } from 'payload'

import {
  isBelofte,
  PRIJZEN,
  stemgerechtigd,
  telUitslag,
  type Competitie,
  type Kandidaat,
  type StemRegel,
  type UitslagRij,
} from './referendum'
import { buildSeasonStats } from './season-stats'
import { gespeeldPerSpeler } from './speler-deelname'

// Databank-kant van het referendum (regels: lib/referendum.ts).

export type Ronde = {
  id: number
  seizoen: string
  status: 'voorbereiding' | 'open' | 'gesloten' | 'gepubliceerd'
  reeksHeren: string
  reeksDames: string
  minWedstrijden: number
  maxLeeftijdBelofte: number
  peildatum: Date
}

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

export function rondeVan(doc: Record<string, unknown>): Ronde {
  return {
    id: Number(doc.id),
    seizoen: String(doc.seizoen ?? ''),
    status: (doc.status as Ronde['status']) ?? 'voorbereiding',
    reeksHeren: String(doc.reeksHeren || '1NAH'),
    reeksDames: String(doc.reeksDames || '1NAD'),
    minWedstrijden: Number(doc.minWedstrijden) || 5,
    maxLeeftijdBelofte: Number(doc.maxLeeftijdBelofte) || 21,
    peildatum: doc.peildatum ? new Date(String(doc.peildatum)) : new Date(),
  }
}

/** De ronde die nu open staat (of null). */
export async function openRonde(payload: Payload): Promise<Ronde | null> {
  const r = await payload.find({ collection: 'referendum-rondes', where: { status: { equals: 'open' } }, limit: 1, depth: 0, overrideAccess: true })
  return r.docs[0] ? rondeVan(r.docs[0] as unknown as Record<string, unknown>) : null
}

/**
 * Wie doet mee in deze competitie: spelers van de ploegen in die reeks met minstens het minimum aan
 * gespeelde wedstrijden dit seizoen. "Gespeeld" = door de scheidsrechter bevestigd op het blad;
 * voor wedstrijden zonder bevestiging (bv. van vóór het digitale blad) telt een wedstrijd waarin de
 * speler een worp had. Van beide het hoogste, zodat niemand uit de boot valt omdat een blad leeg bleef.
 */
export async function kandidaten(payload: Payload, ronde: Ronde, competitie: Competitie): Promise<Kandidaat[]> {
  const reeks = competitie === 'heren' ? ronde.reeksHeren : ronde.reeksDames
  const ploegen = await payload.find({
    collection: 'teams',
    where: { and: [{ reeks: { equals: reeks } }, { analyseOnly: { not_equals: true } }] },
    depth: 1,
    limit: 100,
    pagination: false,
    overrideAccess: true,
  })
  if (!ploegen.docs.length) return []
  const clubVan = new Map(ploegen.docs.map((t) => [Number(t.id), { id: relId(t.club), naam: t.club && typeof t.club === 'object' ? String(t.club.name ?? '') : '' }]))
  const [spelers, wedstrijden, stats] = await Promise.all([
    payload.find({ collection: 'players', where: { team: { in: [...clubVan.keys()] } }, depth: 0, limit: 3000, pagination: false, overrideAccess: true }),
    payload.find({
      collection: 'matches',
      where: { and: [{ reeks: { equals: reeks } }, { seizoen: { equals: ronde.seizoen } }, { status: { equals: 'finished' } }, { analyseOnly: { not_equals: true } }] },
      depth: 0,
      limit: 2000,
      pagination: false,
      overrideAccess: true,
    }),
    buildSeasonStats(payload, reeks, ronde.seizoen, { analyseOnly: { not_equals: true } }).catch(() => []),
  ])
  const bevestigd = await gespeeldPerSpeler(payload, wedstrijden.docs.map((m) => Number(m.id)))
  const metWorp = new Map(stats.map((s) => [s.playerId, s.matches]))

  const uit: Kandidaat[] = []
  for (const p of spelers.docs) {
    if (p.soortLid === 'lid' || p.actief === false) continue
    const gespeeld = Math.max(bevestigd.get(Number(p.id)) ?? 0, metWorp.get(Number(p.id)) ?? 0)
    if (!stemgerechtigd(gespeeld, ronde.minWedstrijden)) continue
    const club = clubVan.get(relId(p.team) ?? -1)
    uit.push({
      id: Number(p.id),
      naam: String(p.name ?? ''),
      clubId: club?.id ?? null,
      clubNaam: club?.naam ?? '',
      geboortedatum: (p.birthDate as string | null) ?? null,
      gespeeld,
    })
  }
  return uit.sort((a, b) => a.naam.localeCompare(b.naam))
}

export type Stemmer = { speler: Kandidaat; competitie: Competitie }

/** De speler achter dit account, als die mag stemmen in deze ronde. */
export async function stemmerVoor(payload: Payload, user: unknown, ronde: Ronde): Promise<{ stemmer: Stemmer | null; reden?: string; kandidaten: Kandidaat[] }> {
  const spelerId = relId((user as { player?: unknown } | null)?.player)
  if (spelerId == null) return { stemmer: null, reden: 'Je account is niet gekoppeld aan je spelersdossier. Vraag je clubverantwoordelijke om dat te doen (Clubteam).', kandidaten: [] }
  const speler = await payload.findByID({ collection: 'players', id: spelerId, depth: 1, overrideAccess: true }).catch(() => null)
  const reeks = speler?.team && typeof speler.team === 'object' ? speler.team.reeks : null
  const competitie: Competitie | null = reeks === ronde.reeksHeren ? 'heren' : reeks === ronde.reeksDames ? 'dames' : null
  if (!speler || !competitie) return { stemmer: null, reden: `Enkel spelers uit ${ronde.reeksHeren} en ${ronde.reeksDames} stemmen.`, kandidaten: [] }
  const lijst = await kandidaten(payload, ronde, competitie)
  const ik = lijst.find((k) => k.id === spelerId)
  if (!ik) return { stemmer: null, reden: `Je moet minstens ${ronde.minWedstrijden} wedstrijden gespeeld hebben dit seizoen.`, kandidaten: lijst }
  return { stemmer: { speler: ik, competitie }, kandidaten: lijst }
}

export async function bestaandeStem(payload: Payload, rondeId: number, spelerId: number) {
  const r = await payload.find({
    collection: 'referendum-stemmen',
    where: { and: [{ ronde: { equals: rondeId } }, { stemmer: { equals: spelerId } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  return r.docs[0] ?? null
}

export type Uitslag = Record<Competitie, { jaar: UitslagRij[]; belofte: UitslagRij[]; stemmers: number; stemgerechtigd: number }>

export async function uitslagVan(payload: Payload, ronde: Ronde): Promise<Uitslag> {
  const stemmen = await payload.find({ collection: 'referendum-stemmen', where: { ronde: { equals: ronde.id } }, depth: 0, limit: 5000, pagination: false, overrideAccess: true })
  const uit = {} as Uitslag
  for (const competitie of ['heren', 'dames'] as Competitie[]) {
    const lijst = await kandidaten(payload, ronde, competitie)
    const s = stemmen.docs
      .filter((d) => d.competitie === competitie)
      .map((d) => ({
        stemmer: relId(d.stemmer) ?? 0,
        regels: (d.regels ?? []).map((r) => ({ speler: relId(r.speler) ?? 0, punten: Number(r.punten) })) as StemRegel[],
      }))
    const jaar = telUitslag(s, lijst)
    uit[competitie] = {
      jaar,
      belofte: jaar.filter((r) => isBelofte(r, ronde.peildatum, ronde.maxLeeftijdBelofte)),
      stemmers: s.length,
      stemgerechtigd: lijst.length,
    }
  }
  return uit
}

/** De winnaars in het archief (referendum-awards) zetten — zelfde lijst als de Erelijst. */
export async function publiceer(payload: Payload, ronde: Ronde): Promise<{ prijs: string; naam: string }[]> {
  const u = await uitslagVan(payload, ronde)
  const gezet: { prijs: string; naam: string }[] = []
  for (const competitie of ['heren', 'dames'] as Competitie[]) {
    for (const soort of ['jaar', 'belofte'] as const) {
      const winnaar = u[competitie][soort][0]
      if (!winnaar) continue
      const prijs = PRIJZEN[competitie][soort]
      const bestaand = (await payload.find({ collection: 'referendum-awards', where: { prijs: { equals: prijs } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
      const regel = { jaar: ronde.seizoen, naam: winnaar.naam, club: winnaar.clubNaam || '—' }
      if (bestaand) {
        const winnaars = [regel, ...(bestaand.winnaars ?? []).filter((w) => w.jaar !== ronde.seizoen).map((w) => ({ jaar: w.jaar, naam: w.naam, club: w.club }))]
        await payload.update({ collection: 'referendum-awards', id: bestaand.id, data: { winnaars }, overrideAccess: true })
      } else {
        await payload.create({ collection: 'referendum-awards', data: { prijs, winnaars: [regel] }, overrideAccess: true })
      }
      gezet.push({ prijs, naam: winnaar.naam })
    }
  }
  await payload.update({ collection: 'referendum-rondes', id: ronde.id, data: { status: 'gepubliceerd', gepubliceerdOp: new Date().toISOString() }, overrideAccess: true })
  return gezet
}
