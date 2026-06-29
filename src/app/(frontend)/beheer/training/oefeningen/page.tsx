import Link from 'next/link'

import { SiteHeader } from '@/components/SiteHeader'
import { canTraining, isFederationLevel, isClubStaff, userClubId } from '@/lib/access'
import { getAuthUser } from '@/lib/auth-user'
import { getPayloadClient } from '@/lib/payload-client'
import { DRILLS } from '@/lib/training-plan'
import { TrainingHero } from '../TrainingHero'
import './oefeningen.css'

// Oefeningenbibliotheek + sessiesjablonen: ingebouwde systeemdrills (training-plan.ts) aangevuld
// met club-eigen oefeningen (Oefeningen-collection) en herbruikbare sessiestructuren (Sessiesjablonen).
export const dynamic = 'force-dynamic'
export const metadata = { title: 'Oefeningen & sjablonen — Krachtbal Live' }

const DOMEIN: Record<string, { label: string; color: string }> = {
  worpkracht: { label: 'Worpkracht', color: 'var(--accent)' },
  aanloop: { label: 'Aanloop', color: '#06b6d4' },
  snelheid: { label: 'Snelheid', color: '#f59e0b' },
  wendbaarheid: { label: 'Wendbaarheid', color: '#8b5cf6' },
  afwerking: { label: 'Afwerking', color: '#ef4444' },
  core: { label: 'Core & balans', color: '#6366f1' },
  conditie: { label: 'Conditie', color: '#ec4899' },
  'warming-up': { label: 'Warming-up', color: '#f97316' },
  'cooling-down': { label: 'Cooling-down', color: '#64748b' },
}

const FASE_LABEL: Record<string, string> = {
  voorbereiding: 'Voorbereiding',
  competitie: 'Competitie',
  uitloop: 'Uitloop',
  algemeen: 'Algemeen',
}

type DrillCard = {
  id: string
  naam: string
  domein: string | null
  beschrijving: string | null
  progressie: string | null
  duurMinuten: number | null
  materiaal: string | null
  isCustom: boolean
  clubNaam: string | null
}

type SjabloonBlok = {
  oefeningNaam: string
  domein: string | null
  duurMinuten: number | null
  sets: number | null
}

type SjabloonCard = {
  id: number
  naam: string
  fase: string | null
  duurTotaal: number | null
  beschrijving: string | null
  blokken: SjabloonBlok[]
  clubNaam: string | null
}

function clubOf(raw: Record<string, unknown>): { id?: number; name?: string } | null {
  const c = raw.club
  if (c == null) return null
  if (typeof c === 'object') return c as { id?: number; name?: string }
  return null
}

export default async function OefeningenPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; domein?: string }>
}) {
  const me = await getAuthUser()
  if (!canTraining(me)) {
    return (
      <>
        <SiteHeader active="training" />
        <div className="site">
          <h1 className="page-title">
            Training <span className="brand">·</span> oefeningen
          </h1>
          <p className="empty">
            Enkel voor admin/federatie of club-beheerders.{' '}
            <Link href="/inloggen" style={{ color: 'var(--accent)' }}>Inloggen →</Link>
          </p>
        </div>
      </>
    )
  }

  const { tab: tabParam, domein: domeinParam } = await searchParams
  const tab = tabParam === 'sjablonen' ? 'sjablonen' : 'oefeningen'
  const domeinFilter = domeinParam && DOMEIN[domeinParam] ? domeinParam : null

  const payload = await getPayloadClient()
  const rawClubId = userClubId(me)
  const myClubId = rawClubId != null && Number.isFinite(Number(rawClubId)) ? Number(rawClubId) : null
  const clubScoped = myClubId != null && !isFederationLevel(me)
  const canWrite = isFederationLevel(me) || isClubStaff(me)

  // Ingebouwde systeemdrills uit training-plan.ts.
  const sysDrills: DrillCard[] = (
    DRILLS as { domain: string; name: string; how: string; progressie: string }[]
  ).map((d, i) => ({
    id: `sys-${i}`,
    naam: d.name,
    domein: d.domain,
    beschrijving: d.how,
    progressie: d.progressie,
    duurMinuten: null,
    materiaal: null,
    isCustom: false,
    clubNaam: null,
  }))

  // Club-eigen + algemene oefeningen uit de collection.
  const { docs: rawOef } = await payload
    .find({ collection: 'oefeningen', depth: 1, limit: 500, sort: 'naam' })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const customDrills: DrillCard[] = (rawOef as Record<string, unknown>[])
    .filter((o) => {
      if (!clubScoped) return true
      const c = clubOf(o)
      return c == null || c.id === myClubId
    })
    .map((o) => ({
      id: `custom-${(o as { id: number }).id}`,
      naam: String(o.naam ?? ''),
      domein: (o.domein as string | null) ?? null,
      beschrijving: (o.beschrijving as string | null) ?? null,
      progressie: (o.progressie as string | null) ?? null,
      duurMinuten: (o.duurMinuten as number | null) ?? null,
      materiaal: (o.materiaal as string | null) ?? null,
      isCustom: true,
      clubNaam: clubOf(o)?.name ?? null,
    }))

  const allDrills = [...sysDrills, ...customDrills]
  const visibleDrills = domeinFilter ? allDrills.filter((d) => d.domein === domeinFilter) : allDrills
  const domains = Array.from(new Set(allDrills.map((d) => d.domein).filter(Boolean))) as string[]

  // Sessiesjablonen: eigen club + algemeen.
  const { docs: rawSja } = await payload
    .find({ collection: 'sessiesjablonen', depth: 1, limit: 200, sort: 'naam' })
    .catch(() => ({ docs: [] as Record<string, unknown>[] }))

  const sjablonen: SjabloonCard[] = (rawSja as Record<string, unknown>[])
    .filter((s) => {
      if (!clubScoped) return true
      const c = clubOf(s)
      return c == null || c.id === myClubId
    })
    .map((s) => {
      const blokken: SjabloonBlok[] = (
        Array.isArray(s.oefeningen) ? (s.oefeningen as unknown[]) : []
      ).map((b) => {
        const blok = b as Record<string, unknown>
        const oef = blok.oefening as Record<string, unknown> | number | null
        const oefeningNaam =
          oef != null && typeof oef === 'object'
            ? String((oef as { naam?: unknown }).naam ?? 'Oefening')
            : `Oefening #${oef}`
        const domein =
          oef != null && typeof oef === 'object'
            ? ((oef as { domein?: unknown }).domein as string | null) ?? null
            : null
        return {
          oefeningNaam,
          domein,
          duurMinuten: (blok.duurMinuten as number | null) ?? null,
          sets: (blok.sets as number | null) ?? null,
        }
      })
      return {
        id: (s as { id: number }).id,
        naam: String(s.naam ?? ''),
        fase: (s.fase as string | null) ?? null,
        duurTotaal: (s.duurTotaal as number | null) ?? null,
        beschrijving: (s.beschrijving as string | null) ?? null,
        blokken,
        clubNaam: clubOf(s)?.name ?? null,
      }
    })

  return (
    <>
      <SiteHeader active="training" />
      <div className="site">
        <TrainingHero active="oefeningen" />
        <p className="wb-intro">
          Blader door de oefeningenbibliotheek of gebruik een kant-en-klaar sessiesjabloon als
          startpunt voor je volgende training.
        </p>

        {/* Tab-balk */}
        <div className="oef-tabs">
          <Link
            href="/beheer/training/oefeningen"
            className={`oef-tab${tab === 'oefeningen' ? ' on' : ''}`}
          >
            💪 Oefeningen
            <span className="oef-tab-n">{allDrills.length}</span>
          </Link>
          <Link
            href="/beheer/training/oefeningen?tab=sjablonen"
            className={`oef-tab${tab === 'sjablonen' ? ' on' : ''}`}
          >
            📋 Sjablonen
            <span className="oef-tab-n">{sjablonen.length}</span>
          </Link>
          {canWrite && (
            <Link
              href={
                tab === 'sjablonen'
                  ? '/admin/collections/sessiesjablonen/create'
                  : '/admin/collections/oefeningen/create'
              }
              className="oef-add"
            >
              + Toevoegen
            </Link>
          )}
        </div>

        {/* ── Oefeningen-tab ──────────────────────────────────────────── */}
        {tab === 'oefeningen' && (
          <>
            {domains.length > 1 && (
              <div className="tr-reekstabs" style={{ marginBottom: 16 }}>
                <Link
                  href="/beheer/training/oefeningen"
                  className={`tr-reekstab${!domeinFilter ? ' on' : ''}`}
                >
                  Alle
                </Link>
                {domains.map((d) => (
                  <Link
                    key={d}
                    href={`/beheer/training/oefeningen?domein=${encodeURIComponent(d)}`}
                    className={`tr-reekstab${domeinFilter === d ? ' on' : ''}`}
                    style={
                      domeinFilter === d
                        ? { background: DOMEIN[d]?.color, borderColor: DOMEIN[d]?.color, color: '#fff' }
                        : {}
                    }
                  >
                    {DOMEIN[d]?.label ?? d}
                  </Link>
                ))}
              </div>
            )}

            {visibleDrills.length === 0 ? (
              <p className="empty">Geen oefeningen gevonden voor dit domein.</p>
            ) : (
              <div className="oef-cards">
                {visibleDrills.map((d) => {
                  const dom = d.domein ? DOMEIN[d.domein] : null
                  return (
                    <div key={d.id} className="oef-card">
                      {dom && (
                        <span
                          className="oef-card-dom"
                          style={{
                            background: `color-mix(in srgb, ${dom.color} 18%, transparent)`,
                            color: dom.color,
                          }}
                        >
                          {dom.label}
                        </span>
                      )}
                      <span className="oef-card-name">{d.naam}</span>
                      {d.beschrijving && (
                        <span className="oef-card-desc">{d.beschrijving}</span>
                      )}
                      {d.progressie && (
                        <span className="oef-card-prog">↗ {d.progressie}</span>
                      )}
                      <div className="oef-card-foot">
                        {d.duurMinuten != null && (
                          <span className="oef-card-tag">⏱ {d.duurMinuten} min</span>
                        )}
                        {d.materiaal && (
                          <span className="oef-card-tag">🧰 {d.materiaal}</span>
                        )}
                        {d.isCustom ? (
                          <span className="oef-card-tag oef-tag-club">{d.clubNaam ?? 'Club'}</span>
                        ) : (
                          <span className="oef-card-tag oef-tag-sys">Systeem</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── Sjablonen-tab ───────────────────────────────────────────── */}
        {tab === 'sjablonen' && (
          <>
            {sjablonen.length === 0 ? (
              <p className="empty">
                Nog geen sessiesjablonen.{' '}
                {canWrite && (
                  <Link
                    href="/admin/collections/sessiesjablonen/create"
                    style={{ color: 'var(--accent)' }}
                  >
                    Maak er een aan →
                  </Link>
                )}
              </p>
            ) : (
              <div className="sja-cards">
                {sjablonen.map((s) => (
                  <div key={s.id} className="sja-card">
                    <div className="sja-card-head">
                      <span className="sja-card-name">{s.naam}</span>
                      <div className="sja-card-chips">
                        {s.fase && (
                          <span className="sja-fase">{FASE_LABEL[s.fase] ?? s.fase}</span>
                        )}
                        {s.duurTotaal != null && (
                          <span className="sja-chip">⏱ {s.duurTotaal} min</span>
                        )}
                        {s.blokken.length > 0 && (
                          <span className="sja-chip">{s.blokken.length} blokken</span>
                        )}
                      </div>
                    </div>
                    {s.beschrijving && (
                      <p className="sja-card-desc">{s.beschrijving}</p>
                    )}
                    {s.blokken.length > 0 && (
                      <ol className="sja-drills">
                        {s.blokken.map((b, i) => {
                          const dom = b.domein ? DOMEIN[b.domein] : null
                          return (
                            <li key={i} className="sja-drill">
                              {dom && (
                                <span
                                  className="sja-drill-dot"
                                  style={{ background: dom.color }}
                                  title={dom.label}
                                />
                              )}
                              <span className="sja-drill-name">{b.oefeningNaam}</span>
                              {(b.sets != null || b.duurMinuten != null) && (
                                <span className="sja-drill-meta">
                                  {b.sets != null && `${b.sets}×`}
                                  {b.sets != null && b.duurMinuten != null && ' '}
                                  {b.duurMinuten != null && `${b.duurMinuten} min`}
                                </span>
                              )}
                            </li>
                          )
                        })}
                      </ol>
                    )}
                    {s.clubNaam && (
                      <span className="oef-card-tag oef-tag-club" style={{ marginTop: 10, display: 'inline-block' }}>
                        {s.clubNaam}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
