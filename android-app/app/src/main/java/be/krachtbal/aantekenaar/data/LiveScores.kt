package be.krachtbal.aantekenaar.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.time.LocalDate
import java.time.ZoneId

/**
 * De live-standen op de wedstrijdlijst komen uit dezelfde bron als het bord op de site: de gedeelde dagstream
 * (`/api/live/stream?date=…`, zie src/lib/day-channel.ts). Eén poller op de server telt de standen van álle
 * wedstrijden van de dag in één keer en stuurt ze naar iedereen. Vroeger vroeg de app per lopende wedstrijd
 * apart `/api/match/{id}/state` op — tot twaalf verzoeken per keer laden of zoeken, elk met tientallen queries.
 */
@Serializable
private data class LiveScoreDto(
    val id: Int,
    val status: String = "",
    val score: Sides<Int> = Sides(0, 0),
)

/** De speeldag zoals de server hem telt: Brusselse kalenderdag (`dateStrBE`). */
fun brusselsToday(): String = LocalDate.now(ZoneId.of("Europe/Brussels")).toString()

/**
 * Het `scores`-bericht van de dagstream → de stand van elke wedstrijd die nu live is. Een kapot of leeg bericht
 * geeft een lege lijst: de lijst toont dan gewoon de LIVE-badge zonder stand.
 */
fun parseLiveScores(data: String): Map<Int, Pair<Int, Int>> = try {
    AppJson.decodeFromString(ListSerializer(LiveScoreDto.serializer()), data)
        .filter { it.status == "live" }
        .associate { it.id to (it.score.home to it.score.away) }
} catch (_: Exception) {
    emptyMap()
}
