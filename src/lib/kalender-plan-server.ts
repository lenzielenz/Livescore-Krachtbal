import type { Payload } from 'payload'

import { rondeVan, speelweekends, zaterdagVan } from './inschrijving'
import { planKalender, type PlanKoppel, type PlanOnbeschikbaar, type PlanPloeg, type PlanResultaat } from './kalender-planner'
import { relId } from './meldingen'
import { reeksCategorie, type Reeks } from './reeksen'

// De invoer voor de kalenderplanner uit de databank: de ploegen per reeks (met thuisdag, thuisuur en
// koppel, gezet bij het verwerken van de inschrijvingen), de weekends van de ronde en per club de
// weekends dat het terrein niet vrij is en het aantal velden. Zie lib/kalender-planner.ts.

const NIET_IN_KALENDER = new Set(['recreatief', 'beker', 'andere', 'EINDR'])

export type KalenderPlan = PlanResultaat & {
  seizoen: string
  namen: Record<number, string>
  weekends: string[]
  reeksen: { reeks: string; ploegen: number }[]
}

export async function maakKalenderPlan(payload: Payload, rondeId: number, reeksen?: string[]): Promise<KalenderPlan | null> {
  const ronde = await rondeVan(payload, rondeId)
  if (!ronde) return null
  const teams = await payload.find({
    collection: 'teams',
    where: { and: [{ analyseOnly: { not_equals: true } }, { reeks: { exists: true } }] },
    depth: 1,
    limit: 3000,
    overrideAccess: true,
  })
  const kies = reeksen?.length ? new Set(reeksen) : null
  const ploegen: PlanPloeg[] = teams.docs
    .filter((t) => t.reeks && !NIET_IN_KALENDER.has(String(t.reeks)) && (!kies || kies.has(String(t.reeks))) && relId(t.club) != null)
    .map((t) => ({
      id: Number(t.id),
      naam: String(t.name),
      club: relId(t.club)!,
      clubNaam: t.club && typeof t.club === 'object' ? String((t.club as { name?: unknown }).name ?? '') : undefined,
      reeks: String(t.reeks),
      thuisdag: ((t as { thuisdag?: 'za' | 'zo' | null }).thuisdag ?? null) as 'za' | 'zo' | null,
      thuisUur: (t.thuisUur as string | null) ?? null,
    }))
  const ids = new Set(ploegen.map((p) => p.id))
  const koppels: PlanKoppel[] = []
  const gezien = new Set<string>()
  for (const t of teams.docs) {
    const b = relId((t as { koppelMet?: unknown }).koppelMet)
    if (b == null || !ids.has(Number(t.id)) || !ids.has(b)) continue
    const key = [Number(t.id), b].sort((x, y) => x - y).join('-')
    if (gezien.has(key)) continue
    gezien.add(key)
    koppels.push({ a: Number(t.id), b })
  }
  const ins = await payload.find({ collection: 'inschrijvingen', where: { ronde: { equals: rondeId } }, depth: 0, limit: 500, overrideAccess: true })
  const onbeschikbaar: PlanOnbeschikbaar[] = []
  const velden: Record<number, number> = {}
  for (const d of ins.docs) {
    const club = relId(d.club)
    if (club == null) continue
    velden[club] = Math.max(1, Number(d.aantalVelden ?? 1) || 1)
    for (const o of (d.onbeschikbaar as { weekend?: string; hard?: boolean; reden?: string | null }[] | undefined) ?? []) {
      if (o.weekend) onbeschikbaar.push({ club, weekend: zaterdagVan(String(o.weekend)), hard: o.hard !== false, reden: o.reden ?? null })
    }
  }
  const weekends = speelweekends(ronde)
  const res = planKalender(ploegen, koppels, onbeschikbaar, { weekends, velden })
  const perReeks = new Map<string, number>()
  for (const p of ploegen) perReeks.set(p.reeks, (perReeks.get(p.reeks) ?? 0) + 1)
  return {
    ...res,
    seizoen: ronde.seizoen,
    namen: Object.fromEntries(ploegen.map((p) => [p.id, p.naam])),
    weekends,
    reeksen: [...perReeks].map(([reeks, n]) => ({ reeks, ploegen: n })).sort((a, b) => a.reeks.localeCompare(b.reeks)),
  }
}

/** Zet het plan om in wedstrijden. Een wedstrijd die er al staat (zelfde ploegen, reeks, seizoen) wordt overgeslagen. */
export async function kalenderAanmaken(payload: Payload, plan: KalenderPlan): Promise<{ aangemaakt: number; overgeslagen: number }> {
  let aangemaakt = 0
  let overgeslagen = 0
  for (const w of plan.wedstrijden) {
    const al = await payload.count({
      collection: 'matches',
      where: { and: [{ homeTeam: { equals: w.thuis } }, { awayTeam: { equals: w.uit } }, { reeks: { equals: w.reeks } }, { seizoen: { equals: plan.seizoen } }] },
      overrideAccess: true,
    })
    if (al.totalDocs > 0) {
      overgeslagen++
      continue
    }
    await payload.create({
      collection: 'matches',
      data: {
        reeks: w.reeks as never,
        category: reeksCategorie(w.reeks as Reeks),
        homeTeam: w.thuis,
        awayTeam: w.uit,
        date: w.aftrapUtc,
        status: 'scheduled',
        goalAreaDepth: 10,
        seizoen: plan.seizoen,
      },
      overrideAccess: true,
    })
    aangemaakt++
  }
  return { aangemaakt, overgeslagen }
}
