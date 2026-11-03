package be.krachtbal.aantekenaar.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.util.UUID

/**
 * Wat een klokactie op de server moet doen. `secondsAtTap` is de klokstand op het moment van de tik;
 * als de klok daarna LOOPT, rekenen we bij het VERZENDEN de verstreken monotone tijd erbij. Zo staat
 * de klok van de kijkers juist, ook als de tik pas seconden later aankomt (zwak veldbereik). Een
 * pauze blijft de waarde van het moment van de tik: de klok stond toen stil.
 */
@Serializable
data class ClockSpec(val secondsAtTap: Double, val running: Boolean)

/**
 * Eén aantekenactie in de wachtrij. Dezelfde acties als `/api/match/[id]/action` van de website
 * (snelscoremodus): simplestart, simplegoal, simpleundo, simplecross, simpletimeout, simplerefstop,
 * simplehalf, clock, finish, reopen, reset — en `setlineup` (de veldspelers van een ploeg, ook bij een wissel).
 *
 * `opId` maakt heruitzenden veilig: de server (processed-ops) telt een tweede keer niet dubbel.
 */
@Serializable
data class Op(
    val opId: String,
    val action: String,
    val side: String? = null,
    val points: Int? = null,
    val delta: Int? = null,
    val playerId: Int? = null,
    val shirtNumber: Int? = null,
    val playerName: String? = null,
    /** Bij `setlineup`: de spelers die op het veld staan (precies 4, of minder als er maar 3 zijn). */
    val playerIds: List<Int>? = null,
    val clock: ClockSpec? = null,
    /** Muurklok van het toestel op het moment van de tik. */
    val tapWall: Long,
    /** Monotone klok op het moment van de tik. */
    val tapElapsed: Long,
    /** Helft en klokminuut op het moment van de tik (voor de optimistische weergave). */
    val tapHalf: Int = 1,
    val tapClockSec: Int = 0,
    /** Na een late start: meteen een klokcorrectie volgen (zie MatchSession). */
    val syncAfter: Boolean = false,
) {
    /** Verandert deze actie de klok/status zodanig dat we de klok van de server niet mogen overnemen? */
    val touchesClock: Boolean
        get() = action in CLOCK_ACTIONS

    /** De JSON voor de server. Klok en tijdstip worden hier berekend, op het moment van VERZENDEN. */
    fun toBody(nowElapsed: Long, toServerTime: (Long) -> Long): JsonObject = buildJsonObject {
        put("action", action)
        put("opId", opId)
        side?.let { put("side", it) }
        points?.let { put("points", it) }
        delta?.let { put("delta", it) }
        playerId?.let { put("playerId", it) }
        shirtNumber?.let { put("shirtNumber", it) }
        playerName?.let { put("playerName", it) }
        playerIds?.let { ids -> put("playerIds", buildJsonArray { ids.forEach { add(JsonPrimitive(it)) } }) }
        clock?.let {
            val extra = if (it.running) maxOf(0L, nowElapsed - tapElapsed) / 1000.0 else 0.0
            put("running", it.running)
            put("seconds", Math.round((it.secondsAtTap + extra) * 1000.0) / 1000.0)
        }
        // De server begrenst `at` zelf (nooit in de toekomst, nooit vóór de laatste klokwijziging).
        put("at", toServerTime(tapWall))
    }

    companion object {
        val CLOCK_ACTIONS = setOf("simplestart", "clock", "simplehalf", "finish", "reopen", "reset")

        fun newId(): String = UUID.randomUUID().toString()
    }
}

/** Een actie die de server definitief weigerde (4xx). Blijft zichtbaar tot de gebruiker kiest. */
@Serializable
data class Rejected(val op: Op, val message: String)

/**
 * De getoonde stand = de laatst bevestigde serverstand + alles wat nog in de wachtrij staat.
 * Zo loopt de score meteen door, ook zonder internet, en na een bevestiging klopt ze vanzelf
 * (de server is altijd de waarheid; dit is enkel de voorspelling van wat hij zal antwoorden).
 */
object Overlay {
    fun apply(base: MatchState, queue: List<Op>): MatchState {
        if (queue.isEmpty()) return base
        // Ondoen-stapel per ploeg: begint met wat de server als laatste doelpunt kent. Een offline
        // gescoord doelpunt komt erop, een ondoen haalt het eraf — zo kan je offline meerdere keren
        // terugnemen en klopt "wat verdwijnt er" zoals op de website.
        val stacks = mapOf(
            Side.HOME to listOfNotNull(base.lastSimpleGoalBySide.home).toMutableList(),
            Side.AWAY to listOfNotNull(base.lastSimpleGoalBySide.away).toMutableList(),
        )
        var s = base
        for (op in queue) s = applyOne(s, op, stacks)
        return s.copy(
            lastSimpleGoalBySide = Sides(stacks.getValue(Side.HOME).lastOrNull(), stacks.getValue(Side.AWAY).lastOrNull()),
        )
    }

    private fun applyOne(s: MatchState, op: Op, stacks: Map<Side, MutableList<GoalView>>): MatchState {
        val side = Side.fromWire(op.side)
        return when (op.action) {
            "simplestart" -> s.copy(match = s.match.copy(status = "live", currentHalf = 1))
            "simplegoal" -> {
                if (side == null) return s
                val pts = if (op.points == 2) 2 else 1
                stacks.getValue(side).add(GoalView(side.wire, pts, op.tapHalf, op.tapClockSec, op.playerName))
                s.copy(
                    score = s.score.with(side, s.score[side] + pts),
                    match = if (s.match.status == "live") s.match else s.match.copy(status = "live"),
                )
            }
            "simpleundo" -> {
                if (side == null) return s
                val stack = stacks.getValue(side)
                val last = stack.removeLastOrNull() ?: return s
                s.copy(score = s.score.with(side, maxOf(0, s.score[side] - last.points)))
            }
            "simplecross" -> {
                if (side == null) return s
                val d = if ((op.delta ?: 1) < 0) -1 else 1
                s.copy(crosses = s.crosses.with(side, maxOf(0, s.crosses[side] + d)))
            }
            "simpletimeout" -> {
                if (side == null) return s
                val d = if ((op.delta ?: 1) < 0) -1 else 1
                s.copy(timeouts = s.timeouts.with(side, (s.timeouts[side] + d).coerceIn(0, 2)))
            }
            "simplerefstop" -> {
                val d = if ((op.delta ?: 1) < 0) -1 else 1
                s.copy(refereeStops = maxOf(0, s.refereeStops + d))
            }
            "simplehalf" -> {
                if (s.match.currentHalf >= 2) return s
                stacks.values.forEach { it.clear() }
                // Tellers van time-outs en scheidsrechter-minuten gelden per helft.
                s.copy(
                    match = s.match.copy(currentHalf = 2),
                    timeouts = Sides(0, 0),
                    refereeStops = 0,
                )
            }
            // Een wissel: de veldspelers veranderen meteen, ook als de tik pas later aankomt.
            "setlineup" -> {
                if (side == null) return s
                val ids = op.playerIds ?: return s
                s.copy(lineup = s.lineup.with(side, ids))
            }
            "finish" -> s.copy(match = s.match.copy(status = "finished"))
            "reopen" -> s.copy(match = s.match.copy(status = "live"))
            "reset" -> {
                stacks.values.forEach { it.clear() }
                s.copy(
                    match = s.match.copy(status = "scheduled", currentHalf = 1),
                    score = Sides(0, 0),
                    crosses = Sides(0, 0),
                    timeouts = Sides(0, 0),
                    refereeStops = 0,
                )
            }
            else -> s
        }
    }
}
