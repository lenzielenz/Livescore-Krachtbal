// Selecteerbaarheid van leden voor een opstelling (WEDSTRIJDBLAD-PROMPT §workflow concept).
// Combineert vergunning + leeftijdscategorie + knipjes-blokkade. Override-filosofie:
// 'block' is een drempel voor clubs, geen muur voor scheidsrechter/federatie.

import { categorieVoorGeboortedatum, magSpelen, type AgeCategory } from './age-categories'
import type { Category } from './categories'

export type Selectability = {
  /** 'ok' = vrij selecteerbaar, 'warn' = mag met waarschuwing, 'block' = standaard geblokkeerd voor clubs. */
  level: 'ok' | 'warn' | 'block'
  reasons: string[]
}

export type SelectablePlayerInput = {
  vergunningsstatus?: string | null
  birthDate?: string | Date | null
  hogerSpelenVerbod?: boolean | null
  medischAttest?: boolean | null
  actief?: boolean | null
  /** Geblokkeerd door administratieve knipjes (fase 8). */
  knipjesGeblokkeerd?: boolean
}

const worst = (a: Selectability['level'], b: Selectability['level']): Selectability['level'] => {
  const rank = { ok: 0, warn: 1, block: 2 } as const
  return rank[a] >= rank[b] ? a : b
}

/**
 * Bepaalt of een lid selecteerbaar is voor een ploeg van categorie `teamCategory`.
 * `seasonStartYear` voedt de leeftijdscategorie-berekening.
 */
export function playerSelectability(
  player: SelectablePlayerInput,
  teamCategory: Category,
  seasonStartYear: number,
): Selectability {
  let level: Selectability['level'] = 'ok'
  const reasons: string[] = []

  if (player.actief === false) {
    level = worst(level, 'block')
    reasons.push('Inactief lid.')
  }

  if (player.vergunningsstatus !== 'geldig') {
    level = worst(level, 'block')
    // Meest voorkomende reden bij een net toegevoegde speler: hij wacht nog op de keuring van de
    // federatie. Maak dat expliciet (i.p.v. enkel "geen geldige vergunning"), zodat een club weet
    // dat dit normaal is en geen fout — en wat er moet gebeuren.
    reasons.push(
      player.vergunningsstatus === 'aangevraagd'
        ? 'Vergunning aangevraagd — nog niet goedgekeurd door de federatie.'
        : 'Nog niet gekeurd door de federatie (geen geldige vergunning).',
    )
  }

  if (player.knipjesGeblokkeerd) {
    level = worst(level, 'block')
    reasons.push('Geblokkeerd door knipjes (sanctiedrempel).')
  }

  // Leeftijdscategorie t.o.v. de ploegcategorie.
  const spelerCat = categorieVoorGeboortedatum(player.birthDate, seasonStartYear)
  if (!spelerCat) {
    level = worst(level, 'warn')
    reasons.push('Geen geboortedatum — categorie onbekend.')
  } else {
    const verdict = magSpelen(spelerCat, teamCategory as AgeCategory, Boolean(player.hogerSpelenVerbod))
    if (verdict === 'WARN_VERBOD') {
      level = worst(level, 'warn')
      reasons.push('Eén categorie hoger met doktersverbod.')
    } else if (verdict === 'BLOCK_TE_HOOG') {
      level = worst(level, 'block')
      reasons.push('Twee of meer categorieën te hoog.')
    } else if (verdict === 'BLOCK') {
      level = worst(level, 'block')
      reasons.push('Speler speelt lager dan eigen categorie (nooit toegelaten).')
    }
  }

  if (!player.medischAttest) {
    level = worst(level, 'warn')
    reasons.push('Geen medisch attest geregistreerd.')
  }

  if (reasons.length === 0) reasons.push('Selecteerbaar.')
  return { level, reasons }
}
