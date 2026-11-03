package be.krachtbal.aantekenaar.data

import java.time.Instant
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import kotlin.math.abs

/**
 * Schat hoeveel de muurklok van de server voor- of achterloopt op die van het toestel.
 *
 * Nodig om (a) het tijdstip van een tik (`at`) in servertijd naar de server te sturen en (b) de
 * klok van de server (`clockUpdatedAt`) in het lokale anker te vertalen. Twee bronnen:
 *  1. De HTTP-`Date`-header van élk antwoord: slechts op de seconde nauwkeurig (±0,5 s), maar altijd er.
 *  2. Het `clockUpdatedAt` dat de server net stempelde bij onze eigen klokactie: op de milliseconde
 *     nauwkeurig, min de halve heen-en-terugtijd. Dat wint, en de laagste RTT wint van een hogere.
 */
class ServerClock(private val wallNow: () -> Long = { Time.wall() }) {
    @Volatile var offsetMs: Long = 0
        private set
    @Volatile private var precise = false
    @Volatile private var bestRttMs = Long.MAX_VALUE
    @Volatile private var preciseAtWall = 0L

    val isPrecise: Boolean get() = precise

    /** Servertijd (ms) op dit moment, volgens onze schatting. */
    fun serverNowMs(): Long = wallNow() + offsetMs

    /** Zet een tijdstip van het toestel (muurklok) om naar servertijd. */
    fun toServerTime(deviceWallMs: Long): Long = deviceWallMs + offsetMs

    /** Zwakke bron: de Date-header van een antwoord dat tussen [sentWall] en [recvWall] onderweg was. */
    fun onDateHeader(header: String?, sentWall: Long, recvWall: Long) {
        if (precise || header == null) return
        val serverMs = parseHttpDate(header) ?: return
        // De header kapt af op de seconde: de echte servertijd ligt in [serverMs, serverMs + 1000).
        val mid = (sentWall + recvWall) / 2
        offsetMs = (serverMs + 500) - mid
    }

    /** Sterke bron: [stampMs] is door de server gestempeld terwijl ons verzoek onderweg was. */
    fun onServerStamp(stampMs: Long, sentWall: Long, recvWall: Long) {
        val rtt = recvWall - sentWall
        if (rtt < 0) return
        val stale = wallNow() - preciseAtWall > 10 * 60_000
        if (precise && !stale && rtt > bestRttMs + 250) return
        val mid = (sentWall + recvWall) / 2
        val candidate = stampMs - mid
        // Sprong van meer dan een uur = onzin (verkeerd veld/tijdzone): negeren.
        if (abs(candidate) > 3_600_000) return
        offsetMs = candidate
        precise = true
        bestRttMs = if (stale) rtt else minOf(rtt, bestRttMs)
        preciseAtWall = wallNow()
    }

    companion object {
        fun parseHttpDate(s: String): Long? = try {
            ZonedDateTime.parse(s, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli()
        } catch (_: Exception) {
            null
        }

        fun parseIso(s: String?): Long? = if (s.isNullOrBlank()) null else try {
            Instant.parse(s).toEpochMilli()
        } catch (_: Exception) {
            null
        }
    }
}
