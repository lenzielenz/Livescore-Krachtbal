import type { Payload } from 'payload'

// De selectie van een wedstrijd: wie de coach (of de club) op het wedstrijdblad zette, per kant, met
// het rugnummer van dat blad. In de federatieflow is dát de lijst waaruit het aantekenscherm kiest —
// niet "alle spelers van de ploeg". Zo staat een speler die de coach uit een lagere ploeg haalde
// (vastspelen, lib/competitieregels.ts) er wél bij, en een niet-geselecteerde speler niet.
// Zonder blad of zonder opstelling (supportersmodus, analyse, oudere wedstrijden) valt alles terug
// op de spelers van de ploeg, zoals vroeger.

export type Kant = 'home' | 'away'
export type SelectieRij = { id: number; rugnummer: number | null }
export type Selectie = Record<Kant, SelectieRij[]>

const idVan = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}

const rijen = (v: unknown): SelectieRij[] =>
  (Array.isArray(v) ? v : [])
    .map((r) => {
      const row = r as { player?: unknown; rugnummer?: unknown }
      const id = idVan(row.player)
      const nr = row.rugnummer != null && Number.isFinite(Number(row.rugnummer)) ? Number(row.rugnummer) : null
      return id == null ? null : { id, rugnummer: nr }
    })
    .filter((r): r is SelectieRij => r != null)

/** De selectie op het wedstrijdblad, per kant (leeg als er geen blad of geen opstelling is). */
export async function wedstrijdSelectie(payload: Payload, matchId: number | string): Promise<Selectie> {
  const res = await payload
    .find({ collection: 'matchsheets', where: { match: { equals: Number(matchId) } }, depth: 0, limit: 1, overrideAccess: true })
    .catch(() => ({ docs: [] as unknown[] }))
  const sheet = res.docs[0] as { homeLineup?: unknown; awayLineup?: unknown } | undefined
  return { home: rijen(sheet?.homeLineup), away: rijen(sheet?.awayLineup) }
}

/**
 * Wie mag voor deze kant op het veld staan: de selectie als die er is, anders de spelers van de
 * ploeg. Gebruikt door de opstelling van de veldspelers, de kapitein en het startvoorstel.
 */
export async function toegelatenSpelers(payload: Payload, matchId: number | string, kant: Kant, teamId: number): Promise<number[]> {
  const sel = (await wedstrijdSelectie(payload, matchId))[kant]
  if (sel.length) return sel.map((r) => r.id)
  const res = await payload.find({ collection: 'players', where: { team: { equals: teamId } }, sort: 'shirtNumber', depth: 0, limit: 200 })
  return res.docs.map((p) => Number(p.id))
}

/**
 * Hoort deze speler in deze wedstrijd bij deze kant? Ja als hij van de ploeg is, of als de coach
 * hem voor deze kant selecteerde (een speler uit een lagere ploeg van dezelfde club).
 */
export async function hoortBijKant(
  payload: Payload,
  matchId: number | string,
  kant: Kant,
  teamId: number,
  speler: { id: number; team?: unknown },
): Promise<boolean> {
  if (idVan(speler.team) === Number(teamId)) return true
  return (await wedstrijdSelectie(payload, matchId))[kant].some((r) => r.id === Number(speler.id))
}
