import Link from 'next/link'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { canTraining, userClubId } from '@/lib/access'
import { competitionWhere } from '@/lib/analyse-access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { seasonFromDate } from '@/lib/seasons'
import { TrainingHero } from '../TrainingHero'
import './kalender.css'
import { formatDateBE, formatTimeBE } from '@/lib/datetime'

// Trainingskalender + jaarplan (CoachBox-geïnspireerd, zonder AI): één kalender met de trainingen
// én de wedstrijden van je club over een seizoen, plus een jaarplan-strip (12 maanden) voor het
// grotere plaatje. Alles afgeleid — leest gewoon uit Trainingen + Matches; slaat niets apart op.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Trainingskalender — Krachtbal Live' }

const MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
const teamName = (v: unknown): string => (v && typeof v === 'object' ? String((v as { name?: unknown }).name ?? '—') : '—')
const STATUS_LABEL: Record<string, string> = { scheduled: 'Gepland', live: 'Live', finished: 'Gespeeld' }

// Een seizoenslabel "2025-2026" → datumbereik [1 jul 2025, 1 jul 2026).
function seasonRange(label: string): { startYear: number; start: string; end: string } {
  const m = /^(\d{4})-(\d{4})$/.exec(label)
  const y = m ? Number(m[1]) : new Date().getFullYear()
  return { startYear: y, start: new Date(y, 6, 1).toISOString(), end: new Date(y + 1, 6, 1).toISOString() }
}
const shiftSeason = (label: string, by: number): string => {
  const m = /^(\d{4})-(\d{4})$/.exec(label)
  const y = m ? Number(m[1]) : new Date().getFullYear()
  return `${y + by}-${y + by + 1}`
}

type Ev = { ts: number; date: string; kind: 'training' | 'match'; title: string; sub: string; href?: string }

export default async function TrainingKalenderPage({ searchParams }: { searchParams: Promise<{ seizoen?: string }> }) {
  const me = await getAuthUser()
  if (!canTraining(me)) {
    return (
      <>
        <SiteHeader active="training" />
        <div className="site">
          <h1 className="page-title">Training <span className="brand">·</span> kalender</h1>
          <p className="empty">
            Enkel voor admin/federatie of club-beheerders.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const { seizoen: qs } = await searchParams
  const season = qs && /^\d{4}-\d{4}$/.test(qs) ? qs : seasonFromDate(new Date())
  const { startYear, start, end } = seasonRange(season)
  const range = { greater_than_equal: start, less_than: end }

  const payload = await getPayloadClient()
  const rawClubId = userClubId(me)
  const myClubId = rawClubId != null && Number.isFinite(Number(rawClubId)) ? Number(rawClubId) : null

  let teamIds: number[] = []
  if (myClubId != null) {
    const teamsRes = await payload.find({ collection: 'teams', where: { club: { equals: myClubId } }, depth: 0, limit: 200 }).catch(() => ({ docs: [] as { id: number }[] }))
    teamIds = teamsRes.docs.map((t) => (t as { id: number }).id)
  }

  const trainingWhere: Where = myClubId != null ? { and: [{ club: { equals: myClubId } }, { datum: range }] } : { datum: range }
  const matchWhere: Where =
    myClubId != null
      ? teamIds.length
        ? { and: [{ or: [{ homeTeam: { in: teamIds } }, { awayTeam: { in: teamIds } }] }, { date: range }, competitionWhere()] }
        : { id: { equals: -1 } }
      : { and: [{ date: range }, competitionWhere()] }

  const [trainRes, matchRes] = await Promise.all([
    payload.find({ collection: 'trainingen', where: trainingWhere, depth: 1, limit: 1000, sort: 'datum' }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({ collection: 'matches', where: matchWhere, depth: 1, limit: 500, sort: 'date' }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
  ])

  const events: Ev[] = []
  for (const t of trainRes.docs) {
    const datum = String((t as { datum?: unknown }).datum ?? '')
    if (!datum) continue
    const reeks = (t as { reeks?: string }).reeks ?? ''
    const duur = (t as { duurMinuten?: number }).duurMinuten ?? null
    const aanwezig = Array.isArray((t as { aanwezigen?: unknown }).aanwezigen) ? (t as { aanwezigen: unknown[] }).aanwezigen.length : 0
    events.push({
      ts: new Date(datum).getTime(),
      date: datum,
      kind: 'training',
      title: reeks ? `Training ${reeksNaam(reeks)}` : 'Clubtraining',
      sub: [duur ? `${duur} min` : null, aanwezig ? `${aanwezig} aanwezig` : null].filter(Boolean).join(' · ') || 'training',
    })
  }
  for (const m of matchRes.docs) {
    const date = String((m as { date?: unknown }).date ?? '')
    if (!date) continue
    const status = String((m as { status?: unknown }).status ?? 'scheduled')
    const reeks = (m as { reeks?: string }).reeks ?? ''
    events.push({
      ts: new Date(date).getTime(),
      date,
      kind: 'match',
      title: `${teamName((m as { homeTeam?: unknown }).homeTeam)} — ${teamName((m as { awayTeam?: unknown }).awayTeam)}`,
      sub: [STATUS_LABEL[status] ?? status, reeks ? reeksNaam(reeks) : null].filter(Boolean).join(' · '),
      href: `/match/${(m as { id: number }).id}`,
    })
  }
  events.sort((a, b) => a.ts - b.ts)

  // Jaarplan-strip: 12 maanden van juli (startjaar) t/m juni (startjaar+1), met tellingen per maand.
  const monthKey = (y: number, mIdx: number) => `${y}-${mIdx}`
  const counts = new Map<string, { t: number; m: number }>()
  for (const e of events) {
    const d = new Date(e.date)
    const k = monthKey(d.getFullYear(), d.getMonth())
    const c = counts.get(k) ?? { t: 0, m: 0 }
    if (e.kind === 'training') c.t++
    else c.m++
    counts.set(k, c)
  }
  const planMonths = Array.from({ length: 12 }, (_, i) => {
    const mIdx = (6 + i) % 12
    const yr = startYear + (6 + i >= 12 ? 1 : 0)
    const c = counts.get(monthKey(yr, mIdx)) ?? { t: 0, m: 0 }
    return { mIdx, yr, ...c }
  })
  const maxPerMonth = Math.max(1, ...planMonths.map((p) => p.t + p.m))

  // Kalender-events gegroepeerd per maand (chronologisch).
  const groups: { key: string; label: string; items: Ev[] }[] = []
  for (const e of events) {
    const d = new Date(e.date)
    const key = monthKey(d.getFullYear(), d.getMonth())
    const label = `${['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'][d.getMonth()]} ${d.getFullYear()}`
    let g = groups.find((x) => x.key === key)
    if (!g) {
      g = { key, label, items: [] }
      groups.push(g)
    }
    g.items.push(e)
  }

  const totalT = events.filter((e) => e.kind === 'training').length
  const totalM = events.filter((e) => e.kind === 'match').length

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <TrainingHero active="kalender" />
        <p className="wb-intro">
          Je trainingen én wedstrijden in één kalender, met een jaarplan over het seizoen. Plan vooruit en
          zie in één oogopslag hoe druk elke maand is.
        </p>

        <div className="kal-bar">
          <Link className="kal-nav" href={`/beheer/training/kalender?seizoen=${shiftSeason(season, -1)}`}>← {shiftSeason(season, -1)}</Link>
          <span className="kal-season">Seizoen {season}</span>
          <Link className="kal-nav" href={`/beheer/training/kalender?seizoen=${shiftSeason(season, 1)}`}>{shiftSeason(season, 1)} →</Link>
        </div>

        <section className="kal-plan" aria-label="Jaarplan">
          <div className="kal-plan-head">
            <h2 className="kal-h2">Jaarplan</h2>
            <span className="kal-plan-legend"><i className="kal-dot t" /> {totalT} trainingen <i className="kal-dot m" /> {totalM} wedstrijden</span>
          </div>
          <div className="kal-months">
            {planMonths.map((p) => (
              <div key={`${p.yr}-${p.mIdx}`} className="kal-mcell" title={`${MONTHS_NL[p.mIdx]} ${p.yr}: ${p.t} training(en), ${p.m} wedstrijd(en)`}>
                <span className="kal-mbar" style={{ ['--h' as string]: `${Math.round(((p.t + p.m) / maxPerMonth) * 100)}%` }}>
                  <i className="kal-mbar-t" style={{ flex: p.t }} />
                  <i className="kal-mbar-m" style={{ flex: p.m }} />
                </span>
                <span className="kal-mname">{MONTHS_NL[p.mIdx]}</span>
                <span className="kal-mcount">{p.t + p.m || ''}</span>
              </div>
            ))}
          </div>
        </section>

        {groups.length === 0 ? (
          <p className="empty">Nog geen trainingen of wedstrijden in dit seizoen. Plan een training in via Aanwezigheid, of voeg wedstrijden toe.</p>
        ) : (
          <div className="kal-list">
            {groups.map((g) => (
              <section key={g.key} className="kal-month">
                <h3 className="kal-month-head">{g.label} <span className="kal-month-n">{g.items.length}</span></h3>
                {g.items.map((e, i) => {
                  const d = new Date(e.date)
                  const inner = (
                    <>
                      <span className="kal-ev-date">
                        <b>{d.getDate()}</b>
                        <small>{formatDateBE(d, { weekday: 'short' })}</small>
                      </span>
                      <span className="kal-ev-ico" aria-hidden>{e.kind === 'training' ? '🏋️' : '🏆'}</span>
                      <span className="kal-ev-body">
                        <span className="kal-ev-title">{e.title}</span>
                        <span className="kal-ev-sub">{e.sub}</span>
                      </span>
                      <span className="kal-ev-time">{formatTimeBE(d)}</span>
                    </>
                  )
                  return e.href ? (
                    <Link key={i} href={e.href} className={`kal-ev kal-ev-${e.kind}`}>{inner}</Link>
                  ) : (
                    <div key={i} className={`kal-ev kal-ev-${e.kind}`}>{inner}</div>
                  )
                })}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
