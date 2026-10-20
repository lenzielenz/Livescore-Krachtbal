import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { isFederationLevel, userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { clubSeizoen, type ClubSpeler, type PloegSeizoenInput, type Uitslag } from '@/lib/club-seizoen'
import { clubLogoFit, clubLogoUrl } from '@/lib/match-engine'
import { menuRechten } from '@/lib/menu-rechten'
import { getPayloadClient } from '@/lib/payload-client'
import { buildReeksStandings } from '@/lib/reeks-standings'
import { reeksNaam } from '@/lib/reeksen'
import { gespeeldPerSpeler } from '@/lib/speler-deelname'
import { buildSuperstars } from '@/lib/superstars'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Seizoen van de club — Krachtbal Live' }

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const VORM: Record<Uitslag, string> = { W: 'Gewonnen', G: 'Gelijk', V: 'Verloren' }

// De seizoenscijfers van de eigen club: per ploeg plaats, punten, doelsaldo en vorm; over de club
// heen de topscorers en wie het meest speelde. Voor de clubstaf en de coaches (Mijn club).
export default async function ClubSeizoenPage() {
  const me = await getAuthUser()
  const r = menuRechten(me)
  const clubId = userClubId(me)
  const mag = clubId != null && (r.isClub || r.isCoach || isFederationLevel(me))
  if (!mag) {
    return (
      <>
        <SiteHeader active="clubs" />
        <div className="site">
          <h1 className="page-title">📊 Seizoen van de club</h1>
          <p className="empty">
            {me ? 'Enkel de staf en de coaches van een club zien de seizoenscijfers van hun club.' : 'Log in als clubverantwoordelijke.'}{' '}
            {!me && <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>}
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const [club, teamsRes] = await Promise.all([
    payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null),
    payload.find({ collection: 'teams', where: { and: [{ club: { equals: clubId } }, competitionWhere()] }, depth: 0, limit: 100, pagination: false }),
  ])
  const ploegen = teamsRes.docs.map((t) => ({ id: Number(t.id), naam: String(t.name ?? ''), reeks: String(t.reeks ?? '') })).filter((t) => t.reeks)
  const reeksen = [...new Set(ploegen.map((p) => p.reeks))]
  const perReeks = new Map(
    await Promise.all(
      reeksen.map(async (reeks) => {
        const [stand, scorers] = await Promise.all([
          buildReeksStandings(payload, reeks).catch(() => null),
          buildSuperstars(payload, reeks, null, competitionWhere()).catch(() => []),
        ])
        return [reeks, { stand, scorers }] as const
      }),
    ),
  )

  // Spelers van de club, met hoe vaak ze speelden (bevestigd op het wedstrijdblad) en hun doelpunten.
  const ploegIds = ploegen.map((p) => p.id)
  const [spelersRes, gespeeldeRes] = await Promise.all([
    ploegIds.length ? payload.find({ collection: 'players', where: { team: { in: ploegIds } }, depth: 0, limit: 3000, pagination: false, overrideAccess: true }) : { docs: [] },
    ploegIds.length
      ? payload.find({
          collection: 'matches',
          where: { and: [{ status: { equals: 'finished' } }, { or: [{ homeTeam: { in: ploegIds } }, { awayTeam: { in: ploegIds } }] }, competitionWhere()] },
          depth: 0,
          limit: 2000,
          pagination: false,
        })
      : { docs: [] },
  ])
  const gespeeld = await gespeeldPerSpeler(payload, gespeeldeRes.docs.map((m) => Number(m.id)))
  const ploegNaam = new Map(ploegen.map((p) => [p.id, p.naam]))
  const scorerVan = new Map([...perReeks.values()].flatMap((v) => v.scorers).map((s) => [s.playerId, s]))
  const spelers: ClubSpeler[] = spelersRes.docs.map((p) => {
    const s = scorerVan.get(Number(p.id))
    return {
      id: Number(p.id),
      naam: String(p.name ?? ''),
      ploeg: ploegNaam.get(relId(p.team) ?? -1) ?? '',
      doelpunten: s?.goals ?? 0,
      punten: s?.points ?? 0,
      rugworpen: s?.rug ?? 0,
      gespeeld: gespeeld.get(Number(p.id)) ?? 0,
    }
  })
  const invoer: PloegSeizoenInput[] = ploegen.map((p) => {
    const v = perReeks.get(p.reeks)?.stand
    return { id: p.id, naam: p.naam, reeks: reeksNaam(p.reeks), stand: v?.standings ?? [], wedstrijden: v?.clinchCtx.results ?? [] }
  })
  const s = clubSeizoen(invoer, spelers)
  const t = s.totaal

  return (
    <>
      <SiteHeader active="clubs" />
      <div className="site site-breed">
        <p className="cs-terug"><Link href="/club">← Mijn club</Link></p>
        <header className="cdash-kop">
          <TeamLogo name={String(club?.name ?? '')} logoUrl={clubLogoUrl({ club })} logoFit={clubLogoFit({ club }) as never} size={52} />
          <div className="cdash-kop-tekst">
            <h1 className="cdash-naam">📊 Seizoen van {String(club?.name ?? 'de club')}</h1>
            <span className="cdash-sub">Alle ploegen, afgeleid uit de gespeelde wedstrijden</span>
          </div>
        </header>

        <div className="cdash-cijfers cs-cijfers">
          <div className="cdash-cijfer"><span className="cdash-waarde">{t.gespeeld}</span><span className="cdash-label">wedstrijden</span></div>
          <div className="cdash-cijfer toon-goed"><span className="cdash-waarde">{t.gewonnen}–{t.gelijk}–{t.verloren}</span><span className="cdash-label">gewonnen · gelijk · verloren</span></div>
          <div className="cdash-cijfer"><span className="cdash-waarde">{t.winstPct}%</span><span className="cdash-label">gewonnen</span></div>
          <div className="cdash-cijfer"><span className="cdash-waarde">{t.voor}–{t.tegen}</span><span className="cdash-label">doelpunten voor · tegen</span></div>
        </div>

        <h2 className="cmenu-titel cs-titel">Per ploeg</h2>
        {s.ploegen.length === 0 ? (
          <p className="empty">Nog geen ploegen in een competitie.</p>
        ) : (
          <div className="cs-ploegen">
            {s.ploegen.map((p) => (
              <article key={p.id} className="cs-ploeg">
                <div className="cs-ploeg-kop">
                  <div>
                    <h3>{p.naam}</h3>
                    <span className="cdash-reeks">{p.reeks}</span>
                  </div>
                  <span className="cs-plaats" title="Plaats in de reeks">
                    {p.plaats ?? '–'}
                    <small>/{p.van || '–'}</small>
                  </span>
                </div>
                {p.rij ? (
                  <dl className="cs-rij">
                    <div><dt>Punten</dt><dd>{p.rij.points}</dd></div>
                    <div><dt>W–G–V</dt><dd>{p.rij.won}–{p.rij.drawn}–{p.rij.lost}</dd></div>
                    <div><dt>Saldo</dt><dd>{p.rij.diff > 0 ? `+${p.rij.diff}` : p.rij.diff}</dd></div>
                  </dl>
                ) : (
                  <p className="cdash-sub">Nog niet gespeeld.</p>
                )}
                {p.vorm.length > 0 && (
                  <div className="cs-vorm" aria-label={`Vorm: ${p.vorm.map((v) => VORM[v]).join(', ')}`}>
                    {p.vorm.map((v, i) => (
                      <span key={i} className={`cs-v cs-v-${v}`} title={VORM[v]}>{v}</span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        <div className="cs-lijsten">
          <section>
            <h2 className="cmenu-titel cs-titel">Topscorers van de club</h2>
            <SpelerTabel spelers={s.topscorers} kol="doelpunten" leeg="Nog geen doelpunten." />
          </section>
          <section>
            <h2 className="cmenu-titel cs-titel">Meeste wedstrijden gespeeld</h2>
            <SpelerTabel spelers={s.meestGespeeld} kol="gespeeld" leeg="Nog geen wedstrijden op het blad bevestigd." />
          </section>
        </div>
      </div>
    </>
  )
}

function SpelerTabel({ spelers, kol, leeg }: { spelers: ClubSpeler[]; kol: 'doelpunten' | 'gespeeld'; leeg: string }) {
  if (!spelers.length) return <p className="empty">{leeg}</p>
  return (
    <div className="cdash-tabel-wrap">
      <table className="cdash-tabel">
        <thead>
          <tr>
            <th scope="col" className="getal">#</th>
            <th scope="col">Speler</th>
            <th scope="col" className="getal">{kol === 'doelpunten' ? 'Doelp.' : 'Wedstr.'}</th>
            <th scope="col" className="getal">{kol === 'doelpunten' ? 'Wedstr.' : 'Doelp.'}</th>
          </tr>
        </thead>
        <tbody>
          {spelers.map((sp, i) => (
            <tr key={sp.id}>
              <td className="getal">{i + 1}</td>
              <th scope="row">
                <span className="cdash-ploeg">{sp.naam}</span>
                <span className="cdash-reeks">{sp.ploeg}</span>
              </th>
              <td className="getal cs-sterk">{kol === 'doelpunten' ? sp.doelpunten : sp.gespeeld}</td>
              <td className="getal">{kol === 'doelpunten' ? sp.gespeeld : sp.doelpunten}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
