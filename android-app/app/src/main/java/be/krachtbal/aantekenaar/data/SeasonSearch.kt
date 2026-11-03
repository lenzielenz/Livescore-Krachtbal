package be.krachtbal.aantekenaar.data

/**
 * Wat de app de server vraagt voor een zoekopdracht over het hele seizoen.
 *
 * De site doet dit met `/api/live/search`, maar dat bouwt per zoekopdracht alle scorebord-gegevens van
 * duizenden wedstrijden op: veel te zwaar voor een app die bij elke toets zoekt. Hier kiest de app zelf een
 * kleine kandidatenverzameling (clubs, reeksen of een stuk van de titel) en vraagt enkel die wedstrijden
 * op via de lichte lijst-API; het exacte "past dit?" gebeurt daarna op het toestel, met dezelfde
 * [pastBijZoekterm] als de site. De server mag dus ruimer antwoorden dan nodig, nooit krapper.
 */
data class SeasonPlan(
    val clubIds: List<Int>,
    val reeksCodes: List<String>,
    /** Titel bevat dit woord ("Thuis — Uit"): vangt ploegnamen op die niet in een clubnaam staan. */
    val titleWord: String?,
)

object SeasonSearch {
    /** Meer clubs dan dit in één verzoek is geen zoeken meer: dan zoeken we op de titel. */
    const val MAX_CLUBS = 80

    /** De seizoenszoektocht kijkt zoveel dagen terug (de lijst "Afgelopen" doet hetzelfde) en dan alles wat komt. */
    const val BACK_DAYS = 14

    private data class Candidate(val word: String, val clubs: List<Int>, val reeks: List<String>) {
        val size get() = clubs.size + reeks.size
    }

    /** Null bij een lege zoekopdracht. */
    fun plan(query: String, clubs: Map<Int, ClubLook>): SeasonPlan? {
        val words = zoekWoorden(query).distinct()
        if (words.isEmpty()) return null
        val candidates = words.map { w ->
            Candidate(w, clubs.values.filter { pastBijZoekterm(w, it.name) }.map { it.id }, Reeksen.codesMatching(w))
        }
        // Het meest onderscheidende woord bepaalt wat we opvragen; alle andere woorden zeven we nadien op het toestel.
        val anchor = candidates.filter { it.size > 0 }.minByOrNull { it.size }
        if (anchor == null) {
            // Geen club of reeks herkend (bv. enkel een teamnaam): zoek in de titel op het langste woord.
            val longest = words.maxBy { it.length }
            return SeasonPlan(emptyList(), emptyList(), longest)
        }
        val tooMany = anchor.clubs.size > MAX_CLUBS
        return SeasonPlan(
            clubIds = if (tooMany) emptyList() else anchor.clubs,
            reeksCodes = anchor.reeks,
            // Een kort woord ("b", "u1") in de titel zoeken vindt van alles; enkel vanaf 3 tekens, of als er niets anders is.
            titleWord = anchor.word.takeIf { it.length >= 3 || tooMany },
        )
    }
}
