import type { Payload } from 'payload'

import { type AttestStatus, beoordeelAttest, korteNaam, type Opgegeven, opgegevenUit } from './attest'
import { dateStrBE } from './datetime'
import { stuurMail } from './mail'
import { leesKaartCode } from './medische-kaart-code'
import type { AttestLezing } from './medische-kaart-lezen'
import { scanKaart, type ScanUitkomst } from './medische-kaart-scan'
import { accountsVanSpeler, clubStaf, meld, relId } from './meldingen'
import { seizoenStartJaar } from './registratie'

// Het medisch attest bewaren en beoordelen — één weg voor elke manier waarop een attest binnenkomt:
//   · de club (bij de registratie of bij een lid), het lid of een ouder (Mijn profiel), de QR-pagina /k/<code>,
//     een stapel kaarten (lib/medische-kaart-server.ts) en de publieke link /attest (zonder login);
//   · de federatie beslist over wat niet vanzelf goedgekeurd kon worden (/beheer/attesten).
// Wanneer is iets vanzelf goed? Zie lib/attest.ts. Een goedgekeurd attest zet de keuringsdatum van het lid; een
// attest dat wacht, raakt een eerder goedgekeurd attest niet aan (zo kan niemand via de publieke link een
// goed dossier "leegmaken").

export const ATTEST_MAX_BYTES = 8 * 1024 * 1024
export const ATTEST_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

/** Controleert een opgeladen attest; geeft de fout terug of null. */
export function attestFout(bestand: unknown): string | null {
  if (!(bestand instanceof File)) return 'Kies een bestand.'
  if (!ATTEST_TYPES.has(bestand.type)) return 'Enkel een PDF of een foto (JPG, PNG, WebP).'
  if (bestand.size > ATTEST_MAX_BYTES) return 'Het bestand is groter dan 8 MB.'
  return null
}

export type AttestVia = 'federatie' | 'club' | 'lid' | 'publiek'
export type AttestUitkomst = { attestId: number; playerId: number | null; status: AttestStatus; reden: string | null; meldingen: string[]; keuringOp: string | null }

const isDag = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

/** Het seizoenslabel van een keuring ("2026-2027"). */
export function seizoenVanKeuring(dag: string): string {
  const j = seizoenStartJaar(new Date(`${dag}T12:00:00Z`))
  return `${j}-${j + 1}`
}

type Speler = Record<string, unknown> & { id: number | string }

/** De club van een lid: players.club, of (bij oudere leden) de club van zijn ploeg. */
export async function clubVanSpeler(payload: Payload, sp: Speler): Promise<number | null> {
  const eigen = relId(sp.club)
  if (eigen != null) return eigen
  const team = relId(sp.team)
  if (team == null) return null
  const t = await payload.findByID({ collection: 'teams', id: team, depth: 0, overrideAccess: true }).catch(() => null)
  return relId(t?.club)
}

/**
 * Wat het systeem op het attest las, toepassen: het doktersverbod om hoger te spelen, als de arts dat duidelijk
 * aankruiste (en het blad uitgelijnd was op de hoekmerken). Een verbod wordt nooit vanzelf opgeheven.
 */
export async function lezingToepassen(payload: Payload, playerId: number, lezing: AttestLezing): Promise<string[]> {
  if (lezing.uitlijning !== 'merken' || lezing.vakjes.nietHoger.aangekruist !== true) return []
  await payload.update({ collection: 'players', id: playerId, data: { hogerSpelenVerbod: true }, overrideAccess: true })
  return ['De arts kruiste "mag niet 1 categorie hoger spelen" aan: het doktersverbod staat nu in het dossier.']
}

/** Een goedgekeurd attest wordt hét attest van het lid: keuringsdatum zetten, het vorige bestand opruimen. */
async function goedkeuringToepassen(payload: Payload, attestId: number, playerId: number, keuringOp: string): Promise<void> {
  const sp = await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true })
  const vorige = relId(sp.medischAttestBestand)
  await payload.update({ collection: 'players', id: playerId, data: { medischeKeuringOp: keuringOp, medischAttestBestand: attestId }, overrideAccess: true })
  if (vorige != null && vorige !== attestId) await payload.delete({ collection: 'medische-attesten', id: vorige, overrideAccess: true }).catch(() => null)
}

/**
 * Een attest bewaren en meteen beoordelen. `playerId`: het lid waarvoor iemand oplaadt (null = blanco, de
 * federatie zoekt het lid). Staat er een QR van een ánder lid op, dan weigeren we (Error). `scan`: al gescand
 * (undefined = hier scannen). `keuringOp`: de datum van de keuring als de uploader die gaf; bij een automatische
 * goedkeuring zonder datum geldt vandaag.
 */
export async function attestOpslaan(
  payload: Payload,
  o: { playerId: number | null; bestand: File; userId: number | null; via: AttestVia; scan?: ScanUitkomst; keuringOp?: string | null; opgegeven?: Opgegeven | null },
): Promise<AttestUitkomst> {
  const data = Buffer.from(await o.bestand.arrayBuffer())
  const scan = o.scan !== undefined ? o.scan : await scanKaart(data, o.bestand.type)
  if (scan?.playerId != null && o.playerId != null && scan.playerId !== o.playerId) {
    throw new Error('Dit is het medisch attest van een ander lid (zie de QR-code). Laad het op bij dat lid.')
  }
  const playerId = o.playerId ?? scan?.playerId ?? null
  const sp = playerId != null ? ((await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null)) as Speler | null) : null
  if (playerId != null && !sp) throw new Error('Dit lid bestaat niet (meer).')

  const b = beoordeelAttest({ lid: sp != null, viaQr: scan?.playerId != null, lezing: scan?.lezing ?? null, doorFederatie: o.via === 'federatie' })
  const keuringOp = isDag(o.keuringOp) ? o.keuringOp : b.status === 'goedgekeurd' ? dateStrBE() : null
  const ext = o.bestand.type === 'application/pdf' ? 'pdf' : o.bestand.type.split('/')[1]
  const club = sp ? await clubVanSpeler(payload, sp) : null
  const attest = await payload.create({
    collection: 'medische-attesten',
    data: {
      player: playerId,
      club,
      geuploadDoor: o.userId,
      herkendViaQr: scan?.playerId != null,
      lezing: (scan?.lezing ?? null) as never,
      status: b.status,
      reden: b.reden,
      via: o.via,
      blanco: playerId == null,
      keuringOp,
      opgegeven: (o.opgegeven ?? null) as never,
    } as never,
    // Geen originele bestandsnaam: die bevat vaak de naam van het kind of de dokter.
    file: { data, mimetype: o.bestand.type, name: `attest-${playerId ?? 'blanco'}-${Date.now()}.${ext}`, size: o.bestand.size },
    overrideAccess: true,
  })
  const attestId = Number(attest.id)
  const meldingen: string[] = []
  if (sp && scan?.lezing) meldingen.push(...(await lezingToepassen(payload, Number(sp.id), scan.lezing)))

  if (sp && b.status === 'goedgekeurd') {
    await goedkeuringToepassen(payload, attestId, Number(sp.id), keuringOp!)
  } else if (sp) {
    // Wacht op de federatie. Het lid had nog geen attest, of enkel een dat zelf nog wachtte of afgekeurd was:
    // dan wordt dit het attest van het lid (de club kan er de registratie mee indienen). Een goedgekeurd attest
    // blijft staan tot de federatie het nieuwe goedkeurt.
    const vorige = relId(sp.medischAttestBestand)
    const vorigDoc = vorige != null ? await payload.findByID({ collection: 'medische-attesten', id: vorige, depth: 0, overrideAccess: true }).catch(() => null) : null
    if (!vorigDoc || (vorigDoc as { status?: string }).status !== 'goedgekeurd') {
      await payload.update({ collection: 'players', id: sp.id, data: { medischAttestBestand: attestId }, overrideAccess: true })
      if (vorigDoc && vorige !== attestId) await payload.delete({ collection: 'medische-attesten', id: vorige!, overrideAccess: true }).catch(() => null)
    }
  }
  return { attestId, playerId, status: b.status, reden: b.reden, meldingen, keuringOp }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** Iedereen die bij dit lid hoort laten weten hoe het met het attest staat: het lid, de ouders, de club. */
async function meldUitkomst(payload: Payload, playerId: number, titel: string, tekst: string): Promise<void> {
  const sp = await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!sp) return
  const club = await clubVanSpeler(payload, sp as unknown as Speler)
  await meld(payload, [...(await accountsVanSpeler(payload, playerId)), ...(await clubStaf(payload, club))], { titel, tekst, url: '/profiel' })
}

export type Besluit =
  | { id: number; besluit: 'goedkeuren'; playerId?: number | null; keuringOp?: string | null; nietHoger?: boolean }
  | { id: number; besluit: 'afkeuren'; reden: string }

/** De federatie beslist over een attest dat wacht (of zoekt bij een blanco attest het lid). */
export async function attestBeslissen(payload: Payload, beoordelaarId: number, b: Besluit): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const doc = (await payload.findByID({ collection: 'medische-attesten', id: b.id, depth: 0, overrideAccess: true }).catch(() => null)) as
    | (Record<string, unknown> & { id: number; status?: string; opgegeven?: Opgegeven | null; keuringOp?: string | null })
    | null
  if (!doc) return { ok: false, status: 404, error: 'Attest niet gevonden.' }
  if (doc.status !== 'nakijken') return { ok: false, status: 409, error: 'Over dit attest is al beslist.' }
  const nu = new Date().toISOString()
  const email = doc.opgegeven?.email ?? null

  if (b.besluit === 'afkeuren') {
    const reden = String(b.reden ?? '').trim().slice(0, 300)
    if (reden.length < 5) return { ok: false, status: 400, error: 'Zeg kort waarom het attest niet in orde is.' }
    await payload.update({ collection: 'medische-attesten', id: doc.id, data: { status: 'afgekeurd', afkeurReden: reden, beoordeeldDoor: beoordelaarId, beoordeeldOp: nu } as never, overrideAccess: true })
    const pid = relId(doc.player)
    if (pid != null) {
      // Een afgekeurd attest is niet langer "het attest" van het lid.
      const sp = await payload.findByID({ collection: 'players', id: pid, depth: 0, overrideAccess: true }).catch(() => null)
      if (sp && relId(sp.medischAttestBestand) === doc.id) await payload.update({ collection: 'players', id: pid, data: { medischAttestBestand: null }, overrideAccess: true })
      await meldUitkomst(payload, pid, `✗ Medisch attest van ${String(sp?.name ?? 'je lid')} afgekeurd`, `${reden} Laat een nieuw attest invullen en laad het opnieuw op.`)
    }
    if (email) {
      await stuurMail({
        aan: email,
        onderwerp: 'Je medisch attest is niet in orde',
        html: `<p>Dag,</p><p>De federatie bekeek het medisch attest dat je opstuurde${doc.opgegeven?.naam ? ` voor ${esc(doc.opgegeven.naam)}` : ''}. Het is niet in orde:</p><p><strong>${esc(reden)}</strong></p><p>Laat een nieuw attest invullen en stuur het opnieuw op.</p><p>Sportieve groeten,<br>KVKBF</p>`,
      })
    }
    return { ok: true }
  }

  const pid = relId(doc.player) ?? (b.playerId != null && Number.isSafeInteger(b.playerId) ? b.playerId : null)
  if (pid == null) return { ok: false, status: 400, error: 'Kies het lid bij dit blanco attest.' }
  const sp = (await payload.findByID({ collection: 'players', id: pid, depth: 0, overrideAccess: true }).catch(() => null)) as Speler | null
  if (!sp) return { ok: false, status: 404, error: 'Lid niet gevonden.' }
  const keuringOp = isDag(b.keuringOp) ? b.keuringOp : isDag(doc.keuringOp) ? doc.keuringOp : dateStrBE()
  if (Date.parse(keuringOp) > Date.now() + 86_400_000) return { ok: false, status: 400, error: 'De keuring kan niet in de toekomst liggen.' }
  await payload.update({
    collection: 'medische-attesten',
    id: doc.id,
    data: { status: 'goedgekeurd', player: pid, club: await clubVanSpeler(payload, sp), keuringOp, beoordeeldDoor: beoordelaarId, beoordeeldOp: nu, blanco: false } as never,
    overrideAccess: true,
  })
  await goedkeuringToepassen(payload, doc.id, pid, keuringOp)
  if (b.nietHoger) await payload.update({ collection: 'players', id: pid, data: { hogerSpelenVerbod: true }, overrideAccess: true })
  const seizoen = seizoenVanKeuring(keuringOp)
  await meldUitkomst(payload, pid, `✅ Medisch attest van ${String(sp.name ?? 'je lid')} goedgekeurd`, `De keuring geldt voor het seizoen ${seizoen}.`)
  if (email) {
    await stuurMail({
      aan: email,
      onderwerp: 'Je medisch attest is goedgekeurd',
      html: `<p>Dag,</p><p>Het medisch attest dat je opstuurde${doc.opgegeven?.naam ? ` voor ${esc(doc.opgegeven.naam)}` : ''} is goedgekeurd door de federatie. De keuring geldt voor het seizoen ${seizoen}.</p><p>Sportieve groeten,<br>KVKBF</p>`,
    })
  }
  return { ok: true }
}

/** Een registratie die de federatie goedkeurt, keurt ook het attest goed dat erbij lag. */
export async function attestMetRegistratieGoedkeuren(payload: Payload, playerId: number, beoordelaarId: number): Promise<void> {
  const sp = await payload.findByID({ collection: 'players', id: playerId, depth: 0, overrideAccess: true }).catch(() => null)
  const id = relId(sp?.medischAttestBestand)
  if (id == null) return
  const doc = await payload.findByID({ collection: 'medische-attesten', id, depth: 0, overrideAccess: true }).catch(() => null)
  if ((doc as { status?: string } | null)?.status !== 'nakijken') return
  await payload.update({
    collection: 'medische-attesten',
    id,
    data: { status: 'goedgekeurd', reden: null, beoordeeldDoor: beoordelaarId, beoordeeldOp: new Date().toISOString() } as never,
    overrideAccess: true,
  })
}

// ── De publieke link (/attest en /k/<code>): zonder login ───────────────────────────────────────────────

export type PubliekUitkomst =
  | { ok: true; status: AttestStatus; naam: string; reden: string | null; seizoen: string | null; meldingen: string[] }
  | { ok: false; fout: string }
  | { ok: false; nodig: 'gegevens'; blanco: boolean }

const normaal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** Bij een blanco attest: is er precies één lid met die naam en geboortedatum? Een voorstel voor de federatie. */
async function zoekLid(payload: Payload, opg: Opgegeven): Promise<number | null> {
  if (!opg.geboortedatum) return null
  const dag = Date.parse(`${opg.geboortedatum}T12:00:00Z`)
  const res = await payload.db.find<{ id: number; name?: string | null }>({
    collection: 'players',
    where: { and: [{ birthDate: { greater_than_equal: new Date(dag - 86_400_000).toISOString() } }, { birthDate: { less_than: new Date(dag + 86_400_000).toISOString() } }] },
    limit: 50,
    pagination: false,
    select: { name: true },
  })
  const woorden = normaal(opg.naam)
  const treffers = res.docs.filter((p) => {
    const n = normaal(String(p.name ?? ''))
    return woorden.length > 0 && woorden.every((w) => n.includes(w))
  })
  return treffers.length === 1 ? Number(treffers[0]!.id) : null
}

/**
 * Een attest opladen zonder login. Met een persoonlijke QR (op de foto, of de link /k/<code> die de uploader
 * opende) weet het systeem van wie het is; anders vragen we naam en geboortedatum (blanco attest) en kijkt de
 * federatie het na. Wie zonder login oplaadt, ziet enkel "Kaat K." — nooit meer over het lid.
 */
export async function attestPubliek(
  payload: Payload,
  bestand: unknown,
  o: { code?: string | null; gegevens?: Record<string, unknown> | null; userId?: number | null } = {},
): Promise<PubliekUitkomst> {
  const fout = attestFout(bestand)
  if (fout) return { ok: false, fout }
  const f = bestand as File
  const codeLid = o.code ? leesKaartCode(o.code) : null
  if (o.code && codeLid == null) return { ok: false, fout: 'Deze link hoort niet bij een geldig attest. Scan de QR-code opnieuw, of gebruik de algemene link.' }
  const scan = await scanKaart(Buffer.from(await f.arrayBuffer()), f.type)
  if (scan?.playerId != null && codeLid != null && scan.playerId !== codeLid) {
    return { ok: false, fout: 'Dit is het attest van een ander lid: de QR-code op de foto hoort niet bij deze link. Scan de QR-code op dit attest zelf.' }
  }
  const pid = scan?.playerId ?? codeLid
  if (pid == null) {
    const opg = o.gegevens ? opgegevenUit(o.gegevens) : null
    if (!opg) return { ok: false, nodig: 'gegevens', blanco: scan?.blanco ?? false }
    const uit = await attestOpslaan(payload, { playerId: null, bestand: f, userId: o.userId ?? null, via: o.userId ? 'lid' : 'publiek', scan, opgegeven: { ...opg, voorstelLid: await zoekLid(payload, opg) } })
    return { ok: true, status: uit.status, naam: opg.naam, reden: uit.reden, seizoen: null, meldingen: [] }
  }
  const sp = await payload.findByID({ collection: 'players', id: pid, depth: 0, overrideAccess: true }).catch(() => null)
  if (!sp) return { ok: false, fout: 'Dit attest hoort bij een lid dat niet meer bestaat. Neem contact op met je club.' }
  try {
    const uit = await attestOpslaan(payload, { playerId: pid, bestand: f, userId: o.userId ?? null, via: o.userId ? 'lid' : 'publiek', scan })
    const naam = korteNaam(sp.voornaam, sp.name)
    await meldUitkomst(
      payload,
      pid,
      uit.status === 'goedgekeurd' ? `✅ Medisch attest van ${String(sp.name ?? '')} ontvangen en goedgekeurd` : `📋 Medisch attest van ${String(sp.name ?? '')} ontvangen`,
      uit.status === 'goedgekeurd' ? `Alles stond juist: de keuring geldt voor het seizoen ${seizoenVanKeuring(uit.keuringOp!)}.` : `De federatie kijkt het na: ${uit.reden ?? ''}`,
    )
    return { ok: true, status: uit.status, naam, reden: uit.reden, seizoen: uit.keuringOp ? seizoenVanKeuring(uit.keuringOp) : null, meldingen: uit.meldingen }
  } catch (err) {
    return { ok: false, fout: (err as Error).message }
  }
}

// ── De wachtrij van de federatie (/beheer/attesten) ──────────────────────────────────────────────────

export type AttestRij = {
  id: number
  url: string | null
  pdf: boolean
  op: string
  via: string | null
  blanco: boolean
  status: AttestStatus
  reden: string | null
  afkeurReden: string | null
  keuringOp: string | null
  opgegeven: Opgegeven | null
  vakjes: { geschikt: boolean | null; nietHoger: boolean | null } | null
  lid: { id: number; naam: string; club: string } | null
  voorstel: { id: number; naam: string } | null
}

/** De attesten met deze status, oudste eerst (wie het langst wacht, eerst). */
export async function attestenLijst(payload: Payload, status: AttestStatus = 'nakijken', limit = 200): Promise<AttestRij[]> {
  const res = await payload.find({
    collection: 'medische-attesten',
    where: { status: { equals: status } },
    sort: status === 'nakijken' ? 'createdAt' : '-updatedAt',
    depth: 1,
    limit,
    overrideAccess: true,
  })
  const voorstelIds = res.docs.map((d) => (d.opgegeven as Opgegeven | null)?.voorstelLid).filter((x): x is number => typeof x === 'number')
  const voorstellen = voorstelIds.length
    ? new Map(
        (await payload.find({ collection: 'players', where: { id: { in: voorstelIds } }, depth: 0, limit: voorstelIds.length, overrideAccess: true })).docs.map((p) => [Number(p.id), String(p.name ?? '')]),
      )
    : new Map<number, string>()
  const naamVan = (v: unknown) => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')
  return res.docs.map((d) => {
    const doc = d as unknown as Record<string, unknown>
    const sp = doc.player && typeof doc.player === 'object' ? (doc.player as { id: number; name?: string }) : null
    const opg = (doc.opgegeven ?? null) as Opgegeven | null
    const lezing = (doc.lezing ?? null) as AttestLezing | null
    const voorstel = opg?.voorstelLid != null && voorstellen.has(opg.voorstelLid) ? { id: opg.voorstelLid, naam: voorstellen.get(opg.voorstelLid)! } : null
    return {
      id: Number(doc.id),
      url: typeof doc.url === 'string' ? doc.url : null,
      pdf: doc.mimeType === 'application/pdf',
      op: String(doc.createdAt),
      via: (doc.via as string | null) ?? null,
      blanco: Boolean(doc.blanco),
      status: doc.status as AttestStatus,
      reden: (doc.reden as string | null) ?? null,
      afkeurReden: (doc.afkeurReden as string | null) ?? null,
      keuringOp: doc.keuringOp ? String(doc.keuringOp).slice(0, 10) : null,
      opgegeven: opg,
      vakjes: lezing && lezing.uitlijning === 'merken' ? { geschikt: lezing.vakjes.geschikt.aangekruist, nietHoger: lezing.vakjes.nietHoger.aangekruist } : null,
      lid: sp ? { id: Number(sp.id), naam: String(sp.name ?? ''), club: naamVan(doc.club) } : null,
      voorstel,
    }
  })
}

/** Hoeveel attesten wachten op de federatie (de teller in het menu). */
export async function attestenTeBeoordelen(payload: Payload): Promise<number> {
  return (await payload.count({ collection: 'medische-attesten', where: { status: { equals: 'nakijken' } }, overrideAccess: true })).totalDocs
}
