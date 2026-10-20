import type { Payload } from 'payload'

import { hasRole, isClubStaff, isFederationLevel, userClubId, userPlayerId } from './access'
import { magOpstellingVoor } from './club-functies'

// Wie mag het wedstrijdblad (de PDF) van een wedstrijd bekijken en afdrukken? Wie bij die wedstrijd
// betrokken is: de federatie en de scheidsrechters, de staf van beide clubs, de coaches van beide
// ploegen, en elke speler die op het blad staat (zo ook de kapiteins die aftekenden). Een buitenstaander
// niet: op het blad staan namen, geboortejaren niet, maar wel handtekeningen.

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

/** Puur: beslist uit de gebruiker en de (al opgehaalde) wedstrijd en lineups. */
export function magWedstrijdbladZienVoor(
  user: unknown,
  w: { home: { id: number; club: number | null; category?: string | null }; away: { id: number; club: number | null; category?: string | null }; spelers: number[] },
): boolean {
  if (!user) return false
  if (isFederationLevel(user) || hasRole(user, 'scheidsrechter')) return true
  const eigenClub = userClubId(user)
  if (isClubStaff(user) && eigenClub != null && [w.home.club, w.away.club].some((c) => c != null && String(c) === String(eigenClub))) return true
  if ([w.home, w.away].some((t) => magOpstellingVoor(user, t))) return true
  const speler = relId(userPlayerId(user))
  return speler != null && w.spelers.includes(speler)
}

export async function magWedstrijdbladZien(payload: Payload, user: unknown, matchId: number | string): Promise<boolean> {
  if (!user) return false
  if (isFederationLevel(user) || hasRole(user, 'scheidsrechter')) return true
  const match = await payload.findByID({ collection: 'matches', id: matchId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!match) return false
  const sheet = (await payload.find({ collection: 'matchsheets', where: { match: { equals: Number(matchId) } }, depth: 0, limit: 1, overrideAccess: true })).docs[0]
  const team = (t: unknown) => ({
    id: relId(t) ?? -1,
    club: t && typeof t === 'object' ? relId((t as { club?: unknown }).club) : null,
    category: t && typeof t === 'object' ? String((t as { category?: unknown }).category ?? '') : null,
  })
  const spelers = [...((sheet?.homeLineup ?? []) as { player?: unknown }[]), ...((sheet?.awayLineup ?? []) as { player?: unknown }[])]
    .map((r) => relId(r.player))
    .filter((x): x is number => x != null)
  return magWedstrijdbladZienVoor(user, { home: team(match.homeTeam), away: team(match.awayTeam), spelers })
}
