// Passnetwerk — afgeleid uit de pass- en worp-events (§6.10). Puur: geen DB, dus makkelijk testbaar.
//
// We registreren per pass enkel de VANGER. De gever volgt daaruit: binnen één balbezit, tussen twee
// worpen in, is de bal achtereenvolgens bij de vangers geweest en eindigt hij bij de werper. De
// keten vanger₁ → vanger₂ → … → werper levert dus de passlijnen op, en de laatste schakel vóór een
// doelpunt is de aangever.
//
// Een voorwaartse pass is een fout (Item 14.10): die telt als balverlies en niet als passlijn.

export interface PassEvent {
  possessionId: number
  /** Aantal worpen dat al genomen was toen de pass gebeurde — bepaalt de volgorde. */
  afterThrows: number
  playerId: number
  forward: boolean
  /** Winst richting doel in meters (negatief = achterwaarts) — puur informatief. */
  gainM?: number
}

export interface ThrowEvent {
  possessionId: number
  /** 1-gebaseerd worpnummer binnen het balbezit. */
  throwNumber: number
  playerId: number
  isGoal: boolean
}

export interface PassEdge {
  fromPlayerId: number
  toPlayerId: number
  count: number
}

export interface PlayerPassStats {
  playerId: number
  gegeven: number
  ontvangen: number
  /** Laatste schakel vóór een doelpunt. */
  aangevers: number
  /** Voorwaartse passes = fout, balverlies. */
  fouten: number
  /** Totale terreinwinst van zijn passes (m). */
  winstM: number
}

export interface PassNetwork {
  spelers: PlayerPassStats[]
  lijnen: PassEdge[]
  totaal: number
  fouten: number
}

function leeg(playerId: number): PlayerPassStats {
  return { playerId, gegeven: 0, ontvangen: 0, aangevers: 0, fouten: 0, winstM: 0 }
}

/**
 * Bouwt het passnetwerk uit de ruwe events. Beide lijsten mogen ongesorteerd binnenkomen.
 */
export function buildPassNetwork(passes: PassEvent[], throws: ThrowEvent[]): PassNetwork {
  const byPlayer = new Map<number, PlayerPassStats>()
  const edges = new Map<string, PassEdge>()
  const get = (id: number) => {
    let d = byPlayer.get(id)
    if (!d) {
      d = leeg(id)
      byPlayer.set(id, d)
    }
    return d
  }
  const addEdge = (from: number, to: number) => {
    if (from === to) return
    const key = `${from}>${to}`
    const e = edges.get(key)
    if (e) e.count += 1
    else edges.set(key, { fromPlayerId: from, toPlayerId: to, count: 1 })
  }

  // Groepeer per "segment": alle passes binnen één balbezit ná hetzelfde aantal worpen horen bij
  // dezelfde reeks, en worden afgesloten door de worp die erop volgt.
  const segments = new Map<string, PassEvent[]>()
  for (const p of passes) {
    const key = `${p.possessionId}:${p.afterThrows}`
    const list = segments.get(key)
    if (list) list.push(p)
    else segments.set(key, [p])
  }

  const throwAfter = new Map<string, ThrowEvent>()
  for (const t of throws) throwAfter.set(`${t.possessionId}:${t.throwNumber - 1}`, t)

  let totaal = 0
  let fouten = 0

  for (const [key, list] of segments) {
    // Stabiele volgorde: zoals ze geregistreerd werden.
    const keten: number[] = []
    for (const p of list) {
      const ontvanger = get(p.playerId)
      if (p.forward) {
        fouten += 1
        // De gever draagt de fout: dat is de vorige balhouder (of onbekend bij de eerste pass).
        const gever = keten[keten.length - 1]
        if (gever != null) get(gever).fouten += 1
        continue
      }
      totaal += 1
      ontvanger.ontvangen += 1
      const gever = keten[keten.length - 1]
      if (gever != null) {
        const g = get(gever)
        g.gegeven += 1
        g.winstM += p.gainM ?? 0
        addEdge(gever, p.playerId)
      }
      keten.push(p.playerId)
    }

    // De worp sluit het segment af: de laatste vanger gaf de bal aan de werper.
    const worp = throwAfter.get(key)
    const laatste = keten[keten.length - 1]
    if (worp && laatste != null && laatste !== worp.playerId) {
      const g = get(laatste)
      g.gegeven += 1
      addEdge(laatste, worp.playerId)
      if (worp.isGoal) g.aangevers += 1
    }
  }

  const spelers = [...byPlayer.values()].sort(
    (a, b) => b.aangevers - a.aangevers || b.gegeven + b.ontvangen - (a.gegeven + a.ontvangen) || a.playerId - b.playerId,
  )
  const lijnen = [...edges.values()].sort((a, b) => b.count - a.count)
  return { spelers, lijnen, totaal, fouten }
}
