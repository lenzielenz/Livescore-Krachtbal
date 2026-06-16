// ── Krachtbal Wrapped ─────────────────────────────────────────────────────────────────────────
// Persoonlijke, deelbare seizoensterugblik voor een supporter. Pure functie: uit de seizoenscijfers
// leidt ze een "supporterstype" (persona) en een lijstje highlights af. Los testbaar; de UI/queries
// zitten in de /wrapped-pagina.

export interface WrappedInput {
  season: string
  matchesAttended: number
  goalsSeen: number
  predictionPoints: number
  exactPredictions: number
  badgesEarned: number
  mvpVotesCast: number
  /** Plaats in het supportersklassement (0-gebaseerd), of null als onbekend/niet gerangschikt. */
  fanRank: number | null
  fanTotal: number
}

export interface WrappedPersona {
  emoji: string
  title: string
  blurb: string
}

export interface WrappedSummary extends WrappedInput {
  persona: WrappedPersona
  highlights: string[]
  /** Percentiel (1 = beste) in het supportersklassement, of null. */
  topPercent: number | null
}

export const WRAPPED_THRESHOLDS = {
  tribuneHeld: 10,
  orakel: 50,
  verzamelaar: 6,
  trouw: 3,
} as const

function pickPersona(i: WrappedInput): WrappedPersona {
  if (i.matchesAttended >= WRAPPED_THRESHOLDS.tribuneHeld)
    return { emoji: '🏟️', title: 'Tribuneheld', blurb: 'Je mist geen match — de tribune is je tweede thuis.' }
  if (i.predictionPoints >= WRAPPED_THRESHOLDS.orakel)
    return { emoji: '🔮', title: 'Het Orakel', blurb: 'Jouw voorspellingen zitten verrassend vaak juist.' }
  if (i.badgesEarned >= WRAPPED_THRESHOLDS.verzamelaar)
    return { emoji: '🏅', title: 'De Verzamelaar', blurb: 'Je jaagt op elke badge die er te rapen valt.' }
  if (i.matchesAttended >= WRAPPED_THRESHOLDS.trouw)
    return { emoji: '📣', title: 'Trouwe supporter', blurb: 'Present op de momenten die tellen.' }
  if (i.matchesAttended > 0 || i.predictionPoints > 0)
    return { emoji: '🌟', title: 'Op dreef', blurb: 'Je bent goed bezig — dit seizoen smaakt naar meer.' }
  return { emoji: '🌱', title: 'Nieuwkomer', blurb: 'Je seizoen is nog maar net begonnen — er valt veel te beleven.' }
}

export function buildWrapped(input: WrappedInput): WrappedSummary {
  const persona = pickPersona(input)

  const topPercent =
    input.fanRank != null && input.fanTotal > 0
      ? Math.max(1, Math.round(((input.fanRank + 1) / input.fanTotal) * 100))
      : null

  const highlights: string[] = []
  if (input.matchesAttended > 0)
    highlights.push(`Je was ${input.matchesAttended}× live erbij in de tribune.`)
  if (input.goalsSeen > 0) highlights.push(`Je zag ${input.goalsSeen} doelpunten van dichtbij.`)
  if (input.exactPredictions > 0)
    highlights.push(`${input.exactPredictions}× de exacte uitslag voorspeld.`)
  else if (input.predictionPoints > 0)
    highlights.push(`${input.predictionPoints} pronostiekpunten verzameld.`)
  if (topPercent != null && topPercent <= 50)
    highlights.push(`Top ${topPercent}% van alle supporters.`)
  if (input.mvpVotesCast > 0)
    highlights.push(`${input.mvpVotesCast}× gestemd voor de held van de match.`)
  if (input.badgesEarned > 0) highlights.push(`${input.badgesEarned} badges verdiend.`)

  return { ...input, persona, highlights, topPercent }
}
