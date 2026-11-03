package be.krachtbal.aantekenaar.fed

import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.MatchState
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.data.Sides
import be.krachtbal.aantekenaar.data.StateResult
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Alles wat de schermen van één wedstrijddag nodig hebben: de wedstrijd zelf (publiek), het blad (enkel wie het mag
 * lezen: scheidsrechter, tafel, clubstaf, federatie) en de selectie van beide kanten (alleen wie ze mag zien).
 * Voor wie het blad niet mag lezen (de coach) volgt de status uit de selectie van zijn eigen ploeg.
 * Daaruit volgen de stappen ([Steps.plan]).
 *
 * [withRosters]: haal de spelerslijsten (namen, blokkades) ook op als het blad leesbaar is — nodig voor de
 * controle, "wie speelde" en de blessure. De hub zelf heeft ze niet nodig.
 */
class HubModel(val matchId: Int, private val withRosters: Boolean = false) {
    data class UI(
        val loading: Boolean = true,
        /** Een fout bij het laden; de vorige gegevens blijven dan staan. */
        val error: String? = null,
        val state: MatchState? = null,
        val cancelled: Boolean = false,
        val sheet: SheetView? = null,
        /** De selectie per kant, zoals de server ze geeft (null = niet jouw ploeg, of niet nodig). */
        val lineups: Sides<LineupInfo?> = Sides(null, null),
        val steps: List<Step> = emptyList(),
    ) {
        /** Naam van een speler, uit de spelerslijst van de ploeg waar hij op staat. */
        fun nameOf(side: Side, player: Int): String? = lineups[side]?.players?.firstOrNull { it.id == player }?.name

        val facts: MatchFacts?
            get() = state?.let { MatchFacts(it.match.status, cancelled, it.teams.home.name, it.teams.away.name, it.match.reeks) }
    }

    private val _ui = MutableStateFlow(UI())
    val ui: StateFlow<UI> = _ui.asStateFlow()

    // Eén herlaadbeurt tegelijk: de ronde van 10 s en een handmatige vernieuwing mogen elkaar niet overlappen.
    private val mutex = Mutex()

    suspend fun reload() = mutex.withLock {
        val api = Graph.api
        // De drie onafhankelijke lezingen tegelijk: zo wacht de hub niet drie keer na elkaar op het netwerk.
        val (stateRes, cancelled, sheetRes) = coroutineScope {
            val a = async { api.fetchState(matchId) }
            val b = async { api.fetchCancelled(matchId) }
            val c = async { api.fetchSheet(matchId) }
            Triple(a.await(), b.await(), c.await())
        }
        val st = when (stateRes) {
            is StateResult.Ok -> stateRes.state
            is StateResult.Err -> {
                _ui.update { it.copy(loading = false, error = stateRes.message) }
                return@withLock
            }
        }
        var error: String? = null
        var sheet: SheetView? = null
        var lineups: Sides<LineupInfo?> = Sides(null, null)

        suspend fun lineupsOrNull(): Sides<LineupInfo?> {
            // 403 = niet jouw ploeg: dan blijft die kant leeg. Een echte fout tonen we, maar de hub werkt verder.
            suspend fun one(side: Side): LineupInfo? = when (val l = api.fetchLineup(matchId, side)) {
                is Fetch.Ok -> l.value
                is Fetch.Forbidden -> null
                is Fetch.Err -> { error = l.message; null }
            }
            return coroutineScope {
                val h = async { one(Side.HOME) }
                val a = async { one(Side.AWAY) }
                Sides(h.await(), a.await())
            }
        }

        when (val s = sheetRes) {
            is Fetch.Ok -> {
                sheet = s.value
                // Nog geen blad? Dan maakt de selectie-route het aan (zoals het scheidsrechterscherm op de site).
                if (sheet == null || withRosters) lineups = lineupsOrNull()
            }
            is Fetch.Forbidden -> lineups = lineupsOrNull()
            is Fetch.Err -> error = s.message
        }

        val kept = _ui.value.sheet.takeIf { error != null }
        val shown = sheet ?: kept
        val next = UI(
            loading = false,
            error = error,
            state = st,
            cancelled = cancelled,
            sheet = shown,
            lineups = lineups,
        )
        _ui.value = next.copy(steps = Steps.plan(next.facts!!, shown, lineups))
    }
}
