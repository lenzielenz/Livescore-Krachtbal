import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Where } from 'payload'

import { SiteHeader } from '@/components/SiteHeader'
import { canTraining, hasRole, isFederationLevel, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { reeksNaam } from '@/lib/reeksen'
import { seasonFromDate } from '@/lib/seasons'
import { TRAINING_METRICS } from '@/lib/training-metrics'
import { TrainingHero } from '../../TrainingHero'
import '../spelers.css'

export const dynamic = 'force-dynamic'

type MetricKey = 'snelheidVooruit' | 'snelheidAchteruit' | 'worp4' | 'worp9' | 'worp18'

type Meting = {
  datum: string
} & Record<MetricKey, number | null>

type Doel = {
  id: number
  metriek: MetricKey
  doel: number
}

type Training = {
  datum: string
  duurMinuten: number | null
  reeks: string | null
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function SpelerDossierPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: rawId } = await params
  const spelerId = Number(rawId)
  if (!Number.isFinite(spelerId)) notFound()

  const me = await getAuthUser()
  const fed = isFederationLevel(me)
  const isClubBeheerder = hasRole(me, 'club-beheerder', 'club-medewerker')
  const canView = canTraining(me)

  if (!canView) {
    return (
      <>
        <SiteHeader active="training" />
        <div className="site">
          <h1 className="page-title">Training <span className="brand">·</span> dossier</h1>
          <p className="empty">
            Enkel voor admin/federatie of club-beheerders.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const payload = await getPayloadClient()
  const rawClubId = userClubId(me)
  const myClubId: number | null =
    rawClubId != null && Number.isFinite(Number(rawClubId)) ? Number(rawClubId) : null

  // Speler ophalen (club-scope controleren na ophalen)
  let spelerDoc: Record<string, unknown>
  try {
    spelerDoc = (await payload.findByID({
      collection: 'players',
      id: spelerId,
      depth: 2,
    })) as unknown as Record<string, unknown>
  } catch {
    notFound()
  }

  // Club-scope: een club-account mag enkel z'n eigen spelers zien.
  if (myClubId != null && !fed) {
    const team = typeof spelerDoc.team === 'object' && spelerDoc.team ? spelerDoc.team as Record<string, unknown> : null
    const playerClubId =
      team && typeof team.club === 'object' && team.club
        ? (team.club as { id?: number }).id ?? null
        : typeof team?.club === 'number'
          ? team.club
          : null
    if (playerClubId !== myClubId) notFound()
  }

  const team = typeof spelerDoc.team === 'object' && spelerDoc.team ? spelerDoc.team as Record<string, unknown> : null
  const spelerName = String(spelerDoc.name ?? '—')
  const shirtNumber = (spelerDoc.shirtNumber as number | null | undefined) ?? null
  const reeks = (team?.reeks as string | null | undefined) ?? ''
  const teamName = (team?.name as string | null | undefined) ?? ''

  // Huidige seizoen (voor de aanwezigheidsfilter)
  const currentSeason = seasonFromDate(new Date())
  const seizoenStart = `${currentSeason.split('-')[0]}-08-01`

  // Parallel ophalen: metingen + doelen + trainingen (aanwezigheid)
  const trainingWhere: Where =
    myClubId != null
      ? { and: [{ club: { equals: myClubId } }, { datum: { greater_than_equal: seizoenStart } }] }
      : { datum: { greater_than_equal: seizoenStart } }

  const [metingenRes, doelenRes, trainingenRes] = await Promise.all([
    payload.find({
      collection: 'trainingmetingen',
      where: { speler: { equals: spelerId } },
      depth: 0,
      limit: 500,
      sort: 'datum',
    }),
    payload.find({
      collection: 'trainingdoelen',
      where: { speler: { equals: spelerId } },
      depth: 0,
      limit: 50,
    }).catch(() => ({ docs: [] as Record<string, unknown>[] })),
    payload.find({
      collection: 'trainingen',
      where: trainingWhere,
      depth: 1,
      limit: 500,
      sort: '-datum',
    }),
  ])

  const metingen: Meting[] = metingenRes.docs.map((m) => {
    const row: Meting = {
      datum: String(m.datum ?? ''),
      snelheidVooruit: (m.snelheidVooruit as number | null | undefined) ?? null,
      snelheidAchteruit: (m.snelheidAchteruit as number | null | undefined) ?? null,
      worp4: (m.worp4 as number | null | undefined) ?? null,
      worp9: (m.worp9 as number | null | undefined) ?? null,
      worp18: (m.worp18 as number | null | undefined) ?? null,
    }
    return row
  })

  const doelen: Doel[] = doelenRes.docs.map((d) => ({
    id: (d as { id: number }).id,
    metriek: String((d as { metriek?: unknown }).metriek ?? '') as MetricKey,
    doel: Number((d as { doel?: unknown }).doel ?? 0),
  }))

  // Aanwezigheid: filter trainingen waarbij deze speler in aanwezigen zit
  const aanwezigTrainingen: Training[] = []
  const allTrainingen: Training[] = []
  for (const t of trainingenRes.docs) {
    const datum = String((t as { datum?: unknown }).datum ?? '')
    const duurMinuten = (t as { duurMinuten?: number | null }).duurMinuten ?? null
    const tReeks = (t as { reeks?: string | null }).reeks ?? null
    const aanwezigen = Array.isArray((t as { aanwezigen?: unknown }).aanwezigen)
      ? (t as { aanwezigen: unknown[] }).aanwezigen
      : []
    allTrainingen.push({ datum, duurMinuten, reeks: tReeks })
    const wasAanwezig = aanwezigen.some((a) => {
      if (a == null) return false
      if (typeof a === 'object') return (a as { id?: number }).id === spelerId
      return a === spelerId
    })
    if (wasAanwezig) aanwezigTrainingen.push({ datum, duurMinuten, reeks: tReeks })
  }

  const totaalTrainingen = allTrainingen.length
  const aanwezigCount = aanwezigTrainingen.length
  const aanwezigPct =
    totaalTrainingen > 0 ? Math.round((aanwezigCount / totaalTrainingen) * 100) : null

  // Beste waarde per metriek (voor doelen + huidige stand)
  const best = new Map<MetricKey, number>()
  for (const m of metingen) {
    for (const metric of TRAINING_METRICS) {
      const val = m[metric.key as MetricKey]
      if (val != null) {
        const prev = best.get(metric.key as MetricKey)
        if (prev == null || val > prev) best.set(metric.key as MetricKey, val)
      }
    }
  }

  // Laatste 8 metingen per metriek (voor de mini-historiek bars)
  const historyByMetric = new Map<MetricKey, number[]>()
  for (const metric of TRAINING_METRICS) {
    const vals = metingen
      .map((m) => m[metric.key as MetricKey])
      .filter((v): v is number => v != null)
    historyByMetric.set(metric.key as MetricKey, vals.slice(-8))
  }

  const initials = spelerName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const canWrite = fed || isClubBeheerder

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <TrainingHero active="spelers" />

        {/* Terug-link */}
        <p style={{ marginBottom: 12 }}>
          <Link
            href="/beheer/training/spelers"
            style={{ color: 'var(--dim)', fontSize: '0.84rem', textDecoration: 'none' }}
          >
            ← Alle spelers
          </Link>
        </p>

        {/* Header */}
        <div className="dos-header">
          <span className="dos-avatar" aria-hidden>
            {shirtNumber != null ? `#${shirtNumber}` : initials}
          </span>
          <div className="dos-id">
            <div className="dos-name">{spelerName}</div>
            <div className="dos-chips">
              {reeks && <span className="dos-chip">{reeksNaam(reeks)}</span>}
              {teamName && <span className="dos-chip">{teamName}</span>}
              {shirtNumber != null && (
                <span className="dos-chip">#{shirtNumber}</span>
              )}
            </div>
          </div>
          {aanwezigPct != null && (
            <div className="dos-stat">
              <span className="dos-stat-val">{aanwezigPct}%</span>
              <span className="dos-stat-label">
                {aanwezigCount}/{totaalTrainingen} trainingen
              </span>
            </div>
          )}
        </div>

        {/* Trainingsdoelen */}
        {doelen.length > 0 && (
          <div className="dos-section">
            <div className="dos-section-title">Trainingsdoelen</div>
            <div className="dos-goals">
              {doelen.map((g) => {
                const metric = TRAINING_METRICS.find((m) => m.key === g.metriek)
                const current = best.get(g.metriek) ?? null
                const pct = current != null ? Math.min(100, Math.round((current / g.doel) * 100)) : 0
                const done = pct >= 100
                return (
                  <div key={g.id} className="dos-goal">
                    <div className="dos-goal-head">
                      <span className="dos-goal-label">{metric?.kort ?? g.metriek}</span>
                      <span className="dos-goal-vals">
                        {current != null ? (
                          <>
                            <strong>{current}</strong> / {g.doel} {metric?.unit}
                          </>
                        ) : (
                          <>doel: {g.doel} {metric?.unit}</>
                        )}
                        {done && ' ✓'}
                      </span>
                    </div>
                    <div className="dos-goal-bar-wrap">
                      <div
                        className={`dos-goal-bar-fill${done ? ' done' : ''}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Meetwaarden */}
        <div className="dos-section">
          <div className="dos-section-title">Meetwaarden</div>
          <div className="dos-metrics">
            {TRAINING_METRICS.map((metric) => {
              const history = historyByMetric.get(metric.key as MetricKey) ?? []
              const current = best.get(metric.key as MetricKey) ?? null
              const maxVal = history.length > 0 ? Math.max(...history) : null
              return (
                <div key={metric.key} className="dos-metric">
                  <span className="dos-metric-label">{metric.kort}</span>
                  {current != null ? (
                    <span className="dos-metric-val">
                      {current}{' '}
                      <span className="dos-metric-unit">{metric.unit}</span>
                    </span>
                  ) : (
                    <span className="dos-metric-empty">Nog geen meting</span>
                  )}
                  {history.length > 1 && maxVal != null && (
                    <div className="dos-metric-history" aria-hidden>
                      {history.map((v, i) => (
                        <div
                          key={i}
                          className={`dos-metric-bar${i === history.length - 1 ? ' latest' : ''}`}
                          style={{ height: `${Math.max(8, Math.round((v / maxVal) * 28))}px` }}
                          title={`${v} ${metric.unit}`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {metingen.length === 0 && (
            <p className="empty" style={{ marginTop: 8 }}>
              Nog geen metingen geregistreerd voor deze speler.{' '}
              {canWrite && (
                <Link
                  href="/beheer/training/progressie"
                  style={{ color: 'var(--accent)' }}
                >
                  Meting toevoegen →
                </Link>
              )}
            </p>
          )}
        </div>

        {/* Aanwezigheid dit seizoen */}
        <div className="dos-section">
          <div className="dos-section-title">
            Aanwezigheid dit seizoen ({currentSeason})
          </div>
          {aanwezigTrainingen.length === 0 ? (
            <p className="empty">
              {totaalTrainingen === 0
                ? 'Nog geen trainingen ingevoerd.'
                : `Nog geen trainingen bijgewoond dit seizoen (${totaalTrainingen} geregistreerd).`}
            </p>
          ) : (
            <>
              {aanwezigTrainingen.slice(0, 10).map((t, i) => (
                <div key={i} className="dos-aw-row">
                  <span className="dos-aw-date">{fmtDate(t.datum)}</span>
                  <span className="dos-aw-meta">
                    {t.duurMinuten != null && <span>⏱ {t.duurMinuten} min</span>}
                    {t.reeks && <span>{reeksNaam(t.reeks)}</span>}
                  </span>
                  <span className="dos-aw-check">✓</span>
                </div>
              ))}
              {aanwezigTrainingen.length > 10 && (
                <p className="dos-aw-more">
                  + {aanwezigTrainingen.length - 10} oudere trainingen
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
