package be.krachtbal.aantekenaar.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** Eén JSON-configuratie voor de hele app: de server mag velden toevoegen zonder dat de app breekt. */
val AppJson = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
    encodeDefaults = true
}

enum class Side(val wire: String) {
    HOME("home"),
    AWAY("away");

    val other: Side get() = if (this == HOME) AWAY else HOME

    companion object {
        fun fromWire(s: String?): Side? = entries.firstOrNull { it.wire == s }
    }
}

@Serializable
data class Sides<T>(val home: T, val away: T) {
    operator fun get(s: Side): T = if (s == Side.HOME) home else away
    fun with(s: Side, v: T): Sides<T> = if (s == Side.HOME) copy(home = v) else copy(away = v)
}

// ── Spiegel van MatchState uit src/lib/match-engine.ts (enkel wat de app nodig heeft) ─────────────

@Serializable
data class MatchInfo(
    val id: Int,
    val title: String? = null,
    val status: String = "scheduled",
    val category: String = "senioren",
    val reeks: String? = null,
    val currentHalf: Int = 1,
    val clockSeconds: Double = 0.0,
    val clockRunning: Boolean = false,
    val clockUpdatedAt: String? = null,
    val finishedAt: String? = null,
    val date: String? = null,
)

@Serializable
data class TeamColors(val primary: String? = null, val secondary: String? = null)

@Serializable
data class TeamInfo(
    val id: Int,
    val name: String,
    val logoUrl: String? = null,
    /** Zoom en verschuiving van het logo binnen de ronde badge (lib/logo-fit.ts). */
    val logoFit: LogoFit? = null,
    val colors: TeamColors? = null,
)

/** `transform: translate(offsetX%, offsetY%) scale(zoom)` van het logo in de badge. */
@Serializable
data class LogoFit(
    val zoom: Double = 1.0,
    val offsetX: Double = 0.0,
    val offsetY: Double = 0.0,
)

/** Het laatste doelpunt van een ploeg — wat de ondoen-pijl zou wegnemen. */
@Serializable
data class GoalView(
    val side: String? = null,
    val points: Int = 1,
    val half: Int = 1,
    val clock: Int = 0,
    val scorer: String? = null,
)

@Serializable
data class Trust(
    val label: String = "unconfirmed",
    val emoji: String = "",
    val short: String = "",
    val long: String = "",
    val scorerId: Int? = null,
    val scorerName: String? = null,
    val claimActive: Boolean = false,
    val laatstActief: Long? = null,
)

@Serializable
data class MatchState(
    val match: MatchInfo,
    val teams: Sides<TeamInfo>,
    val lineup: Sides<List<Int>> = Sides(emptyList(), emptyList()),
    val captain: Sides<Int?> = Sides(null, null),
    val score: Sides<Int> = Sides(0, 0),
    val crosses: Sides<Int> = Sides(0, 0),
    val timeouts: Sides<Int> = Sides(0, 0),
    val refereeStops: Int = 0,
    val lastSimpleGoalBySide: Sides<GoalView?> = Sides(null, null),
    val atHalfTime: Boolean = false,
    val trust: Trust = Trust(),
) {
    val isLive: Boolean get() = match.status == "live"
    val isFinished: Boolean get() = match.status == "finished"
}

/** Payload van het SSE-event `update`: `{ state, timeline }`. */
@Serializable
data class StreamUpdate(val state: MatchState? = null)

/** Een speler uit de ploegkeuze (enkel nodig in federatiemodus, waar een scorer verplicht is). */
@Serializable
data class Player(val id: Int, val name: String, val shirtNumber: Int, val teamId: Int)

/** Eén rij in de wedstrijdenlijst. */
data class MatchRow(
    val id: Int,
    val dateIso: String?,
    val status: String,
    val reeks: String?,
    val home: String,
    val away: String,
    val cancelled: Boolean,
    /** Club-id's (voor het logo uit de [ClubDirectory]); null als de server ze niet meegaf. */
    val homeClub: Int? = null,
    val awayClub: Int? = null,
)

/** Speelduur van één helft: 2×20 min jeugd (U8–U16), 2×25 min U18/U20/senioren (src/lib/categories.ts). */
fun halfDurationSeconds(category: String): Int {
    val youth = setOf("U8", "U10", "U12", "U14", "U16")
    return (if (category in youth) 20 else 25) * 60
}
