// De wedkiosken in het wedkantoor van het virtuele stadion: daar plaats je een échte pronostiek,
// dezelfde als op de matchpagina (POST /api/club/predict, met dezelfde regels: enkel vóór de aftrap,
// pas open vanaf maandag van de speelweek, een beperkt aantal per weekend, boosters van het bonusrad).
// Deze module kiest en schikt de wedstrijden die de kiosk toont; puur, zonder databank.

export type KioskWedstrijd = {
  id: number
  /** ISO-datum van de aftrap. */
  datum: string
  reeks: string
  thuis: string
  uit: string
  /** Speelt een ploeg van de club van dit stadion mee? Die staan bovenaan. */
  eigenClub: boolean
  /** Mag er nu al voorspeld worden (de speelweek is open)? */
  open: boolean
  /** Je eigen voorspelling, als je die al deed (die staat vast). */
  mijn: { home: number; away: number } | null
}

export type KioskRuw = {
  id: number
  datum: string
  status: string
  reeks: string
  thuisId: number | null
  uitId: number | null
  thuis: string
  uit: string
  isDemo?: boolean
  analyseOnly?: boolean
  preds: { userId?: unknown; home?: unknown; away?: unknown }[]
}

/** Hoe ver vooruit de kiosk kijkt. */
export const KIOSK_DAGEN = 14
/** Hoeveel wedstrijden de kiosk hoogstens toont. */
export const KIOSK_MAX = 24

const relId = (v: unknown): number | null =>
  v && typeof v === 'object' ? (Number((v as { id?: unknown }).id) || null) : Number.isFinite(Number(v)) ? Number(v) : null

/**
 * De wedstrijden voor de kiosk: nog niet begonnen, binnen de komende `KIOSK_DAGEN` dagen, geen
 * demo- of analysewedstrijden. Eerst die van de eigen club, dan de rest, telkens op aftrap.
 */
export function kioskWedstrijden(
  ruw: KioskRuw[],
  opt: { nu: Date; clubPloegen: Set<number>; userId: number | null; isOpen: (datumIso: string) => boolean },
): KioskWedstrijd[] {
  const t0 = opt.nu.getTime()
  const t1 = t0 + KIOSK_DAGEN * 86_400_000
  return ruw
    .filter((m) => {
      if (m.isDemo || m.analyseOnly || m.status !== 'scheduled') return false
      const t = new Date(m.datum).getTime()
      return Number.isFinite(t) && t > t0 && t <= t1
    })
    .map((m) => {
      const eigen = m.preds.find((p) => opt.userId != null && relId(p?.userId) === opt.userId)
      return {
        id: m.id,
        datum: m.datum,
        reeks: m.reeks,
        thuis: m.thuis,
        uit: m.uit,
        eigenClub: (m.thuisId != null && opt.clubPloegen.has(m.thuisId)) || (m.uitId != null && opt.clubPloegen.has(m.uitId)),
        open: opt.isOpen(m.datum),
        mijn: eigen ? { home: Number(eigen.home), away: Number(eigen.away) } : null,
      }
    })
    .sort((a, b) => Number(b.eigenClub) - Number(a.eigenClub) || new Date(a.datum).getTime() - new Date(b.datum).getTime() || a.id - b.id)
    .slice(0, KIOSK_MAX)
}
