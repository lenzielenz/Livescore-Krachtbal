import type { TeamReport } from './team-report'

// ── Trainingsfocus ────────────────────────────────────────────────────────────────────────
// Vertaalt de gemeten werkpunten van een ploeg automatisch naar concrete trainingssuggesties,
// gekoppeld aan de meetwaarden uit het trainingsluik (worp4/worp9/worp18, snelheid). Zo wordt
// de analyse meteen bruikbaar op het trainingsveld. Pure functie → los testbaar.

export interface FocusItem {
  title: string
  why: string
  drill: string
  /** Optionele koppeling aan een trainings-meetwaarde (Trainingdoelen). */
  metric?: 'snelheidVooruit' | 'snelheidAchteruit' | 'worp4' | 'worp9' | 'worp18'
  priority: number
}

const pct = (v: number) => Math.round(v * 100)

export function buildTrainingFocus(report: TeamReport): FocusItem[] {
  const items: FocusItem[] = []
  const t = report.totals
  const conv = t.goalAttempts ? t.goals / t.goalAttempts : 0
  const lossRate = t.throws ? (t.caughtAgainst + t.out) / t.throws : 0
  const rugShare = t.goals ? t.rug / t.goals : 0
  const topShare = report.profile.topScorerShare
  const weakTitles = report.profile.weaknesses.map((w) => w.title.toLowerCase())
  const hasWeak = (kw: string) => weakTitles.some((w) => w.includes(kw))

  // 1. Afwerking — lage of wisselvallige conversie.
  if (t.goalAttempts >= 6 && conv <= 0.45) {
    items.push({
      title: 'Afwerking onder druk',
      why: `Slechts ${pct(conv)}% van de doelpogingen raak — de afronding hapert.`,
      drill: 'Doelworpen na sprint en onder tijdsdruk; afwerken vanuit beweging i.p.v. stilstand.',
      metric: 'worp9',
      priority: Math.round((0.5 - conv) * 200) + 60,
    })
  }

  // 2. Balvastheid — veel balverlies (gevangen + buiten).
  if (t.throws >= 20 && lossRate >= 0.15) {
    items.push({
      title: 'Balvastheid & opbouw',
      why: `${t.caughtAgainst}× gevangen en ${t.out}× buiten — ${pct(lossRate)}% balverlies.`,
      drill: 'Pass-and-catch onder druk; de tweede worp bewust over de middellijn forceren.',
      metric: 'snelheidAchteruit',
      priority: Math.round(lossRate * 200) + 40,
    })
  }

  // 3. Worpkracht & diepgang — korte gemiddelde afstand of weinig rugworpen.
  if (t.throws >= 15 && (t.avgDistance < 11 || rugShare < 0.2)) {
    items.push({
      title: 'Worpkracht & diepgang',
      why: t.avgDistance < 11 ? `Gemiddeld maar ${t.avgDistance} m per worp.` : `Amper ${pct(rugShare)}% van de doelpunten zijn rugworpen (+2).`,
      drill: 'Krachttraining + gerichte worp 18 m; rugworp-techniek voor dubbele punten.',
      metric: 'worp18',
      priority: 55,
    })
  }

  // 4. Variatie — voorspelbaar via één zone.
  if (hasWeak('voorspelbaar')) {
    items.push({
      title: 'Variatie in de aanval',
      why: 'Te voorspelbaar via één kant — makkelijk te lezen voor de tegenstander.',
      drill: 'Aanvallen afwisselend via beide flanken; zwakke-hand afwerking inslijpen.',
      priority: 50,
    })
  }

  // 5. Breder scoren — te afhankelijk van één man.
  if (topShare >= 0.4) {
    items.push({
      title: 'Breder scoren',
      why: `${pct(topShare)}% van de punten komt van één speler — te afhankelijk.`,
      drill: 'Afwerkoefeningen voor meerdere spelers; bewust de tweede en derde afwerker betrekken.',
      metric: 'worp4',
      priority: Math.round(topShare * 120),
    })
  }

  return items.sort((a, b) => b.priority - a.priority).slice(0, 4)
}
