import type { PlayerMovers } from './player-movers'
import type { TeamEfficiency } from './team-efficiency'
import type { TeamReport } from './team-report'

// Coach-digest: de stand van zaken van de eigen ploeg in een handvol geprioriteerde regels —
// sterkte, werkpunt, efficiëntie (xP), vorm en spelers in beweging. Pure functie → los testbaar.

export interface DigestItem {
  icon: string
  tone: 'good' | 'warn' | 'info'
  text: string
}

const first = (n: string) => n.split(/\s+/)[0]

/** Vormrichting uit de wedstrijd-vormtrend (eerste helft vs. tweede helft). */
function formTrend(report: TeamReport): 'up' | 'down' | 'flat' | null {
  const f = report.form
  if (!f || f.length < 4) return null
  const half = Math.floor(f.length / 2)
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const early = avg(f.slice(0, half).map((p) => p.points))
  const late = avg(f.slice(half).map((p) => p.points))
  const d = late - early
  return d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat'
}

export function buildCoachDigest(report: TeamReport, efficiency: TeamEfficiency | null, movers: PlayerMovers): DigestItem[] {
  const items: DigestItem[] = []

  items.push({
    icon: '📊',
    tone: 'info',
    text: `${report.matchesAnalyzed} ${report.matchesAnalyzed === 1 ? 'wedstrijd' : 'wedstrijden'} geanalyseerd · ${report.totals.goals} doelpunten · ${Math.round(report.totals.conversion * 100)}% conversie.`,
  })

  const str = report.profile.strengths[0]
  if (str) items.push({ icon: '💪', tone: 'good', text: `Sterkte: ${str.title} — ${str.detail}` })

  const weak = report.profile.weaknesses[0]
  if (weak) items.push({ icon: '⚠️', tone: 'warn', text: `Werkpunt: ${weak.title} — ${weak.detail}` })

  if (efficiency && Math.abs(efficiency.diff) >= 2) {
    items.push(
      efficiency.diff > 0
        ? { icon: '🎯', tone: 'good', text: `Klinisch: +${efficiency.diff} punten boven verwachting (${efficiency.actual} vs ${efficiency.expected} xP).` }
        : { icon: '🎯', tone: 'warn', text: `Onder verwachting: ${efficiency.diff} t.o.v. xP (${efficiency.actual} vs ${efficiency.expected}) — de afwerking kan scherper.` },
    )
  }

  const trend = formTrend(report)
  if (trend === 'up') items.push({ icon: '📈', tone: 'good', text: 'Stijgende vorm — de ploeg gaat crescendo richting het einde van de reeks.' })
  else if (trend === 'down') items.push({ icon: '📉', tone: 'warn', text: 'Dalende vorm — het rendement zakt de laatste wedstrijden.' })

  const riser = movers.risers[0]
  if (riser) items.push({ icon: '🔥', tone: 'good', text: `In vorm: #${riser.shirtNumber} ${first(riser.name)} (+${riser.delta} ptn/match).` })
  const faller = movers.fallers[0]
  if (faller) items.push({ icon: '🧊', tone: 'warn', text: `Vorm zakt: #${faller.shirtNumber} ${first(faller.name)} (${faller.delta} ptn/match).` })

  return items.slice(0, 7)
}
