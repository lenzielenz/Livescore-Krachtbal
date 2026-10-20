import type { Payload, Where } from 'payload'

import { eindrondeStatus } from './competitieregels'
import { formatDateTimeBE } from './datetime'

// Wat staat er voor de federatie nog te doen? Eén lijst taken, elk met een aantal, een paar
// voorbeelden en de plek waar je het oplost. Gelezen bij elke paginalading van /federatie: enkel
// tellingen en de eerste paar items, geen zware aggregaties.

export type TaakItem = { label: string; href?: string }
export type Taak = {
  sleutel: string
  icoon: string
  titel: string
  uitleg: string
  aantal: number
  /** 'rood' = moet nu, 'oranje' = deze week, 'groen' = niets te doen. */
  dringend: 'rood' | 'oranje' | 'groen'
  href: string
  actie: string
  items: TaakItem[]
}

const DAG = 86_400_000
const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const naamVan = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '') : '')
const wedstrijdLabel = (m: { homeTeam?: unknown; awayTeam?: unknown; date?: unknown }) =>
  `${naamVan(m.homeTeam) || '?'} – ${naamVan(m.awayTeam) || '?'} · ${m.date ? formatDateTimeBE(String(m.date)) : ''}`

const COMPETITIE: Where[] = [{ analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }]

export async function federatieTaken(payload: Payload, nu: Date = new Date()): Promise<Taak[]> {
  const t = nu.getTime()
  const verplaatsingenOpen = await payload
    .count({ collection: 'verplaatsingsaanvragen', where: { status: { equals: 'wacht_federatie' } }, overrideAccess: true })
    .catch(() => ({ totalDocs: 0 }))
  const inschrijvingenOpen = await payload
    .count({ collection: 'inschrijvingen', where: { status: { equals: 'ingediend' } }, overrideAccess: true })
    .catch(() => ({ totalDocs: 0 }))
  const boetesOpen = await payload
    .count({ collection: 'boetes', where: { status: { in: ['voorstel', 'betwist', 'betaling_gemeld'] } }, overrideAccess: true })
    .catch(() => ({ totalDocs: 0 }))
  const iso = (ms: number) => new Date(ms).toISOString()

  const [registraties, komend, live, recentAf, clubs, beheerders, kaarten, ongevallen, ongevallenOpen, afgelast] = await Promise.all([
    payload.count({ collection: 'players', where: { registratieStatus: { equals: 'ingediend' } }, overrideAccess: true }),
    payload.find({
      collection: 'matches',
      // Afgelaste wedstrijden staan apart (taak "Afgelaste wedstrijden"), niet als opstelling of scheidsrechter te regelen.
      where: { and: [...COMPETITIE, { status: { equals: 'scheduled' } }, { afgelast: { not_equals: true } }, { date: { greater_than_equal: iso(t) } }, { date: { less_than: iso(t + 14 * DAG) } }] },
      sort: 'date',
      depth: 1,
      limit: 500,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'matches',
      where: { and: [...COMPETITIE, { status: { equals: 'live' } }, { date: { less_than: iso(t - 4 * 3600_000) } }] },
      depth: 1,
      limit: 50,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'matches',
      where: { and: [...COMPETITIE, { status: { equals: 'finished' } }, { date: { greater_than_equal: iso(t - 30 * DAG) } }] },
      sort: '-date',
      depth: 1,
      limit: 500,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({ collection: 'clubs', where: { analyseOnly: { not_equals: true } }, depth: 0, limit: 500, pagination: false, overrideAccess: true }),
    payload.find({ collection: 'users', where: { roles: { contains: 'club-beheerder' } }, depth: 0, limit: 2000, pagination: false, overrideAccess: true }),
    payload.count({ collection: 'medische-kaart-aanvragen', where: { status: { equals: 'aangevraagd' } }, overrideAccess: true }),
    payload.find({ collection: 'accidents', where: { status: { equals: 'ingediend' } }, sort: 'ingediendOp', depth: 0, limit: 4, overrideAccess: true }),
    payload.count({ collection: 'accidents', where: { status: { equals: 'gemeld' } }, overrideAccess: true }),
    payload.find({ collection: 'afgelastingen', where: { status: { equals: 'gemeld' } }, sort: 'createdAt', depth: 2, limit: 4, overrideAccess: true }),
  ])

  const matchIds = [...komend.docs, ...recentAf.docs].map((m) => Number(m.id))
  const bladen = matchIds.length
    ? await payload.find({ collection: 'matchsheets', where: { match: { in: matchIds } }, depth: 0, limit: matchIds.length, pagination: false, overrideAccess: true })
    : { docs: [] }
  const bladVan = new Map(bladen.docs.map((b) => [relId(b.match), b]))

  const zonderRef = komend.docs.filter((m) => relId(bladVan.get(Number(m.id))?.assignedReferee) == null)
  const binnen48 = komend.docs.filter((m) => new Date(String(m.date)).getTime() < t + 2 * DAG)
  const opstellingOpen = binnen48.filter((m) => {
    const b = bladVan.get(Number(m.id))
    return !b?.homeLineupConfirmed || !b?.awayLineupConfirmed
  })
  const nietIngediend = recentAf.docs.filter((m) => bladVan.get(Number(m.id))?.status !== 'ingediend')

  // Clubs met ploegen maar zonder iemand die de club kan beheren: die club kan niets registreren.
  const metBeheerder = new Set(beheerders.docs.map((u) => relId(u.club)).filter((x): x is number => x != null))
  const ploegen = await payload.find({ collection: 'teams', where: { analyseOnly: { not_equals: true } }, depth: 0, limit: 2000, pagination: false, overrideAccess: true })
  const clubsMetPloeg = new Set(ploegen.docs.map((p) => relId(p.club)).filter((x): x is number => x != null))
  const zonderLogin = clubs.docs.filter((c) => clubsMetPloeg.has(Number(c.id)) && !metBeheerder.has(Number(c.id)))

  const kleur = (n: number, rood: boolean): Taak['dringend'] => (n === 0 ? 'groen' : rood ? 'rood' : 'oranje')

  // Eindrondes volgens de regels: klaar om te starten (het systeem maakt ze zelf aan na de volgende
  // afgelopen wedstrijd) of al aangemaakt in de laatste 14 dagen (kalender nakijken).
  const eindRegels = await payload.find({ collection: 'competitieregels', where: { and: [{ soort: { equals: 'eindronde' } }, { actief: { equals: true } }] }, depth: 0, limit: 20, overrideAccess: true })
  const eindItems: TaakItem[] = []
  for (const r of eindRegels.docs) {
    const st = await eindrondeStatus(payload, r as never).catch(() => null)
    if (!st) continue
    if (st.bestaat) {
      const er = await payload.findByID({ collection: 'eindrondes', id: st.bestaat, depth: 0, overrideAccess: true }).catch(() => null)
      if (er && t - new Date(String(er.createdAt)).getTime() < 14 * DAG) eindItems.push({ label: `${st.naam}: aangemaakt — kijk de kalender na`, href: `/eindronde/${st.bestaat}` })
    } else if (st.klaar) eindItems.push({ label: `${st.naam}: reeksen uitgespeeld, ${st.doorgaan.length} ploegen gaan door`, href: '/federatie/reglement' })
  }
  const eersteRefDatum = zonderRef[0] ? new Date(String(zonderRef[0].date)).getTime() : Infinity

  return [
    {
      sleutel: 'registraties',
      icoon: '📥',
      titel: 'Spelers goed te keuren',
      uitleg: 'Door clubs ingediend, wachten op jouw controle van het attest.',
      aantal: registraties.totalDocs,
      dringend: kleur(registraties.totalDocs, registraties.totalDocs > 20),
      href: '/beheer/leden',
      actie: 'Keuren',
      items: [],
    },
    {
      sleutel: 'eindrondes',
      icoon: '🏁',
      titel: 'Eindrondes',
      uitleg: 'Volgens de regels van het reglement; het systeem maakt ze zelf aan.',
      aantal: eindItems.length,
      dringend: kleur(eindItems.length, false),
      href: '/federatie/reglement',
      actie: 'Bekijken',
      items: eindItems.slice(0, 4),
    },
    {
      sleutel: 'verplaatsingen',
      icoon: '🔁',
      titel: 'Verplaatsingen te beslissen',
      uitleg: 'Een club vroeg een andere datum en de tegenpartij ging akkoord.',
      aantal: verplaatsingenOpen.totalDocs,
      dringend: kleur(verplaatsingenOpen.totalDocs, false),
      href: '/beheer/planner',
      actie: 'Beslissen',
      items: [],
    },
    {
      sleutel: 'inschrijvingen',
      icoon: '📝',
      titel: 'Inschrijvingen te verwerken',
      uitleg: 'Door de club ingediend: verwerken zet de ploegen klaar voor de kalender.',
      aantal: inschrijvingenOpen.totalDocs,
      dringend: kleur(inschrijvingenOpen.totalDocs, false),
      href: '/beheer/inschrijvingen',
      actie: 'Verwerken',
      items: [],
    },
    {
      sleutel: 'boetes',
      icoon: '💶',
      titel: 'Boetes te beoordelen',
      uitleg: 'Voorstellen van het systeem (forfait, blad te laat, aftrap later), betwistingen en gemelde betalingen.',
      aantal: boetesOpen.totalDocs,
      dringend: kleur(boetesOpen.totalDocs, false),
      href: '/beheer/boetes',
      actie: 'Beoordelen',
      items: [],
    },
    {
      sleutel: 'afgelastingen',
      icoon: '⛈️',
      titel: 'Afgelaste wedstrijden',
      uitleg: "Door de scheidsrechter afgelast, met foto's. Plan een nieuwe datum.",
      aantal: afgelast.totalDocs,
      dringend: kleur(afgelast.totalDocs, false),
      href: '/beheer/afgelastingen',
      actie: 'Herplannen',
      items: afgelast.docs.map((a) => ({ label: a.match && typeof a.match === 'object' ? wedstrijdLabel(a.match) : 'Wedstrijd', href: '/beheer/afgelastingen' })),
    },
    {
      sleutel: 'ongevallen',
      icoon: '🚑',
      titel: 'Ongevalsdossiers te behandelen',
      uitleg: `Ingediend door speler of club. ${ongevallenOpen.totalDocs} blessure(s) wachten nog op documenten.`,
      aantal: ongevallen.totalDocs,
      dringend: kleur(ongevallen.totalDocs, false),
      href: '/ongevallen',
      actie: 'Behandelen',
      items: ongevallen.docs.map((a) => ({ label: String(a.slachtofferNaam ?? ''), href: '/ongevallen' })),
    },
    {
      sleutel: 'kaarten',
      icoon: '🩺',
      titel: 'Medische kaarten aangevraagd',
      uitleg: 'Door een lid of zijn club; lid en club krijgen bericht zodra je ze behandelt.',
      aantal: kaarten.totalDocs,
      dringend: kleur(kaarten.totalDocs, false),
      href: '/beheer/leden#kaarten',
      actie: 'Behandelen',
      items: [],
    },
    {
      sleutel: 'scheidsrechters',
      icoon: '🧑‍⚖️',
      titel: 'Wedstrijden zonder scheidsrechter',
      uitleg: 'In de komende 14 dagen.',
      aantal: zonderRef.length,
      dringend: kleur(zonderRef.length, eersteRefDatum < t + 3 * DAG),
      href: '/beheer/scheidsrechters',
      actie: 'Toewijzen',
      items: zonderRef.slice(0, 4).map((m) => ({ label: wedstrijdLabel(m) })),
    },
    {
      sleutel: 'opstellingen',
      icoon: '📋',
      titel: 'Opstelling niet bevestigd',
      uitleg: 'Wedstrijden binnen 48 uur waar een club de opstelling nog niet bevestigde.',
      aantal: opstellingOpen.length,
      dringend: kleur(opstellingOpen.length, true),
      href: '/beheer/wedstrijden',
      actie: 'Bekijken',
      items: opstellingOpen.slice(0, 4).map((m) => ({ label: wedstrijdLabel(m), href: `/opstelling/${m.id}` })),
    },
    {
      sleutel: 'bladen',
      icoon: '📝',
      titel: 'Wedstrijdblad niet ingediend',
      uitleg: 'Afgelopen wedstrijden (laatste 30 dagen) zonder ingediend blad.',
      aantal: nietIngediend.length,
      dringend: kleur(nietIngediend.length, false),
      href: '/beheer/wedstrijden?filter=bladen',
      actie: 'Bekijken',
      items: nietIngediend.slice(0, 4).map((m) => ({ label: wedstrijdLabel(m), href: `/scheidsrechter/${m.id}` })),
    },
    {
      sleutel: 'live',
      icoon: '⏱️',
      titel: 'Vergeten af te sluiten',
      uitleg: 'Staat al meer dan 4 uur live.',
      aantal: live.docs.length,
      dringend: kleur(live.docs.length, true),
      href: '/beheer/wedstrijden?filter=live',
      actie: 'Afsluiten',
      items: live.docs.slice(0, 4).map((m) => ({ label: wedstrijdLabel(m), href: `/scheidsrechter/${m.id}` })),
    },
    {
      sleutel: 'clubs',
      icoon: '🏟️',
      titel: 'Clubs zonder login',
      uitleg: 'Club met ploegen maar zonder clubbeheerder: kan geen leden registreren.',
      aantal: zonderLogin.length,
      dringend: kleur(zonderLogin.length, false),
      href: '/beheer/clubs',
      actie: 'Uitnodigen',
      items: zonderLogin.slice(0, 4).map((c) => ({ label: String(c.name ?? '') })),
    },
  ]
}
