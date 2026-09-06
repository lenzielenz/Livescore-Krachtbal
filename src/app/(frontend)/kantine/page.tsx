import Link from 'next/link'
import type { Payload } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { formatTimeBE } from '@/lib/datetime'
import { sanitizeKantineSelectie, schermVenster } from '@/lib/kantine-selectie'
import { buildMatchState } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { KantineClubLink } from './KantineClubLink'
import { MijnKantineScherm } from './MijnKantineScherm'
import { type KantineMatch } from './KantineBoard'
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

/** De wedstrijden waaruit je "losse wedstrijden" kan kiezen: vandaag + de komende week. */
async function weekWedstrijden(payload: Payload): Promise<KantineMatch[]> {
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

  const lijst: KantineMatch[] = []
  for (const m of docs) {
    try {
      const s = await buildMatchState(payload, m.id)
      lijst.push({
        id: m.id,
        reeks: reeksLabel(m.reeks),
        time: formatTimeBE(m.date),
        date: typeof m.date === 'string' ? m.date : null,
        status: s.match.status,
        home: { name: s.teams.home.name, logoUrl: s.teams.home.logoUrl, logoFit: s.teams.home.logoFit, colors: s.teams.home.colors },
        away: { name: s.teams.away.name, logoUrl: s.teams.away.logoUrl, logoFit: s.teams.away.logoFit, colors: s.teams.away.colors },
        score: s.score,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
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
  const ploegen = teamsRes.docs
    .map((t) => ({
      id: t.id as number,
      name: String((t as { name?: unknown }).name ?? ''),
      clubId: relId((t as { club?: unknown }).club),
    }))
    .filter((t) => t.name)

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
  const bewaard = sanitizeKantineSelectie((me as { kantineScherm?: unknown }).kantineScherm)
  // Nog niets gekozen? Zet de eigen club alvast klaar — voor bijna iedereen de juiste keuze, en
  // één tik minder om het scherm werkend te krijgen. Bewaren gebeurt pas bij de eerste wijziging.
  const eigenClub = Number(userClubId(me))
  const heeftEigenClub = Number.isFinite(eigenClub) && eigenClub > 0
  const leegBewaard =
    bewaard.clubIds.length === 0 && bewaard.teamIds.length === 0 && bewaard.matchIds.length === 0
  const initieel = leegBewaard && heeftEigenClub ? { ...bewaard, clubIds: [eigenClub] } : bewaard

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
