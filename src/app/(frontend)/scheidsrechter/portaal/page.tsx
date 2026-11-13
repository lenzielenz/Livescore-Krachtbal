
import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { hasRole, isFederationLevel, userOfficialId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { personalCode, personalQrValue } from '@/lib/referee-credentials'
import { isSupportersMode } from '@/lib/score-mode'
import { RefereeLogin } from './RefereeLogin'
import { RefereeMatches, type RefMatch, type RefOfficial } from './RefereeMatches'
import { RefereePortal } from './RefereePortal'
import './referee-matches.css'
import '../../wedstrijdblad.css'

export const dynamic = 'force-dynamic'

const relId = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null
const teamName = (t: unknown): string => (t && typeof t === 'object' ? String((t as { name?: unknown }).name ?? '—') : '—')
// Clubnaam van een ploeg (club is op depth 2 mee gepopuleerd) — voor het club-filter in de lijst.
const clubName = (t: unknown): string | null => {
  const club = t && typeof t === 'object' ? (t as { club?: unknown }).club : null
  const name = club && typeof club === 'object' ? (club as { name?: unknown }).name : null
  return typeof name === 'string' && name ? name : null
}

// Haalt de wedstrijdenlijst + scheidsrechter-toewijzingen op voor het portaal.
async function loadRefereeMatches(): Promise<{ matches: RefMatch[]; officials: RefOfficial[] }> {
  const payload = await getPayloadClient()
  const since = new Date(Date.now() - 2 * 864e5).toISOString()
  const matchesRes = await payload
    .find({ collection: 'matches', where: { and: [{ date: { greater_than: since } }, { analyseOnly: { not_equals: true } }] }, sort: 'date', depth: 2, limit: 150 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const docs = matchesRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)
  const ids = docs.map((m) => (m as { id: number }).id)
  const sheetsRes = ids.length
    ? await payload.find({ collection: 'matchsheets', where: { match: { in: ids } }, depth: 1, pagination: false }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const refByMatch = new Map<number, { id: number | null; name: string | null; blad: string | null }>()
  for (const s of sheetsRes.docs) {
    const mid = relId((s as { match?: unknown }).match)
    const ar = (s as { assignedReferee?: unknown }).assignedReferee
    if (mid != null)
      refByMatch.set(mid, { id: relId(ar), name: ar && typeof ar === 'object' ? String((ar as { name?: unknown }).name ?? '') || null : null, blad: ((s as { status?: unknown }).status as string | null) ?? null })
  }
  const officialsRes = await payload
    .find({ collection: 'officials', where: { type: { equals: 'scheidsrechter' } }, sort: 'name', depth: 0, limit: 400 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const officials: RefOfficial[] = officialsRes.docs.map((o) => ({ id: (o as { id: number }).id, name: String((o as { name?: unknown }).name ?? '—') }))

  const matches: RefMatch[] = docs.map((m) => {
    const id = (m as { id: number }).id
    const ref = refByMatch.get(id)
    return {
      id,
      home: teamName((m as { homeTeam?: unknown }).homeTeam),
      away: teamName((m as { awayTeam?: unknown }).awayTeam),
      homeClub: clubName((m as { homeTeam?: unknown }).homeTeam),
      awayClub: clubName((m as { awayTeam?: unknown }).awayTeam),
      reeks: reeksNaam((m as { reeks?: unknown }).reeks),
      date: ((m as { date?: unknown }).date as string | null) ?? null,
      status: String((m as { status?: unknown }).status ?? 'scheduled'),
      assignedRefId: ref?.id ?? null,
      assignedRefName: ref?.name ?? null,
      bladStatus: ref?.blad ?? null,
    }
  })
  return { matches, officials }
}

// Het scheidsrechtersportaal, in tabbladen (in plaats van alles onder elkaar):
//   Mijn wedstrijden (standaard) — jouw komende en net gespeelde wedstrijden, met "Open wedstrijdblad"
//   Vrije wedstrijden            — zelf een wedstrijd zonder scheidsrechter opnemen
//   Mijn QR                      — je persoonlijke QR (+ code) om een wedstrijd vrij te geven; tijdelijke QR bij ziekte
//   Vergoedingen                 — je kwitantie
//   Alle wedstrijden             — enkel de federatie: toewijzen en doorgeven over alle wedstrijden
type PortaalTab = 'mijn' | 'vrij' | 'qr' | 'vergoedingen' | 'alle'
const TAB_LABEL: Record<PortaalTab, [string, string]> = {
  mijn: ['🟨', 'Mijn wedstrijden'],
  vrij: ['🙋', 'Vrije'],
  qr: ['🔳', 'Mijn QR'],
  vergoedingen: ['💶', 'Vergoeding'],
  alle: ['📋', 'Alle'],
}

export default async function RefereePortaalPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const payload = await getPayloadClient()
  const user = await getAuthUser()

  const isReferee = hasRole(user, 'scheidsrechter') || isFederationLevel(user)
  const loggedIn = Boolean(user && isReferee)
  const supportersMode = await isSupportersMode(payload)
  if (!user || !isReferee) {
    return (
      <>
        <SiteHeader active="scheidsrechters" />
        <div className="site ref-portal">
          <h1 className="page-title">
            <span className="brand">Scheidsrechter</span>
          </h1>
          <RefereeLogin />
        </div>
      </>
    )
  }
  const isFed = isFederationLevel(user)
  const tabs: PortaalTab[] = isFed ? ['mijn', 'vrij', 'alle', 'qr', 'vergoedingen'] : ['mijn', 'vrij', 'qr', 'vergoedingen']
  const gevraagd = (await searchParams).tab as PortaalTab | undefined
  const tab: PortaalTab = gevraagd && tabs.includes(gevraagd) ? gevraagd : 'mijn'
  const officialId = userOfficialId(user)
  const myOfficialId = officialId != null ? Number(officialId) : null

  let inhoud: React.ReactNode = null
  if (tab === 'mijn' || tab === 'vrij' || tab === 'alle') {
    const { matches, officials } = await loadRefereeMatches()
    inhoud = <RefereeMatches matches={matches} officials={officials} myOfficialId={myOfficialId} isFederation={isFed} modus={tab} />
    if (tab === 'mijn' && myOfficialId == null && !isFed) {
      inhoud = <p className="wb-intro">Je account is nog niet gekoppeld aan een scheidsrechtersdossier. Contacteer de federatie om je account te koppelen.</p>
    }
  } else if (tab === 'qr') {
    if (officialId == null) {
      inhoud = (
        <p className="wb-intro">
          Je account is nog niet gekoppeld aan een scheidsrechtersdossier. Contacteer de federatie om je account te koppelen — daarna verschijnt hier je
          persoonlijke QR-code.
        </p>
      )
    } else {
      const official = await payload.findByID({ collection: 'officials', id: officialId, depth: 0 }).catch(() => null)
      const secret = process.env.PAYLOAD_SECRET || ''
      inhoud = (
        <RefereePortal naam={(official?.name as string) ?? (user.name as string) ?? 'Scheidsrechter'} qrValue={personalQrValue(secret, officialId)} code={personalCode(secret, officialId)} />
      )
    }
  } else {
    inhoud = (
      <section className="wb-card">
        <h2>Vergoedingen</h2>
        <p className="wb-sub">Je kwitantie bundelt al je gefloten wedstrijden van een periode: €13 per wedstrijd plus de kilometers.</p>
        <Link href="/vergoedingen" className="wb-btn wb-btn-primary">
          💶 Kwitantie opmaken →
        </Link>
      </section>
    )
  }

  return (
    <>
      <SiteHeader active="scheidsrechters" />
      <div className="site ref-portal">
        <h1 className="page-title">
          Scheidsrechter <span className="brand">·</span> {String(user.name ?? '')}
        </h1>
        {/* Staat het platform op vrije livescore, dan geeft niemand nog een wedstrijd vrij. Zeg dat hier: de
            aanduiding en de vergoedingen blijven, het akkoord en de QR-code niet. */}
        {loggedIn && supportersMode && (
          <p className="wb-intro">
            <strong>Supportersmodus staat aan.</strong> Alle wedstrijden worden vrij aangetekend — je akkoord en je QR-code zijn niet nodig om te
            starten. Je aanduidingen en je vergoedingen blijven gewoon hier staan.
          </p>
        )}
        <nav className="ctabs" aria-label="Onderdelen van het portaal">
          {tabs.map((t) => (
            <Link key={t} href={t === 'mijn' ? '/scheidsrechter/portaal' : `/scheidsrechter/portaal?tab=${t}`} className={`ctab${t === tab ? ' actief' : ''}`} aria-current={t === tab ? 'page' : undefined}>
              <span className="ctab-icoon" aria-hidden>
                {TAB_LABEL[t][0]}
              </span>
              <span className="ctab-tekst">{TAB_LABEL[t][1]}</span>
            </Link>
          ))}
        </nav>
        {inhoud}
      </div>
    </>
  )
}
