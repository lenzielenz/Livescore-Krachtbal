import type { Payload } from 'payload'

// De ploegnaam en haar club rechtzetten — één plaats, twee ingangen.
//
// Dit kan vanaf de wedstrijdpagina (/api/match/[id]/beheer) en vanaf de ploegpagina zelf
// (/api/ploeg/[id]/beheer). Beide schrijven exact hetzelfde en moeten dus ook exact dezelfde
// controles doen; staat die logica twee keer, dan lopen ze bij de eerste wijziging uit elkaar en
// laat de ene route door wat de andere weigert.
//
// Wat er op het spel staat: het logo en de kleuren hangen aan de CLUB, niet aan de ploeg. Een ploeg
// onder de verkeerde club toont het verkeerde logo op het live-bord, het kantinescherm en de cast.

export type Rechtzetting = { naam?: unknown; clubId?: unknown }

/** Een club zoals ze in de keuzelijst staat. */
export type BeheerClub = { id: number; naam: string }
/** Een ploeg zoals het beheerformulier ze kent: naam, en de club waar ze nu onder hangt. */
export type BeheerPloeg = { id: number; naam: string; clubId: number | null }

export type Uitkomst =
  | { ok: true; teamId: number; naam: string; clubId: number | null }
  | { ok: false; fout: string; status: number }

const rel = (v: unknown): number | null =>
  v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null

export async function ploegRechtzetten(
  payload: Payload,
  teamId: number,
  velden: Rechtzetting,
): Promise<Uitkomst> {
  const team = await payload.findByID({ collection: 'teams', id: teamId, depth: 0 }).catch(() => null)
  if (!team) return { ok: false, fout: 'Ploeg niet gevonden.', status: 404 }
  // Analyseploegen zijn privé en horen bij één eigenaar; die worden onder /analyse/beheer beheerd.
  if ((team as { analyseOnly?: boolean }).analyseOnly) {
    return { ok: false, fout: 'Analyseploegen beheer je onder /analyse/beheer.', status: 400 }
  }

  const data: { name?: string; club?: number } = {}

  if (velden.naam !== undefined) {
    const naam = String(velden.naam ?? '').trim()
    if (!naam) return { ok: false, fout: 'Geef een ploegnaam in.', status: 400 }
    data.name = naam
  }

  // Geen clubId meegestuurd (of null) betekent: laat de club staan zoals ze staat. Loskoppelen kán
  // niet en hoort ook niet te kunnen — `club` is een verplicht veld op een ploeg (Teams.ts), want
  // logo en kleuren hangen eraan. Een ploeg verhang je naar een andere club; je laat ze niet los.
  if (velden.clubId !== undefined && velden.clubId !== null && velden.clubId !== '') {
    const clubId = Number(velden.clubId)
    if (!Number.isFinite(clubId)) return { ok: false, fout: 'Ongeldige club.', status: 400 }
    const club = await payload.findByID({ collection: 'clubs', id: clubId, depth: 0 }).catch(() => null)
    if (!club) return { ok: false, fout: 'Die club bestaat niet.', status: 404 }
    if ((club as { analyseOnly?: boolean }).analyseOnly) {
      return { ok: false, fout: 'Dat is een analyse-club; kies een competitieclub.', status: 400 }
    }
    data.club = clubId
  }

  if (!('name' in data) && !('club' in data)) {
    return { ok: false, fout: 'Niets om te wijzigen.', status: 400 }
  }

  await payload.update({ collection: 'teams', id: teamId, data, overrideAccess: true })
  const na = await payload.findByID({ collection: 'teams', id: teamId, depth: 0 }).catch(() => null)
  return {
    ok: true,
    teamId,
    naam: String((na as { name?: unknown } | null)?.name ?? ''),
    clubId: rel((na as { club?: unknown } | null)?.club),
  }
}

// ── De club die een ploeg nu heeft ───────────────────────────────────────────────────────────

/**
 * De namen van de clubs waar deze ploegen nú onder hangen, om ze in het formulier te tonen.
 *
 * Bewust een opzoeking op id en geen lijst. De eerste versie toonde een keuzelijst van alle clubs,
 * met een cap van 1000 — maar er staan er meer dan vierduizend in de database. Wat er dan gebeurt
 * is dubbel fout: de eigen club valt buiten de lijst, dus het formulier toont "geen club" terwijl
 * ze er wel een heeft, én de club die je nodig hebt staat er evenmin in, dus je kunt haar niet
 * kiezen. Kiezen gebeurt nu via zoeken (/api/clubs/zoek); hier hoeft enkel de huidige stand.
 */
export async function clubsOpId(payload: Payload, ids: (number | null | undefined)[]): Promise<BeheerClub[]> {
  const uniek = [...new Set(ids.filter((v): v is number => typeof v === 'number'))]
  if (!uniek.length) return []
  const res = await payload
    .find({ collection: 'clubs', where: { id: { in: uniek } }, depth: 0, limit: uniek.length, select: { name: true } })
    .catch(() => ({ docs: [] as unknown[] }))
  return res.docs
    .map((c) => ({ id: (c as { id: number }).id, naam: String((c as { name?: unknown }).name ?? '') }))
    .filter((c) => c.naam)
}
