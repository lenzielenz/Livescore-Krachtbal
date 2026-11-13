package be.krachtbal.aantekenaar.fed

import be.krachtbal.aantekenaar.data.AppJson
import be.krachtbal.aantekenaar.data.Side
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject

// Het wedstrijdblad en de selectie zoals de server ze geeft. Spiegel van src/collections/MatchSheets.ts
// (blad) en src/lib/matchsheet-data.ts (roster), enkel wat de app nodig heeft. De server beslist altijd
// zelf wat mag; deze modellen zijn om te tonen en om de volgende stap te bepalen.

/** Reglement §4: een selectie telt minstens 3 en hoogstens 8 spelers (src/lib/match-readiness.ts). */
object Limits {
    const val SELECTIE_MIN = 3
    const val SELECTIE_MAX = 8
}

/** Eén speler op de opstelling van het blad. */
data class LineupRow(
    val player: Int,
    val rugnummer: Int?,
    /** De scheidsrechter bevestigde na afloop dat hij speelde ("wie speelde"). */
    val deelgenomen: Boolean,
    /** De scheidsrechter controleerde vooraf "jij bent die speler, alles in orde". */
    val gecontroleerd: Boolean,
)

data class Signature(val akkoord: Boolean, val naam: String?)

/**
 * Een voorbehoud of uitsluiting op het blad (RCVK items 25, 27; src/lib/voorbehoud.ts). [side] is "thuis" of "uit";
 * [onderwerp] enkel bij een voorbehoud (bepaalt het comité), [player] enkel bij een uitsluiting van een lid.
 */
data class BladRij(
    val side: String,
    val naam: String?,
    val reden: String,
    val onderwerp: String?,
    val player: Int?,
    val score: String?,
    val speeltijd: String?,
)

/** Het blad van één wedstrijd (de velden die `select` ophaalt; de handtekening-afbeeldingen blijven weg: tientallen KB). */
data class SheetView(
    val id: Int,
    /** concept → wedstrijdklaar → bezig → af_te_tekenen → ingediend (src/lib/blad-status.ts). */
    val status: String,
    val home: List<LineupRow>,
    val away: List<LineupRow>,
    val homeConfirmed: Boolean,
    val awayConfirmed: Boolean,
    val keuring: Map<String, String>,
    val keuringBevestigd: Boolean,
    val officials: Map<String, String>,
    val startAkkoord: Boolean,
    val startNaam: String?,
    val eindeAkkoord: Boolean,
    /** "geen", "thuis", "uit" of "dubbel": wie forfait gaf. */
    val forfait: String,
    val kapiteinThuis: Signature,
    val kapiteinUit: Signature,
    val scheidsrechter: Signature,
    val assignedReferee: Int?,
    val backupReferee: Int?,
    /** De vrijgavecode (backup) die de federatie aan de scheidsrechter doorgeeft; enkel voor de federatie leesbaar. */
    val vrijgaveCode: String? = null,
    val voorbehoud: List<BladRij> = emptyList(),
    val uitsluitingen: List<BladRij> = emptyList(),
    /** "Zie scheidsrechtersrapport" (RCVK item 27): er volgt een rapport over een andere onregelmatigheid. */
    val rapportVolgt: Boolean = false,
) {
    fun lineup(side: Side): List<LineupRow> = if (side == Side.HOME) home else away
    val ingediend: Boolean get() = status == "ingediend"
    val isForfait: Boolean get() = forfait != "geen"
}

/** Velden die we van het blad ophalen: alles behalve de handtekening-afbeeldingen. */
internal val SHEET_SELECT: List<Pair<String, String>> = listOf(
    "select[status]" to "true",
    "select[homeLineup]" to "true",
    "select[awayLineup]" to "true",
    "select[homeLineupConfirmed]" to "true",
    "select[awayLineupConfirmed]" to "true",
    "select[keuring]" to "true",
    "select[keuringBevestigd]" to "true",
    "select[officials]" to "true",
    "select[wedstrijdstart]" to "true",
    "select[wedstrijdeinde]" to "true",
    "select[forfait]" to "true",
    "select[assignedReferee]" to "true",
    "select[backupReferee]" to "true",
    "select[vrijgaveCode]" to "true",
    "select[voorbehoud]" to "true",
    "select[uitsluitingen]" to "true",
    "select[rapportVolgt]" to "true",
    "select[kapiteinThuis][akkoord]" to "true",
    "select[kapiteinThuis][naam]" to "true",
    "select[kapiteinUit][akkoord]" to "true",
    "select[kapiteinUit][naam]" to "true",
    "select[scheidsrechter][akkoord]" to "true",
    "select[scheidsrechter][naam]" to "true",
)

private fun JsonElement?.obj(): JsonObject? = this as? JsonObject
private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.contentOrNull
private fun JsonElement?.int(): Int? = (this as? JsonPrimitive)?.intOrNull
private fun JsonElement?.bool(): Boolean = (this as? JsonPrimitive)?.booleanOrNull == true

/** Een relatie is een id, of — bij `depth` ≥ 1 — een uitgeklapt object met een id. */
private fun JsonElement?.relId(): Int? = when (this) {
    is JsonObject -> this["id"].int()
    is JsonPrimitive -> intOrNull
    else -> null
}

private fun lineupOf(el: JsonElement?): List<LineupRow> =
    (el as? JsonArray).orEmpty().mapNotNull { r ->
        val o = r.obj() ?: return@mapNotNull null
        val player = o["player"].relId() ?: return@mapNotNull null
        LineupRow(player, o["rugnummer"].int(), o["deelgenomen"].bool(), o["ibGecontroleerd"].bool())
    }

private fun bladRijen(el: JsonElement?): List<BladRij> =
    (el as? JsonArray).orEmpty().mapNotNull { r ->
        val o = r.obj() ?: return@mapNotNull null
        BladRij(
            side = o["side"].str() ?: "thuis",
            naam = o["naam"].str(),
            reden = o["reden"].str().orEmpty(),
            onderwerp = o["onderwerp"].str(),
            player = o["player"].relId(),
            score = o["score"].str(),
            speeltijd = o["speeltijd"].str(),
        )
    }

private fun signatureOf(el: JsonElement?): Signature = Signature(el.obj()?.get("akkoord").bool(), el.obj()?.get("naam").str())

private fun stringMap(el: JsonElement?): Map<String, String> =
    el.obj()?.mapNotNull { (k, v) -> v.str()?.let { k to it } }?.toMap().orEmpty()

/** Het eerste blad uit een `/api/matchsheets`-antwoord, of null als er geen is (of het onleesbaar is). */
fun parseSheet(body: String): SheetView? {
    return try {
    val doc = (AppJson.parseToJsonElement(body).jsonObject["docs"] as? JsonArray)?.firstOrNull().obj()
    doc?.let { d ->
        SheetView(
            id = d["id"].int() ?: return null,
            status = d["status"].str() ?: "concept",
            home = lineupOf(d["homeLineup"]),
            away = lineupOf(d["awayLineup"]),
            homeConfirmed = d["homeLineupConfirmed"].bool(),
            awayConfirmed = d["awayLineupConfirmed"].bool(),
            keuring = stringMap(d["keuring"]),
            keuringBevestigd = d["keuringBevestigd"].bool(),
            officials = stringMap(d["officials"]),
            startAkkoord = d["wedstrijdstart"].obj()?.get("akkoord").bool(),
            startNaam = d["wedstrijdstart"].obj()?.get("naam").str(),
            eindeAkkoord = d["wedstrijdeinde"].obj()?.get("akkoord").bool(),
            forfait = d["forfait"].obj()?.get("uitslag").str() ?: "geen",
            kapiteinThuis = signatureOf(d["kapiteinThuis"]),
            kapiteinUit = signatureOf(d["kapiteinUit"]),
            scheidsrechter = signatureOf(d["scheidsrechter"]),
            assignedReferee = d["assignedReferee"].relId(),
            backupReferee = d["backupReferee"].relId(),
            vrijgaveCode = d["vrijgaveCode"].str(),
            voorbehoud = bladRijen(d["voorbehoud"]),
            uitsluitingen = bladRijen(d["uitsluitingen"]),
            rapportVolgt = d["rapportVolgt"].bool(),
        )
    }
} catch (_: Exception) {
        null
    }
}

// ── De selectie (roster) van één kant: `GET /api/matchsheet/{id}/lineup?side=` ──────────────────────

/** Mag deze speler gekozen worden? "ok", "warn" (kan, maar let op) of "block" (reglement: niet speelgerechtigd). */
data class RosterPlayer(
    val id: Int,
    val name: String,
    val shirtNumber: Int?,
    val level: String,
    val reasons: List<String>,
    val suggested: Boolean,
    /** Speler uit een lagere ploeg van de club (speelt hier hoger). */
    val geleendVan: String?,
    /** Vastspelen: "2/3" als hij al hoger speelde en een maximum geldt. */
    val knipjes: String?,
) {
    val blocked: Boolean get() = level == "block"
}

data class LineupInfo(
    val teamId: Int,
    val teamName: String,
    val category: String,
    val players: List<RosterPlayer>,
    /** De ⭐-spelers van de ploeg (vaste opstelling), die bovenaan staan. */
    val favorites: Set<Int>,
    val status: String,
    /** De huidige opstelling op het blad: speler + rugnummer op dit blad. */
    val current: List<Pair<Int, Int?>>,
    val confirmed: Boolean,
    val kapitein: Int?,
    /** Waarom de club niet meer mag wijzigen (vrijgegeven, begonnen, …), of null als het nog mag. */
    val vergrendeld: String?,
)

fun parseLineupInfo(body: String): LineupInfo? {
    return try {
    val o = AppJson.parseToJsonElement(body).jsonObject
    LineupInfo(
        teamId = o["teamId"].int() ?: return null,
        teamName = o["teamName"].str() ?: "",
        category = o["category"].str() ?: "senioren",
        players = (o["players"] as? JsonArray).orEmpty().mapNotNull { p ->
            val po = p.obj() ?: return@mapNotNull null
            val sel = po["selectability"].obj()
            val kn = po["knipjes"].obj()
            RosterPlayer(
                id = po["id"].int() ?: return@mapNotNull null,
                name = po["name"].str() ?: "?",
                shirtNumber = po["shirtNumber"].int(),
                level = sel?.get("level").str() ?: "ok",
                reasons = (sel?.get("reasons") as? JsonArray).orEmpty().mapNotNull { it.str() },
                suggested = po["suggested"].bool(),
                geleendVan = po["geleendVan"].str(),
                knipjes = kn?.let { k ->
                    val keer = k["keer"].int()
                    val max = k["max"].int()
                    if (keer != null && max != null) "$keer/$max" else null
                },
            )
        },
        favorites = (o["favorites"] as? JsonArray).orEmpty().mapNotNull { it.int() }.toSet(),
        status = o["status"].str() ?: "concept",
        current = (o["current"] as? JsonArray).orEmpty().mapNotNull { r ->
            val ro = r.obj() ?: return@mapNotNull null
            (ro["player"].int() ?: return@mapNotNull null) to ro["rugnummer"].int()
        },
        confirmed = o["confirmed"].bool(),
        kapitein = o["kapitein"].int(),
        vergrendeld = o["vergrendeld"].str(),
    )
} catch (_: Exception) {
        null
    }
}
