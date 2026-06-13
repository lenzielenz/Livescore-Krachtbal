import type { RadarAxis } from './team-report'

// ── Head-to-Head matchup ──────────────────────────────────────────────────────────────────
// Legt het datagedreven DNA-profiel (de 6 radar-assen, 0-100) van twee ploegen naast elkaar:
// per as wie leidt en met hoeveel, een geprojecteerd voordeel, en — het scherpst — wáár wij
// hun zwakte kunnen uitbuiten en wáár wij hen moeten afdekken. Pure functie → los testbaar.

export interface AxisMatchup {
  key: string
  label: string
  ours: number
  opp: number
  oursDisplay: string
  oppDisplay: string
  diff: number // ours − opp (positief = ons voordeel)
  leader: 'ours' | 'opp' | 'even'
}

export interface Matchup {
  ourName: string
  oppName: string
  axes: AxisMatchup[]
  /** Gemiddeld verschil over alle assen (−100..100, + = ons voordeel). */
  edgeScore: number
  verdict: { side: 'ours' | 'opp' | 'even'; label: string; margin: 'evenwicht' | 'licht' | 'duidelijk' | 'fors' }
  /** Onze grootste troef (positief verschil). */
  exploit: AxisMatchup | null
  /** Hun grootste troef tegen ons (negatief verschil). */
  danger: AxisMatchup | null
  tips: string[]
}

// Een verschil kleiner dan deze drempel telt als "gelijk" (ruis in kleine steekproeven).
const EVEN = 8

type TeamRadar = { name: string; radar: RadarAxis[] }

// Hoe je een voordeel op een as uitspeelt (exploit) en hoe je hun voordeel neutraliseert (counter).
const ACTION: Record<string, { use: string; counter: string }> = {
  afwerking: { use: 'leg de nadruk op afwerking — jullie zijn killer voor doel.', counter: 'forceer hen tot moeilijke afstanden; geef geen vrije doelworp.' },
  kracht: { use: 'zoek de rugworp (+2) op; jullie pakken vaker dubbel.', counter: 'sluit de diepe/verre worp af — daar halen zij hun dubbele punten.' },
  diepgang: { use: 'speel met diepgang en rek hun verdediging uit elkaar.', counter: 'blijf compact en knijp de ruimte achterin dicht.' },
  spreiding: { use: 'wissel je kant van aanval — jullie zijn lastiger te lezen.', counter: 'zij spelen breed; houd je verdediging gebalanceerd, jaag niet één kant op.' },
  balveilig: { use: 'speel geduldig; jullie verliezen zelden de bal.', counter: 'zet vol druk — zij zijn slordiger in balbezit.' },
  verdediging: { use: 'vertrouw op je verdediging en counter op balverlies.', counter: 'zij pakken veel ballen af — speel zuiver, vermijd risicovolle worpen.' },
}

function leaderOf(diff: number): 'ours' | 'opp' | 'even' {
  if (diff >= EVEN) return 'ours'
  if (diff <= -EVEN) return 'opp'
  return 'even'
}

export function buildMatchup(ours: TeamRadar, opp: TeamRadar): Matchup {
  // Koppel de assen op sleutel (zelfde set/volgorde uit buildTeamReport, maar robuust gematcht).
  const oppByKey = new Map(opp.radar.map((a) => [a.key, a]))
  const axes: AxisMatchup[] = ours.radar
    .filter((a) => oppByKey.has(a.key))
    .map((a) => {
      const o = oppByKey.get(a.key)!
      const diff = Math.round(a.value - o.value)
      return {
        key: a.key,
        label: a.label,
        ours: Math.round(a.value),
        opp: Math.round(o.value),
        oursDisplay: a.display,
        oppDisplay: o.display,
        diff,
        leader: leaderOf(diff),
      }
    })

  const edgeScore = axes.length ? Math.round(axes.reduce((s, a) => s + a.diff, 0) / axes.length) : 0
  const abs = Math.abs(edgeScore)
  const margin = abs < 4 ? 'evenwicht' : abs < 14 ? 'licht' : abs < 28 ? 'duidelijk' : 'fors'
  const side: 'ours' | 'opp' | 'even' = margin === 'evenwicht' ? 'even' : edgeScore > 0 ? 'ours' : 'opp'
  const verdictLabel =
    side === 'even'
      ? 'Evenwichtige matchup'
      : `${margin === 'licht' ? 'Licht' : margin === 'duidelijk' ? 'Duidelijk' : 'Fors'} voordeel voor ${side === 'ours' ? ours.name : opp.name}`

  // Exploit = onze grootste troef; danger = hun grootste troef.
  const sortedByDiff = [...axes].sort((a, b) => b.diff - a.diff)
  const exploit = sortedByDiff.find((a) => a.diff >= EVEN) ?? null
  const danger = [...sortedByDiff].reverse().find((a) => a.diff <= -EVEN) ?? null

  const tips: string[] = []
  if (exploit) {
    const act = ACTION[exploit.key]?.use ?? 'speel je sterkste kant uit.'
    tips.push(`Jullie troef — ${exploit.label} (${exploit.ours} vs ${exploit.opp}): ${act}`)
  }
  if (danger) {
    const act = ACTION[danger.key]?.counter ?? 'dek hun sterkste kant af.'
    tips.push(`Let op — ${opp.name} is sterker in ${danger.label} (${danger.opp} vs ${danger.ours}): ${act}`)
  }
  if (!exploit && !danger) tips.push('Profielen liggen dicht bij elkaar — de match wordt op details en dagvorm beslist.')

  return { ourName: ours.name, oppName: opp.name, axes, edgeScore, verdict: { side, label: verdictLabel, margin }, exploit, danger, tips }
}
