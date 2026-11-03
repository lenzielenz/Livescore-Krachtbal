package be.krachtbal.aantekenaar.fed

/**
 * Welke officials er op het blad moeten staan, per reekstype — spiegel van src/lib/officials-rules.ts en de
 * reeksgroepen uit src/lib/reeksen.ts. Het indienen weigert een blad met onvolledige officials; hier tonen we dat
 * vooraf, in het formulier, in plaats van pas na het indienen.
 */
object Officials {
    val KEYS = listOf("aantekenaar", "tijdopnemer", "grensrechterThuis", "grensrechterUit", "terreinafgevaardigde", "coachThuis", "coachUit")

    val LABELS = mapOf(
        "aantekenaar" to "Aantekenaar / scorer",
        "tijdopnemer" to "Tijdopnemer",
        "grensrechterThuis" to "Grensrechter (thuis)",
        "grensrechterUit" to "Grensrechter (uit)",
        "terreinafgevaardigde" to "Terreinafgevaardigde",
        "coachThuis" to "Coach (thuis)",
        "coachUit" to "Coach (uit)",
    )

    enum class Type { JEUGD, LANDELIJK, NATIONAAL }

    private val NATIONAAL = setOf("1NAH", "1NAHB", "1NAD", "2NAH", "2NAHB")
    private val JEUGD_2X20 = setOf("U12", "U12A", "U12B", "U14J", "U14JA", "U14JB", "U14M", "U16J", "U16M", "U16MA", "U16MB")

    fun type(reeks: String?): Type = when (reeks) {
        in NATIONAAL -> Type.NATIONAAL
        in JEUGD_2X20 -> Type.JEUGD
        else -> Type.LANDELIJK
    }

    /** De functies die voor deze reeks ingevuld moeten zijn. Zonder reeks (bv. een beker): niets verplicht. */
    fun required(reeks: String?): List<String> = when {
        reeks == null -> emptyList()
        else -> when (type(reeks)) {
            Type.JEUGD -> listOf("aantekenaar", "tijdopnemer", "grensrechterThuis", "terreinafgevaardigde")
            Type.LANDELIJK -> listOf("aantekenaar", "tijdopnemer", "grensrechterThuis")
            Type.NATIONAAL -> listOf("aantekenaar", "terreinafgevaardigde", "grensrechterThuis", "coachThuis", "tijdopnemer", "grensrechterUit", "coachUit")
        }
    }

    /** Naam én voornaam: minstens twee woorden van elk ≥ 2 tekens ("Janssens" alleen volstaat niet). */
    fun isVolledigeNaam(value: String?): Boolean {
        if (value.isNullOrBlank()) return false
        return value.trim().split(Regex("\\s+")).count { it.replace(Regex("[.\\-']"), "").length >= 2 } >= 2
    }

    enum class FieldStatus { LEEG, OK, ONVOLLEDIG, CONFLICT }

    private fun norm(v: String?) = (v ?: "").trim().lowercase()

    fun status(key: String, values: Map<String, String>): FieldStatus {
        val v = values[key]
        if (v.isNullOrBlank()) return FieldStatus.LEEG
        if (!isVolledigeNaam(v)) return FieldStatus.ONVOLLEDIG
        // Art. 25: een coach mag geen grensrechter zijn (aan dezelfde kant).
        if (key == "coachThuis" && norm(v) == norm(values["grensrechterThuis"])) return FieldStatus.CONFLICT
        if (key == "coachUit" && norm(v) == norm(values["grensrechterUit"])) return FieldStatus.CONFLICT
        return FieldStatus.OK
    }

    /** De fouten waarom het blad nog niet ingediend kan worden (leeg = in orde). */
    fun validate(reeks: String?, values: Map<String, String>): List<String> {
        val errors = ArrayList<String>()
        val required = required(reeks).toSet()
        for (key in KEYS) {
            val v = values[key]
            val ingevuld = !v.isNullOrBlank()
            val label = LABELS.getValue(key)
            if (key in required && !ingevuld) {
                errors += "$label is verplicht voor deze reeks."
                continue
            }
            if (ingevuld && !isVolledigeNaam(v)) errors += "$label: noteer de volledige naam én voornaam."
        }
        for ((coach, grens) in listOf("coachThuis" to "grensrechterThuis", "coachUit" to "grensrechterUit")) {
            if (status(coach, values) == FieldStatus.CONFLICT) errors += "${LABELS.getValue(coach)} mag niet tegelijk ${LABELS.getValue(grens).lowercase()} zijn (art. 25)."
        }
        return errors
    }
}
