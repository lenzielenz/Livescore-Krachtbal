package be.krachtbal.aantekenaar.fed

import be.krachtbal.aantekenaar.data.Api
import be.krachtbal.aantekenaar.data.AppJson
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.Http
import be.krachtbal.aantekenaar.data.Reauth
import be.krachtbal.aantekenaar.data.Side
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.jsonObject
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Request

// De federatie-kant van de API: het wedstrijdblad, de selectie en (straks) de acties van de scheidsrechter en het
// aftekenen. Alles loopt over routes die de website zelf gebruikt — de server blijft de enige die beslist wat mag.

/** Uitkomst van een leesverzoek. */
sealed interface Fetch<out T> {
    data class Ok<T>(val value: T) : Fetch<T>

    /** De server weigert deze rol (403): niet jouw ploeg of niet jouw taak. Geen fout, wel iets om te weten. */
    data object Forbidden : Fetch<Nothing>

    data class Err(val message: String) : Fetch<Nothing>
}

/** Pad + query samen, zoals [Api.builder] het wil. */
private fun Api.path(path: String, params: List<Pair<String, String>> = emptyList()): String {
    val url = (auth.serverUrl + path).toHttpUrl().newBuilder().apply { params.forEach { (k, v) -> addQueryParameter(k, v) } }.build()
    return url.encodedPath + (url.encodedQuery?.let { "?$it" } ?: "")
}

/**
 * Een verzoek met de sessie. Is het token verlopen (401), dan loggen we stil opnieuw in en proberen we het één keer
 * opnieuw: niemand mag midden in een wedstrijddag op een inlogscherm belanden (zie AuthRepo).
 */
internal suspend fun Api.authed(build: () -> Request): Http {
    val token = auth.token
    val r = call(build())
    if (r is Http.Fail && r.code == 401 && Graph.authRepo.reauthenticate(token) == Reauth.OK) return call(build())
    return r
}

/**
 * Het blad van een wedstrijd (zonder de handtekening-afbeeldingen). `Ok(null)` = er is nog geen blad;
 * `Forbidden` = deze rol mag het blad niet lezen (de coach): die leest de stand via [fetchLineup].
 */
suspend fun Api.fetchSheet(matchId: Int): Fetch<SheetView?> {
    val params = buildList {
        add("where[match][equals]" to matchId.toString())
        add("depth" to "0")
        add("limit" to "1")
        addAll(SHEET_SELECT)
    }
    return when (val r = authed { builder(path("/api/matchsheets", params)).get().build() }) {
        is Http.Ok -> Fetch.Ok(parseSheet(r.body))
        is Http.Fail -> if (r.code == 403) Fetch.Forbidden else Fetch.Err(r.message)
        is Http.Net -> Fetch.Err("Geen verbinding met de server.")
    }
}

/** De selectie van één kant (spelerslijst met blokkades, de huidige keuze, kapitein, vergrendeling). 403 = niet jouw ploeg. */
suspend fun Api.fetchLineup(matchId: Int, side: Side): Fetch<LineupInfo> =
    when (val r = authed { builder(path("/api/matchsheet/$matchId/lineup", listOf("side" to side.wire))).get().build() }) {
        is Http.Ok -> parseLineupInfo(r.body)?.let { Fetch.Ok(it) } ?: Fetch.Err("Onverwacht antwoord van de server.")
        is Http.Fail -> if (r.code == 403) Fetch.Forbidden else Fetch.Err(r.message)
        is Http.Net -> Fetch.Err("Geen verbinding met de server.")
    }

/** Is de wedstrijd afgelast? (Het veld zit niet in de publieke state; één klein verzoek.) Bij een fout: niet afgelast. */
suspend fun Api.fetchCancelled(matchId: Int): Boolean {
    val r = authed { builder(path("/api/matches/$matchId", listOf("depth" to "0", "select[afgelast]" to "true"))).get().build() }
    if (r !is Http.Ok) return false
    return try {
        (AppJson.parseToJsonElement(r.body).jsonObject["afgelast"] as? JsonPrimitive)?.booleanOrNull == true
    } catch (_: Exception) {
        false
    }
}
