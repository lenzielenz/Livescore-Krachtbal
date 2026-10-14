import type { FotoKader } from './virtueel'

// De fotogalerij in de gangen van het virtuele stadion: supportersfoto's die tijdens live
// wedstrijden van je club genomen werden (match-instants), door elkaar gehusseld en per 1 tot 4 in
// een kader gezet. De husseling hangt af van een zaad (de dag), zodat de galerij elke dag anders
// oogt maar binnen een dag stabiel blijft. Puur: geen DB, geen DOM.

export type GalerijFoto = { id: number; url: string; auteur: string; matchId: number }
export type GalerijWedstrijd = { label: string; datum: string }

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/** Kleine, voorspelbare toevalsgenerator (mulberry32). */
export function toeval(zaad: number): () => number {
  let a = zaad >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function husselen<T>(lijst: T[], r: () => number): T[] {
  const uit = [...lijst]
  for (let i = uit.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[uit[i], uit[j]] = [uit[j], uit[i]]
  }
  return uit
}

/** "12 oktober" (Belgische kalender). */
function dagLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', month: 'numeric', day: 'numeric' }).formatToParts(d)
  const dag = Number(p.find((x) => x.type === 'day')?.value)
  const maand = Number(p.find((x) => x.type === 'month')?.value)
  return `${dag} ${MAANDEN[maand - 1]}`
}

/** Voornamen van de fotografen, zonder dubbels: "Lotte", "Lotte en Jan", "Lotte, Jan en 2 anderen". */
export function fotografen(namen: string[]): string {
  const uniek = [...new Set(namen.map((n) => n.trim().split(/\s+/)[0]).filter(Boolean))]
  if (uniek.length === 0) return 'supporters'
  if (uniek.length === 1) return uniek[0]
  if (uniek.length === 2) return `${uniek[0]} en ${uniek[1]}`
  return uniek.length === 3 ? `${uniek[0]}, ${uniek[1]} en ${uniek[2]}` : `${uniek[0]}, ${uniek[1]} en ${uniek.length - 2} anderen`
}

/**
 * Zet de foto's in kaders: eerst gehusseld, dan in groepjes van 1 tot 4 (de grootte per kader
 * wisselt ook met het zaad). Hoogstens `maxKaders` kaders en elke foto hoogstens één keer.
 */
export function fotoKaders(
  fotos: GalerijFoto[],
  wedstrijden: Map<number, GalerijWedstrijd>,
  o: { zaad: number; maxKaders?: number },
): FotoKader[] {
  const max = o.maxKaders ?? 8
  const r = toeval(o.zaad)
  const pool = husselen(
    fotos.filter((f) => f.url && wedstrijden.has(f.matchId)),
    r,
  )
  const kaders: FotoKader[] = []
  let i = 0
  while (i < pool.length && kaders.length < max) {
    // Een mengeling van groottes; met weinig foto's niet alles in één kader proppen.
    const rest = pool.length - i
    const voorkeur = 1 + Math.floor(r() * 4)
    const n = Math.min(rest, voorkeur, rest <= max - kaders.length ? 1 : 4)
    const groep = pool.slice(i, i + Math.max(1, n))
    i += groep.length
    const matches = [...new Set(groep.map((f) => f.matchId))]
    const eerste = wedstrijden.get(matches[0])!
    const datums = [...new Set(matches.map((m) => dagLabel(wedstrijden.get(m)!.datum)).filter(Boolean))]
    kaders.push({
      fotos: groep.map((f) => ({ url: f.url, auteur: f.auteur })),
      titel: matches.length === 1 ? eerste.label : `${matches.length} wedstrijden`,
      sub: [datums.length === 1 ? datums[0] : '', `foto${groep.length === 1 ? '' : "'s"} van ${fotografen(groep.map((f) => f.auteur))}`].filter(Boolean).join(' · '),
      zaad: Math.floor(r() * 1e9),
    })
  }
  return kaders
}
