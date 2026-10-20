import type { Payload, Where } from 'payload'

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
  const iso = (ms: number) => new Date(ms).toISOString()

  const [registraties, komend, live, recentAf, clubs, beheerders] = await Promise.all([
    payload.count({ collection: 'players', where: { registratieStatus: { equals: 'ingediend' } }, overrideAccess: true }),
    payload.find({
      collection: 'matches',
      where: { and: [...COMPETITIE, { status: { equals: 'scheduled' } }, { date: { greater_than_equal: iso(t) } }, { date: { less_than: iso(t + 14 * DAG) } }] },
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
