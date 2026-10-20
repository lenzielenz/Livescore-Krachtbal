import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { BandChart } from '@/components/analytics/BandChart'
import { SiteHeader } from '@/components/SiteHeader'
import { knipjesTekst, vastspelenVoorClub } from '@/lib/competitieregels'
import { deelnameVanSpeler } from '@/lib/speler-deelname'
import { competitionWhere } from '@/lib/analyse-access'
import { getPayloadClient } from '@/lib/payload-client'
import { buildPlayerDanger } from '@/lib/player-danger'
import { reeksNaam, resolveCompetitieReeks } from '@/lib/reeksen'
import { buildSeasonStats } from '@/lib/season-stats'
import { GevaarMap } from '../../analyse/gevaar/GevaarMap'
import { TeamForm } from '../../analyse/ploeg/TeamForm'
import '../../analyse/analyse.css'
import '../../publieke-stats.css'

// Publiek speler-profiel: maakt de statistiek die we al berekenen zichtbaar voor fans/spelers
// (voorheen enkel achter de coach/analyse-login). Carrière-aggregaat (alle seizoenen).
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

type PlayerDoc = {
  name?: string
  shirtNumber?: number
  position?: string
  analyseOnly?: boolean
  team?: unknown
}

async function loadPlayer(id: number): Promise<PlayerDoc | null> {
  if (!Number.isFinite(id)) return null
  const payload = await getPayloadClient()
  // overrideAccess:false → de veld-toegang van Players geldt: geboortedatum/medische velden komen
  // NIET mee in de publieke respons (privacy — zie Players.ts access).
  return (await payload
    .findByID({ collection: 'players', id, depth: 1, overrideAccess: false })
    .catch(() => null)) as PlayerDoc | null
}

export async function generateMetadata({ params }: Params) {
  const { id } = await params
  const player = await loadPlayer(Number(id))
  return { title: player?.name ? `${player.name} — Krachtbal Live` : 'Speler — Krachtbal Live' }
}

export default async function SpelerProfiel({ params }: Params) {
  const { id } = await params
  const playerId = Number(id)
  const player = await loadPlayer(playerId)
  // Enkel echte competitiespelers zijn publiek; analyse-spelers zijn privé (eigenaar-only).
  if (!player || player.analyseOnly) notFound()

  const team = (player.team && typeof player.team === 'object' ? player.team : null) as
    | { id: number; name?: string; reeks?: string | null }
    | null
  const reeksCode = team?.reeks ? resolveCompetitieReeks(team.reeks) : null
  const payload = await getPayloadClient()

  const [seasonPlayers, danger, deelname] = await Promise.all([
    reeksCode
      ? buildSeasonStats(payload, reeksCode, null, competitionWhere()).catch(() => [])
      : Promise.resolve([]),
    reeksCode
      ? buildPlayerDanger(payload, playerId, reeksCode, null, competitionWhere()).catch(() => null)
      : Promise.resolve(null),
    deelnameVanSpeler(payload, playerId).catch(() => null),
  ])
  const clubId = (player as { club?: unknown }).club
  const clubNr = clubId && typeof clubId === 'object' ? Number((clubId as { id?: unknown }).id) : Number(clubId)
  const knipjes = Number.isFinite(clubNr) ? knipjesTekst((await vastspelenVoorClub(payload, clubNr).catch(() => null))?.get(playerId)) : null
  const stat = seasonPlayers.find((s) => s.playerId === playerId) ?? null

  return (
    <>
      <SiteHeader />
      <main className="an-wrap">
        <div className="ps-hero">
          <div className="ps-hero-num">{player.shirtNumber ?? '–'}</div>
          <div>
            <h1 className="ps-name">{player.name ?? 'Speler'}</h1>
            <p className="ps-meta">
              {player.position ? <span className="ps-tag">{player.position}</span> : null}
              {team ? <Link href={`/ploegen/${team.id}`}>{team.name ?? 'Ploeg'}</Link> : null}
              {reeksCode ? <span className="ps-tag">{reeksNaam(reeksCode)}</span> : null}
            </p>
          </div>
        </div>

        {/* Selecties van de coach en wat de scheidsrechter na de wedstrijd bevestigde. */}
        {deelname && deelname.geselecteerd > 0 ? (
          <section className="ps-kpis">
            <Kpi label="Geselecteerd" value={deelname.geselecteerd} />
            <Kpi label="Gespeeld (bevestigd)" value={deelname.gespeeld} />
          </section>
        ) : null}
        {knipjes ? <p className="ps-meta">{knipjes}</p> : null}

        {!stat ? (
          <p className="an-empty">Nog geen wedstrijdstatistieken voor deze speler.</p>
        ) : (
          <>
            <section className="ps-kpis">
              <Kpi label="Wedstrijden" value={stat.matches} />
              <Kpi label="Worpen" value={stat.throws} />
              <Kpi label="Doelpunten" value={stat.goals} />
              <Kpi label="Punten" value={stat.points} />
              <Kpi label="Conversie" value={`${Math.round(stat.conversion * 100)}%`} />
              <Kpi label="Rugworp-goals" value={stat.rug} />
              <Kpi label="Gem. afstand" value={`${stat.avgDistance.toFixed(1)} m`} />
              <Kpi label="Verste worp" value={`${stat.maxDistance.toFixed(1)} m`} />
            </section>

            {stat.trend.length > 1 ? (
              <section className="an-card">
                <TeamForm
                  form={stat.trend.map((t) => ({ date: t.date, points: t.points, conversion: t.conversion }))}
                  label="Vorm"
                  hint="punten & conversie per wedstrijd"
                />
              </section>
            ) : null}

            {danger && danger.shots.length > 0 ? (
              <section className="an-card">
                <h2 className="an-h2">Gevaarzone</h2>
                <GevaarMap shots={danger.shots} />
                <div className="ps-bands">
                  <BandChart title="Per diepte" bands={danger.depthBands} />
                  <BandChart title="Per zone" bands={danger.zoneBands} />
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  )
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ps-kpi">
      <span className="ps-kpi-val">{value}</span>
      <span className="ps-kpi-lbl">{label}</span>
    </div>
  )
}
