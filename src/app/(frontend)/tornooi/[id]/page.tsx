import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

import { hasRole, isFederationLevel } from '@/lib/access'
import { getPayloadClient } from '@/lib/payload-client'
import { buildTournamentState } from '@/lib/tournament-engine'
import { BracketBoard } from './BracketBoard'
import '../tornooi.css'

export const dynamic = 'force-dynamic'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

// Boomstructuur van een tornooi: alle rondes naast elkaar, live via SSE. Supporters kijken mee;
// enkel wie het tornooi beheert (federatie/aantekenaar) ziet de aanteken-/veldknoppen. Clublogo's
// worden via naamherkenning naast elke ploeg getoond.
export default async function TornooiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tournamentId = Number(id)
  if (!Number.isFinite(tournamentId)) notFound()

  const payload = await getPayloadClient()
  let state
  try {
    state = await buildTournamentState(payload, tournamentId)
  } catch {
    notFound()
  }

  const { user } = await payload.auth({ headers: await headers() }).catch(() => ({ user: null }))
  const canManage = isFederationLevel(user) || hasRole(user, 'scorekeeper', 'scheidsrechter')

  // Clublogo's: koppel de (vrij ingegeven) ploegnamen aan een club via naamherkenning.
  const clubsRes = await payload.find({ collection: 'clubs', depth: 1, limit: 500 }).catch(() => ({ docs: [] as Record<string, unknown>[] }))
  const clubsNorm: { norm: string; url: string }[] = []
  for (const c of clubsRes.docs) {
    const name = String((c as { name?: unknown }).name ?? '')
    const logo = (c as { logo?: { url?: string } }).logo
    const url = logo && typeof logo === 'object' && logo.url ? logo.url : (typeof (c as { logoUrl?: unknown }).logoUrl === 'string' ? String((c as { logoUrl?: string }).logoUrl) : '')
    if (name && url) clubsNorm.push({ norm: norm(name), url })
  }
  clubsNorm.sort((a, b) => b.norm.length - a.norm.length)
  const resolveLogo = (teamName: string): string | null => {
    const n = norm(teamName)
    if (!n) return null
    const hit = clubsNorm.find((c) => c.norm.length >= 3 && (n.includes(c.norm) || c.norm.includes(n)))
    return hit?.url ?? null
  }
  const names = new Set<string>()
  for (const r of state.rounds) for (const m of r.matches) { if (m.home) names.add(m.home); if (m.away) names.add(m.away) }
  if (state.thirdPlace) { if (state.thirdPlace.home) names.add(state.thirdPlace.home); if (state.thirdPlace.away) names.add(state.thirdPlace.away) }
  for (const s of state.standings ?? []) names.add(s.team)
  const logos: Record<string, string> = {}
  for (const nm of names) {
    const url = resolveLogo(nm)
    if (url) logos[nm] = url
  }

  return <BracketBoard id={tournamentId} initial={state} canManage={canManage} logos={logos} />
}
