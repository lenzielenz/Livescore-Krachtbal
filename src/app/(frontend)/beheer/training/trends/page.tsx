import Link from 'next/link'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { canTraining, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { seasonFromDate } from '@/lib/seasons'
import { TrainingHero } from '../TrainingHero'
import '../kalender/kalender.css'
import './trends.css'

// Belasting & opkomsttrends: per-speler aanwezigheidsratio + trainingsbelasting (totaal minuten),
// afgeleid uit de Trainingen-collection. Geen extra opslag — leest dezelfde sessies als Aanwezigheid.
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Opkomsttrends — Krachtbal Live' }

const MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

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

type MonthStat = { mIdx: number; yr: number; sessies: number; total: number }
type PlayerStat = {
  id: number
  name: string
  shirtNumber?: number
  sessies: number
  total: number
  rate: number
  belasting: number
  monthly: MonthStat[]
}

function belastingStr(mins: number): string {
  if (!mins) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? (m > 0 ? `${h}u${m}` : `${h}u`) : `${m}m`
}

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ seizoen?: string; reeks?: string }>
}) {
  const me = await getAuthUser()
  if (!canTraining(me)) {
    return (
      <>
        <SiteHeader active="training" />
        <div className="site">
          <h1 className="page-title">
            Training <span className="brand">·</span> trends
          </h1>
          <p className="empty">
            Enkel voor admin/federatie of club-beheerders.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const { seizoen: qs, reeks: reeksFilter } = await searchParams
  const season = qs && /^\d{4}-\d{4}$/.test(qs) ? qs : seasonFromDate(new Date())
  const { startYear, start, end } = seasonRange(season)
  const range = { greater_than_equal: start, less_than: end }

  const payload = await getPayloadClient()
  const rawClubId = userClubId(me)
  const myClubId = rawClubId != null && Number.isFinite(Number(rawClubId)) ? Number(rawClubId) : null

  const where: Where =
    myClubId != null
      ? { and: [{ club: { equals: myClubId } }, { datum: range }] }
      : { datum: range }

  const trainRes = await payload
    .find({ collection: 'trainingen', where, depth: 1, limit: 1000, sort: 'datum' })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  // Jul-jun maandslots voor het seizoen (12 stuks).
  const planMonths = Array.from({ length: 12 }, (_, i) => {
    const mIdx = (6 + i) % 12
    const yr = startYear + (6 + i >= 12 ? 1 : 0)
    return { mIdx, yr }
  })

  // Verzamel alle reeksen die in de data voorkomen.
  const reeksenSet = new Set<string>()
  for (const t of trainRes.docs) {
    const r = (t as { reeks?: string }).reeks ?? ''
    if (r) reeksenSet.add(r)
  }

  // Aggregeer per speler, eventueel gefilterd op reeks.
  const playerMap = new Map<number, PlayerStat>()
  const monthSessionCounts = new Map<string, number>()
  let totalSessions = 0

  for (const t of trainRes.docs) {
    const datum = String((t as { datum?: unknown }).datum ?? '')
    if (!datum) continue
    const duur = (t as { duurMinuten?: number }).duurMinuten ?? 0
    const reeks = (t as { reeks?: string }).reeks ?? ''
    const aanwezigen = Array.isArray((t as { aanwezigen?: unknown }).aanwezigen)
      ? (t as { aanwezigen: unknown[] }).aanwezigen
      : []

    if (reeksFilter && reeks !== reeksFilter) continue

    totalSessions++
    const d = new Date(datum)
    const mIdx = d.getMonth()
    const yr = d.getFullYear()
    const mk = `${yr}-${mIdx}`
    monthSessionCounts.set(mk, (monthSessionCounts.get(mk) ?? 0) + 1)

    for (const a of aanwezigen) {
      if (!a || typeof a !== 'object') continue
      const p = a as { id?: number; name?: string; shirtNumber?: number }
      if (!p.id) continue

      if (!playerMap.has(p.id)) {
        playerMap.set(p.id, {
          id: p.id,
          name: p.name ?? 'Onbekend',
          shirtNumber: p.shirtNumber,
          sessies: 0,
          total: 0,
          rate: 0,
          belasting: 0,
          monthly: planMonths.map((m) => ({ ...m, sessies: 0, total: 0 })),
        })
      }
      const stat = playerMap.get(p.id)!
      stat.sessies++
      stat.belasting += duur

      const ms = stat.monthly.find((m) => m.mIdx === mIdx && m.yr === yr)
      if (ms) ms.sessies++
    }
  }

  // Vul totalen in en bereken ratio per speler.
  for (const stat of playerMap.values()) {
    stat.total = totalSessions
    stat.rate = totalSessions > 0 ? stat.sessies / totalSessions : 0
    for (const ms of stat.monthly) {
      ms.total = monthSessionCounts.get(`${ms.yr}-${ms.mIdx}`) ?? 0
    }
  }

  const players = Array.from(playerMap.values()).sort(
    (a, b) => b.rate - a.rate || a.name.localeCompare(b.name, 'nl'),
  )
  const reeksen = Array.from(reeksenSet).sort()
  const avgRate = players.length ? players.reduce((s, p) => s + p.rate, 0) / players.length : 0

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <TrainingHero active="trends" />
        <p className="wb-intro">
          Wie traint regelmatig, wie dreigt af te haken? Bekijk de opkomstfrequentie en
          trainingsbelasting per speler over het seizoen.
        </p>

        {/* Seizoensnavigatie */}
        <div className="kal-bar">
          <Link className="kal-nav" href={`/beheer/training/trends?seizoen=${shiftSeason(season, -1)}`}>
            ← {shiftSeason(season, -1)}
          </Link>
          <span className="kal-season">Seizoen {season}</span>
          <Link className="kal-nav" href={`/beheer/training/trends?seizoen=${shiftSeason(season, 1)}`}>
            {shiftSeason(season, 1)} →
          </Link>
        </div>

        {/* Reeks-filter */}
        {reeksen.length > 1 && (
          <div className="tr-reekstabs" style={{ marginBottom: 16 }}>
            <Link
              href={`/beheer/training/trends?seizoen=${season}`}
              className={`tr-reekstab${!reeksFilter ? ' on' : ''}`}
            >
              Alle
            </Link>
            {reeksen.map((r) => (
              <Link
                key={r}
                href={`/beheer/training/trends?seizoen=${season}&reeks=${encodeURIComponent(r)}`}
                className={`tr-reekstab${reeksFilter === r ? ' on' : ''}`}
              >
                {reeksNaam(r)}
              </Link>
            ))}
          </div>
        )}

        {/* KPI-strip */}
        <div className="tr-statcards" style={{ marginBottom: 20 }}>
          <div className="tr-statcard">
            <span className="tr-stat-n">{totalSessions}</span>
            <span className="tr-stat-l">Sessies dit seizoen</span>
          </div>
          <div className="tr-statcard">
            <span className="tr-stat-n">{players.length}</span>
            <span className="tr-stat-l">Actieve spelers</span>
          </div>
          <div className="tr-statcard">
            <span className="tr-stat-n">{Math.round(avgRate * 100)}%</span>
            <span className="tr-stat-l">Gemiddelde opkomst</span>
          </div>
          <div className="tr-statcard">
            <span className="tr-stat-n">{players.filter((p) => p.rate >= 0.75).length}</span>
            <span className="tr-stat-l">Trouwe aanwezigen ≥75%</span>
          </div>
        </div>

        {players.length === 0 ? (
          <p className="empty">
            Nog geen aanwezigheidsdata in dit seizoen. Registreer trainingen via{' '}
            <Link href="/beheer/training/aanwezigheid" style={{ color: 'var(--accent)' }}>
              Aanwezigheid →
            </Link>
          </p>
        ) : (
          <>
            <div className="tr-legend">
              <span className="tr-legend-item">
                <span className="tr-legend-dot high" /> ≥75%
              </span>
              <span className="tr-legend-item">
                <span className="tr-legend-dot mid" /> 50–74%
              </span>
              <span className="tr-legend-item">
                <span className="tr-legend-dot low" /> &lt;50%
              </span>
              <span className="tr-legend-sep" />
              <span>Verloop = opkomst per maand (jul → jun)</span>
            </div>

            <div className="tr-trends-wrap">
              <table className="tr-trends-tbl">
                <thead>
                  <tr>
                    <th>Speler</th>
                    <th className="r">Aanwezig</th>
                    <th className="r">Opkomst</th>
                    <th>Verloop</th>
                    <th className="r">Belasting</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => {
                    const pct = Math.round(p.rate * 100)
                    const cls = pct >= 75 ? 'high' : pct >= 50 ? 'mid' : 'low'
                    return (
                      <tr key={p.id}>
                        <td className="tr-trend-name">
                          {p.shirtNumber != null && (
                            <span className="tr-trend-nr">#{p.shirtNumber}</span>
                          )}
                          {p.name}
                        </td>
                        <td className="r tr-trend-dim">
                          {p.sessies}
                          <span className="tr-trend-tot">/{p.total}</span>
                        </td>
                        <td className="r">
                          <span className={`tr-trend-badge tr-trend-${cls}`}>{pct}%</span>
                        </td>
                        <td>
                          <span className="tr-sparkline" aria-hidden>
                            {p.monthly.map((m, i) => {
                              const kind =
                                m.total === 0
                                  ? 'empty'
                                  : m.sessies === m.total
                                  ? 'full'
                                  : m.sessies > 0
                                  ? 'part'
                                  : 'none'
                              return (
                                <span
                                  key={i}
                                  className={`tr-spark-bar ${kind}`}
                                  style={{
                                    ['--h' as string]: `${
                                      m.total > 0
                                        ? Math.round((m.sessies / m.total) * 100)
                                        : 0
                                    }%`,
                                  }}
                                  title={`${MONTHS_NL[m.mIdx]}: ${m.sessies}/${m.total}`}
                                />
                              )
                            })}
                          </span>
                        </td>
                        <td className="r tr-trend-dim">{belastingStr(p.belasting)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  )
}
