package be.krachtbal.aantekenaar.data

import java.text.Normalizer

// Ploegen zoeken zoals mensen ze noemen — dezelfde regels als src/lib/team-search.ts van de site.
//
// Clubnamen staan officieel anders in de databank dan hoe supporters ze typen: "KBC St. Michiels B"
// zoek je als "Sint Michiels", "'T Botterken Baasrode" als "baasro". Een gewone `contains` faalt daarop.
// Regel: knip beide kanten in woorden, maak ze gelijkvormig (accenten en leestekens weg, courante
// afkortingen uitgeschreven) en zeg JA wanneer élk getypt woord het BEGIN is van een woord in de naam.

/** Afkortingen die in clubnamen door elkaar gebruikt worden. Beide kanten worden hierop herleid. */
private val SYNONIEMEN = mapOf("st" to "sint", "ste" to "sint", "snt" to "sint")

private val ACCENTEN = Regex("\\p{M}+")
private val GEEN_LETTER_OF_CIJFER = Regex("[^a-z0-9]+")

/** Naam → losse, vergelijkbare woorden. */
fun zoekWoorden(tekst: String?): List<String> =
    Normalizer.normalize(tekst ?: "", Normalizer.Form.NFD)
        .replace(ACCENTEN, "")
        .lowercase()
        .replace(GEEN_LETTER_OF_CIJFER, " ")
        .trim()
        .split(' ')
        .filter { it.isNotEmpty() }
        .map { SYNONIEMEN[it] ?: it }

/**
 * Past de zoekterm bij minstens één van de meegegeven velden (ploegnaam, clubnaam, reeks)?
 * Een lege zoekterm past altijd — dan filter je niet.
 */
fun pastBijZoekterm(zoekterm: String, vararg velden: String?): Boolean {
    val gezocht = zoekWoorden(zoekterm)
    if (gezocht.isEmpty()) return true
    val doel = velden.filterNotNull().flatMap { zoekWoorden(it) }
    if (doel.isEmpty()) return false
    // Elk getypt woord moet ergens vooraan in een woord van de naam zitten.
    return gezocht.all { w -> doel.any { it.startsWith(w) } }
}
