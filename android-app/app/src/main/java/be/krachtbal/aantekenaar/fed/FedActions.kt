package be.krachtbal.aantekenaar.fed

import be.krachtbal.aantekenaar.data.Api
import be.krachtbal.aantekenaar.data.AppJson
import be.krachtbal.aantekenaar.data.Http
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.data.Sides
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody

// De acties van de wedstrijddag. Elke actie is één verzoek naar een route die de website zelf ook gebruikt; de server
// controleert de rechten en de volgorde en geeft bij een weigering een Nederlandse tekst terug, die we ongewijzigd tonen.

/** Uitkomst van een actie. */
sealed interface Act {
    data class Ok(val body: JsonObject) : Act {
        fun bool(key: String): Boolean? = (body[key] as? JsonPrimitive)?.booleanOrNull
        fun text(key: String): String? = (body[key] as? JsonPrimitive)?.contentOrNull
    }

    data class Fail(val message: String, val code: Int = 0) : Act
}

private val JSON = "application/json; charset=utf-8".toMediaType()

private fun parseObject(body: String): JsonObject = try {
    AppJson.parseToJsonElement(body).jsonObject
} catch (_: Exception) {
    JsonObject(emptyMap())
}

private suspend fun Api.send(path: String, body: JsonObject): Act =
    when (val r = authed { builder(path).post(body.toString().toRequestBody(JSON)).build() }) {
        is Http.Ok -> Act.Ok(parseObject(r.body))
        is Http.Fail -> Act.Fail(if (r.code == 401) "Je bent uitgelogd. Log opnieuw in." else r.message, r.code)
        is Http.Net -> Act.Fail("Geen verbinding met de server.")
    }

// ── Selectie (coach, scheidsrechter) ────────────────────────────────────────────────────────────────

/**
 * Bewaart de selectie van één kant: speler + rugnummer op dit blad, de kapitein, en — als [confirmed] niet null is —
 * de bevestiging (de club beschouwt de selectie als definitief; ontgrendelen kan). [saveFavorites] onthoudt ze als
 * "vaste opstelling" van de ploeg.
 */
suspend fun Api.saveLineup(matchId: Int, side: Side, players: List<Pair<Int, Int?>>, kapitein: Int?, confirmed: Boolean?, saveFavorites: Boolean): Act =
    send(
        "/api/matchsheet/$matchId/lineup",
        buildJsonObject {
            put("side", side.wire)
            put("kapitein", kapitein)
            put(
                "players",
                buildJsonArray {
                    players.forEach { (id, nr) ->
                        add(buildJsonObject { put("player", id); if (nr != null) put("rugnummer", nr) })
                    }
                },
            )
            if (confirmed != null) put("confirmed", confirmed)
            if (saveFavorites) put("saveFavorites", true)
        },
    )

/** ⭐ een speler als favoriet (aan/uit): staat dan altijd bovenaan de selectielijst van de ploeg. */
suspend fun Api.setFavorite(matchId: Int, side: Side, player: Int, aan: Boolean): Act =
    send(
        "/api/matchsheet/$matchId/lineup",
        buildJsonObject {
            put("side", side.wire)
            put("favoriet", buildJsonObject { put("player", player); put("aan", aan) })
        },
    )

// ── Scheidsrechter: controle, keuring, officials, vrijgave ──────────────────────────────────────────

private suspend fun Api.referee(matchId: Int, body: JsonObject): Act = send("/api/matchsheet/$matchId/referee", body)

/** Eén speler (of alle spelers van een kant) als gecontroleerd markeren — of die controle intrekken. */
suspend fun Api.controle(matchId: Int, side: Side, playerId: Int?, ok: Boolean): Act =
    referee(
        matchId,
        buildJsonObject {
            put("action", "controle")
            put("side", side.wire)
            if (playerId == null) put("alle", true) else put("playerId", playerId)
            put("ok", ok)
        },
    )

/** De materiële keuring bewaren; [bevestigd] true vergrendelt ze, false ontgrendelt, null laat de bevestiging ongemoeid. */
suspend fun Api.keuring(matchId: Int, keuring: Map<String, String>, bevestigd: Boolean?): Act =
    referee(
        matchId,
        buildJsonObject {
            put("action", "keuring")
            put("keuring", buildJsonObject { keuring.forEach { (k, v) -> put(k, v) } })
            if (bevestigd != null) put("bevestigd", bevestigd)
        },
    )

suspend fun Api.officials(matchId: Int, officials: Map<String, String>): Act =
    referee(
        matchId,
        buildJsonObject {
            put("action", "officials")
            put("officials", buildJsonObject { officials.forEach { (k, v) -> put(k, v) } })
        },
    )

/**
 * Vrijgeven (of het akkoord intrekken). De scheidsrechter bewijst zijn aanwezigheid met zijn persoonlijke code, de
 * vrijgavecode van de wedstrijd of de tekst van zijn QR; de federatie hoeft dat niet.
 */
suspend fun Api.vrijgeven(matchId: Int, akkoord: Boolean, code: String?): Act =
    referee(
        matchId,
        buildJsonObject {
            put("action", "wedstrijdstart")
            put("akkoord", akkoord)
            if (!code.isNullOrBlank()) put("code", code.trim())
        },
    )

// ── Wie speelde ─────────────────────────────────────────────────────────────────────────────────────

/** De spelers die al als "gespeeld" bevestigd zijn, per kant. */
suspend fun Api.fetchDeelname(matchId: Int): Fetch<Sides<Set<Int>>> =
    when (val r = authed { builder("/api/matchsheet/$matchId/deelname").get().build() }) {
        is Http.Ok -> {
            val o = parseObject(r.body)
            fun ids(k: String) = (o[k] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.intOrNull }.toSet()
            Fetch.Ok(Sides(ids("home"), ids("away")))
        }
        is Http.Fail -> if (r.code == 403) Fetch.Forbidden else Fetch.Err(r.message)
        is Http.Net -> Fetch.Err("Geen verbinding met de server.")
    }

suspend fun Api.saveDeelname(matchId: Int, home: Set<Int>, away: Set<Int>): Act =
    send(
        "/api/matchsheet/$matchId/deelname",
        buildJsonObject {
            put("home", buildJsonArray { home.forEach { add(JsonPrimitive(it)) } })
            put("away", buildJsonArray { away.forEach { add(JsonPrimitive(it)) } })
        },
    )

// ── Aftekenen en indienen ───────────────────────────────────────────────────────────────────────────

/** De drie ondertekenaars, met de sleutel die de server verwacht (`who`). */
enum class Signer(val wire: String, val label: String) {
    KAPITEIN_THUIS("kapiteinThuis", "Kapitein thuis"),
    KAPITEIN_UIT("kapiteinUit", "Kapitein uit"),
    SCHEIDSRECHTER("scheidsrechter", "Scheidsrechter"),
}

/**
 * Zet een handtekening (PNG als data-URL). Een gezette handtekening is definitief. Staat hiermee de laatste nodige
 * handtekening, dan dient de server het blad zelf in: `ingediend` is dan true; zo niet zegt `nogTeDoen` wat er rest.
 */
suspend fun Api.sign(matchId: Int, who: Signer, naam: String?, dataUrl: String): Act =
    send(
        "/api/matchsheet/$matchId/sign",
        buildJsonObject {
            put("who", who.wire)
            if (!naam.isNullOrBlank()) put("naam", naam.trim())
            put("handtekening", dataUrl)
            put("akkoord", true)
        },
    )

suspend fun Api.submitSheet(matchId: Int): Act = send("/api/matchsheet/$matchId/submit", JsonObject(emptyMap()))

// ── Blessure, aftrap, afgelasting ───────────────────────────────────────────────────────────────────

/** Een blessure doorgeven: wordt een ongevalsaangifte, een regel op het blad en een melding aan club, speler en federatie. */
suspend fun Api.blessure(matchId: Int, side: Side, playerId: Int?, omschrijving: String): Act =
    send(
        "/api/matchsheet/$matchId/blessure",
        buildJsonObject {
            put("side", side.wire)
            if (playerId != null) put("playerId", playerId)
            put("omschrijving", omschrijving.trim())
        },
    )

/** De aftrap verschuiven (zelfde dag, max. 4 uur); [volgendeOok] schuift de volgende wedstrijden op het terrein mee. */
suspend fun Api.aftrapVerschuiven(matchId: Int, nieuwIso: String, reden: String, toelichting: String?, volgendeOok: Boolean): Act =
    send(
        "/api/match/$matchId/aftrap",
        buildJsonObject {
            put("nieuw", nieuwIso)
            put("reden", reden)
            if (!toelichting.isNullOrBlank()) put("toelichting", toelichting.trim())
            put("volgendeOok", volgendeOok)
        },
    )

/** Een foto voor een afgelasting: bestandsnaam, mimetype en de bytes. */
class Foto(val name: String, val mime: String, val bytes: ByteArray)

/** De wedstrijd afgelasten (multipart). De server eist minstens één foto van de omstandigheden. */
suspend fun Api.afgelasten(matchId: Int, reden: String, toelichting: String?, fotos: List<Foto>): Act {
    val body = MultipartBody.Builder().setType(MultipartBody.FORM).apply {
        addFormDataPart("reden", reden)
        if (!toelichting.isNullOrBlank()) addFormDataPart("toelichting", toelichting.trim())
        fotos.forEach { addFormDataPart("fotos", it.name, it.bytes.toRequestBody(it.mime.toMediaType())) }
    }.build()
    return when (val r = authed { builder("/api/match/$matchId/afgelasten").post(body).build() }) {
        is Http.Ok -> Act.Ok(parseObject(r.body))
        is Http.Fail -> Act.Fail(if (r.code == 401) "Je bent uitgelogd. Log opnieuw in." else r.message, r.code)
        is Http.Net -> Act.Fail("Geen verbinding met de server.")
    }
}

// ── Onregelmatigheden op het blad: voorbehoud, uitsluiting, rapport, forfait (RCVK items 25, 27, 34) ───────────

/** Waarover een voorbehoud gaat; bepaalt welk comité het behandelt (spiegel van src/lib/voorbehoud-onderwerpen.ts). */
val VOORBEHOUD_ONDERWERPEN: List<Pair<String, String>> = listOf(
    "inrichting" to "Materiële inrichting niet in orde",
    "speelduur_tijdopnemer" to "Speelduur — fout van de tijdopnemer",
    "officials" to "Officials ontbreken",
    "leeftijd" to "Twijfel over de leeftijdscategorie",
    "aantekenblad" to "Aantekenblad verkeerd ingevuld",
    "identiteit" to "Twijfel over de identiteit van spelers",
    "doelpunt" to "Doelpunt niet toegekend",
    "sr_afwezig" to "Scheidsrechter niet opgekomen",
    "sr_te_laat" to "Scheidsrechter te laat",
    "spelregels" to "Spelregels verkeerd toegepast",
    "speelduur_scheidsrechter" to "Speelduur — fout van de scheidsrechter",
    "ander" to "Iets anders",
)

/** "thuis"/"uit" zoals het blad ze voor voorbehoud en uitsluiting bewaart. */
val Side.bladKant: String get() = if (this == Side.HOME) "thuis" else "uit"

/** Een voorbehoud noteren: wie het vroeg (kapitein; U12–U16 de coach), waarover, de feiten, stand en speeltijd. */
suspend fun Api.voorbehoud(matchId: Int, side: Side, naam: String, onderwerp: String, reden: String, score: String?, speeltijd: String?): Act =
    referee(
        matchId,
        buildJsonObject {
            put("action", "voorbehoud")
            put("side", side.bladKant)
            put("naam", naam.trim())
            put("onderwerp", onderwerp)
            put("reden", reden.trim())
            if (!score.isNullOrBlank()) put("score", score.trim())
            if (!speeltijd.isNullOrBlank()) put("speeltijd", speeltijd.trim())
        },
    )

/** Een uitsluiting noteren: een speler van het blad ([playerId]) of een naam, met de reden, stand en speeltijd. */
suspend fun Api.uitsluiting(matchId: Int, side: Side, playerId: Int?, naam: String?, reden: String, score: String?, speeltijd: String?): Act =
    referee(
        matchId,
        buildJsonObject {
            put("action", "uitsluiting")
            put("side", side.bladKant)
            if (playerId != null) put("playerId", playerId)
            if (!naam.isNullOrBlank()) put("naam", naam.trim())
            put("reden", reden.trim())
            if (!score.isNullOrBlank()) put("score", score.trim())
            if (!speeltijd.isNullOrBlank()) put("speeltijd", speeltijd.trim())
        },
    )

/** Een verkeerd genoteerde regel schrappen ([voorbehoud] true = voorbehoud, anders uitsluiting), zolang de scheidsrechter niet aftekende. */
suspend fun Api.blokSchrappen(matchId: Int, voorbehoud: Boolean, index: Int): Act =
    referee(
        matchId,
        buildJsonObject {
            put("action", if (voorbehoud) "voorbehoud-schrappen" else "uitsluiting-schrappen")
            put("index", index)
        },
    )

/** "Zie scheidsrechtersrapport" aan of uit: er volgt een rapport over een andere onregelmatigheid. */
suspend fun Api.rapportVolgt(matchId: Int, aan: Boolean): Act =
    referee(matchId, buildJsonObject { put("action", "rapport-volgt"); put("aan", aan) })

/** Forfait ter plaatse: "thuis", "uit" of "dubbel" (wie forfait geeft), of "geen" om het terug te draaien. */
suspend fun Api.forfait(matchId: Int, uitslag: String): Act =
    referee(matchId, buildJsonObject { put("action", "forfait"); put("uitslag", uitslag) })

/** Waarover een scheidsrechtersrapport gaat (src/lib/sr-rapport.ts). */
val RAPPORT_AANLEIDINGEN: List<Pair<String, String>> = listOf(
    "voorbehoud" to "Voorbehoud aangetekend",
    "uitsluiting" to "Uitsluiting",
    "niet_gespeeld" to "Wedstrijd niet (volledig) gespeeld",
    "incident" to "Incident of onsportief gedrag",
    "ander" to "Andere onregelmatigheid",
)
const val RAPPORT_MIN_TEKENS = 30
const val RAPPORT_MAX_BIJLAGEN = 5

/** Het scheidsrechtersrapport indienen (multipart), ondertekend met [naam]; foto's als bijlage. */
suspend fun Api.srRapport(matchId: Int, aanleidingen: Set<String>, relaas: String, naam: String, bijlagen: List<Foto>): Act {
    val body = MultipartBody.Builder().setType(MultipartBody.FORM).apply {
        addFormDataPart("matchId", matchId.toString())
        aanleidingen.forEach { addFormDataPart("aanleidingen", it) }
        addFormDataPart("relaas", relaas.trim())
        addFormDataPart("naam", naam.trim())
        bijlagen.forEach { addFormDataPart("bijlagen", it.name, it.bytes.toRequestBody(it.mime.toMediaType())) }
    }.build()
    return when (val r = authed { builder("/api/sr-rapport").post(body).build() }) {
        is Http.Ok -> Act.Ok(parseObject(r.body))
        is Http.Fail -> Act.Fail(if (r.code == 401) "Je bent uitgelogd. Log opnieuw in." else r.message, r.code)
        is Http.Net -> Act.Fail("Geen verbinding met de server.")
    }
}
