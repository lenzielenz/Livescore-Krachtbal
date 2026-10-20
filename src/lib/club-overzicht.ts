// Het clubdashboard bovenaan "Mijn club": kerncijfers, wat er te doen is en het ledenbestand per
// ploeg. Puur — de pagina (app/(frontend)/club/page.tsx) haalt de ruwe tellingen op, hier wordt
// bepaald wat er getoond wordt en in welke volgorde. Niets wordt opgeslagen: alles volgt uit de
// leden, blessures, boetes en wedstrijden zoals ze nu zijn.

/** Toestand van één lid, zoals registratieIcoon (lib/registratie.ts) ze geeft. */
export type LidToon = 'ok' | 'wacht' | 'todo' | 'fout' | 'lid'

export type PloegLeden = { id: number; naam: string; reeks: string; toon: LidToon[] }

export type ClubOverzichtInput = {
  ploegen: PloegLeden[]
  /** Ongevallendossiers: documenten nog te bezorgen door de club/speler, of bij de federatie. */
  blessures: { teBezorgen: number; bijFederatie: number }
  /** Opgelegde boetes die nog openstaan (opgelegd, betaling gemeld, betwist). */
  boetes: { aantal: number; bedrag: number; teBetalen: number }
  /** Wedstrijden binnen de komende twee weken waarvan de eigen opstelling nog niet klaar is. */
  opstellingenTeDoen: number
}

export type LedenTelling = { totaal: number; spelers: number; ok: number; wacht: number; todo: number; leden: number }

export type Kerncijfer = { sleutel: string; waarde: string; label: string; href: string; toon: 'neutraal' | 'goed' | 'let-op' | 'actie' }
export type TeDoen = { sleutel: string; tekst: string; href: string; dringend: boolean }
export type PloegRij = { id: number; naam: string; reeks: string } & LedenTelling

export function telLeden(toon: LidToon[]): LedenTelling {
  const t: LedenTelling = { totaal: toon.length, spelers: 0, ok: 0, wacht: 0, todo: 0, leden: 0 }
  for (const x of toon) {
    if (x === 'lid') {
      t.leden += 1
      continue
    }
    t.spelers += 1
    if (x === 'ok') t.ok += 1
    else if (x === 'wacht') t.wacht += 1
    else t.todo += 1
  }
  return t
}

const euro = (n: number) => `€ ${n.toFixed(2).replace('.', ',').replace(/,00$/, '')}`
const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`

export function clubOverzicht(inp: ClubOverzichtInput): { totaal: LedenTelling; kerncijfers: Kerncijfer[]; teDoen: TeDoen[]; ploegen: PloegRij[] } {
  const ploegen: PloegRij[] = inp.ploegen.map((p) => ({ id: p.id, naam: p.naam, reeks: p.reeks, ...telLeden(p.toon) }))
  const totaal = telLeden(inp.ploegen.flatMap((p) => p.toon))
  const blessuresOpen = inp.blessures.teBezorgen + inp.blessures.bijFederatie

  const kerncijfers: Kerncijfer[] = [
    { sleutel: 'leden', waarde: String(totaal.totaal), label: totaal.leden ? `leden (${totaal.spelers} spelers)` : 'leden', href: '/club/leden', toon: 'neutraal' },
    { sleutel: 'ok', waarde: String(totaal.ok), label: 'mogen spelen', href: '/club/leden', toon: 'goed' },
    { sleutel: 'wacht', waarde: String(totaal.wacht), label: 'bij de federatie', href: '/club/leden', toon: totaal.wacht ? 'let-op' : 'neutraal' },
    { sleutel: 'todo', waarde: String(totaal.todo), label: 'aan te vullen', href: '/club/leden', toon: totaal.todo ? 'actie' : 'neutraal' },
    { sleutel: 'blessures', waarde: String(blessuresOpen), label: 'open blessures', href: '/ongevallen', toon: inp.blessures.teBezorgen ? 'actie' : blessuresOpen ? 'let-op' : 'neutraal' },
    { sleutel: 'boetes', waarde: euro(inp.boetes.bedrag), label: inp.boetes.aantal ? `open (${meervoud(inp.boetes.aantal, 'boete', 'boetes')})` : 'open boetes', href: '/club/boetes', toon: inp.boetes.teBetalen ? 'actie' : inp.boetes.aantal ? 'let-op' : 'neutraal' },
  ]

  // Te doen: enkel wat de club zelf moet doen, het dringendste eerst (wedstrijden kunnen anders
  // niet doorgaan of het kost geld). Wat bij de federatie ligt, is geen taak van de club.
  const teDoen: TeDoen[] = []
  if (inp.opstellingenTeDoen) teDoen.push({ sleutel: 'opstelling', tekst: `${meervoud(inp.opstellingenTeDoen, 'wedstrijd', 'wedstrijden')} zonder opstelling (komende 2 weken)`, href: '#wedstrijden', dringend: true })
  if (totaal.todo) teDoen.push({ sleutel: 'leden', tekst: `${meervoud(totaal.todo, 'lid', 'leden')} aan te vullen of in te dienen bij de federatie`, href: '/club/leden', dringend: false })
  if (inp.blessures.teBezorgen) teDoen.push({ sleutel: 'blessures', tekst: `${meervoud(inp.blessures.teBezorgen, 'blessure', 'blessures')}: documenten nog te bezorgen`, href: '/ongevallen', dringend: false })
  if (inp.boetes.teBetalen) teDoen.push({ sleutel: 'boetes', tekst: `${meervoud(inp.boetes.teBetalen, 'boete', 'boetes')} te betalen`, href: '/club/boetes', dringend: true })
  teDoen.sort((a, b) => Number(b.dringend) - Number(a.dringend))

  return { totaal, kerncijfers, teDoen, ploegen }
}

// ── Ledenbestand exporteren ─────────────────────────────────────────────────────────────────────
// Als CSV met puntkomma (zo opent Excel het in België meteen in kolommen) en een BOM voor de
// accenten. Bewust zonder medische gegevens: enkel wat de clubstaf in de ledenlijst al ziet.

export type ExportLid = {
  naam: string
  voornaam: string
  achternaam: string
  ploeg: string
  rugnummer: number | null
  geboortedatum: string
  geslacht: string
  soortLid: string
  status: string
  email: string
  ouderEmail: string
  login: boolean
}

const KOLOMMEN: [keyof ExportLid, string][] = [
  ['achternaam', 'Naam'],
  ['voornaam', 'Voornaam'],
  ['ploeg', 'Ploeg'],
  ['rugnummer', 'Rugnummer'],
  ['geboortedatum', 'Geboortedatum'],
  ['geslacht', 'Geslacht'],
  ['soortLid', 'Soort lid'],
  ['status', 'Status'],
  ['email', 'E-mail'],
  ['ouderEmail', 'E-mail ouder'],
  ['login', 'Login'],
]

function cel(v: unknown): string {
  const s = typeof v === 'boolean' ? (v ? 'ja' : 'nee') : v == null ? '' : String(v)
  // Formule-injectie in Excel voorkomen (=, +, -, @ aan het begin) en aanhalingstekens verdubbelen.
  const veilig = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[;"\n\r]/.test(veilig) || veilig !== s ? `"${veilig.replace(/"/g, '""')}"` : veilig
}

export function ledenCsv(leden: ExportLid[]): string {
  const rijen = [KOLOMMEN.map(([, kop]) => kop).join(';')]
  for (const l of leden) {
    const rij = { ...l, achternaam: l.achternaam || l.naam, rugnummer: l.rugnummer || '' }
    rijen.push(KOLOMMEN.map(([k]) => cel(rij[k])).join(';'))
  }
  return `﻿${rijen.join('\r\n')}\r\n`
}
