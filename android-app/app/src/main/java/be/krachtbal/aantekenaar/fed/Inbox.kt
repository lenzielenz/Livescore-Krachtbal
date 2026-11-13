package be.krachtbal.aantekenaar.fed

import be.krachtbal.aantekenaar.data.Api
import be.krachtbal.aantekenaar.data.AppJson
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.Http
import be.krachtbal.aantekenaar.data.Reauth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
import java.io.IOException
import java.util.concurrent.TimeUnit

// Wat de app buiten de wedstrijddag nog doet: je meldingen (🔔, zoals op de website), het medisch attest bezorgen
// (/api/attest, dezelfde route als de publieke link) en het wedstrijdblad als PDF.

private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()

private fun JsonObject.tekst(k: String): String? = (this[k] as? JsonPrimitive)?.contentOrNull

// ── Meldingen (src/app/api/meldingen/route.ts) ─────────────────────────────────────────────────────────

data class Melding(val id: Int, val titel: String, val tekst: String?, val url: String?, val gelezen: Boolean, val op: String?)

/** `{ meldingen: [{ id, titel, tekst, url, gelezen, op }] }` → de lijst (onleesbare regels vallen weg). */
fun parseMeldingen(body: String): List<Melding> = try {
    (AppJson.parseToJsonElement(body).jsonObject["meldingen"] as? JsonArray).orEmpty().mapNotNull { el ->
        val o = el as? JsonObject ?: return@mapNotNull null
        val id = (o["id"] as? JsonPrimitive)?.intOrNull ?: (o["id"] as? JsonPrimitive)?.contentOrNull?.toIntOrNull() ?: return@mapNotNull null
        Melding(
            id = id,
            titel = o.tekst("titel").orEmpty(),
            tekst = o.tekst("tekst")?.takeIf { it.isNotBlank() },
            url = o.tekst("url")?.takeIf { it.isNotBlank() },
            gelezen = (o["gelezen"] as? JsonPrimitive)?.booleanOrNull == true,
            op = o.tekst("op"),
        )
    }
} catch (_: Exception) {
    emptyList()
}

/** `{ ongelezen: n }` → n, of 0. */
fun parseTelling(body: String): Int = try {
    (AppJson.parseToJsonElement(body).jsonObject["ongelezen"] as? JsonPrimitive)?.intOrNull ?: 0
} catch (_: Exception) {
    0
}

suspend fun Api.meldingen(): Fetch<List<Melding>> =
    when (val r = authed { builder("/api/meldingen").get().build() }) {
        is Http.Ok -> Fetch.Ok(parseMeldingen(r.body))
        is Http.Fail -> Fetch.Err(r.message)
        is Http.Net -> Fetch.Err("Geen verbinding met de server.")
    }

/** Het aantal ongelezen meldingen, of null als de server niet bereikbaar is (dan blijft de badge zoals ze was). */
suspend fun Api.meldingenTelling(): Int? =
    when (val r = authed { builder("/api/meldingen?telling=1").get().build() }) {
        is Http.Ok -> parseTelling(r.body)
        else -> null
    }

/** Meldingen als gelezen markeren: [ids], of alle als [ids] null is. */
suspend fun Api.meldingenGelezen(ids: List<Int>?): Boolean {
    val body = buildJsonObject {
        if (ids == null) put("gelezen", "alle") else put("gelezen", buildJsonArray { ids.forEach { add(JsonPrimitive(it)) } })
    }
    return authed { builder("/api/meldingen").post(body.toString().toRequestBody(JSON_TYPE)).build() } is Http.Ok
}

// ── Medisch attest bezorgen (src/app/api/attest/route.ts → PubliekUitkomst) ───────────────────────────

sealed interface AttestUitkomst {
    /** Bewaard. [status] "goedgekeurd" (alles stond juist) of "nakijken" (de federatie kijkt het na). */
    data class Ontvangen(val status: String, val naam: String, val reden: String?, val seizoen: String?, val meldingen: List<String>) : AttestUitkomst {
        val goedgekeurd: Boolean get() = status == "goedgekeurd"
    }

    /** Niet gelukt, met de uitleg van de server. */
    data class Fout(val tekst: String) : AttestUitkomst

    /** Geen lid gevonden (blanco attest of geen QR): vraag naam en geboortedatum en verstuur opnieuw. */
    data class Gegevens(val blanco: Boolean) : AttestUitkomst
}

fun parseAttest(body: String): AttestUitkomst = try {
    val o = AppJson.parseToJsonElement(body).jsonObject
    val ok = (o["ok"] as? JsonPrimitive)?.booleanOrNull == true
    when {
        ok -> AttestUitkomst.Ontvangen(
            status = o.tekst("status") ?: "nakijken",
            naam = o.tekst("naam").orEmpty(),
            reden = o.tekst("reden"),
            seizoen = o.tekst("seizoen"),
            meldingen = (o["meldingen"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull },
        )
        o.tekst("nodig") == "gegevens" -> AttestUitkomst.Gegevens((o["blanco"] as? JsonPrimitive)?.booleanOrNull == true)
        else -> AttestUitkomst.Fout(o.tekst("fout") ?: o.tekst("error") ?: "Het lukte niet. Probeer opnieuw.")
    }
} catch (_: Exception) {
    AttestUitkomst.Fout("Het antwoord van de server was onleesbaar. Probeer opnieuw.")
}

/** De gegevens van het lid bij een blanco attest. */
data class AttestGegevens(val naam: String, val geboortedatum: String, val club: String, val email: String)

/**
 * Het attest opladen. [code] = de code van het lid (uit zijn QR-link), als je die kent; anders leest de server de QR
 * op de foto. Ingelogd: de server onthoudt wie het opstuurde.
 */
suspend fun Api.attestBezorgen(foto: Foto, code: String?, gegevens: AttestGegevens?): AttestUitkomst {
    val body = MultipartBody.Builder().setType(MultipartBody.FORM).apply {
        addFormDataPart("bestand", foto.name, foto.bytes.toRequestBody(foto.mime.toMediaType()))
        if (!code.isNullOrBlank()) addFormDataPart("code", code.trim())
        if (gegevens != null) {
            addFormDataPart("naam", gegevens.naam.trim())
            addFormDataPart("geboortedatum", gegevens.geboortedatum.trim())
            addFormDataPart("club", gegevens.club.trim())
            addFormDataPart("email", gegevens.email.trim())
        }
    }.build()
    // Het lezen van een foto duurt op de server enkele seconden: ruimer wachten dan voor een gewone actie.
    val traag = http.newBuilder().readTimeout(60, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS).callTimeout(90, TimeUnit.SECONDS).build()
    return withContext(Dispatchers.IO) {
        try {
            traag.newCall(builder("/api/attest").post(body).build()).execute().use { r ->
                val tekst = r.body?.string().orEmpty()
                if (r.code == 429) AttestUitkomst.Fout(parseAttest(tekst).let { (it as? AttestUitkomst.Fout)?.tekst } ?: "Even geduld: te veel attesten na elkaar.")
                else parseAttest(tekst)
            }
        } catch (_: IOException) {
            AttestUitkomst.Fout("Geen verbinding met de server. Kijk of je internet hebt en probeer opnieuw.")
        }
    }
}

/** Haalt een QR-code van een lid uit een link of tekst (".../k/K1A-ABCDEFGH" → "K1A-ABCDEFGH"), of null. */
fun kaartCodeUit(tekst: String?): String? =
    Regex("""(?:^|/k/|\s)(K[0-9A-Z]{1,10}\s*-?\s*[0-9A-Z]{8})(?:$|[\s/?#])""", RegexOption.IGNORE_CASE).find(tekst.orEmpty().trim())
        ?.groupValues?.get(1)?.replace(Regex("\\s"), "")?.uppercase()

// ── Het wedstrijdblad als PDF (/api/matchsheet/{id}/pdf) ──────────────────────────────────────────────

sealed interface Download {
    class Ok(val bytes: ByteArray) : Download
    data class Fail(val message: String) : Download
}

/** De PDF van het blad (binair, dus niet via [Api.call] die tekst leest). Bij een verlopen sessie: één keer opnieuw. */
suspend fun Api.bladPdf(matchId: Int): Download = withContext(Dispatchers.IO) {
    val traag = http.newBuilder().readTimeout(40, TimeUnit.SECONDS).callTimeout(60, TimeUnit.SECONDS).build()
    suspend fun poging(): Pair<Int, ByteArray?> = withContext(Dispatchers.IO) {
        traag.newCall(builder("/api/matchsheet/$matchId/pdf").header("Accept", "application/pdf").get().build()).execute().use { r ->
            r.code to r.body?.bytes()
        }
    }
    try {
        val token = auth.token
        var (code, bytes) = poging()
        if (code == 401 && Graph.authRepo.reauthenticate(token) == Reauth.OK) {
            val tweede = poging()
            code = tweede.first
            bytes = tweede.second
        }
        when {
            code in 200..299 && bytes != null && bytes.size > 4 && String(bytes, 0, 4) == "%PDF" -> Download.Ok(bytes)
            code == 401 -> Download.Fail("Je bent uitgelogd. Log opnieuw in.")
            code == 403 -> Download.Fail("Je mag het blad van deze wedstrijd niet zien.")
            code == 404 -> Download.Fail("Er is nog geen wedstrijdblad.")
            else -> Download.Fail(bytes?.let { b -> runCatching { (AppJson.parseToJsonElement(String(b)).jsonObject["error"] as? JsonPrimitive)?.contentOrNull }.getOrNull() } ?: "Het blad kon niet geladen worden (fout $code).")
        }
    } catch (_: IOException) {
        Download.Fail("Geen verbinding met de server.")
    }
}
