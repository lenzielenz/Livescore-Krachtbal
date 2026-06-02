// Pure tornooi-logica: enkele afvalrace (knockout) met bye's voor niet-machten-van-2 en een
// kleine finale (3e plaats). Géén Payload/DB-afhankelijkheden — volledig getest in
// tests/unit/tournament.test.ts. De server-engine (tournament-engine.ts) zet deze structuur om
// naar rijen en past de score-/propagatieregels toe.
//
// Net als de rest van het platform is de score event-sourced: elke worp is een immutable goal in
// `goals[]`; de stand wordt afgeleid, één undo = laatste goal verwijderen.

export type Side = 'home' | 'away'
export type Bracket = 'main' | 'third'
export type MatchStatus = 'pending' | 'live' | 'finished'

/** Eén gescoorde worp. points: nekworp = 1, rugworp = 2 (telt dubbel). */
export type Goal = { side: Side; points: 1 | 2; half: number; clock: number; ts: number }

/** Verwijzing naar een slot van een andere wedstrijd (waar een winnaar/verliezer naartoe schuift). */
export type SlotRef = { round: number; position: number; slot: Side; bracket: Bracket }

/** Structurele beschrijving van één wedstrijd in het schema (vóór persistentie). */
export type BracketMatch = {
  round: number
  position: number
  bracket: Bracket
  label: string
  home: string | null
  away: string | null
  status: MatchStatus
  winner: Side | null
  /** Waar de winnaar naartoe schuift (null bij de finale). */
  winnerTo: SlotRef | null
  /** Waar de verliezer naartoe schuift (enkel halve finales → kleine finale). */
  loserTo: SlotRef | null
}

/** Kleinste macht van 2 ≥ n (minimaal 2). */
export function nextPow2(n: number): number {
  let size = 2
  while (size < n) size *= 2
  return size
}

/** Standaard seed-volgorde voor een schema van `size` slots: posities[i] = seed (1..size) op slot i.
 * Zorgt dat seed 1 en seed 2 elkaar pas in de finale kunnen tegenkomen en dat bye's (seeds > aantal
 * ploegen) tegen de hoogste seeds vallen. */
export function seedPositions(size: number): number[] {
  let seeds = [1, 2]
  while (seeds.length < size) {
    const n = seeds.length * 2
    const next: number[] = []
    for (const s of seeds) {
      next.push(s)
      next.push(n + 1 - s)
    }
    seeds = next
  }
  return seeds
}

/** Verdeel ploegnamen over de slots van het schema volgens de seed-volgorde; lege slots (bye's)
 * worden null. `names` in seed-volgorde (sterkste eerst, of willekeurig bij toggle). */
export function seededSlots(names: string[]): (string | null)[] {
  const size = nextPow2(names.length)
  return seedPositions(size).map((seed) => names[seed - 1] ?? null)
}

/** Fisher-Yates shuffle met een meegegeven [0,1)-generator (zo blijft de functie puur/testbaar). */
export function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Leesbaar label voor een ronde op basis van de afstand tot de finale. */
export function roundLabel(round: number, totalRounds: number, bracket: Bracket): string {
  if (bracket === 'third') return 'Kleine finale (3e plaats)'
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return 'Finale'
  if (fromEnd === 1) return 'Halve finale'
  if (fromEnd === 2) return 'Kwartfinale'
  if (fromEnd === 3) return 'Achtste finale'
  return `Ronde ${round}`
}

function makeMatch(round: number, position: number, bracket: Bracket, totalRounds: number): BracketMatch {
  return {
    round,
    position,
    bracket,
    label: roundLabel(round, totalRounds, bracket),
    home: null,
    away: null,
    status: 'pending',
    winner: null,
    winnerTo: null,
    loserTo: null,
  }
}

function findMatch(matches: BracketMatch[], ref: SlotRef): BracketMatch | undefined {
  return matches.find((m) => m.bracket === ref.bracket && m.round === ref.round && m.position === ref.position)
}

/** Schrijf een ploegnaam in het doel-slot waarnaar een winnaar/verliezer verwijst. */
export function applyToSlot(matches: BracketMatch[], ref: SlotRef, name: string): void {
  const target = findMatch(matches, ref)
  if (target) target[ref.slot] = name
}

/**
 * Bouw het volledige schema uit een geordende slot-lijst (lengte = macht van 2; null = bye).
 * Lost bye's in ronde 1 meteen op (de niet-lege ploeg schuift automatisch door). Voegt een kleine
 * finale toe zodra er halve finales zijn (≥ 4 slots).
 */
export function buildBracket(slots: (string | null)[]): BracketMatch[] {
  const size = slots.length
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new Error('Aantal slots moet een macht van 2 zijn (≥ 2).')
  }
  const totalRounds = Math.log2(size)
  const matches: BracketMatch[] = []

  // Hoofdschema: ronde 1..totalRounds, halverend aantal wedstrijden per ronde.
  let perRound = size / 2
  for (let round = 1; round <= totalRounds; round++) {
    for (let position = 0; position < perRound; position++) {
      matches.push(makeMatch(round, position, 'main', totalRounds))
    }
    perRound /= 2
  }

  // Ronde 1 vullen vanuit de slot-lijst (twee opeenvolgende slots per wedstrijd).
  const round1 = matches.filter((m) => m.round === 1)
  round1.forEach((m, i) => {
    m.home = slots[i * 2] ?? null
    m.away = slots[i * 2 + 1] ?? null
  })

  // Winnaar-doorschuiving voor alle hoofdwedstrijden behalve de finale.
  for (const m of matches) {
    if (m.bracket === 'main' && m.round < totalRounds) {
      m.winnerTo = {
        round: m.round + 1,
        position: Math.floor(m.position / 2),
        slot: m.position % 2 === 0 ? 'home' : 'away',
        bracket: 'main',
      }
    }
  }

  // Kleine finale: enkel als er halve finales bestaan (size ≥ 4). De finale staat op
  // (round=totalRounds, position 0, main); de kleine finale op (round=totalRounds, position 1, third).
  if (totalRounds >= 2) {
    matches.push(makeMatch(totalRounds, 1, 'third', totalRounds))
    const semis = matches
      .filter((m) => m.bracket === 'main' && m.round === totalRounds - 1)
      .sort((a, b) => a.position - b.position)
    semis[0].loserTo = { round: totalRounds, position: 1, slot: 'home', bracket: 'third' }
    semis[1].loserTo = { round: totalRounds, position: 1, slot: 'away', bracket: 'third' }
  }

  // Bye's in ronde 1 meteen oplossen: de aanwezige ploeg wint en schuift door.
  for (const m of round1) {
    const homeEmpty = !m.home
    const awayEmpty = !m.away
    if (homeEmpty === awayEmpty) continue // beide leeg of beide gevuld: geen bye
    m.winner = homeEmpty ? 'away' : 'home'
    m.status = 'finished'
    const name = (homeEmpty ? m.away : m.home) as string
    if (m.winnerTo) applyToSlot(matches, m.winnerTo, name)
  }

  return matches
}

/** Afgeleide stand uit de goal-events. */
export function deriveScore(goals: Goal[]): { home: number; away: number } {
  return goals.reduce(
    (acc, g) => {
      acc[g.side] += g.points
      return acc
    },
    { home: 0, away: 0 },
  )
}

/** Winnaar bepalen: uit de stand, of expliciet (bij gelijkspel kiest de aantekenaar). */
export function resolveWinner(
  score: { home: number; away: number },
  explicit?: Side | null,
): Side | null {
  if (score.home > score.away) return 'home'
  if (score.away > score.home) return 'away'
  return explicit ?? null
}

/** Naam van de winnaar/verliezer van een afgewerkte wedstrijd. */
export function winnerName(m: Pick<BracketMatch, 'home' | 'away' | 'winner'>): string | null {
  if (!m.winner) return null
  return m.winner === 'home' ? m.home : m.away
}
export function loserName(m: Pick<BracketMatch, 'home' | 'away' | 'winner'>): string | null {
  if (!m.winner) return null
  return m.winner === 'home' ? m.away : m.home
}
