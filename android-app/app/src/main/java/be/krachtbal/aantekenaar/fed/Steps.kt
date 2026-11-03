package be.krachtbal.aantekenaar.fed

import be.krachtbal.aantekenaar.data.Me
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.data.Sides

// De stappen van een wedstrijddag, in de volgorde van docs/FEDERATIEFLOW.md §5. Elke stap bewaakt de volgende:
// het blad volgt de wedstrijd vanzelf (src/lib/blad-status.ts). Deze logica toont enkel waar de wedstrijd staat en
// wie aan zet is — de server dwingt de regels af (vrijgave kan pas met beide selecties, alle spelers gecontroleerd, …).

enum class StepId { SELECTIE_THUIS, SELECTIE_UIT, CONTROLE, KEURING, VRIJGAVE, AANTEKENEN, WIE_SPEELDE, AFTEKENEN, INDIENEN }

/** Wie de stap doet. */
enum class Owner(val label: String) {
    COACH("Coach"),
    SCHEIDSRECHTER("Scheidsrechter"),
    TAFEL("Tafel"),
    KAPITEINS("Kapiteins en scheidsrechter"),
}

enum class StepState {
    /** Gedaan. */
    DONE,

    /** Aan de beurt (of kan nu). */
    TODO,

    /** Bezig (de wedstrijd loopt). */
    BUSY,

    /** Nog niet aan de beurt: een eerdere stap is niet klaar. */
    WAIT,

    /** Hoort bij deze wedstrijd niet (forfait, afgelast). */
    NA,
}

data class Step(
    val id: StepId,
    val title: String,
    val owner: Owner,
    val state: StepState,
    val detail: String?,
    /** De eerstvolgende stap die nog moet gebeuren — die licht de hub op. */
    val next: Boolean = false,
)

/** Wat we van de wedstrijd zelf weten (uit `/api/match/{id}/state`). */
data class MatchFacts(
    /** scheduled, live of finished. */
    val status: String,
    val cancelled: Boolean = false,
    val home: String = "Thuis",
    val away: String = "Uit",
    /** De reeks (bv. "RHA"): bepaalt welke officials er op het blad moeten staan. */
    val reeks: String? = null,
)

object Steps {
    // De bladstatussen van de server, in volgorde (src/lib/matchsheet-workflow.ts). "vrijgegeven" staat er bewust NIET in:
    // dat is de oude status "opstellingen zichtbaar voor de scheidsrechter", niet zijn vrijgave van de wedstrijd — ze telt
    // hier als concept (rang 0). De echte vrijgave is `wedstrijdstart.akkoord` → "wedstrijdklaar".
    private val RANK = listOf("concept", "wedstrijdklaar", "bezig", "af_te_tekenen", "ingediend")
    private fun rank(status: String) = RANK.indexOf(status).coerceAtLeast(0)

    /** De status van het blad: uit het blad zelf, of — voor wie het blad niet mag lezen (coach) — uit de selectie. */
    fun bladStatus(sheet: SheetView?, lineups: Sides<LineupInfo?>): String =
        sheet?.status ?: lineups.home?.status ?: lineups.away?.status ?: "concept"

    private fun count(side: Side, sheet: SheetView?, lineups: Sides<LineupInfo?>): Int? =
        sheet?.lineup(side)?.size ?: lineups[side]?.current?.size

    private fun spelers(n: Int) = if (n == 1) "1 speler" else "$n spelers"

    fun plan(facts: MatchFacts, sheet: SheetView?, lineups: Sides<LineupInfo?> = Sides(null, null)): List<Step> {
        val r = rank(bladStatus(sheet, lineups))
        val released = r >= 1
        val finished = facts.status == "finished"
        val forfait = sheet?.forfait ?: "geen"
        val isForfait = forfait != "geen"
        val steps = ArrayList<Step>()

        // ── 1–2. Selectie van de coach, per ploeg ───────────────────────────────────────────────────────
        val selectieOk = BooleanArray(2)
        for ((i, side) in listOf(Side.HOME, Side.AWAY).withIndex()) {
            val n = count(side, sheet, lineups)
            val naam = if (side == Side.HOME) facts.home else facts.away
            val forfaitDezeKant = (side == Side.HOME && (forfait == "thuis" || forfait == "dubbel")) ||
                (side == Side.AWAY && (forfait == "uit" || forfait == "dubbel"))
            val ok = n != null && n >= Limits.SELECTIE_MIN
            // Een coach mag het blad en de lijst van de tegenstander niet lezen (403): die kant is dan niet de zijne
            // en zeker niet "aan hem" — we weten er niets van tot de wedstrijd vrijgegeven is.
            val nietZichtbaar = n == null && r < 1
            selectieOk[i] = ok || r >= 1 || forfaitDezeKant
            steps += Step(
                id = if (side == Side.HOME) StepId.SELECTIE_THUIS else StepId.SELECTIE_UIT,
                title = "Selectie $naam",
                owner = Owner.COACH,
                state = when {
                    forfaitDezeKant -> StepState.NA
                    ok || (r >= 1 && n == null) -> StepState.DONE
                    nietZichtbaar -> StepState.WAIT
                    else -> StepState.TODO
                },
                detail = when {
                    forfaitDezeKant -> "forfait"
                    n == null -> if (r >= 1) "vrijgegeven" else "de coach van $naam — niet zichtbaar voor jou"
                    ok -> spelers(n) + if ((if (side == Side.HOME) sheet?.homeConfirmed else sheet?.awayConfirmed) == true) " · bevestigd" else ""
                    n == 0 -> "nog geen spelers gekozen"
                    else -> "${spelers(n)} — minstens ${Limits.SELECTIE_MIN} nodig"
                },
            )
        }

        // ── 3. Controle van de spelers door de scheidsrechter ───────────────────────────────────────────
        val rows = sheet?.let { it.home + it.away }.orEmpty()
        val gecontroleerd = rows.count { it.gecontroleerd }
        val controleOk = released || (rows.isNotEmpty() && gecontroleerd == rows.size)
        steps += Step(
            id = StepId.CONTROLE,
            title = "Spelers controleren",
            owner = Owner.SCHEIDSRECHTER,
            state = when {
                isForfait -> StepState.NA
                controleOk -> StepState.DONE
                rows.isEmpty() -> StepState.WAIT
                else -> StepState.TODO
            },
            detail = when {
                isForfait -> "forfait"
                released && sheet == null -> "klaar"
                rows.isEmpty() -> "wacht op de selecties"
                else -> "$gecontroleerd van ${rows.size} gecontroleerd"
            },
        )

        // ── 4. Materiële keuring ───────────────────────────────────────────────────────────────────────
        val keuringOk = released || sheet?.keuringBevestigd == true
        val nietOk = sheet?.keuring?.count { it.value == "niet_ok" } ?: 0
        steps += Step(
            id = StepId.KEURING,
            title = "Materiële keuring",
            owner = Owner.SCHEIDSRECHTER,
            state = when {
                isForfait -> StepState.NA
                keuringOk -> StepState.DONE
                else -> StepState.TODO
            },
            detail = when {
                isForfait -> "forfait"
                released && sheet == null -> "klaar"
                keuringOk && nietOk > 0 -> "bevestigd · $nietOk punt${if (nietOk == 1) "" else "en"} niet OK"
                keuringOk -> "bevestigd"
                else -> "nog te bevestigen"
            },
        )

        // ── 5. Vrijgave ────────────────────────────────────────────────────────────────────────────────
        val vrijgaveKan = selectieOk.all { it } && controleOk && keuringOk
        val ontbreekt = buildList {
            if (!selectieOk.all { it }) add("selecties")
            if (!controleOk) add("controle")
            if (!keuringOk) add("keuring")
        }
        steps += Step(
            id = StepId.VRIJGAVE,
            title = "Wedstrijd vrijgeven",
            owner = Owner.SCHEIDSRECHTER,
            state = when {
                isForfait -> StepState.NA
                facts.cancelled -> StepState.NA
                sheet?.startAkkoord == true || released -> StepState.DONE
                vrijgaveKan -> StepState.TODO
                else -> StepState.WAIT
            },
            detail = when {
                isForfait -> "forfait"
                facts.cancelled -> "wedstrijd afgelast"
                sheet?.startAkkoord == true -> sheet.startNaam?.let { "vrijgegeven door $it" } ?: "vrijgegeven"
                released -> "vrijgegeven"
                vrijgaveKan -> "met QR of code van de scheidsrechter"
                else -> "wacht op: ${ontbreekt.joinToString(", ")}"
            },
        )

        // ── 6. Aantekenen door de tafel ────────────────────────────────────────────────────────────────
        steps += Step(
            id = StepId.AANTEKENEN,
            title = "Aantekenen",
            owner = Owner.TAFEL,
            state = when {
                isForfait || facts.cancelled -> StepState.NA
                finished -> StepState.DONE
                facts.status == "live" -> StepState.BUSY
                released -> StepState.TODO
                else -> StepState.WAIT
            },
            detail = when {
                isForfait -> "forfait"
                facts.cancelled -> "wedstrijd afgelast"
                finished -> "afgelopen"
                facts.status == "live" -> "de wedstrijd loopt"
                released -> "klaar om te starten"
                else -> "pas na de vrijgave"
            },
        )

        // ── 7. Wie speelde ─────────────────────────────────────────────────────────────------------------
        val gespeeldOk = sheet != null && listOf(sheet.home, sheet.away).all { l -> l.any { it.deelgenomen } }
        steps += Step(
            id = StepId.WIE_SPEELDE,
            title = "Wie speelde",
            owner = Owner.SCHEIDSRECHTER,
            state = when {
                isForfait || facts.cancelled -> StepState.NA
                r >= 4 || gespeeldOk -> StepState.DONE
                finished -> StepState.TODO
                else -> StepState.WAIT
            },
            detail = when {
                isForfait -> "forfait"
                facts.cancelled -> "wedstrijd afgelast"
                r >= 4 || gespeeldOk -> "bevestigd"
                finished -> "met één tik: berekend uit de veldspelers en wissels"
                else -> "na het eindsignaal"
            },
        )

        // ── 8. Aftekenen: beide kapiteins en de scheidsrechter ─────────────────────────────────────────
        val nodig = buildList {
            if (forfait != "thuis" && forfait != "dubbel") add(sheet?.kapiteinThuis?.akkoord ?: false)
            if (forfait != "uit" && forfait != "dubbel") add(sheet?.kapiteinUit?.akkoord ?: false)
            add(sheet?.scheidsrechter?.akkoord ?: false)
        }
        val getekend = nodig.count { it }
        val alleGetekend = r >= 4 || (sheet != null && getekend == nodig.size)
        steps += Step(
            id = StepId.AFTEKENEN,
            title = "Aftekenen",
            owner = Owner.KAPITEINS,
            state = when {
                facts.cancelled -> StepState.NA
                alleGetekend -> StepState.DONE
                finished || isForfait -> StepState.TODO
                else -> StepState.WAIT
            },
            detail = when {
                facts.cancelled -> "wedstrijd afgelast"
                alleGetekend -> "alles getekend"
                finished || isForfait -> if (sheet == null) "na het eindsignaal" else "$getekend van ${nodig.size} getekend"
                else -> "na het eindsignaal"
            },
        )

        // ── 9. Indienen ────────────────────────────────────────────────────────────────────────────────
        // Het indienen weigert een blad met onvolledige officials (lib/submit/index.ts): dat zien we vooraf.
        val officialsFouten = if (sheet != null) Officials.validate(facts.reeks, sheet.officials) else emptyList()
        val klaarOmIn = alleGetekend && (gespeeldOk || isForfait)
        steps += Step(
            id = StepId.INDIENEN,
            title = "Blad indienen",
            owner = Owner.SCHEIDSRECHTER,
            state = when {
                facts.cancelled -> StepState.NA
                r >= 4 -> StepState.DONE
                klaarOmIn && officialsFouten.isEmpty() -> StepState.TODO
                else -> StepState.WAIT
            },
            detail = when {
                facts.cancelled -> "wedstrijd afgelast"
                r >= 4 -> "ingediend bij de federatie"
                klaarOmIn && officialsFouten.isNotEmpty() -> "officials aanvullen: ${officialsFouten.first()}"
                klaarOmIn -> "gaat vanzelf na de laatste handtekening"
                else -> "na het aftekenen"
            },
        )

        // De eerstvolgende stap die nog moet gebeuren licht op.
        val next = steps.indexOfFirst { it.state == StepState.TODO || it.state == StepState.BUSY }
        return if (next < 0) steps else steps.mapIndexed { i, s -> if (i == next) s.copy(next = true) else s }
    }

    /** Is deze stap voor deze gebruiker bedoeld? (De server controleert nog altijd zelf.) */
    fun isMine(step: Step, me: Me): Boolean = me.isFederatie || when (step.owner) {
        Owner.COACH -> me.isCoach || me.isClubStaff || me.isReferee
        Owner.SCHEIDSRECHTER -> me.isReferee
        Owner.TAFEL -> me.isClubStaff || me.isReferee
        Owner.KAPITEINS -> me.isReferee || me.isCoach || me.isClubStaff
    }
}
