import { headers } from 'next/headers'
import Link from 'next/link'
import type { Where } from 'payload'

import { BewaarWedstrijd } from '@/components/BewaarWedstrijd'
import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { competitionWhere } from '@/lib/analyse-access'
import { formatDateTimeBE } from '@/lib/datetime'
import { googleCalendarUrl } from '@/lib/google-calendar'
import { matchTitel } from '@/lib/match-ics'
import { clubColors, clubLogoFit, clubLogoUrl } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam, type Reeks } from '@/lib/reeksen'
import { pastBijZoekterm } from '@/lib/team-search'
import { MijnWedstrijden } from './MijnWedstrijden'
import './zoeken.css'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Wanneer spelen we? — Krachtbal Live',
  description: 'Zoek je volgende wedstrijd op ploeg of tegenstander en zet ze in je agenda.',
}

// "Ik speel tegen die — wanneer is dat?" Eén zoekveld voor je eigen ploeg, een optioneel tweede
// voor de tegenstander. Bewust een gewoon GET-formulier: werkt zonder JavaScript, het resultaat
// zit in de URL (dus deelbaar en te bewaren), en de terugknop doet wat je verwacht.

const MAX_TEAMS = 40
const MAX_MATCHES = 60

type TeamDoc = { id: number; name?: unknown; reeks?: unknown; club?: unknown }

const naamVan = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')
/**
 * Ploegen zoeken op naam of clubnaam, zoals mensen ze typen: "Sint Michiels" moet "KBC St.
 * Michiels B" vinden en "baasro" moet "'T Botterken Baasrode" vinden.
 *
 * Dat kan een databank-`like` niet (die struikelt over het punt, de afkorting en de woordvolgorde),
 * dus halen we de competitieploegen één keer op en filteren we ze met dezelfde regels als het
 * live-bord (team-search.ts). Een paar honderd ploegen — dat weegt niet.
 */
async function zoekPloegen(payload: Awaited<ReturnType<typeof getPayloadClient>>, term: string): Promise<TeamDoc[]> {
  const q = term.trim()
  if (q.length < 2) return []
  const res = await payload
    .find({ collection: 'teams', where: competitionWhere(), sort: 'name', depth: 2, limit: 5000 })
    .catch(() => ({ docs: [] as TeamDoc[] }))
  return (res.docs as TeamDoc[])
    .filter((t) => pastBijZoekterm(q, String(t.name ?? ''), clubNaamVan(t)))
    .slice(0, MAX_TEAMS)
}

/** Clubnaam van een ploeg (bij depth 2 zit de club als object mee). */
function clubNaamVan(t: TeamDoc): string | null {
  const c = t.club
  return c && typeof c === 'object' ? String((c as { name?: unknown }).name ?? '') || null : null
}

export default async function ZoekenPage({
  searchParams,
}: {
  searchParams: Promise<{ ploeg?: string; tegen?: string; team?: string; alles?: string }>
}) {
  const { ploeg = '', tegen = '', team = '', alles = '' } = await searchParams
  const payload = await getPayloadClient()
  // Google Agenda krijgt een klikbare link mee; die moet absoluut zijn, dus lezen we de host van
  // het verzoek i.p.v. een domein te veronderstellen.
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = host ? `${proto}://${host}` : ''

  const mijne = await zoekPloegen(payload, ploeg)
  const tegenPloegen = tegen.trim() ? await zoekPloegen(payload, tegen) : []
  const gezocht = ploeg.trim().length >= 2

  // Eén club heeft al snel twintig ploegen (van U12 tot 1ste Nationale). Daarom kies je eerst wélke
  // ploeg je bedoelt; pas dan tonen we een kalender. Bij één treffer, een gekozen ploeg of een
  // uitdrukkelijk "alles samen" slaan we die stap over.
  const gekozenId = Number(team)
  const gekozen = mijne.find((t) => t.id === gekozenId) ?? null
  const toonAlles = alles === '1'
  const kiezen = mijne.length > 1 && !gekozen && !toonAlles

  const selectie = gekozen ? [gekozen] : mijne
  const mijnIds = selectie.map((t) => t.id)
  const tegenIds = tegenPloegen.map((t) => t.id)

  /** Link naar dezelfde zoekopdracht, met een andere ploegkeuze. */
  const keuzeLink = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ploeg })
    if (tegen.trim()) p.set('tegen', tegen)
    for (const [k, v] of Object.entries(extra)) p.set(k, v)
    return `/zoeken?${p.toString()}`
  }

  // Wedstrijden van de gevonden ploeg(en); staat er een tegenstander, dan moet die aan de andere
  // kant staan. Alles op datum, aankomende eerst — je zoekt hier meestal naar wat nog komt.
  let wedstrijden: Record<string, unknown>[] = []
  if (mijnIds.length > 0 && !kiezen) {
    const kant = (ids: number[]): Where[] => [{ homeTeam: { in: ids } }, { awayTeam: { in: ids } }]
    const clauses: Where[] = [{ or: kant(mijnIds) }, competitionWhere()]
    if (tegen.trim()) {
      // Geen enkele treffer voor de tegenstander → bewust geen resultaten tonen.
      if (tegenIds.length === 0) clauses.push({ id: { equals: -1 } })
      else clauses.push({ or: kant(tegenIds) })
    }
    const res = await payload
      .find({ collection: 'matches', where: { and: clauses }, sort: 'date', depth: 2, limit: MAX_MATCHES })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    wedstrijden = res.docs as unknown as Record<string, unknown>[]
  }

  const nu = Date.now()
  const komend = wedstrijden.filter((m) => new Date(String(m.date ?? '')).getTime() >= nu - 3 * 60 * 60 * 1000)
  const voorbij = wedstrijden.filter((m) => new Date(String(m.date ?? '')).getTime() < nu - 3 * 60 * 60 * 1000).reverse()

  const agendaNaam = selectie.map((t) => naamVan(t)).join(' + ')
  const agendaAlles =
    mijnIds.length > 0 && !kiezen
      ? `/api/agenda/ics?teams=${mijnIds.join(',')}&name=${encodeURIComponent(agendaNaam)}`
      : null

  return (
    <>
      <SiteHeader active="wedstrijden" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Wanneer spelen we?</span></h1>
        <p className="wb-intro" style={{ maxWidth: 640 }}>
          Vul je ploeg in — en eventueel de tegenstander — en je ziet meteen wanneer die wedstrijd
          is. Met één tik staat ze in je agenda, met een melding vooraf.
        </p>

        <form className="zk-form" method="get" action="/zoeken">
          <label className="zk-veld">
            <span>Mijn ploeg of club</span>
            <input name="ploeg" defaultValue={ploeg} placeholder="bv. Sint-Michiels" autoComplete="off" required minLength={2} />
          </label>
          <label className="zk-veld">
            <span>Tegen (optioneel)</span>
            <input name="tegen" defaultValue={tegen} placeholder="bv. Beveren" autoComplete="off" />
          </label>
          <button type="submit" className="zk-knop">🔎 Zoeken</button>
        </form>

        {/* Wat je op een wedstrijdpagina bewaarde, staat hier klaar (uit je browser, geen account
            nodig). Niets bewaard? Dan toont dit blok zichzelf niet. */}
        <MijnWedstrijden />

        {!gezocht ? (
          <p className="empty">Typ minstens twee letters van je ploeg- of clubnaam.</p>
        ) : mijne.length === 0 ? (
          <p className="empty">
            Geen ploeg gevonden voor “{ploeg}”. Probeer een deel van de naam, of kijk in{' '}
            <Link href="/clubs" style={{ color: 'var(--accent)' }}>de clublijst</Link>.
          </p>
        ) : (
          <>
            {/* Eén club telt al snel twintig ploegen. Ze als één lange zin opsommen is onleesbaar,
                dus staan ze hier als keuze — één tik en je hebt de kalender van díe ploeg. */}
            {kiezen ? (
              <section className="zk-kies">
                <h2 className="zk-kies-titel">Welke ploeg bedoel je?</h2>
                <p className="zk-kies-sub">
                  {mijne.length} ploegen gevonden voor “{ploeg}”. Kies er een — of{' '}
                  <Link href={keuzeLink({ alles: '1' })}>toon ze allemaal samen</Link>.
                </p>
                <ul className="zk-kies-lijst">
                  {mijne.map((t) => (
                    <li key={t.id}>
                      <Link href={keuzeLink({ team: String(t.id) })} className="zk-kies-knop">
                        <span className="zk-kies-naam">{naamVan(t)}</span>
                        {t.reeks ? <span className="zk-kies-reeks">{reeksNaam(t.reeks as Reeks)}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <p className="zk-gevonden">
                {gekozen ? (
                  <>
                    Kalender van <b>{naamVan(gekozen)}</b>
                    {gekozen.reeks ? ` — ${reeksNaam(gekozen.reeks as Reeks)}` : ''}
                    {mijne.length > 1 && (
                      <>
                        {' · '}
                        <Link href={keuzeLink({})}>andere ploeg kiezen</Link>
                      </>
                    )}
                  </>
                ) : mijne.length === 1 ? (
                  <>
                    Kalender van <b>{naamVan(mijne[0])}</b>
                    {mijne[0].reeks ? ` — ${reeksNaam(mijne[0].reeks as Reeks)}` : ''}
                  </>
                ) : (
                  <>
                    Alle {mijne.length} ploegen samen ·{' '}
                    <Link href={keuzeLink({})}>één ploeg kiezen</Link>
                  </>
                )}
                {tegen.trim() && tegenPloegen.length === 0 ? ` — geen tegenstander gevonden voor “${tegen}”` : ''}
              </p>
            )}

            {kiezen ? null : komend.length === 0 && voorbij.length === 0 ? (
              <p className="empty">Geen wedstrijden gevonden voor deze combinatie.</p>
            ) : (
              <>
                {komend.length > 0 && (
                  <section>
                    <h2 className="an-sub">Nog te spelen</h2>
                    <ul className="zk-lijst">
                      {komend.map((m) => (
                        <WedstrijdRegel key={String(m.id)} m={m} origin={origin} />
                      ))}
                    </ul>
                  </section>
                )}

                {agendaAlles && komend.length > 0 && (
                  <p className="zk-alles">
                    <a className="zk-knop klein" href={agendaAlles}>📅 Hele seizoensagenda (.ics, met melding)</a>
                  </p>
                )}

                {voorbij.length > 0 && (
                  <details className="zk-voorbij">
                    <summary>Al gespeeld ({voorbij.length})</summary>
                    <ul className="zk-lijst">
                      {voorbij.slice(0, 20).map((m) => (
                        <WedstrijdRegel key={String(m.id)} m={m} origin={origin} gespeeld />
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

/** Eén wedstrijd in de resultatenlijst, met de twee agenda-knoppen. */
function WedstrijdRegel({
  m,
  origin,
  gespeeld = false,
}: {
  m: Record<string, unknown>
  origin: string
  gespeeld?: boolean
}) {
  const id = Number(m.id)
  const home = m.homeTeam
  const away = m.awayTeam
  const homeNaam = naamVan(home)
  const awayNaam = naamVan(away)
  const datum = String(m.date ?? '')
  const reeksLabel = m.reeks ? reeksNaam(m.reeks as Reeks) : null
  const club = home && typeof home === 'object' ? (home as { club?: unknown }).club : null
  const plaats =
    club && typeof club === 'object'
      ? String((club as { accommodatie?: string }).accommodatie ?? '').trim() ||
        String((club as { plaats?: string }).plaats ?? '').trim() ||
        null
      : null

  // Zelfde titel als in het .ics-bestand (match-ics.ts), zodat een wedstrijd er in je agenda
  // hetzelfde uitziet langs welke weg je ze ook toevoegde.
  const titel = matchTitel(homeNaam, awayNaam, reeksLabel)
  // De locatie is altijd het terrein van de THUISPLOEG: de accommodatie als de club ze invulde,
  // anders de gemeente. Zo weet je waar je moet zijn zonder de wedstrijdpagina te openen.
  const google = datum
    ? googleCalendarUrl({
        title: titel,
        startIso: datum,
        location: plaats,
        details: [
          reeksLabel ? `Reeks: ${reeksLabel}` : null,
          `Thuisploeg: ${homeNaam}`,
          plaats ? `Terrein: ${plaats}` : 'Terrein: nog niet gekend',
          origin ? `Live volgen: ${origin}/match/${id}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      })
    : ''

  return (
    <li className="zk-item">
      <Link href={`/match/${id}`} className="zk-wedstrijd">
        <span className="zk-ploeg">
          <TeamLogo
            name={homeNaam}
            logoUrl={clubLogoUrl(home)}
            logoFit={clubLogoFit(home)}
            side="home"
            size="xs"
            ringColor={clubColors(home)?.primary}
          />
          <span className="zk-naam">{homeNaam}</span>
        </span>
        <span className="zk-vs">–</span>
        <span className="zk-ploeg away">
          <span className="zk-naam">{awayNaam}</span>
          <TeamLogo
            name={awayNaam}
            logoUrl={clubLogoUrl(away)}
            logoFit={clubLogoFit(away)}
            side="away"
            size="xs"
            ringColor={clubColors(away)?.primary}
          />
        </span>
      </Link>
      <div className="zk-meta">
        <span className="zk-wanneer">{datum ? formatDateTimeBE(datum) : 'Datum nog niet bekend'}</span>
        {reeksLabel && <span className="zk-chip">{reeksLabel}</span>}
        {plaats && <span className="zk-chip">📍 {plaats}</span>}
      </div>
      {!gespeeld && datum && (
        <div className="zk-agenda">
          {/* Bewaren kan meteen vanuit de lijst — daarvoor hoef je de wedstrijd niet te openen. */}
          <BewaarWedstrijd
            wedstrijd={{ id, home: homeNaam, away: awayNaam, date: datum, reeks: reeksLabel }}
          />
          {google && (
            <a className="zk-knop klein" href={google} target="_blank" rel="noopener noreferrer">
              📅 Google Agenda
            </a>
          )}
          <a className="zk-knop klein zacht" href={`/api/match/${id}/ics`}>
            ⬇ Met melding (.ics)
          </a>
        </div>
      )}
    </li>
  )
}
