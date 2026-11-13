import Link from 'next/link'
import type { Payload } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { OPEN_STATUSSEN } from '@/lib/boetes'
import { clinchStatus } from '@/lib/championship'
import { magOpstellingVoor } from '@/lib/club-functies'
import { clubOverzicht, type LidToon } from '@/lib/club-overzicht'
import { dateStrBE, formatDateBE, shiftDateStr, zaterdagVan } from '@/lib/datetime'
import { facturenLijst } from '@/lib/facturatie-server'
import { getAuthUser } from '@/lib/auth-user'
import { clubLogoFit, clubLogoUrl } from '@/lib/match-engine'
import { getMatchReadiness } from '@/lib/matchsheet-data'
import { sheetOpenForScoring } from '@/lib/matchsheet-workflow'
import { getPayloadClient } from '@/lib/payload-client'
import { buildReeksStandings } from '@/lib/reeks-standings'
import { reeksNaam, REEKS_OPTIONS } from '@/lib/reeksen'
import { registratieIcoon } from '@/lib/registratie'
import { emailVanaf } from '@/lib/registratie-server'
import { isSupportersMode } from '@/lib/score-mode'
import { claimHeld, sanitizeTrust } from '@/lib/score-trust'
import { formatEuro } from '@/lib/vergoeding'
import { clubActies, primaireActie } from '@/lib/wedstrijddag-acties'
import { ClaimButton } from './ClaimButton'
import { ClubDashboard } from './ClubDashboard'
import { type ClubTab, ClubTabs, ClubTegels, zichtbareTabs } from './ClubMenu'
import { InstagramWeekendCard } from './InstagramWeekendCard'
import { MyTeamsPicker } from './MyTeamsPicker'

export const dynamic = 'force-dynamic'

// "Mijn club" — in vijf vaste tabbladen (ClubMenu.tsx), in plaats van alles onder elkaar:
//   Overzicht   wat te doen is + de wedstrijden van dit en volgend weekend (het startpunt)
//   Wedstrijden alle komende wedstrijden, per speelweekend (de eerste twee open, de rest ingeklapt)
//   Leden       ledenbestand per ploeg en alles rond registratie                    (clubstaf)
//   Geld        wat er open staat: facturen, boetes, scheidsrechterskosten            (clubstaf)
//   Meer        statistieken, schermen, pronostiek, referendum, inschrijving, Instagram
// Elk tabblad laadt enkel wat het toont. Welke knoppen bij een wedstrijd horen, hangt van de aantekenmodus
// af (wedstrijddag-acties.ts): in federatiemodus de opstelling, in supportersmodus meteen aantekenen.

const nameOf = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')

type Row = {
  id: number
  reeks: string
  reeksCode: string
  date: string
  status: string
  side: 'home' | 'away'
  /** Id van de eigen (club-)ploeg in deze wedstrijd, voor de "Mijn ploegen"-focus. */
  myTeamId: number
  /** Mag deze gebruiker de opstelling van de eigen ploeg zetten (clubstaf, coach, jeugdverantwoordelijke)? */
  magOpstelling: boolean
  afgelast: boolean
  home: string
  away: string
  /** Opstelling van de eigen ploeg klaar? Null = niet nagekeken (ver weg; de badge verschijnt dichterbij). */
  ownReady: boolean | null
  location: string
  coachName: string | null
  coachMine: boolean
  takeoverName: string | null
  takeoverMine: boolean
  refereeName: string | null
  sheetStatus: string | null
  claimedByOther: boolean
  claimedByName: string | null
}

function Shell({ children, tabs }: { children: React.ReactNode; tabs?: React.ReactNode }) {
  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site">
        <h1 className="page-title">
          <span className="brand">Mijn club</span>
        </h1>
        {tabs}
        {children}
      </div>
    </>
  )
}

/** Het speelweekend (zaterdag) van een wedstrijd, en hoe we het noemen. */
function weekendVan(datum: string): string {
  return zaterdagVan(dateStrBE(new Date(datum)))
}
function weekendLabel(za: string, ditWeekend: string): string {
  if (za === ditWeekend) return 'Dit weekend'
  if (za === shiftDateStr(ditWeekend, 7)) return 'Volgend weekend'
  return `Weekend van ${formatDateBE(new Date(`${za}T12:00:00Z`), { weekday: 'short', day: 'numeric', month: 'long' })}`
}

export default async function ClubPage({ searchParams }: { searchParams: Promise<{ alle?: string; tab?: string }> }) {
  const { alle, tab: tabRaw } = await searchParams
  const showAll = alle === '1'
  const payload = await getPayloadClient()
  const user = await getAuthUser()
  if (!user) {
    return (
      <Shell>
        <p className="empty">
          Log in als club-beheerder om je club te beheren.{' '}
          <Link href="/inloggen" className="hub-pill">
            Inloggen →
          </Link>
        </p>
      </Shell>
    )
  }
  const clubId = userClubId(user)
  const isBeheerder = hasRole(user, 'club-beheerder') || isFederationLevel(user)
  // Clubstaf (en federatie) beheert alle wedstrijden van de club en tekent aan; een coach zet enkel
  // de opstelling van zijn ploegen.
  const clubStaf = isFederationLevel(user) || hasRole(user, 'club-beheerder', 'club-medewerker')
  const magAantekenen = clubStaf || hasRole(user, 'scorekeeper')
  if (clubId == null) {
    return (
      <Shell>
        <p className="empty">Je account is nog niet aan een club gekoppeld. Vraag de federatie om je gebruiker aan je club te koppelen.</p>
      </Shell>
    )
  }
  const tabs = zichtbareTabs(clubStaf)
  const tab: ClubTab = tabs.includes(tabRaw as ClubTab) ? (tabRaw as ClubTab) : 'overzicht'

  const [club, teams, supportersMode] = await Promise.all([
    payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null),
    payload.find({ collection: 'teams', where: { and: [{ club: { equals: clubId } }, competitionWhere()] }, depth: 0, limit: 200 }),
    isSupportersMode(payload),
  ])
  const teamIds = teams.docs.map((t) => t.id)
  if (teamIds.length === 0) {
    return (
      <Shell tabs={<ClubTabs actief={tab} staf={clubStaf} />}>
        <p className="empty">{club?.name ? `${club.name}: ` : ''}nog geen ploegen geregistreerd.</p>
        {tab === 'meer' && <ClubTegels tab="meer" staf={clubStaf} beheerder={isBeheerder} />}
      </Shell>
    )
  }

  // ── Wedstrijden (Overzicht en Wedstrijden) ──
  const metWedstrijden = tab === 'overzicht' || tab === 'wedstrijden'
  const ditWeekend = zaterdagVan(dateStrBE())
  const volgendWeekend = shiftDateStr(ditWeekend, 7)
  const rows = metWedstrijden ? await wedstrijdRijen(payload, user, clubId, teamIds, supportersMode, tab === 'wedstrijden' ? null : volgendWeekend) : []

  // "Mijn ploegen": de eigen voorkeur van de trainer/coach (team-ids); een coach zonder keuze ziet de
  // ploegen waarvan hij de opstelling zet (lib/club-functies.ts).
  const teamIdSet = new Set(teamIds.map(Number))
  const allTeams = teams.docs.map((t) => {
    const code = String((t as { reeks?: unknown }).reeks ?? '')
    const cat = String((t as { category?: unknown }).category ?? '')
    return { id: Number(t.id), name: String((t as { name?: unknown }).name ?? '—'), sub: code ? reeksNaam(code as Parameters<typeof reeksNaam>[0]) : cat }
  })
  const rawMine = (user as { myTeams?: unknown }).myTeams
  const functiePloegen = clubStaf
    ? []
    : teams.docs.filter((t) => magOpstellingVoor(user, { id: t.id, club: clubId, category: String((t as { category?: unknown }).category ?? '') })).map((t) => Number(t.id))
  const myTeams = (Array.isArray(rawMine) && rawMine.length ? rawMine.map(Number).filter((n) => Number.isFinite(n)) : functiePloegen).filter((id) => teamIdSet.has(id))
  const mySet = new Set(myTeams)
  const focusing = mySet.size > 0 && !showAll
  const visibleRows = focusing ? rows.filter((r) => mySet.has(r.myTeamId)) : rows

  // ── Clubdashboard (Overzicht: kop, cijfers, te doen; Leden: ploegtabel) ──
  const tweeWeken = Date.now() + 14 * 86_400_000
  const ov = clubStaf && (tab === 'overzicht' || tab === 'leden') ? await clubCijfers(payload, clubId, teams.docs as unknown as Record<string, unknown>[], rows, supportersMode, tweeWeken) : null
  const seizoenStart = Number(((await payload.findGlobal({ slug: 'season' }).catch(() => null)) as { startYear?: unknown } | null)?.startYear)
  const seizoen = Number.isFinite(seizoenStart) && seizoenStart > 0 ? `${seizoenStart}–${seizoenStart + 1}` : null
  const dashboard = (delen: ('kop' | 'cijfers' | 'taken' | 'ploegen')[]) =>
    ov ? (
      <ClubDashboard
        club={{ naam: String(club?.name ?? ''), logoUrl: clubLogoUrl({ club }), logoFit: clubLogoFit({ club }) }}
        seizoen={seizoen}
        kerncijfers={ov.kerncijfers}
        teDoen={ov.teDoen}
        ploegen={ov.ploegen}
        delen={delen}
      />
    ) : null

  const tabBalk = <ClubTabs actief={tab} staf={clubStaf} tellers={ov && tab === 'overzicht' ? { overzicht: ov.teDoen.length } : {}} />
  const kaart = (m: Row) => <WedstrijdKaart key={m.id} m={m} supportersMode={supportersMode} magAantekenen={magAantekenen} />
  const focusBalk =
    mySet.size > 0 ? (
      <p className="myteams-focusbar">
        {focusing ? (
          <>
            Gefocust op jouw ploeg(en).{' '}
            <Link href={`/club?${new URLSearchParams({ ...(tab !== 'overzicht' ? { tab } : {}), alle: '1' })}`} className="myteams-link">
              Toon alle ploegen →
            </Link>
          </>
        ) : (
          <>
            Je ziet alle ploegen van de club.{' '}
            <Link href={tab === 'overzicht' ? '/club' : `/club?tab=${tab}`} className="myteams-link">
              ← Enkel mijn ploeg(en)
            </Link>
          </>
        )}
      </p>
    ) : null

  // ── Overzicht ──
  if (tab === 'overzicht') {
    const live = visibleRows.filter((r) => r.status === 'live')
    const dit = visibleRows.filter((r) => r.status !== 'live' && weekendVan(r.date) <= ditWeekend)
    const volgend = visibleRows.filter((r) => r.status !== 'live' && weekendVan(r.date) === volgendWeekend)
    const champs = await kampioenen(payload, teams.docs as unknown as Record<string, unknown>[], focusing ? mySet : null)
    return (
      <Shell tabs={tabBalk}>
        {dashboard(['kop', 'cijfers', 'taken'])}
        {focusBalk}
        {live.length > 0 && (
          <section className="club-group">
            <h2 className="club-group-h">
              Nu bezig <span className="club-group-n">{live.length}</span>
            </h2>
            <div className="club-list">{live.map(kaart)}</div>
          </section>
        )}
        <section className="club-group">
          <h2 className="club-group-h">
            Dit weekend <span className="club-group-n">{dit.length}</span>
          </h2>
          {dit.length ? <div className="club-list">{dit.map(kaart)}</div> : <p className="empty">Geen wedstrijden dit weekend.</p>}
        </section>
        {volgend.length > 0 && (
          <section className="club-group">
            <h2 className="club-group-h">
              Volgend weekend <span className="club-group-n">{volgend.length}</span>
            </h2>
            <div className="club-list">{volgend.map(kaart)}</div>
          </section>
        )}
        <p>
          <Link href="/club?tab=wedstrijden" className="cdash-knop">
            📅 Alle komende wedstrijden →
          </Link>
        </p>
        <Kampioenen champs={champs} />
      </Shell>
    )
  }

  // ── Wedstrijden ──
  if (tab === 'wedstrijden') {
    const weekends = new Map<string, Row[]>()
    for (const r of visibleRows) {
      const k = r.status === 'live' ? 'live' : weekendVan(r.date)
      weekends.set(k, [...(weekends.get(k) ?? []), r])
    }
    const volgorde = [...weekends.keys()].sort((a, b) => (a === 'live' ? -1 : b === 'live' ? 1 : a.localeCompare(b)))
    return (
      <Shell tabs={tabBalk}>
        <MyTeamsPicker teams={allTeams} initial={myTeams} />
        {focusBalk}
        {visibleRows.length === 0 ? (
          <p className="empty">{focusing ? 'Geen geplande wedstrijden voor je gekozen ploeg(en).' : 'Geen geplande wedstrijden.'}</p>
        ) : (
          volgorde.map((k, i) => {
            const lijst = weekends.get(k)!
            const titel = k === 'live' ? 'Nu bezig' : weekendLabel(k, ditWeekend)
            // Het begin open (nu bezig + de eerste twee weekends), de rest ingeklapt met een teller.
            const open = k === 'live' || i < (weekends.has('live') ? 3 : 2)
            return open ? (
              <section key={k} className="club-group">
                <h2 className="club-group-h">
                  {titel} <span className="club-group-n">{lijst.length}</span>
                </h2>
                <div className="club-list">{lijst.map(kaart)}</div>
              </section>
            ) : (
              <details key={k} className="club-week">
                <summary>
                  <span>{titel}</span> <span className="club-group-n">{lijst.length}</span>
                  <span className="club-week-ploegen">{[...new Set(lijst.map((r) => (r.side === 'home' ? r.home : r.away)))].join(' · ')}</span>
                </summary>
                <div className="club-list">{lijst.map(kaart)}</div>
              </details>
            )
          })
        )}
        <ClubTegels tab="wedstrijden" staf={clubStaf} beheerder={isBeheerder} />
      </Shell>
    )
  }

  // ── Leden ──
  if (tab === 'leden') {
    return (
      <Shell tabs={tabBalk}>
        <ClubTegels tab="leden" staf={clubStaf} beheerder={isBeheerder} />
        {dashboard(['ploegen'])}
      </Shell>
    )
  }

  // ── Geld ──
  if (tab === 'geld') {
    const [boetes, facturen] = await Promise.all([
      payload.find({ collection: 'boetes', where: { and: [{ club: { equals: clubId } }, { status: { in: [...OPEN_STATUSSEN] } }] }, depth: 0, limit: 500, pagination: false, overrideAccess: true }),
      facturenLijst(payload, { and: [{ club: { equals: clubId } }, { status: { equals: 'verstuurd' } }] }).catch(() => []),
    ])
    const openF = facturen.filter((f) => f.beeld.open > 0)
    const vervallen = openF.filter((f) => f.beeld.stand === 'vervallen')
    const losseBoetes = boetes.docs.filter((b) => b.status === 'opgelegd')
    return (
      <Shell tabs={tabBalk}>
        <div className="cdash-cijfers" style={{ marginBottom: 18 }}>
          <Link href="/club/facturen" className={`cdash-cijfer toon-${vervallen.length ? 'actie' : openF.length ? 'let-op' : 'goed'}`}>
            <span className="cdash-waarde">{formatEuro(openF.reduce((t, f) => t + f.beeld.open, 0))}</span>
            <span className="cdash-label">
              te betalen op {openF.length} {openF.length === 1 ? 'factuur' : 'facturen'}
              {vervallen.length ? ` (${vervallen.length} vervallen)` : ''}
            </span>
          </Link>
          <Link href="/club/boetes" className={`cdash-cijfer toon-${losseBoetes.length ? 'let-op' : 'goed'}`}>
            <span className="cdash-waarde">{boetes.docs.length}</span>
            <span className="cdash-label">open {boetes.docs.length === 1 ? 'boete' : 'boetes'} ({formatEuro(boetes.docs.reduce((t, b) => t + (Number(b.bedrag) || 0), 0))})</span>
          </Link>
        </div>
        <ClubTegels tab="geld" staf={clubStaf} beheerder={isBeheerder} />
        <p className="wb-sub">Een opgelegde boete komt op de volgende factuur van de federatie; betaal ze dan samen met die factuur.</p>
      </Shell>
    )
  }

  // ── Meer ──
  return (
    <Shell tabs={tabBalk}>
      <ClubTegels tab="meer" staf={clubStaf} beheerder={isBeheerder} />
      <details className="cmenu-extra">
        <summary>📸 Weekendplan als Instagram-Story</summary>
        <InstagramWeekendCard />
      </details>
    </Shell>
  )
}

// ── Gegevens ────────────────────────────────────────────────────────────────────────────────────────

/**
 * De komende (en lopende) wedstrijden van de club. `totWeekend`: enkel tot en met dat speelweekend (Overzicht);
 * null = alle. De klaar-controle (die per wedstrijd het blad leest) enkel voor wat binnen twee weken valt.
 */
async function wedstrijdRijen(payload: Payload, user: unknown, clubId: number | string, teamIds: (number | string)[], supportersMode: boolean, totWeekend: string | null): Promise<Row[]> {
  const teamIdSet = new Set(teamIds.map(Number))
  const myUserId = Number((user as { id?: number }).id)
  // Federatie/admin mogen altijd overnemen (zelfde noodrem als op het aantekenscherm).
  const bypassClaim = isFederationLevel(user)
  const tot = totWeekend ? new Date(`${shiftDateStr(totWeekend, 2)}T00:00:00Z`).toISOString() : null
  const matches = await payload.find({
    collection: 'matches',
    where: {
      and: [
        { status: { in: ['scheduled', 'live'] } },
        { or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] },
        competitionWhere(),
        ...(tot ? [{ date: { less_than: tot } }] : []),
      ],
    },
    sort: 'date',
    depth: 2,
    limit: 300,
  })
  const ids = matches.docs.map((m) => m.id)
  const sheets = ids.length
    ? await payload.find({ collection: 'matchsheets', where: { match: { in: ids } }, depth: 1, pagination: false }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const refByMatch = new Map<number, string>()
  const sheetStatusByMatch = new Map<number, string>()
  for (const s of sheets.docs) {
    const mid = (s as { match?: unknown }).match
    const midId = mid && typeof mid === 'object' ? Number((mid as { id?: number }).id) : Number(mid)
    const ar = (s as { assignedReferee?: unknown }).assignedReferee
    const name = ar && typeof ar === 'object' ? String((ar as { name?: unknown }).name ?? '') : ''
    if (Number.isFinite(midId) && name) refByMatch.set(midId, name)
    const st = (s as { status?: unknown }).status
    if (Number.isFinite(midId) && typeof st === 'string') sheetStatusByMatch.set(midId, st)
  }
  const nabij = Date.now() + 14 * 86_400_000
  const rows: Row[] = []
  for (const m of matches.docs) {
    if ((m as { isDemo?: boolean }).isDemo || (m as { analyseOnly?: boolean }).analyseOnly) continue
    const homeTeam = m.homeTeam as { id?: number; name?: string; club?: unknown; category?: unknown } | null
    const awayTeam = m.awayTeam as { id?: number; name?: string; club?: unknown; category?: unknown } | null
    const side: 'home' | 'away' = homeTeam?.id != null && teamIdSet.has(Number(homeTeam.id)) ? 'home' : 'away'
    const eigen = side === 'home' ? homeTeam : awayTeam
    try {
      // In supportersmodus valt er niets voor te bereiden; ver weg tonen we de badge nog niet (dat spaart een
      // lezing van het blad per wedstrijd).
      const dichtbij = m.status === 'live' || new Date(String(m.date)).getTime() <= nabij
      const r = supportersMode || !dichtbij ? null : await getMatchReadiness(payload, m.id)
      const homeClub = homeTeam?.club as { name?: string; accommodatie?: string } | null
      const coach = (side === 'home' ? m.homeCoach : m.awayCoach) as { id?: number; name?: string; email?: string } | null
      const takeover = (side === 'home' ? m.homeTakeover : m.awayTakeover) as { id?: number; name?: string; email?: string } | null
      const trust = sanitizeTrust((m as { scoreTrust?: unknown }).scoreTrust)
      const claimedByOther = !bypassClaim && claimHeld(trust, m.status === 'live') && Number(trust.scorerId) !== myUserId
      rows.push({
        id: m.id,
        reeks: reeksNaam(m.reeks),
        reeksCode: String(m.reeks ?? ''),
        date: m.date,
        status: String(m.status ?? 'scheduled'),
        side,
        myTeamId: Number(eigen?.id ?? 0),
        afgelast: Boolean((m as { afgelast?: boolean }).afgelast),
        magOpstelling: magOpstellingVoor(user, { id: Number(eigen?.id ?? 0), club: clubId, category: eigen ? String(eigen.category ?? '') : null }),
        home: nameOf(homeTeam),
        away: nameOf(awayTeam),
        ownReady: supportersMode ? true : r ? (side === 'home' ? r.homeOk : r.awayOk) : null,
        // Locatie = terrein van de thuisclub (waar je moet zijn).
        location: (homeClub?.accommodatie || homeClub?.name || nameOf(homeTeam)).trim(),
        coachName: coach ? coach.name || coach.email || 'Geclaimd' : null,
        coachMine: coach?.id != null && Number(coach.id) === myUserId,
        takeoverName: takeover ? takeover.name || takeover.email || 'Iemand' : null,
        takeoverMine: takeover?.id != null && Number(takeover.id) === myUserId,
        refereeName: refByMatch.get(m.id) ?? null,
        sheetStatus: sheetStatusByMatch.get(m.id) ?? null,
        claimedByOther,
        claimedByName: claimedByOther ? trust.scorerName : null,
      })
    } catch {
      // Wedstrijd met ontbrekende ploeg overslaan.
    }
  }
  return rows
}

/** Kerncijfers, te doen en ledenbestand per ploeg (lib/club-overzicht.ts). Alles afgeleid. */
async function clubCijfers(payload: Payload, clubId: number | string, teams: Record<string, unknown>[], rows: Row[], supportersMode: boolean, tweeWeken: number) {
  const teamIds = teams.map((t) => t.id as number)
  const [spelers, blessures, boetes, vanaf] = await Promise.all([
    payload.find({ collection: 'players', where: { team: { in: teamIds } }, depth: 0, limit: 3000, pagination: false, overrideAccess: true }),
    payload
      .find({ collection: 'accidents', where: { and: [{ club: { equals: clubId } }, { status: { in: ['gemeld', 'ingediend'] } }] }, depth: 0, limit: 500, pagination: false, overrideAccess: true })
      .catch(() => ({ docs: [] as { status?: unknown }[] })),
    payload
      .find({ collection: 'boetes', where: { and: [{ club: { equals: clubId } }, { status: { in: [...OPEN_STATUSSEN] } }] }, depth: 0, limit: 500, pagination: false, overrideAccess: true })
      .catch(() => ({ docs: [] as { status?: unknown; bedrag?: unknown }[] })),
    emailVanaf(payload),
  ])
  const toonPerPloeg = new Map<number, LidToon[]>()
  for (const p of spelers.docs) {
    const tid = Number(typeof p.team === 'object' && p.team ? (p.team as { id?: unknown }).id : p.team)
    const toon = registratieIcoon(
      {
        voornaam: String(p.voornaam ?? ''),
        achternaam: String(p.achternaam ?? ''),
        birthDate: p.birthDate ? String(p.birthDate).slice(0, 10) : '',
        geslacht: String(p.geslacht ?? ''),
        soortLid: String(p.soortLid ?? 'speler'),
        medischeKeuringOp: p.medischeKeuringOp ? String(p.medischeKeuringOp).slice(0, 10) : '',
        email: String(p.email ?? ''),
        heeftAttest: Boolean(p.medischAttestBestand),
        registratieStatus: String(p.registratieStatus ?? ''),
        vergunningsstatus: String(p.vergunningsstatus ?? 'geen'),
        medischAttest: Boolean(p.medischAttest),
        actief: p.actief !== false,
      },
      undefined,
      vanaf,
    ).toon as LidToon
    toonPerPloeg.set(tid, [...(toonPerPloeg.get(tid) ?? []), toon])
  }
  return clubOverzicht({
    ploegen: teams.map((t) => ({
      id: Number(t.id),
      naam: String(t.name ?? '—'),
      reeks: t.reeks ? reeksNaam(t.reeks as Parameters<typeof reeksNaam>[0]) : String(t.category ?? ''),
      toon: toonPerPloeg.get(Number(t.id)) ?? [],
    })),
    blessures: {
      teBezorgen: blessures.docs.filter((b) => b.status === 'gemeld').length,
      bijFederatie: blessures.docs.filter((b) => b.status === 'ingediend').length,
    },
    boetes: {
      aantal: boetes.docs.length,
      bedrag: boetes.docs.reduce((som, b) => som + (Number(b.bedrag) || 0), 0),
      teBetalen: boetes.docs.filter((b) => b.status === 'opgelegd').length,
    },
    opstellingenTeDoen: supportersMode ? 0 : rows.filter((r) => r.ownReady === false && !r.afgelast && r.status === 'scheduled' && new Date(String(r.date)).getTime() <= tweeWeken).length,
  })
}

type Champ = { teamName: string; reeks: string; clinched: boolean; leading: boolean; pointsToClinch: number | null; winsToClinch: number | null }

/** Ploegen die (bijna) kampioen zijn — enkel op het Overzicht. */
async function kampioenen(payload: Payload, teams: Record<string, unknown>[], enkel: Set<number> | null): Promise<Champ[]> {
  const COMPETITIE = new Set<string>(REEKS_OPTIONS.map((o) => o.value).filter((v) => !['beker', 'recreatief', 'andere'].includes(v)))
  const clubTeams = teams
    .map((t) => ({ id: Number(t.id), name: String(t.name ?? '—'), reeks: String(t.reeks ?? '') }))
    .filter((t) => COMPETITIE.has(t.reeks) && (!enkel || enkel.has(t.id)))
  const champs: Champ[] = []
  for (const reeks of [...new Set(clubTeams.map((t) => t.reeks))]) {
    const sb = await buildReeksStandings(payload, reeks).catch(() => null)
    if (!sb || sb.standings.length < 2) continue
    for (const t of clubTeams.filter((ct) => ct.reeks === reeks)) {
      const st = clinchStatus(sb.standings, sb.remaining, t.id, sb.clinchCtx)
      if (!st || !(st.clinched || st.leading)) continue
      champs.push({ teamName: t.name, reeks: reeksNaam(reeks as Parameters<typeof reeksNaam>[0]), clinched: st.clinched, leading: st.leading, pointsToClinch: st.pointsToClinch, winsToClinch: st.winsToClinch })
    }
  }
  return champs.sort((a, b) => Number(b.clinched) - Number(a.clinched))
}

// ── Weergave ────────────────────────────────────────────────────────────────────────────────────────

function Kampioenen({ champs }: { champs: Champ[] }) {
  if (!champs.length) return null
  return (
    <div className="club-champ-wrap">
      {champs.map((c, i) => {
        const almost = c.winsToClinch != null && c.winsToClinch <= 2
        const cls = c.clinched ? 'champion' : almost ? 'almost' : 'leading'
        return (
          <div key={i} className={`club-champ ${cls}`}>
            <span className="club-champ-ico" aria-hidden>
              {c.clinched ? '🏆' : almost ? '🔥' : '📈'}
            </span>
            <span className="club-champ-text">
              {c.clinched ? (
                <>
                  <strong>{c.teamName}</strong> is wiskundig <strong>KAMPIOEN</strong> in {c.reeks}! 🎉
                </>
              ) : c.pointsToClinch != null ? (
                <>
                  <strong>{c.teamName}</strong> leidt in {c.reeks} — nog{' '}
                  <strong>
                    {c.pointsToClinch} {c.pointsToClinch === 1 ? 'punt' : 'punten'}
                  </strong>
                  {c.winsToClinch != null && (
                    <>
                      {' '}
                      ({c.winsToClinch} {c.winsToClinch === 1 ? 'overwinning' : 'overwinningen'})
                    </>
                  )}{' '}
                  voor de titel.{almost ? ' Bijna zover!' : ''}
                </>
              ) : (
                <>
                  <strong>{c.teamName}</strong> staat aan de leiding in {c.reeks}.
                </>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function WedstrijdKaart({ m, supportersMode, magAantekenen }: { m: Row; supportersMode: boolean; magAantekenen: boolean }) {
  // Welke knoppen hier horen, hangt van de aantekenmodus af (wedstrijddag-acties.ts); enkel de knoppen die
  // voor deze gebruiker werken: een coach zet de opstelling van zijn ploeg en volgt verder mee.
  const alle = clubActies({ supportersMode, side: m.side, live: m.status === 'live', bladOpen: sheetOpenForScoring(m.sheetStatus), claimedByOther: m.claimedByOther })
  const gefilterd = alle.filter((a) => (a !== 'opstelling' || m.magOpstelling) && ((a !== 'aantekenen' && a !== 'wachtOpScheidsrechter') || magAantekenen || supportersMode))
  const acties = gefilterd.includes('bekijk') ? gefilterd : [...gefilterd, 'bekijk' as const]
  const primair = primaireActie(acties)
  const cls = (a: string) => `btn ${a === primair ? 'btn-primary' : 'btn-ghost'}`
  return (
    <div className="club-match">
      <div className="club-match-info">
        <span className="club-match-toprow">
          <span className={`club-role ${m.side}`}>{m.side === 'home' ? 'THUIS' : 'UIT'}</span>
          <span className="club-match-reeks">{m.reeks}</span>
          {m.status === 'live' ? (
            <span className="club-badge live">● LIVE</span>
          ) : supportersMode ? (
            <span className="club-badge ready">🎉 Vrije livescore</span>
          ) : m.ownReady === true ? (
            <span className="club-badge ready">✓ Klaar</span>
          ) : m.ownReady === false ? (
            <span className="club-badge todo">○ Voor te bereiden</span>
          ) : null}
        </span>
        <span className="club-match-teams">
          {m.home} <span className="club-vs">–</span> {m.away}
        </span>
        <span className="club-match-meta">
          {formatDateBE(new Date(m.date), { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          {m.location ? <> · 📍 {m.location}</> : null}
          {m.refereeName ? <> · 🟡 SR: {m.refereeName}</> : null}
          {m.afgelast ? (
            <>
              {' '}
              · <strong style={{ color: '#e0a23d' }}>⛈️ Afgelast — nieuwe datum volgt</strong>
            </>
          ) : null}
        </span>
        <span className="club-match-coach">
          <ClaimButton matchId={m.id} coachName={m.coachName} mine={m.coachMine} takeoverName={m.takeoverName} takeoverMine={m.takeoverMine} />
        </span>
      </div>
      <div className="club-match-actions">
        {acties.map((a) => {
          if (a === 'opstelling')
            return (
              <Link key={a} href={`/opstelling/${m.id}`} className={cls(a)}>
                Opstelling
              </Link>
            )
          if (a === 'aantekenen')
            return (
              <Link key={a} href={`/scorekeeper/${m.id}`} className={cls(a)}>
                Aantekenen
              </Link>
            )
          if (a === 'bekijk')
            return (
              <Link key={a} href={`/match/${m.id}`} className={cls(a)} title={m.claimedByOther ? `${m.claimedByName ?? 'Iemand anders'} tekent deze wedstrijd al aan.` : undefined}>
                Bekijk
              </Link>
            )
          return (
            <span key={a} className="btn btn-ghost is-disabled" title="De scheidsrechter heeft het wedstrijdblad nog niet opengezet om aan te tekenen.">
              ⏳ Wacht op scheidsrechter
            </span>
          )
        })}
      </div>
    </div>
  )
}
