package be.krachtbal.aantekenaar.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.IOException
import kotlin.coroutines.coroutineContext

data class SseEvent(val event: String, val data: String, val id: String?)

/** Server-Sent Events volgens de spec: velden `event`/`data`/`id`, een lege regel sluit een bericht. */
class SseParser {
    private var event: String? = null
    private var id: String? = null
    private val data = StringBuilder()
    private var hasData = false

    /** Voed één regel (zonder regeleinde). Geeft een event terug als deze regel het bericht afsluit. */
    fun feed(line: String): SseEvent? {
        if (line.isEmpty()) {
            if (!hasData && event == null) return null
            val e = SseEvent(event ?: "message", data.toString(), id)
            event = null
            data.setLength(0)
            hasData = false
            return e
        }
        if (line.startsWith(":")) return null // commentaar
        val colon = line.indexOf(':')
        val field = if (colon < 0) line else line.substring(0, colon)
        var value = if (colon < 0) "" else line.substring(colon + 1)
        if (value.startsWith(" ")) value = value.substring(1)
        when (field) {
            "event" -> event = value
            "data" -> {
                if (hasData) data.append('\n')
                data.append(value)
                hasData = true
            }
            "id" -> id = value
        }
        return null
    }
}

/**
 * Houdt één SSE-verbinding open tot ze wegvalt. De leestime-out van de client (45 s) is de
 * waakhond: de server stuurt elke 15 s een `ping`, dus 45 s stilte = dode lijn. Typisch na een gsm
 * die sliep: de socket lijkt open maar er komt niets meer door.
 *
 * Gooit altijd (IOException) bij het wegvallen; de aanroeper herverbindt met backoff. Een
 * geannuleerde coroutine sluit de socket, zodat het blokkerende lezen meteen stopt.
 */
suspend fun streamSse(client: OkHttpClient, request: Request, onEvent: (SseEvent) -> Unit) {
    withContext(Dispatchers.IO) {
        val call = client.newCall(request)
        val handle = coroutineContext[Job]!!.invokeOnCompletion { call.cancel() }
        try {
            call.execute().use { r ->
                if (!r.isSuccessful) throw IOException("SSE HTTP ${r.code}")
                val reader = r.body?.charStream()?.buffered() ?: throw IOException("SSE zonder body")
                val parser = SseParser()
                while (true) {
                    val line = reader.readLine() ?: throw IOException("SSE gesloten")
                    parser.feed(line)?.let(onEvent)
                }
            }
        } finally {
            handle.dispose()
        }
    }
}
