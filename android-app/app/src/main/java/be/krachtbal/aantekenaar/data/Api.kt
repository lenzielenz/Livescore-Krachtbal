package be.krachtbal.aantekenaar.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.coroutineContext

/** Ruw HTTP-resultaat. */
sealed interface Http {
    data class Ok(val code: Int, val body: String, val sentWall: Long, val recvWall: Long) : Http
    data class Fail(val code: Int, val message: String, val body: String) : Http
    data class Net(val cause: Throwable) : Http
}

/** Uitkomst van een aantekenactie, ingedeeld zoals de offline-wachtrij van de website dat doet. */
sealed interface ActionResult {
    data class Ok(val state: MatchState?, val sentWall: Long, val recvWall: Long) : ActionResult
    data object Unauthorized : ActionResult

    /** Later opnieuw proberen: geen verbinding, time-out, 5xx, 408, 429. De tik blijft in de wachtrij. */
    data class Temporary(val reason: String) : ActionResult

    /** Echte weigering (4xx): de server wil deze actie niet. */
    data class Rejected(val code: Int, val message: String) : ActionResult
}

sealed interface StateResult {
    data class Ok(val state: MatchState) : StateResult
    data class Err(val message: String, val notFound: Boolean = false) : StateResult
}

enum class ListMode { LIVE, TODAY, UPCOMING, FINISHED }

data class MatchPage(val rows: List<MatchRow>, val hasNext: Boolean)

class Api(internal val auth: AuthStore, val serverClock: ServerClock) {
    private val json = "application/json; charset=utf-8".toMediaType()

    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(12, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        // Een hangend verzoek op een slechte lijn mag nooit eindeloos wachten: de wachtrij probeert
        // later opnieuw, en de opId maakt dat veilig.
        .callTimeout(15, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    /** Voor SSE: lang leven, maar 45 s stilte (3 gemiste hartslagen) = dode lijn. */
    val sseHttp: OkHttpClient = http.newBuilder()
        .readTimeout(45, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS)
        .build()

    internal fun builder(path: String): Request.Builder {
        val b = Request.Builder().url(auth.serverUrl + path)
            .header("Accept", "application/json")
            .header("User-Agent", BuildInfo.AGENT)
        auth.token?.let {
            // Payload leest `Authorization: JWT …`; de cookie is wat de website zelf gebruikt. Beide
            // meesturen is onschuldig en dekt beide paden af.
            b.header("Authorization", "JWT $it")
            b.header("Cookie", "payload-token=$it")
        }
        return b
    }

    suspend fun call(req: Request): Http = withContext(Dispatchers.IO) {
        val sent = Time.wall()
        val c = http.newCall(req)
        val handle = coroutineContext[Job]!!.invokeOnCompletion { c.cancel() }
        try {
            c.execute().use { r ->
                val recv = Time.wall()
                val body = r.body?.string().orEmpty()
                serverClock.onDateHeader(r.header("Date"), sent, recv)
                if (r.isSuccessful) Http.Ok(r.code, body, sent, recv)
                else Http.Fail(r.code, errorMessage(body) ?: "Fout ${r.code}", body)
            }
        } catch (e: IOException) {
            Http.Net(e)
        } finally {
            handle.dispose()
        }
    }

    private fun errorMessage(body: String): String? = try {
        val o = AppJson.parseToJsonElement(body).jsonObject
        o["error"]?.jsonPrimitive?.contentOrNull
            ?: o["errors"]?.jsonArray?.firstOrNull()?.jsonObject?.get("message")?.jsonPrimitive?.contentOrNull
            ?: o["message"]?.jsonPrimitive?.contentOrNull
    } catch (_: Exception) {
        null
    }

    private fun parseState(body: String): MatchState? = try {
        val el = AppJson.parseToJsonElement(body)
        if (el is JsonObject && "match" in el && "score" in el) AppJson.decodeFromJsonElement(MatchState.serializer(), el) else null
    } catch (_: Exception) {
        null
    }

    private fun classify(r: Http): ActionResult = when (r) {
        is Http.Ok -> ActionResult.Ok(parseState(r.body), r.sentWall, r.recvWall)
        is Http.Net -> ActionResult.Temporary(r.cause.message ?: "Geen verbinding")
        is Http.Fail -> when {
            r.code == 401 -> ActionResult.Unauthorized
            r.code >= 500 || r.code == 408 || r.code == 429 -> ActionResult.Temporary("Serverfout ${r.code}")
            else -> ActionResult.Rejected(r.code, r.message)
        }
    }

    // ── Aantekenen ───────────────────────────────────────────────────────────────────────────

    suspend fun postAction(matchId: Int, body: JsonObject): ActionResult =
        classify(call(builder("/api/match/$matchId/action").post(body.toString().toRequestBody(json)).build()))

    /** Hartslag ("dit toestel tekent nog aan") — ook meteen de toegangscontrole. */
    suspend fun heartbeat(matchId: Int): ActionResult =
        postAction(matchId, buildJsonObject { put("action", "aanwezig") })

    /** Wedstrijd overnemen van een stilgevallen aantekenaar. */
    suspend fun takeOver(matchId: Int): ActionResult =
        postAction(matchId, buildJsonObject { put("action", "overnemen") })

    suspend fun pairFieldScreen(matchId: Int, code: String): Pair<Boolean, String> =
        when (val r = call(builder("/api/veldscherm/koppel").post(
            buildJsonObject { put("code", code); put("matchId", matchId) }.toString().toRequestBody(json),
        ).build())) {
            is Http.Ok -> true to "Veldscherm gekoppeld."
            is Http.Fail -> false to r.message
            is Http.Net -> false to "Geen verbinding."
        }

    // ── Lezen (publiek) ──────────────────────────────────────────────────────────────────────

    suspend fun fetchState(matchId: Int): StateResult = when (val r = call(builder("/api/match/$matchId/state").get().build())) {
        is Http.Ok -> parseState(r.body)?.let { StateResult.Ok(it) } ?: StateResult.Err("Onverwacht antwoord van de server.")
        is Http.Fail -> StateResult.Err(r.message, notFound = r.code == 404)
        is Http.Net -> StateResult.Err("Geen verbinding met de server.")
    }

    fun streamRequest(matchId: Int): Request =
        Request.Builder().url("${auth.serverUrl}/api/match/$matchId/stream?display=1")
            .header("Accept", "text/event-stream")
            .header("User-Agent", BuildInfo.AGENT)
            .build()

    /** De gedeelde dagstream van de site: de stand van alle wedstrijden van één dag (en wat nu live is) per bericht. */
    fun liveDayRequest(date: String): Request =
        Request.Builder().url("${auth.serverUrl}/api/live/stream".toHttpUrl().newBuilder().addQueryParameter("date", date).build())
            .header("Accept", "text/event-stream")
            .header("User-Agent", BuildInfo.AGENT)
            .build()

    /** "supporters" (vrije livescore) of "federatie" (volledige flow, scorer verplicht). */
    suspend fun fetchScoreMode(): String? = when (val r = call(builder("/api/settings/score-mode").get().build())) {
        is Http.Ok -> try {
            AppJson.parseToJsonElement(r.body).jsonObject["mode"]?.jsonPrimitive?.contentOrNull
        } catch (_: Exception) {
            null
        }
        else -> null
    }

    suspend fun fetchPlayers(teamIds: List<Int>): List<Player> {
        val url = "${auth.serverUrl}/api/players".toHttpUrl().newBuilder().apply {
            teamIds.forEachIndexed { i, id -> addQueryParameter("where[team][in][$i]", id.toString()) }
            addQueryParameter("sort", "shirtNumber")
            addQueryParameter("limit", "300")
            addQueryParameter("depth", "0")
            for (f in listOf("name", "team", "shirtNumber", "actief")) addQueryParameter("select[$f]", "true")
        }.build()
        val r = call(Request.Builder().url(url).header("Accept", "application/json").build())
        if (r !is Http.Ok) return emptyList()
        return try {
            AppJson.parseToJsonElement(r.body).jsonObject["docs"]!!.jsonArray.mapNotNull { el ->
                val o = el.jsonObject
                if (o["actief"]?.jsonPrimitive?.booleanOrNull == false) return@mapNotNull null
                Player(
                    id = o["id"]!!.jsonPrimitive.intOrNull ?: return@mapNotNull null,
                    name = o["name"]?.jsonPrimitive?.contentOrNull ?: "?",
                    shirtNumber = o["shirtNumber"]?.jsonPrimitive?.intOrNull ?: 0,
                    teamId = (o["team"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null,
                )
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /**
     * Spelers op id (de selectie op het wedstrijdblad kan ook spelers uit een lagere ploeg bevatten, die niet bij `team`
     * van deze wedstrijd horen). `teamId` is hier onbekend (-1): de aanroeper weet bij welke kant ze horen.
     */
    suspend fun fetchPlayersByIds(ids: List<Int>): List<Player> {
        if (ids.isEmpty()) return emptyList()
        val url = "${auth.serverUrl}/api/players".toHttpUrl().newBuilder().apply {
            ids.forEachIndexed { i, id -> addQueryParameter("where[id][in][$i]", id.toString()) }
            addQueryParameter("limit", "300")
            addQueryParameter("depth", "0")
            for (f in listOf("name", "shirtNumber", "actief")) addQueryParameter("select[$f]", "true")
        }.build()
        val r = call(Request.Builder().url(url).header("Accept", "application/json").build())
        if (r !is Http.Ok) return emptyList()
        return try {
            AppJson.parseToJsonElement(r.body).jsonObject["docs"]!!.jsonArray.mapNotNull { el ->
                val o = el.jsonObject
                Player(
                    id = o["id"]!!.jsonPrimitive.intOrNull ?: return@mapNotNull null,
                    name = o["name"]?.jsonPrimitive?.contentOrNull ?: "?",
                    shirtNumber = o["shirtNumber"]?.jsonPrimitive?.intOrNull ?: 0,
                    teamId = -1,
                )
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /** Een wissel op het wedstrijdblad: de ploeg en de tekst `#nr naam → #nr naam` (zie [Field.parseOuts]). */
    data class SubEvent(val teamId: Int, val note: String)

    /** De wissels van een wedstrijd, in volgorde. Leeg bij een fout of als er geen waren. */
    suspend fun fetchSubstitutions(matchId: Int): List<SubEvent> {
        val url = "${auth.serverUrl}/api/match-events".toHttpUrl().newBuilder().apply {
            addQueryParameter("where[match][equals]", matchId.toString())
            addQueryParameter("where[type][equals]", "substitution")
            addQueryParameter("sort", "createdAt")
            addQueryParameter("limit", "200")
            addQueryParameter("depth", "0")
            for (f in listOf("team", "note")) addQueryParameter("select[$f]", "true")
        }.build()
        val r = call(Request.Builder().url(url).header("Accept", "application/json").build())
        if (r !is Http.Ok) return emptyList()
        return try {
            AppJson.parseToJsonElement(r.body).jsonObject["docs"]!!.jsonArray.mapNotNull { el ->
                val o = el.jsonObject
                val team = (o["team"] as? JsonObject)?.get("id")?.jsonPrimitive?.intOrNull ?: (o["team"] as? JsonPrimitive)?.intOrNull
                SubEvent(team ?: return@mapNotNull null, o["note"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null)
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /**
     * Wedstrijdenlijst via Payload's publieke REST. De website filtert in federatiemodus op wie wat
     * mag aantekenen; dat kan hier niet — de server weigert een niet-toegelaten tik netjes (403) en
     * de app meldt dat meteen bij het openen van de wedstrijd (hartslag).
     */
    suspend fun fetchMatches(mode: ListMode, query: String, page: Int, nowMs: Long = Time.wall()): Result<MatchPage> {
        val iso = { ms: Long -> java.time.Instant.ofEpochMilli(ms).toString() }
        val zone = java.time.ZoneId.systemDefault()
        val today = java.time.LocalDate.now(zone)
        val dayStart = today.atStartOfDay(zone).toInstant().toEpochMilli()
        val dayEnd = today.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val url = "${auth.serverUrl}/api/matches".toHttpUrl().newBuilder().apply {
            when (mode) {
                ListMode.LIVE -> {
                    addQueryParameter("where[status][equals]", "live")
                    addQueryParameter("sort", "date")
                }
                ListMode.TODAY -> {
                    addQueryParameter("where[date][greater_than_equal]", iso(dayStart))
                    addQueryParameter("where[date][less_than]", iso(dayEnd))
                    addQueryParameter("sort", "date")
                }
                ListMode.UPCOMING -> {
                    addQueryParameter("where[status][equals]", "scheduled")
                    addQueryParameter("where[date][greater_than_equal]", iso(nowMs - 4 * 3_600_000L))
                    addQueryParameter("sort", "date")
                }
                ListMode.FINISHED -> {
                    addQueryParameter("where[status][equals]", "finished")
                    addQueryParameter("where[date][greater_than_equal]", iso(nowMs - 14 * 86_400_000L))
                    addQueryParameter("sort", "-date")
                }
            }
            if (query.isNotBlank()) addQueryParameter("where[title][like]", query.trim())
            addQueryParameter("limit", PAGE_SIZE.toString())
            addQueryParameter("page", page.toString())
            addListFields()
        }.build()
        return getMatches(url)
    }

    /**
     * Zoeken over het hele seizoen (vanaf twee weken terug): de wedstrijden van de kandidaat-clubs, -reeksen of
     * met dat woord in de titel — zie [SeasonSearch]. Eén lichte lijst-aanvraag, geen scorebord-opbouw.
     */
    suspend fun fetchSeasonMatches(plan: SeasonPlan, nowMs: Long = Time.wall()): Result<MatchPage> {
        val from = java.time.Instant.ofEpochMilli(nowMs - SeasonSearch.BACK_DAYS * 86_400_000L).toString()
        val url = "${auth.serverUrl}/api/matches".toHttpUrl().newBuilder().apply {
            addQueryParameter("where[date][greater_than_equal]", from)
            var i = 0
            if (plan.clubIds.isNotEmpty()) {
                val ids = plan.clubIds.joinToString(",")
                addQueryParameter("where[or][${i++}][homeTeam.club][in]", ids)
                addQueryParameter("where[or][${i++}][awayTeam.club][in]", ids)
            }
            if (plan.reeksCodes.isNotEmpty()) addQueryParameter("where[or][${i++}][reeks][in]", plan.reeksCodes.joinToString(","))
            plan.titleWord?.let { addQueryParameter("where[or][${i++}][title][like]", it) }
            addQueryParameter("sort", "date")
            addQueryParameter("limit", SEASON_LIMIT.toString())
            addListFields()
        }.build()
        return getMatches(url)
    }

    private fun okhttp3.HttpUrl.Builder.addListFields() {
        addQueryParameter("depth", "1")
        for (f in listOf("title", "date", "status", "homeTeam", "awayTeam", "reeks", "afgelast", "isDemo", "analyseOnly")) {
            addQueryParameter("select[$f]", "true")
        }
        // Van de uitgeklapte ploegen heeft de lijst enkel de naam en de club nodig (voor het logo en Thuis/Uit).
        // Zonder dit krijgt elke rij twee volledige ploegdocumenten mee: drie keer zoveel bytes voor niets.
        addQueryParameter("populate[teams][name]", "true")
        addQueryParameter("populate[teams][club]", "true")
    }

    private suspend fun getMatches(url: okhttp3.HttpUrl): Result<MatchPage> =
        when (val r = call(Request.Builder().url(url).header("Accept", "application/json").build())) {
            is Http.Ok -> try {
                Result.success(parseMatches(r.body))
            } catch (e: Exception) {
                Result.failure(e)
            }
            is Http.Fail -> Result.failure(IOException(r.message))
            is Http.Net -> Result.failure(IOException("Geen verbinding met de server."))
        }

    internal fun parseMatches(body: String): MatchPage = parseMatchesBody(body)

    companion object {
        /** Rijen per lijstpagina. De lijst laadt zelf door tot [be.krachtbal.aantekenaar.data.MatchListModel.AUTO_LOAD_MAX]. */
        const val PAGE_SIZE = 100
        const val SEASON_LIMIT = 200
    }

    // ── Logo's en clubs ──────────────────────────────────────────────────────────────────────

    /** Ruwe bytes van een afbeelding (publiek, geen login nodig). Null bij elke fout of een te groot bestand. */
    suspend fun fetchBytes(url: String): ByteArray? = withContext(Dispatchers.IO) {
        val c = try {
            http.newCall(Request.Builder().url(url).header("User-Agent", BuildInfo.AGENT).build())
        } catch (_: Exception) {
            return@withContext null
        }
        val handle = coroutineContext[Job]!!.invokeOnCompletion { c.cancel() }
        try {
            c.execute().use { r ->
                val body = r.body
                if (!r.isSuccessful || body == null || body.contentLength() > 3_000_000) null else body.bytes()
            }
        } catch (_: IOException) {
            null
        } finally {
            handle.dispose()
        }
    }

    /** Alle clubs (naam, logo, uitsnede, clubkleur) in één verzoek — een tiental KB. */
    suspend fun fetchClubs(): List<ClubLook>? {
        val url = "${auth.serverUrl}/api/clubs".toHttpUrl().newBuilder().apply {
            addQueryParameter("limit", "500")
            addQueryParameter("depth", "1")
            for (f in listOf("name", "logo", "logoUrl", "logoZoom", "logoOffsetX", "logoOffsetY", "colorPrimary")) {
                addQueryParameter("select[$f]", "true")
            }
        }.build()
        val r = call(Request.Builder().url(url).header("Accept", "application/json").build())
        return if (r is Http.Ok) try { parseClubsBody(r.body) } catch (_: Exception) { null } else null
    }

    // ── Inloggen ─────────────────────────────────────────────────────────────────────────────

    data class LoginOk(
        val token: String,
        val userId: Int,
        val name: String?,
        val clubId: Int? = null,
        /** `user.roles` ("scheidsrechter", "club-beheerder", "federatie", …): bepaalt welke stappen de app toont. */
        val roles: Set<String> = emptySet(),
        /** `user.clubFuncties` ("coach", "jeugdverantwoordelijke", …). */
        val clubFuncties: Set<String> = emptySet(),
    )

    /** `user.club` is een id of — bij een dieper antwoord — een uitgeklapt object (zoals `userClubId` op de site). */
    private fun clubOf(user: JsonObject?): Int? = when (val c = user?.get("club")) {
        is JsonObject -> c["id"]?.jsonPrimitive?.intOrNull
        is JsonPrimitive -> c.intOrNull
        else -> null
    }

    private fun stringsOf(user: JsonObject?, key: String): Set<String> =
        (user?.get(key) as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull }?.toSet().orEmpty()

    private fun rolesOf(user: JsonObject?): Set<String> = stringsOf(user, "roles")

    /** Het eigen profiel (naam, club en rollen), voor wie al ingelogd was vóór de app die bewaarde. Null bij een fout. */
    suspend fun fetchMe(): LoginOk? {
        val token = auth.token ?: return null
        val r = call(builder("/api/users/me").get().build())
        if (r !is Http.Ok) return null
        return try {
            val user = AppJson.parseToJsonElement(r.body).jsonObject["user"] as? JsonObject ?: return null
            LoginOk(
                token = token,
                userId = user["id"]?.jsonPrimitive?.intOrNull ?: return null,
                name = user["name"]?.jsonPrimitive?.contentOrNull,
                clubId = clubOf(user),
                roles = rolesOf(user),
                clubFuncties = stringsOf(user, "clubFuncties"),
            )
        } catch (_: Exception) {
            null
        }
    }

    /**
     * Demoruimte: inloggen als een demorol, zonder wachtwoord (`POST /api/demoruimte/als`, enkel op de
     * demo-omgeving). De server geeft de sessie als cookie terug; die is hetzelfde JWT als bij een gewone login.
     * Vraagt de demo een toegangscode, dan sturen we dezelfde cookie mee als de website ([DemoAccess]).
     */
    suspend fun loginDemo(server: String, rol: String, code: String?): Result<LoginOk> {
        val b = Request.Builder().url(server.trimEnd('/') + "/api/demoruimte/als")
            .header("Accept", "application/json")
            .header("User-Agent", BuildInfo.AGENT)
        if (!code.isNullOrBlank()) b.header("Cookie", "${DemoAccess.COOKIE}=${DemoAccess.hash(code)}")
        val req = b.post(buildJsonObject { put("rol", rol) }.toString().toRequestBody(json)).build()
        val raw = withContext(Dispatchers.IO) {
            val c = http.newCall(req)
            val handle = coroutineContext[Job]!!.invokeOnCompletion { c.cancel() }
            try {
                c.execute().use { r -> Triple(r.code, r.body?.string().orEmpty(), r.headers("Set-Cookie")) }
            } catch (_: IOException) {
                null
            } finally {
                handle.dispose()
            }
        } ?: return Result.failure(IOException("Geen verbinding met de server."))
        val (status, body, cookies) = raw
        if (status != 200) {
            val msg = errorMessage(body)
            return Result.failure(
                when (status) {
                    404 -> LoginDenied(
                        if (code.isNullOrBlank()) "De demo vraagt een toegangscode: vul ze hieronder in (Railway → DEMO_TOEGANGSCODE)."
                        else "Geen toegang: de toegangscode klopt niet, of dit is geen demo-adres.",
                    )
                    else -> IOException(msg ?: "Fout $status")
                },
            )
        }
        val token = DemoAccess.tokenFromCookies(cookies) ?: return Result.failure(IOException("De demo gaf geen sessie terug."))
        return Result.success(LoginOk(token = token, userId = -1, name = null))
    }

    suspend fun login(server: String, email: String, password: String): Result<LoginOk> {
        val req = Request.Builder().url(server.trimEnd('/') + "/api/users/login")
            .header("Accept", "application/json")
            .post(buildJsonObject { put("email", email); put("password", password) }.toString().toRequestBody(json))
            .build()
        return when (val r = call(req)) {
            is Http.Ok -> try {
                val o = AppJson.parseToJsonElement(r.body).jsonObject
                val user = o["user"]?.jsonObject
                Result.success(
                    LoginOk(
                        token = o["token"]!!.jsonPrimitive.content,
                        userId = user?.get("id")?.jsonPrimitive?.intOrNull ?: -1,
                        name = user?.get("name")?.jsonPrimitive?.contentOrNull,
                        clubId = clubOf(user),
                        roles = rolesOf(user),
                        clubFuncties = stringsOf(user, "clubFuncties"),
                    ),
                )
            } catch (e: Exception) {
                Result.failure(IOException("Onverwacht antwoord bij het inloggen."))
            }
            is Http.Fail -> Result.failure(
                if (r.code == 401 || r.code == 400) LoginDenied("Inloggen mislukt — controleer je e-mail en wachtwoord.")
                else IOException(r.message),
            )
            is Http.Net -> Result.failure(IOException("Geen verbinding met de server."))
        }
    }
}

/** De server weigerde de inloggegevens (iets anders dan: de server niet bereiken). */
class LoginDenied(message: String) : IOException(message)

/**
 * Payload-REST-antwoord van `/api/matches` naar rijen. Demo- en analysewedstrijden horen niet in de
 * lijst (zoals op de website: scorekeeper/page.tsx); ploegnamen vallen terug op de titel
 * "Thuis — Uit" als de relatie niet uitgeklapt kwam.
 */
internal fun parseMatchesBody(body: String): MatchPage {
    val root = AppJson.parseToJsonElement(body).jsonObject
    val rows = (root["docs"] as? JsonArray ?: JsonArray(emptyList())).mapNotNull { el ->
        val o = el.jsonObject
        if (o["isDemo"]?.jsonPrimitive?.booleanOrNull == true || o["analyseOnly"]?.jsonPrimitive?.booleanOrNull == true) {
            return@mapNotNull null
        }
        val id = o["id"]?.jsonPrimitive?.intOrNull ?: return@mapNotNull null
        val title = o["title"]?.jsonPrimitive?.contentOrNull
        fun team(key: String, titleIdx: Int): String =
            (o[key] as? JsonObject)?.get("name")?.jsonPrimitive?.contentOrNull
                ?: title?.split(" — ")?.getOrNull(titleIdx)
                ?: "?"
        // De club van een ploeg: een id (depth 1) of — bij een dieper antwoord — een uitgeklapt object.
        fun club(key: String): Int? = when (val c = (o[key] as? JsonObject)?.get("club")) {
            is JsonObject -> c["id"]?.jsonPrimitive?.intOrNull
            is JsonPrimitive -> c.intOrNull
            else -> null
        }
        MatchRow(
            id = id,
            dateIso = o["date"]?.jsonPrimitive?.contentOrNull,
            status = o["status"]?.jsonPrimitive?.contentOrNull ?: "scheduled",
            reeks = o["reeks"]?.jsonPrimitive?.contentOrNull,
            home = team("homeTeam", 0),
            away = team("awayTeam", 1),
            cancelled = o["afgelast"]?.jsonPrimitive?.booleanOrNull == true,
            homeClub = club("homeTeam"),
            awayClub = club("awayTeam"),
        )
    }
    return MatchPage(rows, root["hasNextPage"]?.jsonPrimitive?.booleanOrNull == true)
}

/** Een club zoals de logo-badge ze nodig heeft. */
@kotlinx.serialization.Serializable
data class ClubLook(
    val id: Int,
    val name: String,
    val logoUrl: String? = null,
    val fit: LogoFit? = null,
    val color: String? = null,
)

/** `/api/clubs` → clubs. Een geüpload logo (`logo.url`) gaat voor op een externe `logoUrl` (clubLogoUrl in match-engine.ts). */
internal fun parseClubsBody(body: String): List<ClubLook> {
    val root = AppJson.parseToJsonElement(body).jsonObject
    return (root["docs"] as? JsonArray ?: JsonArray(emptyList())).mapNotNull { el ->
        val o = el.jsonObject
        val id = o["id"]?.jsonPrimitive?.intOrNull ?: return@mapNotNull null
        val uploaded = ((o["logo"] as? JsonObject)?.get("url") as? JsonPrimitive)?.contentOrNull
        val external = (o["logoUrl"] as? JsonPrimitive)?.contentOrNull?.trim()?.ifEmpty { null }
        fun num(k: String, d: Double) = (o[k] as? JsonPrimitive)?.contentOrNull?.toDoubleOrNull() ?: d
        val zoom = num("logoZoom", 1.0).coerceIn(1.0, 3.0)
        val ox = num("logoOffsetX", 0.0).coerceIn(-50.0, 50.0)
        val oy = num("logoOffsetY", 0.0).coerceIn(-50.0, 50.0)
        ClubLook(
            id = id,
            name = (o["name"] as? JsonPrimitive)?.contentOrNull ?: "",
            logoUrl = uploaded ?: external,
            fit = if (zoom == 1.0 && ox == 0.0 && oy == 0.0) null else LogoFit(zoom, ox, oy),
            color = (o["colorPrimary"] as? JsonPrimitive)?.contentOrNull,
        )
    }
}

object BuildInfo {
    /** Het versienummer van déze app (per product, zie build.gradle.kts). */
    val VERSION: String = be.krachtbal.aantekenaar.BuildConfig.VERSION_NAME

    /** Is dit het officiële federatiepakket (volledige wedstrijddag) i.p.v. de tafel-app? */
    val FEDERATIE: Boolean = be.krachtbal.aantekenaar.BuildConfig.FEDERATIE

    /** User-agent: zo ziet de server (en zijn log) welke app een verzoek deed. */
    val AGENT: String = (if (FEDERATIE) "KrachtbalFederatie/" else "KrachtbalAantekenaar/") + VERSION
}
