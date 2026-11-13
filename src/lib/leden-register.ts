import type { Where } from 'payload'

import { AGE_CATEGORIES, type AgeCategory, eigenCategorie, peiljaar } from './age-categories'
import { seizoenBegin, seizoenEinde } from './registratie'

// Het ledenregister van de federatie: duizenden leden, honderden clubs. Puur — geen DB.
//
// Twee kanten van dezelfde regels:
//   · `lidToestand` zegt van één lid hoe het ervoor staat (voor de tabel, de tellingen, het dossier);
//   · `ledenWhere` zegt hetzelfde als databankfilter, zodat zoeken en bladeren op de server gebeurt
//     en de browser nooit 5000 leden hoeft te krijgen.
// tests/int/leden-register.int.spec.ts bewaakt dat beide voor elk lid exact hetzelfde antwoorden.
//
// De toestand volgt registratieIcoon (lib/registratie.ts) — wat de club achter een naam ziet, is wat
// de federatie hier filtert — met één toevoeging: een inactief lid is "inactief", niet "aan te vullen".
// De keuring staat er los naast: een speler kan speelgerechtigd zijn én een verlopen keuring hebben.

const DAG = 86_400_000
/** Binnen hoeveel dagen een keuring "verloopt binnenkort". */
export const KEURING_WAARSCHUW_DAGEN = 30

export type Toon = 'ok' | 'wacht' | 'todo' | 'fout' | 'lid' | 'inactief'
export type KeuringStand = 'geldig' | 'verloopt' | 'verlopen' | 'onbekend' | 'nvt'

export const TOON_LABEL: Record<Toon, string> = {
  ok: 'Mag spelen',
  wacht: 'Wacht op de federatie',
  todo: 'Aan te vullen door de club',
  fout: 'Afgekeurd',
  lid: 'Gewoon lid',
  inactief: 'Inactief',
}
export const KEURING_LABEL: Record<KeuringStand, string> = {
  geldig: 'Keuring geldig',
  verloopt: `Keuring verloopt binnen ${KEURING_WAARSCHUW_DAGEN} dagen`,
  verlopen: 'Keuring verlopen',
  onbekend: 'Geen keuringsdatum',
  nvt: 'Geen keuring nodig',
}

/** Wat een lid-record minstens moet bevatten om zijn toestand te kennen. */
export type LidVelden = {
  soortLid?: string | null
  actief?: boolean | null
  vergunningsstatus?: string | null
  medischAttest?: boolean | null
  registratieStatus?: string | null
  medischeKeuringOp?: string | Date | null
}

const isLid = (p: LidVelden) => (p.soortLid ?? 'speler') === 'lid'
const isActief = (p: LidVelden) => p.actief !== false
const isOk = (p: LidVelden) => p.vergunningsstatus === 'geldig' && p.medischAttest === true

export function toonVan(p: LidVelden): Toon {
  if (isLid(p)) return 'lid'
  if (!isActief(p)) return 'inactief'
  if (isOk(p)) return 'ok'
  if (p.registratieStatus === 'ingediend') return 'wacht'
  if (p.registratieStatus === 'afgekeurd') return 'fout'
  return 'todo'
}

/** Het einde van de geldigheid van een keuring (ms, exclusief): het einde van haar seizoen; null zonder datum. */
export function keuringTot(op: string | Date | null | undefined): number | null {
  if (!op) return null
  const d = new Date(op)
  return Number.isFinite(d.getTime()) ? seizoenEinde(d) : null
}

export function keuringStand(p: LidVelden, nu: Date = new Date()): KeuringStand {
  if (isLid(p) || !isActief(p)) return 'nvt'
  const tot = keuringTot(p.medischeKeuringOp)
  if (tot == null) return 'onbekend'
  if (tot <= nu.getTime()) return 'verlopen'
  if (tot <= nu.getTime() + KEURING_WAARSCHUW_DAGEN * DAG) return 'verloopt'
  return 'geldig'
}

/** Hoeveel dagen de keuring nog geldt (negatief = zoveel dagen verlopen), of null. */
export function keuringDagen(p: LidVelden, nu: Date = new Date()): number | null {
  const tot = keuringTot(p.medischeKeuringOp)
  return tot == null ? null : Math.floor((tot - nu.getTime()) / DAG)
}

// ── Als databankfilter ───────────────────────────────────────────────────────────────────────────
// Let op NULL: een leeg veld is in SQL noch gelijk noch ongelijk. Daarom telkens "of het veld is leeg"
// waar de JS-kant een lege waarde als standaard leest (soortLid leeg = speler, actief leeg = actief).

const spelerW: Where = { or: [{ soortLid: { equals: 'speler' } }, { soortLid: { exists: false } }] }
const actiefW: Where = { or: [{ actief: { equals: true } }, { actief: { exists: false } }] }
const okW: Where = { and: [{ vergunningsstatus: { equals: 'geldig' } }, { medischAttest: { equals: true } }] }
const nietOkW: Where = {
  or: [
    { vergunningsstatus: { not_equals: 'geldig' } },
    { vergunningsstatus: { exists: false } },
    { medischAttest: { not_equals: true } },
    { medischAttest: { exists: false } },
  ],
}

export function toonWhere(t: Toon): Where {
  switch (t) {
    case 'lid':
      return { soortLid: { equals: 'lid' } }
    case 'inactief':
      return { and: [spelerW, { actief: { equals: false } }] }
    case 'ok':
      return { and: [spelerW, actiefW, okW] }
    case 'wacht':
      return { and: [spelerW, actiefW, nietOkW, { registratieStatus: { equals: 'ingediend' } }] }
    case 'fout':
      return { and: [spelerW, actiefW, nietOkW, { registratieStatus: { equals: 'afgekeurd' } }] }
    case 'todo':
      return {
        and: [
          spelerW,
          actiefW,
          nietOkW,
          { or: [{ registratieStatus: { not_in: ['ingediend', 'afgekeurd'] } }, { registratieStatus: { exists: false } }] },
        ],
      }
  }
}

export function keuringWhere(k: Exclude<KeuringStand, 'nvt'>, nu: Date = new Date()): Where {
  // Per seizoen: geldig = een keuring van dit seizoen (of al van het volgende). "Verloopt" = het seizoen eindigt
  // binnen de waarschuwingstermijn: dan verlopen alle keuringen van dit seizoen samen op 30 juni.
  const begin = new Date(seizoenBegin(nu)).toISOString()
  const einde = new Date(seizoenEinde(nu)).toISOString()
  const bijnaOm = seizoenEinde(nu) - nu.getTime() <= KEURING_WAARSCHUW_DAGEN * DAG
  const basis: Where[] = [spelerW, actiefW]
  const ditSeizoen: Where[] = [{ medischeKeuringOp: { greater_than_equal: begin } }, { medischeKeuringOp: { less_than: einde } }]
  const niets: Where[] = [{ medischeKeuringOp: { exists: true } }, { medischeKeuringOp: { exists: false } }]
  switch (k) {
    case 'onbekend':
      return { and: [...basis, { medischeKeuringOp: { exists: false } }] }
    case 'verlopen':
      return { and: [...basis, { medischeKeuringOp: { less_than: begin } }] }
    case 'verloopt':
      return { and: [...basis, ...(bijnaOm ? ditSeizoen : niets)] }
    case 'geldig':
      return {
        and: [...basis, bijnaOm ? { medischeKeuringOp: { greater_than_equal: einde } } : { medischeKeuringOp: { greater_than_equal: begin } }],
      }
  }
}

/** De geboortejaren van een categorie in een seizoen: [eerste, laatste] (inclusief). */
export function geboortejarenVan(cat: AgeCategory, seizoenStartJaar: number): [number, number] | null {
  const pj = peiljaar(seizoenStartJaar)
  const jaren: number[] = []
  for (let j = pj - 100; j <= pj; j++) if (eigenCategorie(j, pj) === cat) jaren.push(j)
  return jaren.length ? [jaren[0]!, jaren[jaren.length - 1]!] : null
}

export type LedenFilter = {
  zoek?: string
  club?: number | null
  ploeg?: number | null
  toon?: Toon | null
  keuring?: Exclude<KeuringStand, 'nvt'> | null
  categorie?: AgeCategory | null
  geslacht?: 'm' | 'v' | null
}

/**
 * Het filter als databankfilter. `clubPloegen` zijn de ploegen van de gekozen club: een speler hoort bij
 * een club via zijn ploeg (players.club is bij oudere leden soms leeg).
 */
export function ledenWhere(f: LedenFilter, seizoenStartJaar: number, nu: Date = new Date(), clubPloegen: number[] = []): Where {
  const en: Where[] = [{ analyseOnly: { not_equals: true } }]
  const zoek = String(f.zoek ?? '').trim().slice(0, 80)
  if (zoek) en.push({ or: [{ name: { like: zoek } }, { vergunningsnummer: { like: zoek } }, { email: { like: zoek } }] })
  if (f.club != null) en.push({ team: { in: clubPloegen.length ? clubPloegen : [-1] } })
  if (f.ploeg != null) en.push({ team: { equals: f.ploeg } })
  if (f.toon) en.push(toonWhere(f.toon))
  if (f.keuring) en.push(keuringWhere(f.keuring, nu))
  if (f.geslacht) en.push({ geslacht: { equals: f.geslacht } })
  if (f.categorie) {
    const jaren = geboortejarenVan(f.categorie, seizoenStartJaar)
    if (jaren) en.push({ birthDate: { greater_than_equal: `${jaren[0]}-01-01T00:00:00.000Z` } }, { birthDate: { less_than: `${jaren[1] + 1}-01-01T00:00:00.000Z` } })
  }
  return { and: en }
}

/** Een filter uit de URL (searchParams), met enkel geldige waarden. */
export function filterUitParams(p: Record<string, string | string[] | undefined>): LedenFilter {
  const een = (k: string) => {
    const v = p[k]
    return (Array.isArray(v) ? v[0] : v) ?? ''
  }
  const getal = (k: string) => {
    const n = Number(een(k))
    return Number.isInteger(n) && n > 0 ? n : null
  }
  const toon = een('toon') as Toon
  const keuring = een('keuring') as KeuringStand
  const cat = een('categorie') as AgeCategory
  const g = een('geslacht')
  return {
    zoek: een('zoek').slice(0, 80) || undefined,
    club: getal('club'),
    ploeg: getal('ploeg'),
    toon: toon in TOON_LABEL ? toon : null,
    keuring: keuring in KEURING_LABEL && keuring !== 'nvt' ? (keuring as Exclude<KeuringStand, 'nvt'>) : null,
    categorie: (AGE_CATEGORIES as readonly string[]).includes(cat) ? cat : null,
    geslacht: g === 'm' || g === 'v' ? g : null,
  }
}

/** Het filter terug als querystring (zonder lege waarden), voor links die het filter bewaren. */
export function filterNaarQuery(f: LedenFilter & { pagina?: number; sort?: string }): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v != null && v !== '') q.set(k, String(v))
  return q.toString()
}

// ── Tellingen per club ───────────────────────────────────────────────────────────────────────────

export type Telling = Record<Toon, number> & { totaal: number; verloopt: number; verlopen: number; onbekend: number }
export const legeTelling = (): Telling => ({ totaal: 0, ok: 0, wacht: 0, todo: 0, fout: 0, lid: 0, inactief: 0, verloopt: 0, verlopen: 0, onbekend: 0 })

export function tel(t: Telling, p: LidVelden, nu: Date = new Date()): void {
  t.totaal++
  t[toonVan(p)]++
  const k = keuringStand(p, nu)
  if (k === 'verloopt' || k === 'verlopen' || k === 'onbekend') t[k]++
}

/** Hoeveel er bij een club "te doen" is: aanvullen, afgekeurd, keuring (bijna) verlopen of onbekend. */
export const teDoen = (t: Telling) => t.todo + t.fout + t.verloopt + t.verlopen + t.onbekend
