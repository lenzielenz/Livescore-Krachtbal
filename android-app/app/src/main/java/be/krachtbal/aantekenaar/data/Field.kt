package be.krachtbal.aantekenaar.data

/**
 * De spelers op het veld en op de bank. Een krachtbalploeg heeft er 4 op het veld; de rest van de selectie (hoogstens 4)
 * zijn wissels. Enkel wie op het veld staat kan scoren, dus enkel die namen verschijnen in de scorerkeuze (zoals op de
 * website, src/app/(frontend)/scorekeeper/[id]/SimpleScorekeeper.tsx). De server houdt de veldspelers bij in
 * `match.homeLineup`/`awayLineup` (`MatchState.lineup`) en logt elke wissel op het wedstrijdblad (reglement §9).
 */
object Field {
    /** Aantal veldspelers (FIELD_PLAYERS op de server). Zijn er maar 3 aanwezig, dan spelen er 3 (reglement §4). */
    const val SIZE = 4

    /** Hoeveel er op het veld horen te staan bij deze selectie. */
    fun wanted(squad: List<Player>): Int = minOf(SIZE, squad.size)

    /**
     * De veldspelers van een ploeg: wat de server zegt (enkel wie in de selectie zit), aangevuld of ingekort tot het juiste
     * aantal met de eerste spelers van de selectie — zo staat er altijd een bruikbaar veld, ook vóór iemand iets koos.
     */
    fun resolve(squad: List<Player>, serverLineup: List<Int>): List<Player> {
        val byId = squad.associateBy { it.id }
        val want = wanted(squad)
        val fromServer = serverLineup.mapNotNull { byId[it] }.distinctBy { it.id }
        if (fromServer.size == want) return fromServer
        return (fromServer + squad.filter { p -> fromServer.none { it.id == p.id } }).take(want)
    }

    /** De wissels: de selectie min het veld, in de volgorde van de selectie. */
    fun bench(squad: List<Player>, field: List<Player>): List<Player> = squad.filter { p -> field.none { it.id == p.id } }

    /** Het veld na een wissel: [out] gaat eruit, [into] komt erin, op dezelfde plaats. Onmogelijk (niet op het veld/al op het veld) = null. */
    fun swap(field: List<Player>, out: Int, into: Int): List<Int>? {
        if (field.none { it.id == out } || field.any { it.id == into }) return null
        return field.map { if (it.id == out) into else it.id }
    }

    /** Wie speelde: wie nu op het veld staat, plus iedereen die er tijdens de wedstrijd afging. */
    fun played(finalField: List<Int>, outs: List<Int>): Set<Int> = (finalField + outs).toSet()

    /**
     * De spelers die eruit gingen, uit de wissel-regels van het blad. De server schrijft elke wissel als
     * `#<nr> <naam> → #<nr> <naam>` (lib/match-engine.ts, setLineup); links staat wie eruit ging. We herkennen hem aan de naam.
     * Een naam die we niet vinden (of dubbel voorkomt) valt weg: liever een speler te weinig voorgesteld dan de verkeerde.
     */
    fun parseOuts(notes: List<String>, squad: List<Player>): List<Int> {
        val out = ArrayList<Int>()
        for (note in notes) {
            val left = note.substringBefore("→", missingDelimiterValue = "").trim()
            if (left.isEmpty()) continue
            val name = left.replace(Regex("^#\\d+\\s*"), "").trim()
            val hits = squad.filter { it.name.trim().equals(name, ignoreCase = true) }
            if (hits.size == 1) out += hits[0].id
        }
        return out
    }
}
