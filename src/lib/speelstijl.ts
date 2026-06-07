// Speelstijl van een ploeg — door de coach ingegeven tactisch profiel. Wordt naast de
// gemeten worpdata gelegd om gerichte strategie-aanbevelingen te maken in het ploegrapport.
// Opgeslagen als één JSON-veld op teams.speelstijl (zie Teams-collectie + migratie).

export type SpeelstijlAccent = 'aanvallend' | 'gebalanceerd' | 'verdedigend'
export type SpeelstijlTempo = 'snel' | 'gecontroleerd'
export type SpeelstijlZone = 'links' | 'midden' | 'rechts' | 'wisselend'
export type SpeelstijlWorp = 'nek' | 'rug' | 'gemengd'

export interface Speelstijl {
  /** Algemeen accent van de ploeg. */
  accent?: SpeelstijlAccent | null
  /** Speltempo. */
  tempo?: SpeelstijlTempo | null
  /** Voorkeurszone in de aanval (waar willen ze spelen). */
  zone?: SpeelstijlZone | null
  /** Voorkeur worptype. */
  worp?: SpeelstijlWorp | null
  /** Speelt graag de verre worp (+15 m, links/rechts over). */
  verreWorp?: boolean | null
  /** Vrije notitie / eigen strategie. */
  notitie?: string | null
}

export const ACCENT_OPTIONS: { value: SpeelstijlAccent; label: string }[] = [
  { value: 'aanvallend', label: 'Aanvallend' },
  { value: 'gebalanceerd', label: 'Gebalanceerd' },
  { value: 'verdedigend', label: 'Verdedigend' },
]
export const TEMPO_OPTIONS: { value: SpeelstijlTempo; label: string }[] = [
  { value: 'snel', label: 'Snel omschakelen' },
  { value: 'gecontroleerd', label: 'Gecontroleerd opbouwen' },
]
export const ZONE_OPTIONS: { value: SpeelstijlZone; label: string }[] = [
  { value: 'links', label: 'Links' },
  { value: 'midden', label: 'Midden' },
  { value: 'rechts', label: 'Rechts' },
  { value: 'wisselend', label: 'Wisselend' },
]
export const WORP_OPTIONS: { value: SpeelstijlWorp; label: string }[] = [
  { value: 'nek', label: 'Nekworp (+1)' },
  { value: 'rug', label: 'Rugworp (+2)' },
  { value: 'gemengd', label: 'Gemengd' },
]

const ZONE_NL: Record<string, string> = { links: 'links', midden: 'het midden', rechts: 'rechts', wisselend: 'wisselend' }

/** Leest een onbekende waarde (json) veilig in als Speelstijl. */
export function parseSpeelstijl(v: unknown): Speelstijl {
  if (!v || typeof v !== 'object') return {}
  const o = v as Record<string, unknown>
  const pick = <T extends string>(x: unknown, opts: readonly T[]): T | null =>
    typeof x === 'string' && (opts as readonly string[]).includes(x) ? (x as T) : null
  return {
    accent: pick(o.accent, ['aanvallend', 'gebalanceerd', 'verdedigend'] as const),
    tempo: pick(o.tempo, ['snel', 'gecontroleerd'] as const),
    zone: pick(o.zone, ['links', 'midden', 'rechts', 'wisselend'] as const),
    worp: pick(o.worp, ['nek', 'rug', 'gemengd'] as const),
    verreWorp: typeof o.verreWorp === 'boolean' ? o.verreWorp : null,
    notitie: typeof o.notitie === 'string' ? o.notitie.slice(0, 600) : null,
  }
}

/** Is er iets ingevuld? */
export function hasSpeelstijl(s: Speelstijl): boolean {
  return Boolean(s.accent || s.tempo || s.zone || s.worp || s.verreWorp || (s.notitie && s.notitie.trim()))
}

/** Korte leesbare samenvatting van het profiel (voor de chips/badge). */
export function speelstijlSamenvatting(s: Speelstijl): string[] {
  const out: string[] = []
  if (s.accent) out.push(ACCENT_OPTIONS.find((o) => o.value === s.accent)!.label)
  if (s.tempo) out.push(TEMPO_OPTIONS.find((o) => o.value === s.tempo)!.label)
  if (s.zone) out.push(`Voorkeur ${ZONE_NL[s.zone]}`)
  if (s.worp) out.push(WORP_OPTIONS.find((o) => o.value === s.worp)!.label)
  if (s.verreWorp) out.push('Verre worp')
  return out
}

/** Gemeten data uit het ploegrapport die we tegen de speelstijl leggen. */
export interface SpeelstijlMeasured {
  /** Dominante zone waar de doelpunten vallen, + percentage. */
  goalZone: { zone: 'links' | 'midden' | 'rechts'; pct: number } | null
  /** Aandeel rugworpen (0–1) op alle nek/rug-worpen. */
  rugShare: number | null
  /** Aantal verre doelpunten/worpen (+15 m). */
  verreWorpen: number
}

/**
 * Legt de ingegeven speelstijl naast de gemeten data en geeft korte strategie-aanbevelingen.
 * Bevestigt wat lukt en wijst op wat afwijkt van de bedoeling — zo wordt de strategie scherper.
 */
export function buildStrategie(s: Speelstijl, m: SpeelstijlMeasured): string[] {
  const tips: string[] = []

  // Voorkeurszone vs. waar de doelpunten écht vallen.
  if (s.zone && s.zone !== 'wisselend' && m.goalZone) {
    if (s.zone === m.goalZone.zone) {
      tips.push(`Jullie willen via ${ZONE_NL[s.zone]} spelen — en dat lukt: de meeste doelpunten vallen via ${ZONE_NL[m.goalZone.zone]} (${m.goalZone.pct}%). Blijf dit uitspelen.`)
    } else {
      tips.push(`Jullie mikken op ${ZONE_NL[s.zone]}, maar de meeste doelpunten vallen via ${ZONE_NL[m.goalZone.zone]} (${m.goalZone.pct}%). Speel die kant bewuster uit, of train de afwerking via ${ZONE_NL[s.zone]}.`)
    }
  }

  // Voorkeur worptype vs. gemeten rugaandeel.
  if (s.worp === 'rug' && m.rugShare != null) {
    const pct = Math.round(m.rugShare * 100)
    if (m.rugShare < 0.4) tips.push(`Jullie willen de rugworp (+2), maar slechts ${pct}% van de worpen zijn rugworpen — durf vaker dubbel te gooien voor meer punten.`)
    else tips.push(`Jullie zetten in op de rugworp (+2) en doen dat ook: ${pct}% rugworpen. Sterk, hou de keuze scherp.`)
  } else if (s.worp === 'nek' && m.rugShare != null && m.rugShare > 0.5) {
    tips.push(`Jullie willen veilig met de nekworp (+1) spelen, maar ${Math.round(m.rugShare * 100)}% zijn rugworpen — bewaak het risico of kies bewust voor de punten.`)
  }

  // Verre worp: bedoeling vs. opbrengst.
  if (s.verreWorp) {
    if (m.verreWorpen >= 3) tips.push(`Jullie spelen graag de verre worp (+15 m) en het rendeert (${m.verreWorpen}×) — blijf de tegenstander zo uit balans halen.`)
    else tips.push(`Jullie willen de verre worp (+15 m) spelen, maar ze komt nog weinig voor (${m.verreWorpen}×) — zoek de ruimte vaker op links/rechts over.`)
  }

  // Accent: korte richtlijn.
  if (s.accent === 'aanvallend') tips.push('Aanvallend accent: forceer het tempo en dwing de tegenstander tot vroege worpkeuzes.')
  else if (s.accent === 'verdedigend') tips.push('Verdedigend accent: hou de verdediging compact en speel op de omschakeling na een vangst.')

  return tips
}
