import type { Payload } from 'payload'

import { categorieVoorGeboortedatum } from './age-categories'
import { getSeasonStartYear } from './matchsheet-data'
import { isSpeelgerechtigd, keuringGeldig, KEURING_GELDIG_DAGEN } from './registratie'
import { seasonFromDate } from './seasons'

// Statistieken over de hele organisatie, voor de federatie (/federatie/statistieken). Alles
// afgeleid uit wat er al is (leden, ploegen, wedstrijden, bladen, officials, ongevalsaangiften) — niets apart bewaard.

export type Telling = { label: string; aantal: number }
export type ClubRij = {
  id: number
  naam: string
  ploegen: number
  leden: number
  spelers: number
  speelgerechtigd: number
  jeugd: number
  meisjes: number
  jongens: number
  forfaits: number
  ongevallen: number
}
export type Statistieken = {
  seizoen: string
  leden: {
    totaal: number
    spelers: number
    gewoneLeden: number
    speelgerechtigd: number
    meisjes: number
    jongens: number
    geslachtOnbekend: number
    jeugd: number
    senioren: number
    leeftijdOnbekend: number
    perCategorie: Telling[]
    keuringVerlopen: number
    keuringVerlooptBinnen30: number
    registratie: Telling[]
    metLogin: number
  }
  ploegen: { totaal: number; perReeks: Telling[] }
  wedstrijden: { gespeeld: number; gepland: number; forfaits: number; dubbelForfait: number; zonderScheidsrechter: number }
  scheidsrechters: { totaal: number; perType: Telling[]; inzet: Telling[] }
  /** Blessures die bij wedstrijden doorgegeven werden (collections/Accidents.ts), dit seizoen. */
  ongevallen: { totaal: number; jeugd: number; senioren: number; perStatus: Telling[]; perMaand: Telling[]; perCategorie: Telling[] }
  clubs: ClubRij[]
}

const relId = (v: unknown): number | null => {
  const id = v && typeof v === 'object' ? (v as { id?: unknown }).id : v
  return id == null || !Number.isFinite(Number(id)) ? null : Number(id)
}
const tel = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
const naarLijst = (m: Map<string, number>, volgorde?: string[]): Telling[] =>
  (volgorde ? volgorde.filter((k) => m.has(k)) : [...m.keys()].sort((a, b) => (m.get(b) ?? 0) - (m.get(a) ?? 0))).map((k) => ({ label: k, aantal: m.get(k) ?? 0 }))

const REG_LABEL: Record<string, string> = {
  concept: 'In voorbereiding (club)',
  ingediend: 'Bij de federatie',
  goedgekeurd: 'Goedgekeurd',
  afgekeurd: 'Afgekeurd',
  '': 'Van vóór de registratie',
}

export async function federatieStatistieken(payload: Payload, nu: Date = new Date()): Promise<Statistieken> {
  const seizoen = seasonFromDate(nu)
  const peiljaar = (await getSeasonStartYear(payload)) ?? nu.getFullYear()
  const opts = { depth: 0, pagination: false as const, overrideAccess: true }
  const [clubs, teams, players, matches, officials, users] = await Promise.all([
    payload.find({ collection: 'clubs', where: { analyseOnly: { not_equals: true } }, limit: 1000, ...opts }),
    payload.find({ collection: 'teams', where: { analyseOnly: { not_equals: true } }, limit: 5000, ...opts }),
    payload.find({ collection: 'players', where: { analyseOnly: { not_equals: true } }, limit: 20000, ...opts }),
    payload.find({
      collection: 'matches',
      where: { and: [{ seizoen: { equals: seizoen } }, { analyseOnly: { not_equals: true } }, { isDemo: { not_equals: true } }] },
      limit: 5000,
      ...opts,
    }),
    payload.find({ collection: 'officials', limit: 2000, ...opts }),
    payload.find({ collection: 'users', where: { player: { exists: true } }, limit: 20000, ...opts }),
  ])
  const sheets = matches.docs.length
    ? await payload.find({ collection: 'matchsheets', where: { match: { in: matches.docs.map((m) => m.id) } }, limit: 5000, ...opts })
    : { docs: [] }

  const clubVanPloeg = new Map(teams.docs.map((t) => [Number(t.id), relId(t.club)]))
  const perClub = new Map<number, ClubRij>(
    clubs.docs.map((c) => [
      Number(c.id),
      { id: Number(c.id), naam: String(c.name ?? ''), ploegen: 0, leden: 0, spelers: 0, speelgerechtigd: 0, jeugd: 0, meisjes: 0, jongens: 0, forfaits: 0, ongevallen: 0 },
    ]),
  )
  const perReeks = new Map<string, number>()
  for (const t of teams.docs) {
    tel(perReeks, String(t.reeks ?? 'zonder reeks'))
    const c = perClub.get(relId(t.club) ?? -1)
    if (c) c.ploegen += 1
  }

  // Leden
  const perCat = new Map<string, number>()
  const perReg = new Map<string, number>()
  const l = {
    totaal: 0, spelers: 0, gewoneLeden: 0, speelgerechtigd: 0, meisjes: 0, jongens: 0, geslachtOnbekend: 0,
    jeugd: 0, senioren: 0, leeftijdOnbekend: 0, keuringVerlopen: 0, keuringVerlooptBinnen30: 0,
  }
  const binnen30 = new Date(nu.getTime() - (KEURING_GELDIG_DAGEN - 30) * 86_400_000)
  for (const p of players.docs) {
    l.totaal += 1
    const speler = p.soortLid !== 'lid'
    if (speler) l.spelers += 1
    else l.gewoneLeden += 1
    const ok = isSpeelgerechtigd({ vergunningsstatus: p.vergunningsstatus, medischAttest: p.medischAttest, actief: p.actief, soortLid: p.soortLid })
    if (ok) l.speelgerechtigd += 1
    if (p.geslacht === 'v') l.meisjes += 1
    else if (p.geslacht === 'm') l.jongens += 1
    else l.geslachtOnbekend += 1
    const cat = categorieVoorGeboortedatum(p.birthDate as string | null, peiljaar)
    if (!cat) l.leeftijdOnbekend += 1
    else {
      tel(perCat, cat)
      if (cat === 'senioren') l.senioren += 1
      else l.jeugd += 1
    }
    if (speler && p.medischeKeuringOp) {
      if (!keuringGeldig(p.medischeKeuringOp as string, nu)) l.keuringVerlopen += 1
      else if (new Date(String(p.medischeKeuringOp)) < binnen30) l.keuringVerlooptBinnen30 += 1
    }
    tel(perReg, REG_LABEL[String(p.registratieStatus ?? '')] ?? String(p.registratieStatus))
    const c = perClub.get(clubVanPloeg.get(relId(p.team) ?? -1) ?? relId(p.club) ?? -1)
    if (c) {
      c.leden += 1
      if (speler) c.spelers += 1
      if (ok) c.speelgerechtigd += 1
      if (cat && cat !== 'senioren') c.jeugd += 1
      if (p.geslacht === 'v') c.meisjes += 1
      if (p.geslacht === 'm') c.jongens += 1
    }
  }

  // Wedstrijden en forfaits (van het wedstrijdblad)
  const bladVan = new Map(sheets.docs.map((s) => [relId(s.match), s]))
  let forfaits = 0
  let dubbel = 0
  let zonderRef = 0
  const inzet = new Map<number, number>()
  for (const m of matches.docs) {
    const s = bladVan.get(Number(m.id))
    const ff = (s?.forfait as { uitslag?: string } | undefined)?.uitslag
    if (ff && ff !== 'geen') {
      forfaits += 1
      if (ff === 'dubbel') dubbel += 1
      const schuldig = ff === 'thuis' ? [m.homeTeam] : ff === 'uit' ? [m.awayTeam] : [m.homeTeam, m.awayTeam]
      for (const t of schuldig) {
        const c = perClub.get(clubVanPloeg.get(relId(t) ?? -1) ?? -1)
        if (c) c.forfaits += 1
      }
    }
    const ref = relId(s?.assignedReferee)
    if (ref != null) inzet.set(ref, (inzet.get(ref) ?? 0) + 1)
    else if (m.status === 'scheduled') zonderRef += 1
  }
  // Ongevallen: vanaf 1 juli van het seizoen.
  const seizoenStart = new Date(Date.UTC(peiljaar, 6, 1)).toISOString()
  const ongevallen = await payload.find({
    collection: 'accidents',
    where: { or: [{ ongevalDatum: { greater_than_equal: seizoenStart } }, { and: [{ ongevalDatum: { exists: false } }, { createdAt: { greater_than_equal: seizoenStart } }] }] },
    depth: 0,
    limit: 5000,
    pagination: false,
    overrideAccess: true,
  })
  const spelerCat = new Map(players.docs.map((p) => [Number(p.id), categorieVoorGeboortedatum(p.birthDate as string | null, peiljaar)]))
  const ongStatus = new Map<string, number>()
  const ongMaand = new Map<string, number>()
  const ongCat = new Map<string, number>()
  let ongJeugd = 0
  let ongSenioren = 0
  const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  for (const a of ongevallen.docs) {
    tel(ongStatus, ({ gemeld: 'Documenten te bezorgen', ingediend: 'Bij de federatie', afgehandeld: 'Afgehandeld' } as Record<string, string>)[String(a.status ?? 'gemeld')] ?? 'Documenten te bezorgen')
    const d = new Date(String(a.ongevalDatum ?? a.createdAt))
    tel(ongMaand, `${MAANDEN[d.getUTCMonth()]} ${d.getUTCFullYear()}`)
    const cat = spelerCat.get(relId(a.player) ?? -1)
    if (cat) {
      tel(ongCat, cat)
      if (cat === 'senioren') ongSenioren += 1
      else ongJeugd += 1
    }
    const c = perClub.get(relId(a.club) ?? -1)
    if (c) c.ongevallen += 1
  }
  const maandVolgorde = [...ongMaand.keys()].sort((x, y) => {
    const [mx, jx] = x.split(' ')
    const [my, jy] = y.split(' ')
    return Number(jx) - Number(jy) || MAANDEN.indexOf(mx) - MAANDEN.indexOf(my)
  })

  const refNaam = new Map(officials.docs.map((o) => [Number(o.id), String(o.name ?? '')]))
  const perType = new Map<string, number>()
  for (const o of officials.docs) tel(perType, String(o.type ?? 'onbekend'))

  return {
    seizoen,
    leden: {
      ...l,
      perCategorie: naarLijst(perCat, ['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'senioren']),
      registratie: naarLijst(perReg),
      metLogin: users.docs.length,
    },
    ploegen: { totaal: teams.docs.length, perReeks: naarLijst(perReeks) },
    wedstrijden: {
      gespeeld: matches.docs.filter((m) => m.status === 'finished').length,
      gepland: matches.docs.filter((m) => m.status === 'scheduled').length,
      forfaits,
      dubbelForfait: dubbel,
      zonderScheidsrechter: zonderRef,
    },
    scheidsrechters: {
      totaal: officials.docs.filter((o) => o.type === 'scheidsrechter').length,
      perType: naarLijst(perType),
      inzet: [...inzet.entries()]
        .map(([id, aantal]) => ({ label: refNaam.get(id) ?? `#${id}`, aantal }))
        .sort((a, b) => b.aantal - a.aantal),
    },
    ongevallen: {
      totaal: ongevallen.docs.length,
      jeugd: ongJeugd,
      senioren: ongSenioren,
      perStatus: naarLijst(ongStatus, ['Documenten te bezorgen', 'Bij de federatie', 'Afgehandeld']),
      perMaand: naarLijst(ongMaand, maandVolgorde),
      perCategorie: naarLijst(ongCat, ['U8', 'U10', 'U12', 'U14', 'U16', 'U18', 'U20', 'senioren']),
    },
    clubs: [...perClub.values()].filter((c) => c.ploegen > 0 || c.leden > 0).sort((a, b) => b.leden - a.leden || a.naam.localeCompare(b.naam)),
  }
}
