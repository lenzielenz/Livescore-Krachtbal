import type { Payload } from 'payload'

// Hoe vaak stond een speler in de selectie, en hoe vaak speelde hij effectief? Afgeleid uit de
// wedstrijdbladen: de selectie van de coach (homeLineup/awayLineup) en de bevestiging van de
// scheidsrechter na de wedstrijd (deelgenomen). Nooit apart opgeslagen.

export type DeelnameRegel = { matchId: number; geselecteerd: true; gespeeld: boolean }
export type Deelname = { geselecteerd: number; gespeeld: number; wedstrijden: DeelnameRegel[] }

type Rij = { player?: unknown; deelgenomen?: boolean | null }
const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

/** De regels van één blad per speler-id (beide kanten). */
export function regelsVanBlad(blad: { match?: unknown; homeLineup?: unknown; awayLineup?: unknown }): Map<number, DeelnameRegel> {
  const matchId = relId(blad.match)
  const uit = new Map<number, DeelnameRegel>()
  if (matchId == null) return uit
  for (const rijen of [blad.homeLineup, blad.awayLineup]) {
    for (const r of (Array.isArray(rijen) ? rijen : []) as Rij[]) {
      const id = relId(r.player)
      if (id == null) continue
      const vorige = uit.get(id)
      uit.set(id, { matchId, geselecteerd: true, gespeeld: Boolean(r.deelgenomen) || Boolean(vorige?.gespeeld) })
    }
  }
  return uit
}

/** Deelname van één speler (voor de spelerspagina). */
export async function deelnameVanSpeler(payload: Payload, spelerId: number): Promise<Deelname> {
  const res = await payload.find({
    collection: 'matchsheets',
    where: { or: [{ 'homeLineup.player': { equals: spelerId } }, { 'awayLineup.player': { equals: spelerId } }] },
    depth: 0,
    limit: 500,
    pagination: false,
    overrideAccess: true,
  })
  const wedstrijden = res.docs.map((b) => regelsVanBlad(b).get(spelerId)).filter((r): r is DeelnameRegel => r != null)
  return { geselecteerd: wedstrijden.length, gespeeld: wedstrijden.filter((w) => w.gespeeld).length, wedstrijden }
}

/**
 * Aantal gespeelde wedstrijden per speler over een set wedstrijden (bv. alle afgelopen wedstrijden
 * van een seizoen in 1NAH/1NAD) — voor het referendum (minimum 5 gespeeld).
 */
export async function gespeeldPerSpeler(payload: Payload, matchIds: number[]): Promise<Map<number, number>> {
  const tel = new Map<number, number>()
  for (let i = 0; i < matchIds.length; i += 200) {
    const deel = matchIds.slice(i, i + 200)
    const res = await payload.find({ collection: 'matchsheets', where: { match: { in: deel } }, depth: 0, limit: deel.length, pagination: false, overrideAccess: true })
    for (const blad of res.docs) {
      for (const [id, r] of regelsVanBlad(blad)) if (r.gespeeld) tel.set(id, (tel.get(id) ?? 0) + 1)
    }
  }
  return tel
}
