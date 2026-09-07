import Link from 'next/link'
import type { Payload } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { formatTimeBE } from '@/lib/datetime'
import { nieuwProfiel, sanitizeProfielen } from '@/lib/kantine-profielen'
import { schermVenster } from '@/lib/kantine-selectie'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { KantineClubLink } from './KantineClubLink'
import { MijnKantineScherm, type KantineKeuze } from './MijnKantineScherm'
import './kantine.css'

export const dynamic = 'force-dynamic'

const reeksLabel = (v: unknown) => reeksNaam(v)

// Kantine — jouw eigen scherm samenstellen.
//
// 2026-09-06: dit was één centrale lijst voor het hele platform (settings.kantineMatchIds): wat de
// ene club aanvinkte, kregen alle andere clubs te zien. Het tornooischerm werkte wél goed, dus nu
// hetzelfde principe voor de competitie, maar per ingelogde gebruiker: kies je club (en eventueel
// losse ploegen of wedstrijden), zet je vaste link op de kantine-tv, klaar voor het seizoen. Het
// scherm zelf staat op /kantine/scherm/<jouw id> en heeft op de tv geen login nodig.

const teamId = (rel: unknown): number | null => {
  const raw = rel && typeof rel === 'object' ? (rel as { id?: unknown }).id : rel
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/**
 * De wedstrijden waaruit je "losse wedstrijden" kan kiezen: vandaag + de komende week.
 *
 * Bewust MAGER. Dit haalde vroeger per wedstrijd de volledige matchstate op (buildMatchState,
 * ~10 query's elk, sequentieel) terwijl de kiezer hieronder enkel het uur, de reeks, de status en
 * de twee ploegnamen toont — geen stand, geen logo's. Bij een volle speelweek (het venster is een
 * week vooruit, over álle clubs) waren dat duizenden round-trips naar de database, en omdat deze
 * pagina op de server rendert kreeg je ondertussen een wit scherm te zien. Nu: twee query's voor
 * de wedstrijden en één voor alle ploegnamen samen.
 */
async function weekWedstrijden(payload: Payload): Promise<KantineKeuze[]> {
  const { dagStart, geplandTot } = schermVenster()
  const [weekRes, liveRes] = await Promise.all([
    payload.find({
      collection: 'matches',
      where: { and: [{ date: { greater_than_equal: dagStart, less_than: geplandTot } }, competitionWhere()] },
      sort: 'date',
      depth: 0,
      limit: 200,
    }),
    payload.find({
      collection: 'matches',
      where: { and: [{ status: { equals: 'live' } }, competitionWhere()] },
      depth: 0,
      limit: 50,
    }),
  ])

  const gezien = new Set<number>()
  const docs = [...liveRes.docs, ...weekRes.docs].filter((m) => {
    if (gezien.has(m.id) || (m as { isDemo?: boolean }).isDemo || (m as { analyseOnly?: boolean }).analyseOnly) return false
    gezien.add(m.id)
    return true
  })

  const ploegIds = [
    ...new Set(docs.flatMap((m) => [teamId(m.homeTeam), teamId(m.awayTeam)]).filter((n): n is number => n != null)),
  ]
  const ploegRes = ploegIds.length
    ? await payload
        .find({ collection: 'teams', where: { id: { in: ploegIds } }, depth: 0, pagination: false, select: { name: true } })
        .catch(() => ({ docs: [] as { id: number; name?: unknown }[] }))
    : { docs: [] as { id: number; name?: unknown }[] }
  const ploegNaam = new Map(ploegRes.docs.map((t) => [Number(t.id), String((t as { name?: unknown }).name ?? '')]))

  const lijst: KantineKeuze[] = []
  for (const m of docs) {
    const thuis = ploegNaam.get(teamId(m.homeTeam) ?? -1)
    const uit = ploegNaam.get(teamId(m.awayTeam) ?? -1)
    // Wedstrijd met een ontbrekende ploeg overslaan — je kan er toch niets zinnigs mee kiezen.
    if (!thuis || !uit) continue
    lijst.push({
      id: m.id,
      reeks: reeksLabel(m.reeks),
      time: formatTimeBE(m.date),
      status: m.status ?? 'scheduled',
      home: { name: thuis },
      away: { name: uit },
    })
  }
  return lijst
}

export default async function KantinePage() {
  const payload = await getPayloadClient()
  const me = await getAuthUser()

  const [clubsRes, teamsRes] = await Promise.all([
    payload
      .find({ collection: 'clubs', where: competitionWhere(), sort: 'name', depth: 0, limit: 500 })
      .catch(() => ({ docs: [] as { id: number; name?: unknown }[] })),
    payload
      .find({ collection: 'teams', where: competitionWhere(), sort: 'name', depth: 0, limit: 800 })
      .catch(() => ({ docs: [] as { id: number; name?: unknown; club?: unknown }[] })),
  ])

  const clubs = clubsRes.docs
    .map((c) => ({ id: c.id as number, name: String((c as { name?: unknown }).name ?? '') }))
    .filter((c) => c.name)

  const relId = (rel: unknown): number | null => {
    if (rel == null) return null
    const raw = typeof rel === 'object' ? (rel as { id?: unknown }).id : rel
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  // De reeks (of anders de categorie) hoort bij de naam: een club heeft vlot een dozijn ploegen
  // die állemaal "KBC St. Michiels" heten, en zonder dat label is een chiplijst een muur van
  // dezelfde tekst. Zelfde oplossing als de ploegkiezer op /club (MyTeamsPicker).
  const ploegen = teamsRes.docs
    .map((t) => {
      const code = String((t as { reeks?: unknown }).reeks ?? '')
      const cat = String((t as { category?: unknown }).category ?? '')
      return {
        id: t.id as number,
        name: String((t as { name?: unknown }).name ?? ''),
        clubId: relId((t as { club?: unknown }).club),
        sub: code ? reeksNaam(code as Parameters<typeof reeksNaam>[0]) : cat,
      }
    })
    .filter((t) => t.name)
    // Op reeks sorteren zet gelijknamige ploegen netjes op volgorde in plaats van willekeurig.
    .sort((a, b) => a.name.localeCompare(b.name) || a.sub.localeCompare(b.sub))

  // Niet ingelogd: er valt niets te bewaren. Toon wél de uitleg en de vaste clublink — die werkt
  // ook zonder account — en wijs naar het aanmeldscherm.
  if (!me) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="kt-page">
          <h1 className="page-title"><span className="brand">Kantine</span> · jouw scherm</h1>
          <section className="kt-uitleg">
            <h2 className="kt-uitleg-title">📺 Maak je eigen kantinescherm</h2>
            <p className="kt-uitleg-lead">
              Meld je aan en stel in één minuut je eigen scherm samen: kies je club en alle
              wedstrijden komen er heel het jaar automatisch op — live zodra ze starten, en
              doordeweeks zie je wat er die week gepland staat. Losse ploegen of affiches van andere
              clubs mag je erbij kiezen.
            </p>
            <p>
              <Link href="/login" className="kt-screen-btn">Aanmelden →</Link>
            </p>
          </section>
          <KantineClubLink clubs={clubs} myClubId={null} />
        </div>
      </>
    )
  }

  const matches = await weekWedstrijden(payload)
  // Wat er al bewaard was: één of meerdere schermen. Een keuze van vóór de profielen bestonden
  // komt er als één profiel uit (zie kantine-profielen.ts) — de tv die eraan hangt blijft dus
  // gewoon draaien.
  const bewaard = sanitizeProfielen((me as { kantineScherm?: unknown }).kantineScherm)
  // Nog niets gekozen? Zet de eigen club alvast klaar — voor bijna iedereen de juiste keuze, en
  // één tik minder om het scherm werkend te krijgen. Bewaren gebeurt pas bij de eerste wijziging.
  const eigenClub = Number(userClubId(me))
  const heeftEigenClub = Number.isFinite(eigenClub) && eigenClub > 0
  const initieel =
    bewaard.length === 0 && heeftEigenClub
      ? [{ ...nieuwProfiel([]), clubIds: [eigenClub] }]
      : bewaard

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="kt-page">
        <h1 className="page-title"><span className="brand">Kantine</span> · jouw scherm</h1>
        <MijnKantineScherm
          userId={Number(me.id)}
          clubs={clubs}
          ploegen={ploegen}
          matches={matches}
          initieel={initieel}
        />
        <KantineClubLink clubs={clubs} myClubId={heeftEigenClub ? eigenClub : null} />
      </div>
    </>
  )
}
