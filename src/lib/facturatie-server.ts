import type { Payload, Where } from 'payload'

import { boeteBehandelen, scheidsrechterskosten } from './boetes'
import { dateStrBE, formatDateBE, shiftDateStr } from './datetime'
import { withDbLock } from './db-lock'
import {
  bankSleutel,
  type Betaalbeeld,
  betaalstand,
  centen,
  type FactuurStatus,
  factuurNummer,
  factuurTotaal,
  type Lijn,
  leesBankCsv,
  ogmOpmaken,
  ogmVoor,
} from './facturatie'
import { clubStaf, meld, relId } from './meldingen'
import { clubPloegen } from './registratie-server'
import { formatEuro } from './vergoeding'
import { huidigSeizoen } from './uitlening'

// Facturatie aan de clubs: concepten opmaken uit wat de club verschuldigd is (aansluitingen, opgelegde boetes,
// scheidsrechterskosten), versturen met doorlopend nummer, betalingen registreren (manueel, bankafschrift,
// online via Mollie) en per factuur berekenen hoe ze ervoor staat. Zie lib/facturatie.ts voor de regels.

export type Fout = { ok: false; status: number; error: string }
const fout = (status: number, error: string): Fout => ({ ok: false, status, error })

export type FactuurInstellingen = {
  naam: string
  adres: string
  ondernemingsnummer: string
  iban: string
  bic: string
  btwVermelding: string
  termijnDagen: number
  lidgeldSpeler: number
  lidgeldLid: number
}

export async function factuurInstellingen(payload: Payload): Promise<FactuurInstellingen> {
  const s = ((await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)) ?? {}) as Record<string, unknown>
  const getal = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
  return {
    naam: String(s.factuurNaam ?? '') || 'KVKBF vzw',
    adres: String(s.factuurAdres ?? ''),
    ondernemingsnummer: String(s.factuurOndernemingsnummer ?? ''),
    iban: String(s.factuurIban ?? ''),
    bic: String(s.factuurBic ?? ''),
    btwVermelding: String(s.factuurBtwVermelding ?? ''),
    termijnDagen: getal(s.betaaltermijnDagen, 30),
    lidgeldSpeler: getal(s.lidgeldSpeler, 0),
    lidgeldLid: getal(s.lidgeldLid, 0),
  }
}

// ── Wat is er al gefactureerd? ──────────────────────────────────────────────────────────────────────

type FactuurDoc = {
  id: number
  club: unknown
  status: FactuurStatus
  nummer?: string | null
  ogm?: string | null
  seizoen?: string | null
  datum?: string | null
  vervaldatum?: string | null
  lijnen?: Lijn[] | null
  totaal?: number | null
  opmerking?: string | null
  annuleerReden?: string | null
}

const lijnenVan = (f: { lijnen?: unknown }): Lijn[] => (Array.isArray(f.lijnen) ? (f.lijnen as Lijn[]) : [])

/** De sleutels die al op een (niet-geannuleerde) factuur van deze club staan: die komen nooit opnieuw. */
async function gefactureerd(payload: Payload, clubId: number): Promise<Set<string>> {
  const res = await payload.find({
    collection: 'facturen',
    where: { and: [{ club: { equals: clubId } }, { status: { not_equals: 'geannuleerd' } }] },
    depth: 0,
    limit: 1000,
    pagination: false,
    overrideAccess: true,
  })
  const uit = new Set<string>()
  for (const f of res.docs) for (const l of lijnenVan(f)) for (const k of l.sleutels ?? []) uit.add(k)
  return uit
}

export type Opmaak = { aansluitingen: boolean; boetes: boolean; scheidsrechters: boolean }

/** De lijnen die deze club nu verschuldigd is en nog niet gefactureerd werden. */
export async function voorgesteldeLijnen(payload: Payload, clubId: number, o: Opmaak): Promise<{ lijnen: Lijn[]; seizoen: string }> {
  const [al, inst, seizoen] = await Promise.all([gefactureerd(payload, clubId), factuurInstellingen(payload), huidigSeizoen(payload)])
  const lijnen: Lijn[] = []

  if (o.aansluitingen && (inst.lidgeldSpeler > 0 || inst.lidgeldLid > 0)) {
    // Aangesloten = goedgekeurd door de federatie, actief, geen analyse-speler. Oudere leden hebben geen
    // players.club: de club volgt dan uit de ploeg.
    const ploegen = [...(await clubPloegen(payload, clubId))]
    const leden = await payload.db.find<{ id: number; soortLid?: string | null; vergunningsstatus?: string | null; registratieStatus?: string | null }>({
      collection: 'players',
      where: {
        and: [
          { or: [{ club: { equals: clubId } }, ...(ploegen.length ? [{ team: { in: ploegen } }] : [])] },
          { or: [{ actief: { equals: true } }, { actief: { exists: false } }] },
          { analyseOnly: { not_equals: true } },
        ],
      } as Where,
      limit: 0,
      pagination: false,
      select: { soortLid: true, vergunningsstatus: true, registratieStatus: true },
    })
    const spelers: string[] = []
    const gewoon: string[] = []
    for (const p of leden.docs) {
      const k = `aansluiting:${seizoen.label}:${p.id}`
      if (al.has(k)) continue
      if ((p.soortLid ?? 'speler') === 'lid') {
        if (p.registratieStatus === 'goedgekeurd') gewoon.push(k)
      } else if (p.vergunningsstatus === 'geldig') spelers.push(k)
    }
    if (inst.lidgeldSpeler > 0 && spelers.length)
      lijnen.push({ soort: 'aansluiting', omschrijving: `Aansluiting spelers seizoen ${seizoen.label}`, aantal: spelers.length, eenheidsprijs: inst.lidgeldSpeler, sleutels: spelers })
    if (inst.lidgeldLid > 0 && gewoon.length)
      lijnen.push({ soort: 'aansluiting', omschrijving: `Aansluiting gewone leden seizoen ${seizoen.label}`, aantal: gewoon.length, eenheidsprijs: inst.lidgeldLid, sleutels: gewoon })
  }

  if (o.boetes) {
    const boetes = await payload.find({
      collection: 'boetes',
      where: { and: [{ club: { equals: clubId } }, { status: { in: ['opgelegd', 'betaling_gemeld'] } }] },
      sort: 'opgelegdOp',
      depth: 0,
      limit: 500,
      pagination: false,
      overrideAccess: true,
    })
    for (const b of boetes.docs) {
      const k = `boete:${b.id}`
      if (al.has(k)) continue
      const op = b.opgelegdOp ? ` (${formatDateBE(String(b.opgelegdOp))})` : ''
      lijnen.push({ soort: 'boete', omschrijving: `Boete: ${String(b.omschrijving ?? '')}${op}`, aantal: 1, eenheidsprijs: Number(b.bedrag ?? 0), sleutels: [k] })
    }
  }

  if (o.scheidsrechters) {
    const start = new Date(Date.UTC(seizoen.startJaar, 5, 30, 22)).toISOString()
    const kosten = await scheidsrechterskosten(payload, clubId, start)
    for (const r of kosten.rijen) {
      const k = `scheidsrechter:${r.soort}:${r.matchId}`
      if (al.has(k) || r.bedrag <= 0) continue
      lijnen.push({
        soort: 'scheidsrechter',
        omschrijving: `${r.soort === 'forfait' ? 'Onkosten scheidsrechter bij forfait' : 'Scheidsrechterskosten'}: ${r.titel} (${formatDateBE(r.datum)})${r.aandeel < 1 ? ' — helft' : ''}`,
        aantal: 1,
        eenheidsprijs: r.bedrag,
        sleutels: [k],
      })
    }
  }
  return { lijnen, seizoen: seizoen.label }
}

/** Voor één club (of alle clubs) een conceptfactuur maken met wat ze verschuldigd is. Lege clubs krijgen niets. */
export async function conceptenMaken(payload: Payload, userId: number, o: Opmaak & { clubs?: number[] }): Promise<{ gemaakt: number[]; leeg: number }> {
  const clubs = o.clubs?.length
    ? o.clubs
    : (await payload.find({ collection: 'clubs', where: { analyseOnly: { not_equals: true } }, depth: 0, limit: 1000, pagination: false, overrideAccess: true })).docs.map((c) => Number(c.id))
  const gemaakt: number[] = []
  let leeg = 0
  for (const clubId of clubs) {
    // Er staat al een concept voor deze club: dat vullen we niet dubbel (zijn sleutels tellen al mee).
    const { lijnen, seizoen } = await voorgesteldeLijnen(payload, clubId, o)
    if (!lijnen.length) {
      leeg++
      continue
    }
    const f = await payload.create({
      collection: 'facturen',
      data: { club: clubId, status: 'concept', seizoen, lijnen: lijnen as never, totaal: factuurTotaal(lijnen), gemaaktDoor: userId } as never,
      overrideAccess: true,
    })
    gemaakt.push(Number(f.id))
  }
  return { gemaakt, leeg }
}

/** Nakijken van lijnen die de federatie zelf invoert of aanpast. */
export function lijnenUit(invoer: unknown): Lijn[] | null {
  if (!Array.isArray(invoer) || invoer.length > 500) return null
  const uit: Lijn[] = []
  for (const r of invoer as Record<string, unknown>[]) {
    const omschrijving = String(r?.omschrijving ?? '').trim().slice(0, 200)
    const aantal = Number(r?.aantal)
    const eenheidsprijs = Number(r?.eenheidsprijs)
    const soort = ['aansluiting', 'boete', 'scheidsrechter', 'ander'].includes(String(r?.soort)) ? (r.soort as Lijn['soort']) : 'ander'
    if (!omschrijving || !Number.isFinite(aantal) || aantal <= 0 || aantal > 100_000 || !Number.isFinite(eenheidsprijs) || Math.abs(eenheidsprijs) > 1_000_000) return null
    const sleutels = Array.isArray(r?.sleutels) ? (r.sleutels as unknown[]).map(String).filter((k) => /^[a-z]+:[\w:.-]+$/i.test(k)).slice(0, 5000) : []
    uit.push({ soort, omschrijving, aantal, eenheidsprijs: Math.round(eenheidsprijs * 100) / 100, sleutels })
  }
  return uit
}

const laad = (payload: Payload, id: number) =>
  payload.findByID({ collection: 'facturen', id, depth: 0, overrideAccess: true }).then((f) => f as unknown as FactuurDoc).catch(() => null)

/** Een concept aanpassen (lijnen en opmerking). Een verstuurde factuur nooit. */
export async function conceptBewerken(payload: Payload, id: number, inv: { lijnen?: unknown; opmerking?: unknown }): Promise<{ ok: true } | Fout> {
  const f = await laad(payload, id)
  if (!f) return fout(404, 'Factuur niet gevonden.')
  if (f.status !== 'concept') return fout(409, 'Een verstuurde factuur verandert niet meer. Annuleer ze en maak een nieuwe.')
  const lijnen = inv.lijnen !== undefined ? lijnenUit(inv.lijnen) : lijnenVan(f)
  if (!lijnen) return fout(400, 'Elke lijn heeft een omschrijving, een aantal en een prijs.')
  if (factuurTotaal(lijnen) < 0) return fout(400, 'Het totaal van een factuur kan niet negatief zijn.')
  await payload.update({
    collection: 'facturen',
    id,
    data: { lijnen: lijnen as never, totaal: factuurTotaal(lijnen), ...(inv.opmerking !== undefined ? { opmerking: String(inv.opmerking ?? '').slice(0, 1000) } : {}) } as never,
    overrideAccess: true,
  })
  return { ok: true }
}

export async function conceptVerwijderen(payload: Payload, id: number): Promise<{ ok: true } | Fout> {
  const f = await laad(payload, id)
  if (!f) return fout(404, 'Factuur niet gevonden.')
  if (f.status !== 'concept') return fout(409, 'Enkel een concept kan verwijderd worden; een verstuurde factuur annuleer je.')
  await payload.delete({ collection: 'facturen', id, overrideAccess: true })
  return { ok: true }
}

/**
 * Versturen: doorlopend nummer (geen gaten, ook niet als twee federatieleden tegelijk versturen — onder een
 * slot), gestructureerde mededeling, factuurdatum vandaag en vervaldatum na de betaaltermijn. De club krijgt
 * een melding. Daarna verandert de factuur niet meer.
 */
export async function factuurVersturen(payload: Payload, id: number, nu: Date = new Date()): Promise<{ ok: true; nummer: string } | Fout> {
  const inst = await factuurInstellingen(payload)
  const jaar = Number(dateStrBE(nu).slice(0, 4))
  const r = await withDbLock(payload, 'factuurnummer', jaar, async (): Promise<{ ok: true; nummer: string } | Fout> => {
    const f = await laad(payload, id)
    if (!f) return fout(404, 'Factuur niet gevonden.')
    if (f.status !== 'concept') return fout(409, 'Deze factuur is al verstuurd.')
    if (!lijnenVan(f).length || Number(f.totaal ?? 0) <= 0) return fout(400, 'Een factuur zonder bedrag verstuur je niet.')
    const laatste = await payload.find({ collection: 'facturen', where: { jaar: { equals: jaar } }, sort: '-volgnr', limit: 1, depth: 0, overrideAccess: true })
    const volgnr = Number(laatste.docs[0]?.volgnr ?? 0) + 1
    const nummer = factuurNummer(jaar, volgnr)
    const datum = dateStrBE(nu)
    await payload.update({
      collection: 'facturen',
      id,
      data: { status: 'verstuurd', jaar, volgnr, nummer, ogm: ogmVoor(jaar, volgnr), datum, vervaldatum: shiftDateStr(datum, inst.termijnDagen), verstuurdOp: nu.toISOString() } as never,
      overrideAccess: true,
    })
    return { ok: true, nummer }
  })
  if (r.ok) {
    const f = (await laad(payload, id))!
    await meld(payload, await clubStaf(payload, relId(f.club)), {
      titel: `🧾 Nieuwe factuur ${r.nummer}`,
      tekst: `${formatEuro(Number(f.totaal ?? 0))}, te betalen vóór ${formatDateBE(String(f.vervaldatum))} met mededeling ${f.ogm}.`,
      url: '/club/facturen',
    })
  }
  return r
}

/** Annuleren (een verstuurde factuur verdwijnt nooit: ze blijft met haar nummer, als geannuleerd). */
export async function factuurAnnuleren(payload: Payload, id: number, reden: string): Promise<{ ok: true } | Fout> {
  const f = await laad(payload, id)
  if (!f) return fout(404, 'Factuur niet gevonden.')
  if (f.status !== 'verstuurd') return fout(409, 'Enkel een verstuurde factuur kan geannuleerd worden.')
  const r = reden.trim().slice(0, 300)
  if (r.length < 3) return fout(400, 'Geef een reden.')
  const betaald = await payload.count({ collection: 'betalingen', where: { factuur: { equals: id } }, overrideAccess: true })
  if (betaald.totalDocs) return fout(409, 'Er staan betalingen op deze factuur. Schrap die eerst (of laat ze staan en maak een creditlijn op een volgende factuur).')
  await payload.update({ collection: 'facturen', id, data: { status: 'geannuleerd', geannuleerdOp: new Date().toISOString(), annuleerReden: r } as never, overrideAccess: true })
  await meld(payload, await clubStaf(payload, relId(f.club)), { titel: `🧾 Factuur ${f.nummer} geannuleerd`, tekst: r, url: '/club/facturen' })
  return { ok: true }
}

// ── Betalingen ───────────────────────────────────────────────────────────────────────────────────────

async function betalingenVan(payload: Payload, factuurIds: number[]): Promise<Map<number, { bedrag: number }[]>> {
  const per = new Map<number, { bedrag: number }[]>()
  if (!factuurIds.length) return per
  const res = await payload.find({ collection: 'betalingen', where: { factuur: { in: factuurIds } }, depth: 0, limit: 0, pagination: false, overrideAccess: true })
  for (const b of res.docs) {
    const f = relId(b.factuur)
    if (f == null) continue
    per.set(f, [...(per.get(f) ?? []), { bedrag: Number(b.bedrag ?? 0) }])
  }
  return per
}

/** Hoe staat deze factuur ervoor? (Altijd uit de betalingen.) */
export async function factuurBeeld(payload: Payload, id: number, nu: Date = new Date()): Promise<Betaalbeeld | null> {
  const f = await laad(payload, id)
  if (!f) return null
  return betaalstand({ status: f.status, totaal: Number(f.totaal ?? 0), vervaldatum: f.vervaldatum }, (await betalingenVan(payload, [id])).get(id) ?? [], nu)
}

export type BetalingInvoer = {
  factuurId: number
  bedrag: number
  datum: string
  bron: 'manueel' | 'bank' | 'online'
  sleutel?: string | null
  mededeling?: string | null
  tegenpartij?: string | null
  opmerking?: string | null
  userId?: number | null
}

/**
 * Een betaling registreren. Is de factuur daarmee volledig betaald, dan worden de boetes erop afgeboekt (de
 * boete-flow van de club kent zo ook "betaald") en krijgt de club een melding. Dezelfde bankregel of online
 * betaling (zelfde sleutel) telt maar één keer.
 */
export async function betalingRegistreren(payload: Payload, b: BetalingInvoer): Promise<{ ok: true; id: number; stand: Betaalbeeld } | Fout> {
  const f = await laad(payload, b.factuurId)
  if (!f) return fout(404, 'Factuur niet gevonden.')
  if (f.status !== 'verstuurd') return fout(409, 'Enkel op een verstuurde factuur kan betaald worden.')
  if (!Number.isFinite(b.bedrag) || centen(b.bedrag) <= 0) return fout(400, 'Geef een bedrag groter dan nul.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.datum) || Number.isNaN(Date.parse(b.datum))) return fout(400, 'Geef de datum van de betaling.')
  if (b.sleutel) {
    const al = await payload.count({ collection: 'betalingen', where: { sleutel: { equals: b.sleutel } }, overrideAccess: true })
    if (al.totalDocs) return fout(409, 'Deze betaling is al geregistreerd.')
  }
  const voor = (await factuurBeeld(payload, f.id))!
  const doc = await payload.create({
    collection: 'betalingen',
    data: {
      factuur: f.id,
      club: relId(f.club),
      bedrag: Math.round(b.bedrag * 100) / 100,
      datum: b.datum,
      bron: b.bron,
      sleutel: b.sleutel ?? null,
      mededeling: b.mededeling?.slice(0, 200) ?? null,
      tegenpartij: b.tegenpartij?.slice(0, 120) ?? null,
      opmerking: b.opmerking?.slice(0, 300) ?? null,
      geregistreerdDoor: b.userId ?? null,
    } as never,
    overrideAccess: true,
  })
  const na = (await factuurBeeld(payload, f.id))!
  if (na.stand === 'betaald' && voor.stand !== 'betaald') {
    for (const l of lijnenVan(f)) {
      for (const k of l.sleutels ?? []) {
        const m = /^boete:(\d+)$/.exec(k)
        if (m) await boeteBehandelen(payload, Number(m[1]), 'betaald').catch(() => null)
      }
    }
    await meld(payload, await clubStaf(payload, relId(f.club)), { titel: `✅ Factuur ${f.nummer} betaald`, tekst: `${formatEuro(na.totaal)} ontvangen. Bedankt!`, url: '/club/facturen' })
  }
  return { ok: true, id: Number(doc.id), stand: na }
}

/** Een betaling schrappen (een vergissing). De factuur staat daarna weer open voor dat bedrag. */
export async function betalingSchrappen(payload: Payload, id: number): Promise<{ ok: true } | Fout> {
  const b = await payload.findByID({ collection: 'betalingen', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!b) return fout(404, 'Betaling niet gevonden.')
  await payload.delete({ collection: 'betalingen', id, overrideAccess: true })
  return { ok: true }
}

// ── Bankafschrift ────────────────────────────────────────────────────────────────────────────────────

export type BankVoorstel = {
  datum: string
  bedrag: number
  mededeling: string
  tegenpartij: string
  sleutel: string
  factuur: { id: number; nummer: string; club: string; open: number } | null
  status: 'koppelen' | 'al-geboekt' | 'geen-factuur'
}

/** Leest een bankafschrift (CSV) en zegt per binnenkomende betaling bij welke factuur ze hoort. Schrijft niets. */
export async function bankVoorbeeld(payload: Payload, csv: string): Promise<BankVoorstel[] | Fout> {
  let regels
  try {
    regels = leesBankCsv(csv)
  } catch (e) {
    return fout(400, (e as Error).message)
  }
  if (regels.length > 2000) return fout(400, 'Te veel verrichtingen in één bestand (max 2000).')
  const ogms = [...new Set(regels.flatMap((r) => r.ogms))].map((c) => ogmOpmaken(c.slice(0, 10)))
  const facturen = ogms.length
    ? (await payload.find({ collection: 'facturen', where: { and: [{ ogm: { in: ogms } }, { status: { equals: 'verstuurd' } }] }, depth: 1, limit: ogms.length, pagination: false, overrideAccess: true })).docs
    : []
  const perOgm = new Map(facturen.map((f) => [String(f.ogm), f]))
  const betaald = await betalingenVan(payload, facturen.map((f) => Number(f.id)))
  const sleutels = regels.map(bankSleutel)
  const al = new Set(
    (await payload.find({ collection: 'betalingen', where: { sleutel: { in: sleutels } }, depth: 0, limit: sleutels.length || 1, pagination: false, overrideAccess: true })).docs.map((b) => String(b.sleutel)),
  )
  return regels.map((r, i) => {
    const f = r.ogms.map((c) => perOgm.get(ogmOpmaken(c.slice(0, 10)))).find(Boolean)
    const club = f?.club && typeof f.club === 'object' ? String((f.club as { name?: unknown }).name ?? '') : ''
    const beeld = f ? betaalstand({ status: 'verstuurd', totaal: Number(f.totaal ?? 0), vervaldatum: f.vervaldatum as string }, betaald.get(Number(f.id)) ?? []) : null
    return {
      datum: r.datum,
      bedrag: r.bedrag,
      mededeling: r.mededeling,
      tegenpartij: r.tegenpartij,
      sleutel: sleutels[i]!,
      factuur: f ? { id: Number(f.id), nummer: String(f.nummer), club, open: beeld!.open } : null,
      status: al.has(sleutels[i]!) ? 'al-geboekt' : f ? 'koppelen' : 'geen-factuur',
    }
  })
}

/** Boekt de gekoppelde betalingen van een bankafschrift (opnieuw gelezen: de server vertrouwt de browser niet). */
export async function bankImporteren(payload: Payload, userId: number, csv: string): Promise<{ ok: true; geboekt: number; overgeslagen: number } | Fout> {
  const v = await bankVoorbeeld(payload, csv)
  if (!Array.isArray(v)) return v
  let geboekt = 0
  let overgeslagen = 0
  for (const r of v) {
    if (r.status !== 'koppelen' || !r.factuur) {
      overgeslagen++
      continue
    }
    const uit = await betalingRegistreren(payload, {
      factuurId: r.factuur.id,
      bedrag: r.bedrag,
      datum: r.datum,
      bron: 'bank',
      sleutel: r.sleutel,
      mededeling: r.mededeling,
      tegenpartij: r.tegenpartij,
      userId,
    })
    if (uit.ok) geboekt++
    else overgeslagen++
  }
  return { ok: true, geboekt, overgeslagen }
}

// ── Lijsten ──────────────────────────────────────────────────────────────────────────────────────────

export type FactuurRij = {
  id: number
  nummer: string | null
  club: { id: number; naam: string }
  status: FactuurStatus
  seizoen: string | null
  datum: string | null
  vervaldatum: string | null
  ogm: string | null
  lijnen: Lijn[]
  totaal: number
  opmerking: string | null
  annuleerReden: string | null
  beeld: Betaalbeeld
  betalingen: { id: number; bedrag: number; datum: string; bron: string; tegenpartij: string | null }[]
}

export async function facturenLijst(payload: Payload, where: Where, nu: Date = new Date(), limit = 500): Promise<FactuurRij[]> {
  const res = await payload.find({ collection: 'facturen', where, sort: '-createdAt', depth: 1, limit, overrideAccess: true })
  const ids = res.docs.map((f) => Number(f.id))
  const bet = ids.length
    ? (await payload.find({ collection: 'betalingen', where: { factuur: { in: ids } }, sort: 'datum', depth: 0, limit: 0, pagination: false, overrideAccess: true })).docs
    : []
  return res.docs.map((d) => {
    const f = d as unknown as FactuurDoc & { club: { id: number; name?: string } | number }
    const eigen = bet.filter((b) => relId(b.factuur) === Number(f.id))
    return {
      id: Number(f.id),
      nummer: f.nummer ?? null,
      club: { id: relId(f.club) ?? 0, naam: typeof f.club === 'object' ? String(f.club.name ?? '') : '' },
      status: f.status,
      seizoen: f.seizoen ?? null,
      datum: f.datum ? String(f.datum).slice(0, 10) : null,
      vervaldatum: f.vervaldatum ? String(f.vervaldatum).slice(0, 10) : null,
      ogm: f.ogm ?? null,
      lijnen: lijnenVan(f),
      totaal: Number(f.totaal ?? 0),
      opmerking: f.opmerking ?? null,
      annuleerReden: f.annuleerReden ?? null,
      beeld: betaalstand({ status: f.status, totaal: Number(f.totaal ?? 0), vervaldatum: f.vervaldatum }, eigen.map((b) => ({ bedrag: Number(b.bedrag ?? 0) })), nu),
      betalingen: eigen.map((b) => ({ id: Number(b.id), bedrag: Number(b.bedrag ?? 0), datum: String(b.datum).slice(0, 10), bron: String(b.bron ?? ''), tegenpartij: (b.tegenpartij as string | null) ?? null })),
    }
  })
}

/** Boekhoudexport: één regel per factuur, met wat betaald en wat open is. */
export function facturenCsv(rijen: FactuurRij[]): string {
  const cel = (v: unknown) => {
    const s = String(v ?? '')
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const bedrag = (n: number) => n.toFixed(2).replace('.', ',')
  const kop = ['Nummer', 'Datum', 'Vervaldatum', 'Club', 'Seizoen', 'Totaal', 'Betaald', 'Open', 'Stand', 'Mededeling']
  const lijnen = rijen
    .filter((r) => r.status !== 'concept')
    .map((r) => [r.nummer, r.datum, r.vervaldatum, r.club.naam, r.seizoen, bedrag(r.totaal), bedrag(r.beeld.betaald), bedrag(r.beeld.open), r.beeld.stand, r.ogm].map(cel).join(';'))
  return '﻿' + [kop.join(';'), ...lijnen].join('\r\n')
}

// ── Online betalen (Mollie) ─────────────────────────────────────────────────────────────────────────

const MOLLIE = 'https://api.mollie.com/v2'
export const mollieActief = (): boolean => Boolean(process.env.MOLLIE_API_KEY)

/**
 * Een online betaling starten voor het openstaande bedrag (Bancontact, overschrijving… zoals ingesteld bij
 * Mollie). Geeft de link naar de betaalpagina. Werkt enkel met MOLLIE_API_KEY.
 */
export async function onlineBetalen(payload: Payload, id: number, basis: string): Promise<{ ok: true; url: string } | Fout> {
  if (!mollieActief()) return fout(501, 'Online betalen is nog niet ingesteld. Betaal met een overschrijving.')
  const f = await laad(payload, id)
  if (!f || f.status !== 'verstuurd') return fout(404, 'Factuur niet gevonden.')
  const beeld = (await factuurBeeld(payload, id))!
  if (beeld.open <= 0) return fout(409, 'Deze factuur is al betaald.')
  const res = await fetch(`${MOLLIE}/payments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.MOLLIE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { currency: 'EUR', value: beeld.open.toFixed(2) },
      description: `Factuur ${f.nummer}`,
      redirectUrl: `${basis}/club/facturen?betaald=${id}`,
      webhookUrl: `${basis}/api/facturen/mollie`,
      metadata: { factuurId: id },
    }),
  }).catch(() => null)
  const j = (await res?.json().catch(() => null)) as { _links?: { checkout?: { href?: string } } } | null
  const url = j?._links?.checkout?.href
  return res?.ok && url ? { ok: true, url } : fout(502, 'De betaalpagina kon niet geopend worden. Probeer later opnieuw of betaal met een overschrijving.')
}

/**
 * De webhook van Mollie: we krijgen enkel een id en vragen de betaling zelf op bij Mollie (de inhoud van de
 * webhook vertrouwen we niet). Betaald → een betaling op de factuur (één keer per Mollie-id).
 */
export async function mollieWebhook(payload: Payload, molliId: string): Promise<{ ok: true; geboekt: boolean } | Fout> {
  if (!mollieActief()) return fout(501, 'Mollie is niet ingesteld.')
  if (!/^tr_[A-Za-z0-9]+$/.test(molliId)) return fout(400, 'Onbekende betaling.')
  const res = await fetch(`${MOLLIE}/payments/${molliId}`, { headers: { Authorization: `Bearer ${process.env.MOLLIE_API_KEY}` } }).catch(() => null)
  const p = (await res?.json().catch(() => null)) as { status?: string; amount?: { value?: string; currency?: string }; metadata?: { factuurId?: number }; paidAt?: string } | null
  if (!res?.ok || !p) return fout(502, 'Mollie antwoordde niet.')
  if (p.status !== 'paid' || p.amount?.currency !== 'EUR' || !p.metadata?.factuurId) return { ok: true, geboekt: false }
  const uit = await betalingRegistreren(payload, {
    factuurId: Number(p.metadata.factuurId),
    bedrag: Number(p.amount.value),
    datum: (p.paidAt ? dateStrBE(new Date(p.paidAt)) : dateStrBE()) as string,
    bron: 'online',
    sleutel: `mollie:${molliId}`,
    mededeling: molliId,
  })
  if (!uit.ok && uit.status === 409) return { ok: true, geboekt: false } // al geboekt (Mollie herhaalt webhooks)
  return uit.ok ? { ok: true, geboekt: true } : uit
}

// ── Herinneringen ────────────────────────────────────────────────────────────────────────────────────

/** Hoeveel facturen vervallen zijn (voor het dashboard van de federatie). */
export async function vervallenFacturen(payload: Payload, nu: Date = new Date()): Promise<FactuurRij[]> {
  const rijen = await facturenLijst(payload, { status: { equals: 'verstuurd' } }, nu, 2000)
  return rijen.filter((r) => r.beeld.stand === 'vervallen')
}


// ── PDF ──────────────────────────────────────────────────────────────────────────────────────────────

/** Mag deze gebruiker deze factuur zien? De federatie altijd; de staf van de club enkel een verstuurde. */
export function magFactuurZien(user: unknown, f: { club: unknown; status: string }, isFederatie: boolean, clubVanUser: number | null, isStaf: boolean): boolean {
  if (isFederatie) return true
  return isStaf && clubVanUser != null && relId(f.club) === clubVanUser && f.status !== 'concept'
}

export async function factuurPdfGegevens(payload: Payload, id: number): Promise<import('./submit/pdf-factuur').FactuurPdfData | null> {
  const [rij] = await facturenLijst(payload, { id: { equals: id } }, new Date(), 1)
  if (!rij) return null
  const inst = await factuurInstellingen(payload)
  const club = (await payload.findByID({ collection: 'clubs', id: rij.club.id, depth: 0, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null
  const adres = [club?.secretarisNaam ? `t.a.v. ${String(club.secretarisNaam)}` : '', String(club?.accommodatie ?? ''), String(club?.plaats ?? '')].filter(Boolean).join('\n')
  return {
    afzender: { naam: inst.naam, adres: inst.adres, ondernemingsnummer: inst.ondernemingsnummer, iban: inst.iban, bic: inst.bic, btwVermelding: inst.btwVermelding },
    club: { naam: rij.club.naam, adres },
    nummer: rij.nummer ?? 'CONCEPT',
    datum: rij.datum ? formatDateBE(rij.datum) : formatDateBE(new Date()),
    vervaldatum: rij.vervaldatum ? formatDateBE(rij.vervaldatum) : '—',
    seizoen: rij.seizoen,
    ogm: rij.ogm ?? '(volgt bij het versturen)',
    lijnen: rij.lijnen,
    totaal: rij.totaal,
    open: rij.status === 'concept' ? rij.totaal : rij.beeld.open,
    opmerking: rij.opmerking,
    geannuleerd: rij.status === 'geannuleerd',
  }
}
