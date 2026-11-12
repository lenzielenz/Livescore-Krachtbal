import type { Payload } from 'payload'

import { type Aanvraag, type Bron, actiesVoor, ontleedSleutel, sleutelVan } from './aanvragen-bord'
import { afgelastingIntrekken } from './afgelasting'
import { boeteBehandelen } from './boetes'
import { formatDateTimeBE } from './datetime'
import { dossierBijwerken, dossiersPerSleutel, takenAlsAanvragen } from './dossiers'
import { inschrijvingVerwerken } from './inschrijving'
import { klachtBehandelen } from './klacht'
import { kaartBehandelen } from './medische-kaart'
import { ongevalBeoordelen } from './ongeval-dossier'
import { registratiesBeoordelen } from './registratie-server'
import { AANLEIDING_LABEL, type Aanleiding, rapportAfhandelen } from './sr-rapport'
import { UITLEEN_STATUS_LABEL, type UitleenStatus, uitleningBehandelen } from './uitlening'
import { verplaatsingBeantwoorden } from './verplaatsing'
import { COMITE_LABEL, type Comite } from './voorbehoud-onderwerpen'
import type { AuthedUser } from './api-auth'

// Alles wat bij de federatie binnenkomt, op één lijst: verplaatsingsaanvragen, registraties, klachten,
// boetes, ongevallen, medische kaarten, afgelastingen, inschrijvingen, scheidsrechtersrapporten,
// uitleningen — plus de vrije taken. Elke
// bron blijft in haar eigen collection met haar eigen status; hier lezen we enkel en vertalen we naar
// één vorm (lib/aanvragen-bord.ts). Afhandelen gebeurt via dezelfde functies als de losse werkschermen:
// het bord is een tweede ingang, geen tweede logica.

const DAG = 86_400_000

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const naam = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')
const wedstrijdLabel = (m: unknown): string => {
  const x = m && typeof m === 'object' ? (m as { homeTeam?: unknown; awayTeam?: unknown; date?: unknown }) : null
  if (!x) return 'Wedstrijd'
  return `${naam(x.homeTeam) || '?'} – ${naam(x.awayTeam) || '?'}`
}
const datum = (v: unknown): string => (v ? formatDateTimeBE(String(v)) : '')

/** RCVK item 41: de ongevalsformulieren horen binnen de acht dagen na het ongeval bij de federatie. */
export const ONGEVAL_TERMIJN_DAGEN = 8
const ongevalTermijn = (a: Record<string, unknown>): string | null => {
  const op = new Date(String(a.ongevalDatum ?? a.createdAt ?? ''))
  return Number.isFinite(op.getTime()) ? new Date(op.getTime() + ONGEVAL_TERMIJN_DAGEN * DAG).toISOString() : null
}

export async function aanvragenLijst(payload: Payload, nu: Date = new Date(), dagenKlaar = 14): Promise<Aanvraag[]> {
  const grens = new Date(nu.getTime() - dagenKlaar * DAG).toISOString()
  const zoek = <T extends Parameters<Payload['find']>[0]['collection']>(collection: T, where: Record<string, unknown>, depth: number, sort: string) =>
    payload.find({ collection, where: where as never, depth, sort, limit: 300, pagination: false, overrideAccess: true }).catch(() => ({ docs: [] as never[] }))

  const [verpl, reg, kl, bo, ong, kaart, afg, insch, rap, uitl, taken, dossiers] = await Promise.all([
    zoek('verplaatsingsaanvragen', { or: [{ status: { in: ['wacht_tegenpartij', 'wacht_federatie'] } }, { and: [{ status: { in: ['goedgekeurd', 'afgewezen'] } }, { behandeldOp: { greater_than_equal: grens } }] }] }, 2, 'createdAt'),
    zoek('players', { or: [{ registratieStatus: { equals: 'ingediend' } }, { and: [{ registratieStatus: { in: ['goedgekeurd', 'afgekeurd'] } }, { ingediendOp: { greater_than_equal: grens } }] }] }, 1, 'ingediendOp'),
    zoek('klachten', { or: [{ status: { in: ['open', 'te_bekrachtigen'] } }, { behandeldOp: { greater_than_equal: grens } }, { and: [{ status: { in: ['afgezien', 'vervallen'] } }, { updatedAt: { greater_than_equal: grens } }] }] }, 2, 'createdAt'),
    // Een opgelegde boete ligt bij de club (betalen of betwisten) en hoort niet meer open op het bord; ze
    // blijft wel 14 dagen bij "Afgehandeld" staan, zodat je ziet waar ze heen ging na "Opleggen".
    zoek('boetes', { or: [{ status: { in: ['voorstel', 'betaling_gemeld', 'betwist'] } }, { and: [{ status: { in: ['betaald', 'vernietigd'] } }, { updatedAt: { greater_than_equal: grens } }] }, { and: [{ status: { equals: 'opgelegd' } }, { opgelegdOp: { greater_than_equal: grens } }] }] }, 1, 'createdAt'),
    zoek('accidents', { or: [{ status: { in: ['gemeld', 'ingediend'] } }, { afgehandeldOp: { greater_than_equal: grens } }] }, 1, 'createdAt'),
    zoek('medische-kaart-aanvragen', { or: [{ status: { equals: 'aangevraagd' } }, { behandeldOp: { greater_than_equal: grens } }] }, 1, 'createdAt'),
    zoek('afgelastingen', { or: [{ status: { equals: 'gemeld' } }, { behandeldOp: { greater_than_equal: grens } }] }, 2, 'createdAt'),
    zoek('inschrijvingen', { or: [{ status: { equals: 'ingediend' } }, { and: [{ status: { equals: 'verwerkt' } }, { updatedAt: { greater_than_equal: grens } }] }] }, 1, 'ingediendOp'),
    zoek('sr-rapporten', { or: [{ status: { equals: 'ingediend' } }, { behandeldOp: { greater_than_equal: grens } }] }, 2, 'createdAt'),
    zoek('uitleningen', { or: [{ status: { in: ['wacht_ontvanger', 'wacht_federatie'] } }, { behandeldOp: { greater_than_equal: grens } }] }, 1, 'createdAt'),
    takenAlsAanvragen(payload, dagenKlaar, nu),
    dossiersPerSleutel(payload),
  ])

  const uit: Aanvraag[] = []
  const voeg = (a: Omit<Aanvraag, 'sleutel' | 'dossier'>) => {
    const sleutel = sleutelVan(a.bron, a.bronId)
    uit.push({ ...a, sleutel, dossier: dossiers.get(sleutel) ?? null })
  }

  for (const v of verpl.docs as Record<string, unknown>[]) {
    const st = String(v.status)
    const open = st === 'wacht_tegenpartij' || st === 'wacht_federatie'
    voeg({
      bron: 'verplaatsing',
      bronId: Number(v.id),
      titel: wedstrijdLabel(v.match),
      detail: `${naam(v.aanvrager) || 'Club'} vraagt ${datum(v.voorgesteld)} — ${String(v.reden ?? '')}`,
      club: naam(v.aanvrager) || null,
      sinds: String(v.createdAt),
      status: { wacht_tegenpartij: 'Wacht op de tegenpartij', wacht_federatie: 'Aan de federatie', goedgekeurd: 'Goedgekeurd', afgewezen: 'Afgewezen' }[st] ?? st,
      statusCode: st,
      open,
      afgeslotenOp: open ? null : (v.behandeldOp as string | null) ?? null,
      wachtOpAuto: st === 'wacht_tegenpartij' ? 'club' : null,
      href: relId(v.match) != null ? `/match/${relId(v.match)}` : '/beheer/planner',
    })
  }

  for (const p of reg.docs as Record<string, unknown>[]) {
    const st = String(p.registratieStatus)
    const open = st === 'ingediend'
    voeg({
      bron: 'registratie',
      bronId: Number(p.id),
      titel: String(p.name ?? 'Lid'),
      detail: `${naam(p.club) || 'Club'} vraagt de goedkeuring van dit lid`,
      club: naam(p.club) || null,
      sinds: String(p.ingediendOp ?? p.updatedAt),
      status: { ingediend: 'Te keuren', goedgekeurd: 'Goedgekeurd', afgekeurd: 'Afgekeurd' }[st] ?? st,
      statusCode: st,
      open,
      afgeslotenOp: open ? null : String(p.updatedAt),
      wachtOpAuto: null,
      href: '/beheer/leden',
    })
  }

  for (const k of kl.docs as Record<string, unknown>[]) {
    const st = String(k.status)
    // Een voorbehoud (RCVK item 25) staat eerst open bij de club: bekrachtigen binnen 5 werkdagen.
    const voorbehoud = k.soort === 'voorbehoud'
    const open = st === 'open' || st === 'te_bekrachtigen'
    voeg({
      bron: 'klacht',
      bronId: Number(k.id),
      titel: `${voorbehoud ? 'Voorbehoud: ' : ''}${wedstrijdLabel(k.match)}`,
      // RCVK item 25.3: welk comité het voorbehoud onderzoekt.
      detail: `${k.comite ? `[${COMITE_LABEL[k.comite as Comite]}] ` : ''}${naam(k.club) || 'Club'}: ${String(k.relaas || k.reden || '')}`,
      club: naam(k.club) || null,
      sinds: String(k.createdAt),
      status:
        {
          open: voorbehoud ? 'Bekrachtigd — te beslissen' : 'Open',
          heropend: 'Blad heropend',
          afgewezen: 'Afgewezen',
          te_bekrachtigen: 'Wacht op bekrachtiging door de club',
          afgezien: 'Club zag af',
          vervallen: 'Niet bekrachtigd — vervallen',
        }[st] ?? st,
      statusCode: st,
      open,
      afgeslotenOp: open ? null : String(k.behandeldOp ?? k.updatedAt),
      wachtOpAuto: st === 'te_bekrachtigen' ? 'club' : null,
      deadlineAuto: st === 'te_bekrachtigen' ? ((k.bekrachtigTegen as string | null) ?? null) : null,
      href: '/beheer/klachten',
    })
  }

  for (const b of bo.docs as Record<string, unknown>[]) {
    const st = String(b.status)
    const open = st === 'voorstel' || st === 'betaling_gemeld' || st === 'betwist'
    const bedrag = Number(b.bedrag ?? 0).toLocaleString('nl-BE', { style: 'currency', currency: 'EUR' })
    voeg({
      bron: 'boete',
      bronId: Number(b.id),
      titel: `${naam(b.club) || 'Club'} · ${bedrag}`,
      detail: `${String(b.omschrijving ?? '')}${b.clubOpmerking ? ` — club: ${String(b.clubOpmerking)}` : ''}`,
      club: naam(b.club) || null,
      sinds: String(st === 'betaling_gemeld' ? b.betalingGemeldOp ?? b.updatedAt : st === 'betwist' ? b.updatedAt : b.createdAt),
      status: { voorstel: 'Voorstel', betaling_gemeld: 'Betaling gemeld', betwist: 'Betwist', betaald: 'Betaald', vernietigd: 'Vernietigd', opgelegd: 'Opgelegd — bij de club' }[st] ?? st,
      statusCode: st,
      open,
      afgeslotenOp: open ? null : String(st === 'opgelegd' ? b.opgelegdOp ?? b.updatedAt : b.betaaldOp ?? b.updatedAt),
      wachtOpAuto: null,
      href: '/beheer/boetes',
    })
  }

  for (const a of ong.docs as Record<string, unknown>[]) {
    const st = String(a.status)
    const open = st === 'gemeld' || st === 'ingediend'
    voeg({
      bron: 'ongeval',
      bronId: Number(a.id),
      titel: String(a.titel ?? naam(a.player) ?? 'Ongeval'),
      detail: st === 'gemeld' ? 'De speler moet de aangifte en het getuigschrift nog bezorgen' : `${naam(a.club) || 'Club'}: dossier ingediend`,
      club: naam(a.club) || null,
      sinds: String(st === 'ingediend' ? a.ingediendOp ?? a.createdAt : a.createdAt),
      status: { gemeld: 'Documenten te bezorgen', ingediend: 'Bij de federatie', afgehandeld: 'Afgehandeld' }[st] ?? st,
      statusCode: st,
      open,
      afgeslotenOp: open ? null : (a.afgehandeldOp as string | null) ?? null,
      wachtOpAuto: st === 'gemeld' ? 'speler' : null,
      // RCVK item 41: alle ongevalsformulieren binnen de acht dagen na het ongeval bij de federatie.
      deadlineAuto: st === 'gemeld' ? ongevalTermijn(a) : null,
      href: '/ongevallen',
    })
  }

  for (const k of kaart.docs as Record<string, unknown>[]) {
    const st = String(k.status)
    const open = st === 'aangevraagd'
    voeg({
      bron: 'kaart',
      bronId: Number(k.id),
      titel: naam(k.player) || 'Lid',
      detail: `Medische kaart gevraagd ${{ lid: 'door het lid zelf', club: 'door de club', ouder: 'door een ouder' }[String(k.via)] ?? ''}`.trim(),
      club: naam(k.club) || null,
      sinds: String(k.createdAt),
      status: { aangevraagd: 'Aangevraagd', verstuurd: 'Verstuurd', geweigerd: 'Geweigerd' }[st] ?? st,
      statusCode: st,
      open,
      afgeslotenOp: open ? null : (k.behandeldOp as string | null) ?? null,
      wachtOpAuto: null,
      href: '/beheer/leden#kaarten',
    })
  }

  for (const a of afg.docs as Record<string, unknown>[]) {
    const st = String(a.status)
    const open = st === 'gemeld'
    voeg({
      bron: 'afgelasting',
      bronId: Number(a.id),
      titel: wedstrijdLabel(a.match),
      detail: `${{ terrein: 'Terrein onbespeelbaar', weer: 'Weersomstandigheden', ander: 'Andere reden' }[String(a.reden)] ?? ''} — was ${datum(a.oorspronkelijkeDatum)}`,
      club: null,
      sinds: String(a.createdAt),
      status: { gemeld: 'Nieuwe datum te plannen', herpland: 'Herpland', ingetrokken: 'Ingetrokken' }[st] ?? st,
      statusCode: st,
      open,
      afgeslotenOp: open ? null : (a.behandeldOp as string | null) ?? null,
      wachtOpAuto: null,
      href: '/beheer/afgelastingen',
    })
  }

  for (const i of insch.docs as Record<string, unknown>[]) {
    const st = String(i.status)
    const open = st === 'ingediend'
    const ronde = i.ronde && typeof i.ronde === 'object' ? (i.ronde as { seizoen?: unknown }) : null
    voeg({
      bron: 'inschrijving',
      bronId: Number(i.id),
      titel: naam(i.club) || 'Club',
      detail: `Inschrijving ${ronde?.seizoen ? String(ronde.seizoen) : ''} — ${Array.isArray(i.ploegen) ? i.ploegen.length : 0} ploegen`.replace(/\s+—/, ' —'),
      club: naam(i.club) || null,
      sinds: String(i.ingediendOp ?? i.updatedAt),
      status: { ingediend: 'Ingediend', verwerkt: 'Verwerkt' }[st] ?? st,
      statusCode: st,
      open,
      afgeslotenOp: open ? null : String(i.updatedAt),
      wachtOpAuto: null,
      href: '/beheer/inschrijvingen',
    })
  }

  for (const r of rap.docs as Record<string, unknown>[]) {
    const st = String(r.status)
    const open = st === 'ingediend'
    const scheids = r.scheidsrechter && typeof r.scheidsrechter === 'object' ? (r.scheidsrechter as { name?: unknown; email?: unknown }) : null
    const redenen = (Array.isArray(r.aanleidingen) ? r.aanleidingen : []).map((a) => AANLEIDING_LABEL[a as Aanleiding] ?? String(a)).join(', ')
    voeg({
      bron: 'rapport',
      bronId: Number(r.id),
      titel: wedstrijdLabel(r.match),
      detail: `${redenen} — ${String(r.ondertekendNaam ?? scheids?.name ?? 'scheidsrechter')}: ${String(r.relaas ?? '').slice(0, 160)}`,
      club: null,
      sinds: String(r.createdAt),
      status: { ingediend: 'Bij het comité', afgehandeld: 'Afgehandeld' }[st] ?? st,
      statusCode: st,
      open,
      afgeslotenOp: open ? null : (r.behandeldOp as string | null) ?? null,
      wachtOpAuto: null,
      href: relId(r.match) != null ? `/match/${relId(r.match)}` : '/federatie/aanvragen',
    })
  }

  for (const u of uitl.docs as Record<string, unknown>[]) {
    const st = String(u.status)
    const open = st === 'wacht_ontvanger' || st === 'wacht_federatie'
    voeg({
      bron: 'uitlening',
      bronId: Number(u.id),
      titel: `${String(u.spelerNaam ?? 'Speler')} → ${naam(u.naarPloeg) || naam(u.naarClub) || '?'}`,
      detail: `${naam(u.vanClub) || 'Club'} leent uit aan ${naam(u.naarClub) || '?'} — ${String(u.categorie ?? '')} ${String(u.competitie ?? u.seizoen ?? '')}`.replace(/\s+/g, ' '),
      club: naam(u.vanClub) || null,
      sinds: String((u.tekenNaar as { op?: unknown } | null)?.op ?? u.createdAt),
      status: UITLEEN_STATUS_LABEL[st as UitleenStatus] ?? st,
      statusCode: st,
      open,
      afgeslotenOp: open ? null : (u.behandeldOp as string | null) ?? String(u.updatedAt),
      wachtOpAuto: st === 'wacht_ontvanger' ? 'club' : null,
      href: '/federatie/aanvragen',
    })
  }

  return [...uit, ...taken]
}

export type ActieUitkomst = { ok: true } | { ok: false; status: number; error: string }

/** Eén knop van het bord: dezelfde functie als het werkscherm van die soort zou aanroepen. */
export async function aanvraagActie(payload: Payload, me: AuthedUser, sleutel: string, actie: string, toelichting = ''): Promise<ActieUitkomst> {
  const s = ontleedSleutel(sleutel)
  if (!s) return { ok: false, status: 400, error: 'Onbekende aanvraag.' }
  const t = toelichting.trim()
  const fout = (status: number, error: string): ActieUitkomst => ({ ok: false, status, error })
  // De knoppen die het bord toont, zijn de enige die hier doorkomen (zie actiesVoor).
  const bekend = (code: string) => actiesVoor({ bron: s.bron, statusCode: code, open: true, bronId: s.id }).some((a) => a.id === actie && !a.href)

  try {
    switch (s.bron) {
      case 'verplaatsing': {
        // Het bord toont de knoppen pas als de aanvraag bij de federatie ligt; de API is even streng,
        // ook al zou lib/verplaatsing.ts de federatie eerder laten beslissen.
        const doc = await payload.findByID({ collection: 'verplaatsingsaanvragen', id: s.id, depth: 0, overrideAccess: true }).catch(() => null)
        if (!doc) return fout(404, 'Aanvraag niet gevonden.')
        if (!bekend(String(doc.status))) return fout(409, doc.status === 'wacht_tegenpartij' ? 'De tegenpartij moet eerst antwoorden.' : 'Deze aanvraag is al behandeld.')
        const r = await verplaatsingBeantwoorden(payload, me, s.id, actie as 'goedkeuren' | 'afwijzen', t || null)
        return r.ok ? { ok: true } : fout(r.status, r.error)
      }
      case 'registratie': {
        if (!bekend('ingediend')) return fout(400, 'Onbekende actie.')
        const r = await registratiesBeoordelen(payload, me.id, [s.id], { besluit: actie as 'goedkeuren' | 'afkeuren', reden: t || undefined })
        return r.verwerkt.length ? { ok: true } : fout(409, 'Dit lid staat niet (meer) ter beoordeling.')
      }
      case 'klacht': {
        if (!bekend('open')) return fout(400, 'Onbekende actie.')
        await klachtBehandelen(payload, me, s.id, actie as 'heropenen' | 'afwijzen', t)
        return { ok: true }
      }
      case 'boete': {
        const doc = await payload.findByID({ collection: 'boetes', id: s.id, depth: 0, overrideAccess: true }).catch(() => null)
        if (!doc) return fout(404, 'Boete niet gevonden.')
        if (!bekend(String(doc.status))) return fout(400, 'Die actie past niet bij de stand van deze boete.')
        const r = await boeteBehandelen(payload, s.id, actie as 'opleggen' | 'vernietigen' | 'betaald' | 'handhaven', { opmerking: t || null })
        return r.ok ? { ok: true } : fout(r.status, r.error)
      }
      case 'ongeval': {
        if (!bekend('ingediend')) return fout(400, 'Onbekende actie.')
        const r = await ongevalBeoordelen(payload, s.id, actie as 'afhandelen' | 'terugsturen', t || undefined)
        return r.ok ? { ok: true } : fout(r.status, r.error)
      }
      case 'kaart': {
        if (!bekend('aangevraagd')) return fout(400, 'Onbekende actie.')
        const n = await kaartBehandelen(payload, [s.id], actie as 'verstuurd' | 'geweigerd', t || undefined)
        return n > 0 ? { ok: true } : fout(409, 'Deze aanvraag is al behandeld.')
      }
      case 'afgelasting': {
        if (actie !== 'intrekken') return fout(400, 'Een nieuwe datum kies je op het werkscherm Afgelastingen.')
        const r = await afgelastingIntrekken(payload, s.id)
        return r.ok ? { ok: true } : fout(r.status, r.error)
      }
      case 'inschrijving': {
        if (!bekend('ingediend')) return fout(400, 'Onbekende actie.')
        const r = await inschrijvingVerwerken(payload, s.id)
        return r.ok ? { ok: true } : fout(r.status, r.error)
      }
      case 'rapport': {
        if (!bekend('ingediend')) return fout(400, 'Onbekende actie.')
        const r = await rapportAfhandelen(payload, me, s.id, t)
        return r.ok ? { ok: true } : fout(r.status, r.error)
      }
      case 'uitlening': {
        const doc = await payload.findByID({ collection: 'uitleningen', id: s.id, depth: 0, overrideAccess: true }).catch(() => null)
        if (!doc) return fout(404, 'Overeenkomst niet gevonden.')
        if (!bekend(String(doc.status))) return fout(409, doc.status === 'wacht_ontvanger' ? 'De ontvangende club moet eerst tekenen.' : 'Deze overeenkomst is al behandeld.')
        const r = await uitleningBehandelen(payload, me, s.id, actie as 'bevestigen' | 'weigeren', t)
        return r.ok ? { ok: true } : fout(r.status, r.error)
      }
      case 'taak': {
        if (actie !== 'afronden') return fout(400, 'Onbekende actie.')
        const r = await dossierBijwerken(payload, me, sleutel, { actie: 'afronden' })
        return r.ok ? { ok: true } : fout(r.status, r.error)
      }
    }
  } catch (err) {
    return fout(400, (err as Error).message)
  }
}

export type { Bron }
