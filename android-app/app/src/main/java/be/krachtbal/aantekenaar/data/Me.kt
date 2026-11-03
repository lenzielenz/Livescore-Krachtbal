package be.krachtbal.aantekenaar.data

/**
 * Wie er ingelogd is, voor zover de app dat nodig heeft om de juiste wedstrijddag-stappen te tonen
 * (`user.roles` en `user.clubFuncties` van `/api/users/me`). De server beslist altijd zelf wat mag
 * (lib/access.ts, lib/club-functies.ts): dit is enkel om de stappen te ordenen en te benoemen.
 */
data class Me(
    val roles: Set<String> = emptySet(),
    val clubFuncties: Set<String> = emptySet(),
) {
    /** Federatie of admin: mag overal aan (lib/access.ts → isFederationLevel). */
    val isFederatie: Boolean get() = "federatie" in roles || "admin" in roles

    /** Scheidsrechter (de server controleert nog of het déze wedstrijd is), of de federatie. */
    val isReferee: Boolean get() = isFederatie || "scheidsrechter" in roles

    /** Clubstaf: beheerder of medewerker van een club (aantekenen, opstellingen, spelers). */
    val isClubStaff: Boolean get() = "club-beheerder" in roles || "club-medewerker" in roles

    /** Coach of jeugdverantwoordelijke: stelt de selectie van zijn ploegen op. */
    val isCoach: Boolean get() = "coach" in clubFuncties || "jeugdverantwoordelijke" in clubFuncties

    /** Kort label voor de koptekst: de belangrijkste rol eerst. */
    val label: String
        get() = when {
            isFederatie -> "Federatie"
            isReferee -> "Scheidsrechter"
            isCoach -> "Coach"
            isClubStaff -> "Clubstaf"
            else -> "Lid"
        }
}
