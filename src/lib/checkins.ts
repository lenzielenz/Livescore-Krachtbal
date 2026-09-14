// ── Supporter check-ins ("ik ben erbij") ─────────────────────────────────────────────────────
// Welke wedstrijden een supporter bijwoonde, bewaard als lijst op het useraccount. Pure helpers
// (saneren, togglen, opzoeken) → los testbaar; de UI/opslag zit in de route en het paspoort.

export interface Checkin { m: number; d: string }

export function sanitizeCheckins(raw: unknown): Checkin[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<number>()
  const out: Checkin[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const m = Number((e as { m?: unknown }).m)
    if (!Number.isFinite(m) || m <= 0 || seen.has(m)) continue
    seen.add(m)
    const d = String((e as { d?: unknown }).d ?? '')
    out.push({ m, d: d || new Date().toISOString() })
  }
  return out.slice(-1000)
}

export function isCheckedIn(list: Checkin[], matchId: number): boolean {
  return list.some((c) => c.m === matchId)
}

/** Zet de check-in voor een wedstrijd aan/uit (toggle) en geeft de nieuwe lijst terug. */
export function toggleCheckin(list: Checkin[], matchId: number, dateISO: string = new Date().toISOString()): Checkin[] {
  return isCheckedIn(list, matchId) ? list.filter((c) => c.m !== matchId) : [...list, { m: matchId, d: dateISO }]
}

/** Aantal unieke accounts dat bij minstens één van deze wedstrijden "ik ben erbij" aanduidde. */
export function countUniqueVisitors(rawCheckins: unknown[], matchIds: Iterable<number>): number {
  const wanted = new Set(matchIds)
  if (wanted.size === 0) return 0
  return rawCheckins.reduce<number>(
    (total, raw) => total + (sanitizeCheckins(raw).some((checkin) => wanted.has(checkin.m)) ? 1 : 0),
    0,
  )
}
