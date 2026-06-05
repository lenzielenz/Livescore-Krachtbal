import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { TeamLogo } from '@/components/TeamLogo'
import { canAnalyse, hasRole } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { buildScoreboards } from '@/lib/match-engine'
import { getPayloadClient } from '@/lib/payload-client'
import { REEKS_OPTIONS, reeksNaam } from '@/lib/reeksen'
import { NieuweAnalyseMatch } from './NieuweAnalyseMatch'
import './analyse.css'

const COMPETITIE_REEKSEN = REEKS_OPTIONS.filter((o) => !['beker', 'recreatief', 'andere'].includes(o.value)).map((o) => ({
  value: o.value,
  label: reeksNaam(o.value),
}))

export const dynamic = 'force-dynamic'

// Analyse-hub (admin-only): kies een afgelopen wedstrijd om alle data te bekijken.
export default async function AnalysePage() {
  const me = await getAuthUser()
  if (!canAnalyse(me)) {
    return (
      <>
        <SiteHeader active="analyse" />
        <div className="site">
          <h1 className="page-title"><span className="brand">Analyse</span></h1>
          <p className="empty">
            Je hebt geen toegang tot de analyse. Vraag een admin om je toegang te geven.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  // Enkel een admin krijgt de volledige scoreopnemer (veldschema) die de analyse-data voedt;
  // daarom tonen we de "manueel opnemen"-sectie enkel aan admins.
  const isAdmin = hasRole(me, 'admin')

  const payload = await getPayloadClient()
  const matchRes = await payload
    .find({ collection: 'matches', where: { status: { equals: 'finished' } }, sort: '-date', depth: 0, limit: 500 })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const finishedDocs = matchRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)

  // Enkel afgelopen wedstrijden met échte analyse-data (worp-events) horen op de analyse-hub.
  // Wedstrijden zonder worpen (0-0 of met de basis-snelscoremodus ingevuld) tellen niet mee.
  const finishedIds = finishedDocs.map((m) => (m as { id: number }).id)
  const relId = (v: unknown): number | null =>
    v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null
  const withData = new Set<number>()
  if (finishedIds.length) {
    const throwRes = await payload
      .find({ collection: 'throws', where: { match: { in: finishedIds } }, depth: 0, pagination: false, select: { match: true } })
      .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    for (const t of throwRes.docs) {
      const mid = relId((t as { match?: unknown }).match)
      if (mid != null) withData.add(mid)
    }
  }
  const docs = finishedDocs.filter((m) => withData.has((m as { id: number }).id))

  // Te-recorderen wedstrijden (gepland of live) — om manueel aan te tekenen met de volledige
  // scoreopnemer. Enkel relevant voor admins.
  const openRes = isAdmin
    ? await payload
        .find({ collection: 'matches', where: { status: { in: ['scheduled', 'live'] } }, sort: 'date', depth: 0, limit: 200 })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const openDocs = openRes.docs.filter((m) => !(m as { isDemo?: boolean }).isDemo)

  // Eén batched scoreboard-opbouw voor afgelopen + open wedstrijden.
  const cards = await buildScoreboards(payload, [...docs, ...openDocs] as Parameters<typeof buildScoreboards>[1])

  const toRow = (m: Record<string, unknown> | { id: number }) => {
    const id = (m as { id: number }).id
    const c = cards.get(id)
    if (!c) return null
    return {
      id,
      reeks: reeksNaam((m as { reeks?: unknown }).reeks),
      date: (m as { date?: string }).date ?? '',
      status: String((m as { status?: unknown }).status ?? ''),
      home: c.teams.home,
      away: c.teams.away,
      score: c.score,
      analyseOnly: Boolean((m as { analyseOnly?: boolean }).analyseOnly),
    }
  }
  type Row = NonNullable<ReturnType<typeof toRow>>
  const notNull = (r: Row | null): r is Row => r != null

  const rows = docs.map(toRow).filter(notNull)
  const openRows = openDocs.map(toRow).filter(notNull)

  // Samenvattende cijfers (goedkoop afgeleid uit de reeds geladen scoreboards).
  const totalPunten = rows.reduce((s, r) => s + r.score.home + r.score.away, 0)
  const analyseOnlyCount = [...rows, ...openRows].filter((r) => r.analyseOnly).length

  // Ploegen voor de "nieuwe analysewedstrijd"-creator (enkel admin heeft die nodig).
  const teamsRes = isAdmin
    ? await payload
        .find({ collection: 'teams', where: { reeks: { in: COMPETITIE_REEKSEN.map((o) => o.value) } }, sort: 'name', depth: 0, limit: 500 })
        .catch(() => ({ docs: [] as Record<string, unknown>[] }))
    : { docs: [] as Record<string, unknown>[] }
  const teamOptions = teamsRes.docs.map((t) => ({
    id: (t as { id: number }).id,
    name: String((t as { name?: unknown }).name ?? '—'),
    reeks: String((t as { reeks?: unknown }).reeks ?? ''),
  }))

  return (
    <>
      <SiteHeader active="analyse" />
      <div className="site">
        <h1 className="page-title"><span className="brand">Analyse</span></h1>
        <p className="an-intro">Kies een afgelopen wedstrijd om alle data per speler en ploeg te bekijken.</p>

        <div className="rep-cards an-summary">
          <div className="rep-card"><span className="rep-num">{rows.length}</span><span className="rep-lbl">Wedstrijden</span></div>
          <div className="rep-card"><span className="rep-num">{totalPunten}</span><span className="rep-lbl">Punten gescoord</span></div>
          <div className="rep-card"><span className="rep-num">{analyseOnlyCount}</span><span className="rep-lbl">Analyse-wedstrijden</span></div>
          {isAdmin && <div className="rep-card"><span className="rep-num">{openRows.length}</span><span className="rep-lbl">Te recorderen</span></div>}
        </div>

        <p className="an-hub-links">
          <Link href="/analyse/seizoen" className="sk-demo-cta">📊 Seizoensanalyse per reeks →</Link>
          <Link href="/analyse/spelers" className="sk-demo-cta">🎯 Spelersradar &amp; vergelijken →</Link>
          <Link href="/analyse/verwacht" className="sk-demo-cta">📈 Verwachte punten (xP) →</Link>
          <Link href="/analyse/ploeg" className="sk-demo-cta">🛡️ Ploegrapport &amp; export →</Link>
          <Link href="/analyse/gevaar" className="sk-demo-cta">🔥 Gevaarzone per speler →</Link>
        </p>

        {isAdmin && (
          <section className="an-record">
            <h2 className="an-sub">🎬 Wedstrijd manueel opnemen</h2>
            <p className="an-intro">
              Start en teken een wedstrijd aan met de volledige scoreopnemer (veldschema). Die detaildata voedt meteen
              de analyse hierboven. Een <strong>analysewedstrijd</strong> wordt niet live of in de rangschikking getoond
              — ze dient puur om data te verzamelen.
            </p>
            <div className="an-record-new">
              <NieuweAnalyseMatch teams={teamOptions} reeksOptions={[...COMPETITIE_REEKSEN]} />
            </div>
            {openRows.length === 0 ? (
              <p className="empty">
                Geen geplande of lopende wedstrijden. Maak er een aan via{' '}
                <Link href="/beheer" style={{ color: 'var(--accent)' }}>Beheer</Link>.
              </p>
            ) : (
              <div className="an-list">
                {openRows.map((r) => (
                  <Link key={r.id} href={`/scorekeeper/${r.id}`} className="an-card">
                    <span className={`an-card-reeks ${r.status === 'live' ? 'an-live' : ''}`}>
                      {r.status === 'live'
                        ? '● LIVE — aantekenen'
                        : r.analyseOnly
                          ? '🎬 Analyse · ▶ Activeren'
                          : `${r.reeks} · ▶ opnemen`}
                    </span>
                    <span className="an-card-row">
                      <span className="an-team">
                        <TeamLogo name={r.home.name} logoUrl={r.home.logoUrl} logoFit={r.home.logoFit} side="home" size="sm" ringColor={r.home.colors?.primary} />
                        <span className="an-team-nm">{r.home.name}</span>
                      </span>
                      <span className="an-score">{r.status === 'live' ? `${r.score.home}–${r.score.away}` : 'vs'}</span>
                      <span className="an-team away">
                        <span className="an-team-nm">{r.away.name}</span>
                        <TeamLogo name={r.away.name} logoUrl={r.away.logoUrl} logoFit={r.away.logoFit} side="away" size="sm" ringColor={r.away.colors?.primary} />
                      </span>
                    </span>
                    <span className="an-card-date">
                      {r.date ? new Date(r.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        <h2 className="an-sub">📊 Afgelopen wedstrijden</h2>
        {rows.length === 0 ? (
          <p className="empty">Nog geen afgelopen wedstrijden om te analyseren.</p>
        ) : (
          <div className="an-list">
            {rows.map((r) => (
              <Link key={r.id} href={`/analyse/${r.id}`} className="an-card">
                <span className="an-card-reeks">{r.reeks}</span>
                <span className="an-card-row">
                  <span className="an-team">
                    <TeamLogo name={r.home.name} logoUrl={r.home.logoUrl} logoFit={r.home.logoFit} side="home" size="sm" ringColor={r.home.colors?.primary} />
                    <span className="an-team-nm">{r.home.name}</span>
                  </span>
                  <span className="an-score">{r.score.home}<span className="an-dash">–</span>{r.score.away}</span>
                  <span className="an-team away">
                    <span className="an-team-nm">{r.away.name}</span>
                    <TeamLogo name={r.away.name} logoUrl={r.away.logoUrl} logoFit={r.away.logoFit} side="away" size="sm" ringColor={r.away.colors?.primary} />
                  </span>
                </span>
                <span className="an-card-date">
                  {r.date ? new Date(r.date).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
