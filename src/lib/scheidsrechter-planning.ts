// Scheidsrechters toewijzen over een reeks speeldagen. Pure logica: conflicten opsporen en de
// lege plaatsen eerlijk vullen. De federatie ziet het voorstel eerst; niets wordt bewaard zonder klik.

export type PlanWedstrijd = {
  matchId: number
  /** Brusselse datum (YYYY-MM-DD) van de wedstrijd. */
  dag: string
  /** Aftrap in ms sinds epoch. */
  aftrap: number
  /** Clubs die spelen: een scheidsrechter fluit niet bij zijn eigen club. */
  clubs: (number | null)[]
  scheidsrechter: number | null
}
export type PlanScheidsrechter = { id: number; naam: string; club?: number | null }

/** Twee wedstrijden overlappen als ze minder dan dit na elkaar beginnen (wedstrijd + verplaatsing). */
export const MIN_TUSSENTIJD_MS = 3 * 60 * 60 * 1000

export type Conflict = { matchId: number; reden: string }

/** Wat klopt er niet aan de huidige toewijzing? (dubbel geboekt, of fluit bij de eigen club) */
export function conflicten(wedstrijden: PlanWedstrijd[], refs: PlanScheidsrechter[]): Conflict[] {
  const clubVan = new Map(refs.map((r) => [r.id, r.club ?? null]))
  const uit: Conflict[] = []
  const perRef = new Map<number, PlanWedstrijd[]>()
  for (const w of wedstrijden) {
    if (w.scheidsrechter == null) continue
    const club = clubVan.get(w.scheidsrechter)
    if (club != null && w.clubs.includes(club)) uit.push({ matchId: w.matchId, reden: 'fluit bij de eigen club' })
    const arr = perRef.get(w.scheidsrechter) ?? []
    arr.push(w)
    perRef.set(w.scheidsrechter, arr)
  }
  for (const lijst of perRef.values()) {
    const s = [...lijst].sort((a, b) => a.aftrap - b.aftrap)
    for (let i = 1; i < s.length; i++) {
      if (s[i].aftrap - s[i - 1].aftrap < MIN_TUSSENTIJD_MS) {
        uit.push({ matchId: s[i].matchId, reden: 'zelfde scheidsrechter, te kort na een andere wedstrijd' })
        uit.push({ matchId: s[i - 1].matchId, reden: 'zelfde scheidsrechter, te kort na een andere wedstrijd' })
      }
    }
  }
  return uit
}

/**
 * Vul de wedstrijden zonder scheidsrechter. Per wedstrijd (vroegste eerst) de beschikbare
 * scheidsrechter met de minste toewijzingen in deze periode: niet van een spelende club, en niet
 * al bezig binnen MIN_TUSSENTIJD_MS. Bestaande toewijzingen blijven staan. Wie niet te vullen is,
 * blijft leeg (de federatie ziet dat).
 */
export function vulAutomatisch(wedstrijden: PlanWedstrijd[], refs: PlanScheidsrechter[]): PlanWedstrijd[] {
  const last = new Map<number, number>()
  for (const w of wedstrijden) if (w.scheidsrechter != null) last.set(w.scheidsrechter, (last.get(w.scheidsrechter) ?? 0) + 1)
  const bezet = new Map<number, number[]>()
  for (const w of wedstrijden) {
    if (w.scheidsrechter == null) continue
    bezet.set(w.scheidsrechter, [...(bezet.get(w.scheidsrechter) ?? []), w.aftrap])
  }
  const volgorde = [...wedstrijden].sort((a, b) => a.aftrap - b.aftrap || a.matchId - b.matchId)
  const gekozen = new Map<number, number>()
  for (const w of volgorde) {
    if (w.scheidsrechter != null) continue
    const kandidaten = refs
      .filter((r) => r.club == null || !w.clubs.includes(r.club))
      .filter((r) => !(bezet.get(r.id) ?? []).some((t) => Math.abs(t - w.aftrap) < MIN_TUSSENTIJD_MS))
      .sort((a, b) => (last.get(a.id) ?? 0) - (last.get(b.id) ?? 0) || a.naam.localeCompare(b.naam))
    const r = kandidaten[0]
    if (!r) continue
    gekozen.set(w.matchId, r.id)
    last.set(r.id, (last.get(r.id) ?? 0) + 1)
    bezet.set(r.id, [...(bezet.get(r.id) ?? []), w.aftrap])
  }
  return wedstrijden.map((w) => (gekozen.has(w.matchId) ? { ...w, scheidsrechter: gekozen.get(w.matchId)! } : w))
}
