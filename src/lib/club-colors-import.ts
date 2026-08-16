import { naamSleutel } from './season-import'

// Clubkleuren uit de officiële "Reeksen"-PDF (KVKBF): per ploeg staat naast de reeks en het
// thuisuur ook de truikleur (bv. "Zwart/Rood"). Enkel bedoeld als STARTWAARDE voor clubs die nog
// geen kleur hebben ingesteld — wie al een logo uploadde (of de kleur handmatig koos via
// LogoColorsEditor) wordt nooit overschreven. Zie extractPdfText in reeksindeling-import.ts voor
// hoe de ruwe PDF-tekst eruit gehaald wordt (dezelfde aanpak, andere PDF-lay-out: hier staat de
// kleur tússen de reekscode en het dag/uur, i.p.v. de reekscode als laatste op de regel).

const COLOR_WORDS = [
  'zwart', 'rood', 'blauw', 'geel', 'groen', 'wit', 'grijs', 'oranje',
  'paars', 'antraciet', 'bruin', 'roze', 'goud', 'zilver', 'marine', 'bordeaux',
] as const

const COLOR_HEX: Record<(typeof COLOR_WORDS)[number], string> = {
  zwart: '#1a1a1a',
  rood: '#c8202e',
  blauw: '#1d4e9b',
  geel: '#f5c518',
  groen: '#1f8a3b',
  wit: '#f4f4f4',
  grijs: '#8a8f98',
  oranje: '#e8791a',
  paars: '#6c2b9e',
  antraciet: '#2c2f33',
  bruin: '#6b4423',
  roze: '#e0679a',
  goud: '#c9a227',
  zilver: '#b7bcc4',
  marine: '#16264a',
  bordeaux: '#5c1a24',
}

export function colorWordToHex(word: string): string | null {
  return COLOR_HEX[word.toLowerCase() as (typeof COLOR_WORDS)[number]] ?? null
}

// Regex-bronfragment voor "één of twee kleurwoorden, evt. met een spatie/scheidingsteken en
// '(gestreept)'" — herbruikt door reeksindeling-import.ts om de reekscode weer los te krijgen van
// het dag/uur-anker in dit PDF-formaat (de kleur schuift zich daar tussenin).
const COLOR_TOK = `(?:${COLOR_WORDS.join('|')})`
export const COLOR_NOISE_SOURCE = `(?:${COLOR_TOK}(?:\\s*[/,-]\\s*${COLOR_TOK})?(?:\\s*\\(gestreept\\))?)?`

export interface KleurEntry {
  /** Clubnaam + reekscode aan elkaar geplakt (geen scheidingsteken in de PDF-tekst). */
  nameCode: string
  /** Eén of twee kleurwoorden, in PDF-volgorde (bv. ["zwart", "rood"]). */
  colors: string[]
}

// Elke regel in de PDF: <rij><club><reekscode><kleur(en)><za|zo><u:mm>. We zoeken niet naar de
// reekscode zelf (die lijst verandert per seizoen) — de kleur staat altijd net vóór het dag/uur,
// dus dát is het betrouwbare anker.
export function parseReeksenKleuren(pdfText: string): KleurEntry[] {
  const colorTok = `(?:${COLOR_WORDS.join('|')})`
  const colorExpr = `${colorTok}(?:[/,-]?${colorTok})?`
  const re = new RegExp(`(${colorExpr})(?:\\(gestreept\\))?(?:za|zo)\\d{1,2}:\\d{2}`, 'gi')

  const out: KleurEntry[] = []
  let prev = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(pdfText))) {
    const seg = pdfText.slice(prev, m.index)
    prev = m.index + m[0].length
    const nameCode = seg.replace(/^\d{1,3}/, '')
    if (!nameCode) continue
    const colors = m[1].toLowerCase().split(/[/,-]/).filter(Boolean)
    out.push({ nameCode, colors })
  }
  return out
}

// Koppelt elke ECHTE club (uit de DB) aan een PDF-fragment via een prefix-vergelijking op de
// genormaliseerde naam — de clubnaam staat normaal vooraan in het fragment, direct gevolgd door de
// reekscode zonder scheidingsteken, dus een prefix-match volstaat. Bij meerdere PDF-regels voor
// dezelfde club (elke reeks/poule herhaalt de kleur) telt de eerste (de kleur is er toch identiek).
// Tweede ronde (fallback): een enkele voetnoot/notitie zonder voorafgaand dag/uur-anker kan vóór de
// rij-index blijven hangen, waardoor de clubnaam niet meer vooraan staat — dan volstaat "ergens in".
export function matchClubColors(clubNames: string[], entries: KleurEntry[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const bySleutel = clubNames
    .map((name) => ({ name, key: naamSleutel(name) }))
    .filter((c) => c.key.length > 0)
    .sort((a, b) => b.key.length - a.key.length) // langste (specifiekste) naam eerst
  const restEntries: KleurEntry[] = []
  for (const entry of entries) {
    const key = naamSleutel(entry.nameCode)
    const hit = bySleutel.find((c) => key.startsWith(c.key))
    if (hit) {
      if (!out.has(hit.name)) out.set(hit.name, entry.colors)
    } else {
      restEntries.push(entry) // geen enkele club paste als voorvoegsel — kandidaat voor de fallback
    }
  }
  for (const entry of restEntries) {
    const key = naamSleutel(entry.nameCode)
    const hit = bySleutel.find((c) => !out.has(c.name) && key.includes(c.key))
    if (hit) out.set(hit.name, entry.colors)
  }
  return out
}

export function colorsToHex(colors: string[]): { primary: string; secondary: string } | null {
  const hexes = colors.map(colorWordToHex).filter((h): h is string => h != null)
  if (hexes.length === 0) return null
  return { primary: hexes[0], secondary: hexes[1] ?? hexes[0] }
}
