package be.krachtbal.aantekenaar.data

/**
 * Competitiereeksen van de KVKBF: code → leesbare naam. Overgenomen uit src/lib/reeksen.ts (REEKS_OPTIONS,
 * het deel na de "—") zodat de app dezelfde namen toont als de site ("1ste Nationale Heren" i.p.v. "1NAH").
 * Past de federatie de indeling aan, werk dan deze lijst bij.
 */
object Reeksen {
    private val OPTIES: List<Pair<String, String>> = listOf(
        "1NAH" to "1ste Nationale Heren",
        "1NAHB" to "1ste Nationale Heren Beloften",
        "1NAD" to "1ste Nationale Dames",
        "2NAH" to "2de Nationale Heren",
        "2NAHB" to "2de Nationale Heren Beloften",
        "LH" to "Landelijke Heren",
        "LD" to "Landelijke Dames",
        "RHA" to "Regionale Heren A",
        "RHB" to "Regionale Heren B",
        "RHC" to "Regionale Heren C",
        "RDA" to "Regionale Dames A",
        "RDB" to "Regionale Dames B",
        "U18J" to "U18 Jongens",
        "U18M" to "U18 Meisjes",
        "U16J" to "U16 Jongens",
        "U16M" to "U16 Meisjes",
        "U16MA" to "U16 Meisjes A",
        "U16MB" to "U16 Meisjes B",
        "U14J" to "U14 Jongens",
        "U14JA" to "U14 Jongens A",
        "U14JB" to "U14 Jongens B",
        "U14M" to "U14 Meisjes",
        "U12" to "U12",
        "U12A" to "U12 A",
        "U12B" to "U12 B",
        "recreatief" to "Recreatief",
        "beker" to "Beker",
        "andere" to "Andere",
    )
    private val NAAR_NAAM = OPTIES.toMap()

    /** Wedstrijden uit een eindronde (ploegen uit verschillende reeksen). */
    const val EINDRONDE = "EINDR"

    /** `reeksNaam`: leesbare naam; een onbekende code blijft staan, geen waarde = "Overig". */
    fun name(code: String?): String = when {
        code == EINDRONDE -> "Eindronde"
        code.isNullOrBlank() -> "Overig"
        else -> NAAR_NAAM[code] ?: code
    }

    /** Alle reeks-codes waarvan code of naam bij één van de getypte woorden past (voor de seizoenszoektocht). */
    fun codesMatching(query: String): List<String> {
        val woorden = zoekWoorden(query)
        if (woorden.isEmpty()) return emptyList()
        return OPTIES.filter { (code, naam) -> woorden.any { w -> pastBijZoekterm(w, code, naam) } }.map { it.first }
    }
}
