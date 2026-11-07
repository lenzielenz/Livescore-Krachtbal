// Normalisatiesleutel om "dezelfde maar net anders geschreven" namen te herkennen
// (ploegen/clubs). Negeert hoofdletters, accenten, leestekens en spaties, en vangt de
// courante varianten op (Sint↔St, & ↔ en). De A/B-poule-suffix blijft behouden, zodat de
// A- en B-ploeg van dezelfde club NIET samengevoegd worden.
export function dedupeKey(name: string): string {
  return String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bsint\b/g, 'st')
    .replace(/&/g, 'en')
    .replace(/[^a-z0-9]/g, '')
}

// ── Dubbele wedstrijden ───────────────────────────────────────────────────────────────────────
// Na het samenvoegen van dubbele ploegen kunnen er twee wedstrijden voor hetzelfde duel staan:
// de geplande van de kalender en een kopie die een uitslagenimport met de dubbele ploeg aanmaakte.
// Beide telden mee in de rangschikking (of de geplande bleef zonder uitslag). Zelfde reeks, zelfde
// thuis- en uitploeg en hoogstens DUBBEL_DAGEN uit elkaar = hetzelfde duel.

export type WedstrijdVoorDedupe = {
  id: number
  reeks: string
  home: number
  away: number
  date: string
  status: string
  /** Heeft een eigen registratie (worpen of een ingediend wedstrijdblad)? Die raken we nooit aan. */
  eigen: boolean
  /** Heeft een (ingevoerde of geïmporteerde) uitslag? */
  uitslag: boolean
}

export type WedstrijdSamenvoeging = {
  /** De wedstrijd die blijft. */
  keep: number
  /** De kopieën die verdwijnen. */
  weg: number[]
  /** Kopie waarvan de uitslag naar `keep` moet (keep had er zelf geen). */
  uitslagVan: number | null
}

const DUBBEL_DAGEN = 3

export function dubbeleWedstrijden(lijst: WedstrijdVoorDedupe[]): WedstrijdSamenvoeging[] {
  const perPaar = new Map<string, WedstrijdVoorDedupe[]>()
  for (const m of lijst) {
    const k = `${m.reeks}|${m.home}|${m.away}`
    const arr = perPaar.get(k) ?? []
    arr.push(m)
    perPaar.set(k, arr)
  }
  const uit: WedstrijdSamenvoeging[] = []
  for (const arr of perPaar.values()) {
    if (arr.length < 2) continue
    arr.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id)
    // Groepjes van wedstrijden die dicht genoeg bij elkaar liggen (heen en terug blijven apart).
    const groepen: WedstrijdVoorDedupe[][] = []
    for (const m of arr) {
      const laatste = groepen[groepen.length - 1]
      const vorige = laatste?.[laatste.length - 1]
      if (vorige && Math.abs(new Date(m.date).getTime() - new Date(vorige.date).getTime()) <= DUBBEL_DAGEN * 86_400_000) laatste.push(m)
      else groepen.push([m])
    }
    for (const g of groepen) {
      if (g.length < 2) continue
      const eigen = g.filter((m) => m.eigen)
      // Twee echte registraties van hetzelfde duel: niet automatisch beslissen.
      if (eigen.length > 1) continue
      // Behouden: de wedstrijd met een eigen registratie, anders de oudste (die van de kalender,
      // waar pronostieken, verplaatsingen en dergelijke aan hangen).
      const keep = eigen[0] ?? [...g].sort((a, b) => a.id - b.id)[0]
      const weg = g.filter((m) => m.id !== keep.id)
      const metUitslag = weg.filter((m) => m.uitslag && m.status === 'finished').sort((a, b) => b.id - a.id)[0]
      const uitslagVan = !keep.eigen && !(keep.uitslag && keep.status === 'finished') && metUitslag ? metUitslag.id : null
      uit.push({ keep: keep.id, weg: weg.map((m) => m.id), uitslagVan })
    }
  }
  return uit
}
