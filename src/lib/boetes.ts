import type { Payload, Where } from 'payload'

import { formatDateBE } from './datetime'
import { clubStaf, federatieAccounts, meld, relId } from './meldingen'
import { berekenForfait, berekenKwitantie, formatEuro } from './vergoeding'

// Boetes aan clubs (collections/Boetes.ts). De bedragen staan niet in het reglement van dit
// project: de federatie zet de boetelijst op (boete-soorten). Het systeem stelt voor, de federatie
// beslist:
//   voorstel ──opleggen──▶ opgelegd ──betaling melden (club)──▶ betaling_gemeld ──bevestigen──▶ betaald
//      │                     │  └──betwisten (club)──▶ betwist ──handhaven──▶ opgelegd
//      └──vernietigen        └──vernietigen (ook vanuit betwist)
// Voorstellen ontstaan bij een forfait (de afwezige ploeg), een wedstrijdblad dat na de termijn
// nog niet ingediend is (de thuisclub) en een aftrap die een club zelf later zette wegens file of
// ziekte (lib/aftrap.ts). Eén sleutel per voorstel: nooit twee keer hetzelfde.

export type Uitkomst = { ok: true; id?: number } | { ok: false; status: number; error: string }
type Soort = { id: number; naam: string; bedrag: number; trigger?: string | null; termijnDagen?: number | null; artikel?: string | null }

const DAG = 86_400_000
const teamNaam = (t: unknown) => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '?') : '?')
const clubVanTeam = (t: unknown) => (t && typeof t === 'object' ? relId((t as { club?: unknown }).club) : null)
const wedstrijdTitel = (m: { homeTeam?: unknown; awayTeam?: unknown; date?: unknown }) =>
  `${teamNaam(m.homeTeam)} – ${teamNaam(m.awayTeam)}${m.date ? ` (${formatDateBE(String(m.date))})` : ''}`

async function soorten(payload: Payload, trigger: string): Promise<Soort[]> {
  const res = await payload.find({
    collection: 'boete-soorten',
    where: { and: [{ trigger: { equals: trigger } }, { actief: { equals: true } }] },
    depth: 0,
    limit: 20,
    overrideAccess: true,
  })
  return res.docs as unknown as Soort[]
}

async function voorstel(
  payload: Payload,
  sleutel: string,
  data: { club: number; soort: Soort; match?: number; omschrijving: string },
): Promise<boolean> {
  const al = await payload.count({ collection: 'boetes', where: { sleutel: { equals: sleutel } }, overrideAccess: true })
  if (al.totalDocs > 0) return false
  await payload.create({
    collection: 'boetes',
    data: {
      club: data.club,
      soort: data.soort.id,
      ...(data.match ? { match: data.match } : {}),
      omschrijving: data.omschrijving,
      bedrag: data.soort.bedrag,
      status: 'voorstel',
      bron: 'automatisch',
      sleutel,
    },
    overrideAccess: true,
  })
  return true
}

/**
 * Maak de automatische voorstellen voor de laatste `dagen` dagen. Idempotent (sleutel), dus veilig om
 * bij elk openen van het federatie-overzicht te draaien. Geeft het aantal nieuwe voorstellen.
 */
export async function boeteVoorstellen(payload: Payload, dagen = 120, nu = Date.now()): Promise<number> {
  let nieuw = 0
  const sinds = new Date(nu - dagen * DAG).toISOString()

  // 1. Forfait: de afwezige ploeg (bij dubbel forfait beide).
  const ff = await soorten(payload, 'forfait')
  if (ff.length) {
    const bladen = await payload.find({
      collection: 'matchsheets',
      where: { 'forfait.uitslag': { in: ['thuis', 'uit', 'dubbel'] } } as Where,
      depth: 2,
      limit: 500,
      overrideAccess: true,
    })
    for (const b of bladen.docs) {
      const m = b.match as { id?: number; date?: string; homeTeam?: unknown; awayTeam?: unknown } | null
      if (!m || typeof m !== 'object' || !m.id || (m.date && m.date < sinds)) continue
      const u = (b.forfait as { uitslag?: string }).uitslag
      const afwezig = [u === 'thuis' || u === 'dubbel' ? m.homeTeam : null, u === 'uit' || u === 'dubbel' ? m.awayTeam : null].filter(Boolean)
      for (const t of afwezig) {
        const club = clubVanTeam(t)
        if (club == null) continue
        for (const s of ff) {
          if (await voorstel(payload, `forfait:${s.id}:${m.id}:${club}`, { club, soort: s, match: m.id, omschrijving: `${s.naam}: ${teamNaam(t)} — ${wedstrijdTitel(m)}` })) nieuw++
        }
      }
    }
  }

  // 2. Wedstrijdblad niet tijdig ingediend: de thuisclub.
  for (const s of await soorten(payload, 'blad_te_laat')) {
    const termijn = Math.max(0, Number(s.termijnDagen ?? 0))
    const grens = new Date(nu - termijn * DAG).toISOString()
    const ms = await payload.find({
      collection: 'matches',
      where: { and: [{ status: { equals: 'finished' } }, { finishedAt: { less_than: grens } }, { finishedAt: { greater_than: sinds } }, { isDemo: { not_equals: true } }, { analyseOnly: { not_equals: true } }] },
      depth: 1,
      limit: 500,
      overrideAccess: true,
    })
    for (const m of ms.docs) {
      const blad = (await payload.find({ collection: 'matchsheets', where: { match: { equals: m.id } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
      if (!blad || blad.status === 'ingediend') continue
      const club = clubVanTeam(m.homeTeam)
      if (club == null) continue
      if (await voorstel(payload, `blad:${s.id}:${m.id}`, { club, soort: s, match: Number(m.id), omschrijving: `${s.naam}: ${wedstrijdTitel(m)} (termijn ${termijn} d)` })) nieuw++
    }
  }

  // 3. Aftrap later door de club zelf (file, ziekte): de club van wie het meldde.
  const tl = await soorten(payload, 'te_laat')
  if (tl.length) {
    const wijz = await payload.find({
      collection: 'aftrap-wijzigingen',
      where: { and: [{ reden: { in: ['file', 'ziekte'] } }, { createdAt: { greater_than: sinds } }, { aanleiding: { exists: false } }] },
      depth: 2,
      limit: 500,
      overrideAccess: true,
    })
    for (const w of wijz.docs) {
      const minuten = Math.round((new Date(String(w.naar)).getTime() - new Date(String(w.van)).getTime()) / 60_000)
      if (minuten <= 0) continue
      const m = w.match as { id?: number; date?: string; homeTeam?: unknown; awayTeam?: unknown } | null
      const door = w.gemeldDoor as { club?: unknown } | null
      const club = relId(door?.club)
      if (!m || typeof m !== 'object' || !m.id || club == null) continue
      // Enkel als die club ook speelt (een scheidsrechter of de federatie die het meldt: niemand).
      if (club !== clubVanTeam(m.homeTeam) && club !== clubVanTeam(m.awayTeam)) continue
      for (const s of tl) {
        if (s.termijnDagen != null && minuten < Number(s.termijnDagen)) continue
        if (await voorstel(payload, `telaat:${s.id}:${m.id}:${club}`, { club, soort: s, match: m.id, omschrijving: `${s.naam}: ${minuten} min later (${String(w.reden)}) — ${wedstrijdTitel(m)}` })) nieuw++
      }
    }
  }
  return nieuw
}

async function laad(payload: Payload, id: number) {
  return payload.findByID({ collection: 'boetes', id, depth: 0, overrideAccess: true }).catch(() => null)
}
const zet = (payload: Payload, id: number, data: Record<string, unknown>) =>
  payload.update({ collection: 'boetes', id, data: data as never, overrideAccess: true })

async function meldClub(payload: Payload, b: { club?: unknown; omschrijving?: unknown; bedrag?: unknown }, titel: string, tekst: string) {
  await meld(payload, await clubStaf(payload, relId(b.club)), { titel, tekst: `${String(b.omschrijving)} — ${formatEuro(Number(b.bedrag ?? 0))}. ${tekst}`.trim(), url: '/club/boetes' })
}

/** Federatie: wat er met een boete gebeurt. */
export async function boeteBehandelen(
  payload: Payload,
  id: number,
  actie: 'opleggen' | 'vernietigen' | 'betaald' | 'handhaven',
  opties: { bedrag?: number; opmerking?: string | null } = {},
): Promise<Uitkomst> {
  const b = await laad(payload, id)
  if (!b) return { ok: false, status: 404, error: 'Boete niet gevonden.' }
  const nu = new Date().toISOString()
  const opm = opties.opmerking?.trim() || undefined
  if (actie === 'opleggen') {
    if (b.status !== 'voorstel') return { ok: false, status: 409, error: 'Enkel een voorstel kan opgelegd worden.' }
    const bedrag = opties.bedrag != null && Number.isFinite(opties.bedrag) && opties.bedrag >= 0 ? opties.bedrag : Number(b.bedrag)
    await zet(payload, id, { status: 'opgelegd', bedrag, opgelegdOp: nu, ...(opm ? { federatieOpmerking: opm } : {}) })
    await meldClub(payload, { ...b, bedrag }, '💶 Boete opgelegd', opm ?? 'Zie je boete-overzicht om te betalen of te betwisten.')
    return { ok: true }
  }
  if (actie === 'vernietigen') {
    if (b.status === 'betaald' || b.status === 'vernietigd') return { ok: false, status: 409, error: 'Deze boete is al afgehandeld.' }
    await zet(payload, id, { status: 'vernietigd', ...(opm ? { federatieOpmerking: opm } : {}) })
    if (b.status !== 'voorstel') await meldClub(payload, b, '✅ Boete vernietigd', opm ?? '')
    return { ok: true }
  }
  if (actie === 'betaald') {
    if (b.status !== 'opgelegd' && b.status !== 'betaling_gemeld') return { ok: false, status: 409, error: 'Enkel een opgelegde boete kan als betaald gemarkeerd worden.' }
    await zet(payload, id, { status: 'betaald', betaaldOp: nu })
    await meldClub(payload, b, '✅ Betaling ontvangen', '')
    return { ok: true }
  }
  if (b.status !== 'betwist') return { ok: false, status: 409, error: 'Enkel een betwiste boete kan gehandhaafd worden.' }
  await zet(payload, id, { status: 'opgelegd', ...(opm ? { federatieOpmerking: opm } : {}) })
  await meldClub(payload, b, '⚖️ Betwisting afgewezen: boete blijft', opm ?? '')
  return { ok: true }
}

/** Federatie: een boete manueel opleggen (direct, zonder voorstel). */
export async function boeteManueel(
  payload: Payload,
  inv: { club: number; soort?: number | null; omschrijving?: string | null; bedrag?: number | null; match?: number | null },
): Promise<Uitkomst> {
  const s = inv.soort ? ((await payload.findByID({ collection: 'boete-soorten', id: inv.soort, depth: 0, overrideAccess: true }).catch(() => null)) as Soort | null) : null
  const bedrag = inv.bedrag != null && Number.isFinite(inv.bedrag) ? inv.bedrag : s?.bedrag
  const omschrijving = inv.omschrijving?.trim() || s?.naam
  if (!omschrijving || bedrag == null || bedrag < 0) return { ok: false, status: 400, error: 'Kies een boetesoort of geef omschrijving en bedrag.' }
  const club = await payload.findByID({ collection: 'clubs', id: inv.club, depth: 0, overrideAccess: true }).catch(() => null)
  if (!club) return { ok: false, status: 404, error: 'Club niet gevonden.' }
  const b = await payload.create({
    collection: 'boetes',
    data: { club: inv.club, ...(s ? { soort: s.id } : {}), ...(inv.match ? { match: inv.match } : {}), omschrijving, bedrag, status: 'opgelegd', bron: 'manueel', opgelegdOp: new Date().toISOString() },
    overrideAccess: true,
  })
  await meldClub(payload, b, '💶 Boete opgelegd', 'Zie je boete-overzicht om te betalen of te betwisten.')
  return { ok: true, id: Number(b.id) }
}

/** Club: een betaling melden of een opgelegde boete betwisten. */
export async function boeteDoorClub(payload: Payload, clubId: number, id: number, actie: 'betaling' | 'betwisten', opmerking?: string | null): Promise<Uitkomst> {
  const b = await laad(payload, id)
  if (!b || relId(b.club) !== clubId || b.status === 'voorstel') return { ok: false, status: 404, error: 'Boete niet gevonden.' }
  if (b.status !== 'opgelegd') return { ok: false, status: 409, error: 'Deze boete staat niet (meer) open.' }
  const opm = opmerking?.trim().slice(0, 1000) || null
  if (actie === 'betwisten' && !opm) return { ok: false, status: 400, error: 'Zeg waarom je de boete betwist.' }
  await zet(payload, id, actie === 'betaling' ? { status: 'betaling_gemeld', betalingGemeldOp: new Date().toISOString(), ...(opm ? { clubOpmerking: opm } : {}) } : { status: 'betwist', clubOpmerking: opm })
  const clubDoc = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0, overrideAccess: true }).catch(() => null)
  await meld(payload, await federatieAccounts(payload), {
    titel: actie === 'betaling' ? `💶 Betaling gemeld: ${String(clubDoc?.name ?? 'club')}` : `⚖️ Boete betwist: ${String(clubDoc?.name ?? 'club')}`,
    tekst: `${String(b.omschrijving)} — ${formatEuro(Number(b.bedrag))}${opm ? `. ${opm}` : ''}`,
    url: '/beheer/boetes',
  })
  return { ok: true }
}

export type BoeteRij = {
  id: number
  clubId: number | null
  clubNaam: string
  omschrijving: string
  artikel: string | null
  bedrag: number
  status: string
  bron: string
  matchId: number | null
  clubOpmerking: string | null
  federatieOpmerking: string | null
  datum: string
}

export async function boeteLijst(payload: Payload, where: Where, limit = 300): Promise<BoeteRij[]> {
  const res = await payload.find({ collection: 'boetes', where, sort: '-createdAt', depth: 1, limit, overrideAccess: true })
  return res.docs.map((b) => {
    const club = b.club as { id?: number; name?: string } | number | null
    const soort = b.soort as { artikel?: string | null } | number | null
    return {
      id: Number(b.id),
      clubId: relId(club),
      clubNaam: club && typeof club === 'object' ? String(club.name ?? '') : '',
      omschrijving: String(b.omschrijving),
      artikel: soort && typeof soort === 'object' ? (soort.artikel ?? null) : null,
      bedrag: Number(b.bedrag ?? 0),
      status: String(b.status),
      bron: String(b.bron ?? 'manueel'),
      matchId: relId(b.match),
      clubOpmerking: (b.clubOpmerking as string | null) ?? null,
      federatieOpmerking: (b.federatieOpmerking as string | null) ?? null,
      datum: String(b.opgelegdOp ?? b.createdAt),
    }
  })
}

export const OPEN_STATUSSEN = ['opgelegd', 'betaling_gemeld', 'betwist'] as const

export type KostenRij = { matchId: number; titel: string; datum: string; soort: 'kwitantie' | 'forfait'; aandeel: number; bedrag: number }
export type Scheidsrechterskosten = { betaler: string | null; forfaitBetaler: string | null; rijen: KostenRij[]; totaal: number }

/**
 * Wat deze club aan scheidsrechterskosten draagt (instelling `scheidsrechterKostenBetaler`), per
 * gefloten wedstrijd: €13 + km × €0,4327 (lib/vergoeding.ts). Bij een forfait het onkostenblad
 * (€13 + km × €0,4259) als `forfaitKostenBetaler` = de ploeg die forfait gaf.
 */
export async function scheidsrechterskosten(payload: Payload, clubId: number, sindsIso?: string): Promise<Scheidsrechterskosten> {
  const s = (await payload.findGlobal({ slug: 'settings', depth: 0 }).catch(() => null)) as { scheidsrechterKostenBetaler?: string | null; forfaitKostenBetaler?: string | null } | null
  const betaler = s?.scheidsrechterKostenBetaler ?? null
  const forfaitBetaler = s?.forfaitKostenBetaler ?? null
  const uit = { betaler, forfaitBetaler, rijen: [] as KostenRij[], totaal: 0 }
  if (betaler !== 'thuisclub' && betaler !== 'gedeeld' && forfaitBetaler !== 'forfaitploeg') return uit
  const ploegen = (await payload.find({ collection: 'teams', where: { club: { equals: clubId } }, depth: 0, limit: 200, overrideAccess: true })).docs.map((t) => t.id)
  if (!ploegen.length) return uit
  const ms = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { or: [{ homeTeam: { in: ploegen } }, { awayTeam: { in: ploegen } }] },
        { afgelast: { not_equals: true } },
        ...(sindsIso ? [{ date: { greater_than: sindsIso } }] : []),
      ],
    },
    depth: 1,
    limit: 500,
    overrideAccess: true,
  })
  for (const m of ms.docs) {
    const blad = (await payload.find({ collection: 'matchsheets', where: { match: { equals: m.id } }, depth: 0, limit: 1, overrideAccess: true })).docs[0] as
      | { refereeKm?: number | null; forfait?: { uitslag?: string; km?: number } }
      | undefined
    if (!blad) continue
    const thuis = clubVanTeam(m.homeTeam) === clubId
    const uitslag = blad.forfait?.uitslag ?? 'geen'
    const titel = wedstrijdTitel(m)
    if (uitslag !== 'geen') {
      if (forfaitBetaler !== 'forfaitploeg') continue
      const gaf = (uitslag === 'thuis' && thuis) || (uitslag === 'uit' && !thuis) || uitslag === 'dubbel'
      if (!gaf) continue
      const aandeel = uitslag === 'dubbel' ? 0.5 : 1
      const bedrag = Math.round(berekenForfait(1, blad.forfait?.km ?? 0).totaal * aandeel * 100) / 100
      uit.rijen.push({ matchId: Number(m.id), titel, datum: String(m.date), soort: 'forfait', aandeel, bedrag })
      continue
    }
    if (m.status !== 'finished') continue
    const aandeel = betaler === 'thuisclub' ? (thuis ? 1 : 0) : betaler === 'gedeeld' ? 0.5 : 0
    if (!aandeel) continue
    const bedrag = Math.round(berekenKwitantie(1, blad.refereeKm ?? 0).totaal * aandeel * 100) / 100
    uit.rijen.push({ matchId: Number(m.id), titel, datum: String(m.date), soort: 'kwitantie', aandeel, bedrag })
  }
  uit.rijen.sort((a, b) => a.datum.localeCompare(b.datum))
  uit.totaal = Math.round(uit.rijen.reduce((t, r) => t + r.bedrag, 0) * 100) / 100
  return uit
}
