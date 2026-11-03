package be.krachtbal.aantekenaar.data

import be.krachtbal.aantekenaar.fed.Fetch
import be.krachtbal.aantekenaar.fed.fetchSheet
import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.math.abs

/**
 * Eén wedstrijd die aangetekend wordt. Vervangt wat op de website verspreid zit over
 * SimpleScorekeeper.tsx, use-action-queue.ts, use-live-clock.ts en use-live-stream.ts.
 *
 * Ontwerp (waarom dit stabieler en nauwkeuriger is dan de browser):
 *  • Elke tik gaat eerst naar SCHIJF en pas dan naar het scherm en het netwerk. Wordt de app gedood,
 *    dan staat de tik er bij de volgende start nog.
 *  • Eén verzender, in volgorde, met een vaste opId per tik: de server telt een heruitgezonden tik
 *    niet dubbel. Een tijdelijke fout (geen net, 5xx, time-out) houdt de tik in de wachtrij; enkel
 *    een echte weigering (4xx) haalt hem eruit — en komt zichtbaar in "niet verwerkt".
 *  • De klok is een anker op de MONOTONE tijd (LocalClock): geen netwerk, geen gsm-klok nodig.
 *  • Alles loopt op de hoofdthread (scope = Main.immediate); enkel het netwerk springt naar IO.
 */
class MatchSession(val matchId: Int) {
    private val scope get() = Graph.scope

    val clock = LocalClock()

    data class Ui(
        /** Bevestigde serverstand + wachtrij (zie Overlay). Null zolang er niets geladen is. */
        val state: MatchState? = null,
        val loading: Boolean = true,
        val loadError: String? = null,
        val pending: Int = 0,
        /** Laatste verzoek lukte (of er is niets te versturen). */
        val online: Boolean = true,
        /** De livestream (SSE) is verbonden. */
        val liveLink: Boolean = false,
        val rejected: List<Rejected> = emptyList(),
        /** Oude wachtrij van een vorige sessie: eerst vragen of ze nog verstuurd moet worden. */
        val staleQueue: Boolean = false,
        val needLogin: Boolean = false,
        /** De server zegt dat je deze wedstrijd niet mag aantekenen (403). */
        val notAllowed: String? = null,
        /** Tijdelijke melding bovenaan (bv. overnemen geweigerd). */
        val notice: String? = null,
        /** Federatiemodus: een scorer kiezen is verplicht. */
        val federation: Boolean = false,
        /**
         * De selectie per kant (de spelers op het wedstrijdblad, met het rugnummer van dit blad). Daaruit volgen het veld
         * (4 spelers, enkel zij kunnen scoren) en de bank. Zonder blad: alle spelers van de ploeg.
         */
        val squad: Sides<List<Player>> = Sides(emptyList(), emptyList()),
        val takeoverBusy: Boolean = false,
    )

    private val _ui = MutableStateFlow(Ui())
    val ui: StateFlow<Ui> = _ui.asStateFlow()

    // ── Toestand (enkel op de hoofdthread aangeraakt) ────────────────────────────────────────
    private var server: MatchState? = null
    private val queue = ArrayDeque<Op>()
    private val rejected = mutableListOf<Rejected>()
    private var staleQueue = false
    private var inFlight = false
    private var lastOwn = -1_000_000L
    private var startTapAt = -1_000_000L
    private var attached = 0
    private var lastSse = 0L
    private var sseBackoff = 1_000L
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private var flusher: Job? = null
    private var netWatcher: Job? = null
    private var sseJob: Job? = null
    private var uiJobs: List<Job> = emptyList()

    val isActive: Boolean get() = attached > 0 || queue.isNotEmpty()

    /** Er wacht iets op verzending of op een beslissing van de gebruiker. */
    val needsAttention: Boolean get() = queue.isNotEmpty() || rejected.isNotEmpty() || staleQueue

    init {
        Graph.store.load(matchId)?.let { snap ->
            server = snap.state
            snap.clock?.let(clock::restore)
            queue.addAll(snap.queue)
            rejected.addAll(snap.rejected)
            val oldest = snap.queue.minOfOrNull { it.tapWall }
            staleQueue = oldest != null && Time.wall() - oldest > STALE_QUEUE_MS
        }
        _ui.value = _ui.value.copy(loading = server == null)
        publish()
    }

    /** Klokstand voor de weergave. */
    fun clockSeconds(): Double = clock.value()

    // ── Levenscyclus ─────────────────────────────────────────────────────────────────────────

    fun attach() {
        attached++
        if (attached > 1) return
        ensureFlusher()
        uiJobs = listOf(
            scope.launch { initialLoad() },
            scope.launch { heartbeatLoop() },
            scope.launch { pollLoop() },
        )
        sseJob = scope.launch { sseLoop() }
        Graph.onSessionChanged()
    }

    fun detach() {
        attached = (attached - 1).coerceAtLeast(0)
        if (attached > 0) return
        uiJobs.forEach { it.cancel() }
        uiJobs = emptyList()
        sseJob?.cancel()
        sseJob = null
        setLink(false)
        maybeRelease()
        Graph.onSessionChanged()
    }

    /** Opruimen als er niets meer te versturen of te beslissen valt en niemand kijkt. */
    private fun maybeRelease() {
        if (attached == 0 && queue.isEmpty() && rejected.isEmpty() && !staleQueue) {
            flusher?.cancel()
            netWatcher?.cancel()
            flusher = null
            netWatcher = null
            Graph.dropSession(matchId)
        }
    }

    fun ensureFlusher() {
        if (flusher?.isActive != true) flusher = scope.launch { flusherLoop() }
        if (netWatcher?.isActive != true) {
            netWatcher = scope.launch {
                Graph.network.regained.collect {
                    wake.trySend(Unit)
                    if (attached > 0) restartSse()
                }
            }
        }
    }

    /** Door Graph aangeroepen na een geslaagde login: de wachtrij mag weer proberen. */
    fun kick() {
        _ui.update { it.copy(needLogin = false) }
        wake.trySend(Unit)
    }

    // ── Laden ────────────────────────────────────────────────────────────────────────────────

    private suspend fun initialLoad() {
        scope.launch { loadMode() }
        if (server == null || queue.isEmpty()) refresh() else _ui.update { it.copy(loading = false) }
    }

    private suspend fun loadMode() {
        val mode = Graph.api.fetchScoreMode()?.also { Graph.auth.scoreMode = it } ?: Graph.auth.scoreMode
        _ui.update { it.copy(federation = mode == "federatie") }
        loadPlayersIfNeeded()
    }

    private suspend fun loadPlayersIfNeeded() {
        if (!_ui.value.federation || _ui.value.squad.home.isNotEmpty() || _ui.value.squad.away.isNotEmpty()) return
        loadSquad()
    }

    /**
     * Haalt de selectie op: de spelers op het wedstrijdblad per kant (met het rugnummer van dit blad). Is er geen blad
     * of geen selectie (of mag deze gebruiker ze niet lezen), dan vallen we terug op alle spelers van de ploeg.
     * Wordt ook opnieuw aangeroepen als de wissel- of scorerkeuze opent: de coach kan de selectie nog gewijzigd hebben.
     */
    suspend fun loadSquad() {
        val st = server ?: return
        if (!_ui.value.federation) return
        val sheet = when (val r = Graph.api.fetchSheet(matchId)) {
            is Fetch.Ok -> r.value
            else -> null
        }
        val rows = Sides(sheet?.home.orEmpty(), sheet?.away.orEmpty())
        val squad = if (rows.home.isNotEmpty() || rows.away.isNotEmpty()) {
            val byId = Graph.api.fetchPlayersByIds((rows.home + rows.away).map { it.player }.distinct()).associateBy { it.id }
            fun build(side: Side, teamId: Int) = rows[side].mapNotNull { r ->
                byId[r.player]?.let { p -> p.copy(shirtNumber = r.rugnummer ?: p.shirtNumber, teamId = teamId) }
            }
            Sides(build(Side.HOME, st.teams.home.id), build(Side.AWAY, st.teams.away.id))
        } else {
            val all = Graph.api.fetchPlayers(listOf(st.teams.home.id, st.teams.away.id))
            Sides(all.filter { it.teamId == st.teams.home.id }, all.filter { it.teamId == st.teams.away.id })
        }
        if (squad.home.isNotEmpty() || squad.away.isNotEmpty()) _ui.update { it.copy(squad = squad) }
    }

    /** De spelers die nu op het veld staan (enkel zij kunnen scoren): wat de server zegt, aangevuld met de eerste van de selectie. */
    fun fieldOf(side: Side): List<Player> =
        Field.resolve(_ui.value.squad[side], _ui.value.state?.lineup?.get(side).orEmpty())

    /** Zet de veldspelers van een ploeg (ook een wissel); gaat door dezelfde wachtrij als een doelpunt, dus ook offline. */
    fun setLineup(side: Side, playerIds: List<Int>) {
        if (finishedBlocks()) return
        val st = _ui.value.state
        // De server schrijft een wissel pas op het blad als hij de vorige veldopstelling ook bewaard heeft. Heeft deze tafel nog
        // nooit een veld ingesteld, dan zou de eerste wissel anders niet gelogd worden — en dan weet niemand later dat de
        // speler die eruit ging, speelde. Dus eerst de huidige opstelling vastleggen (voor de server: "geen wijziging").
        if (st != null && st.isLive) {
            val huidig = Field.resolve(_ui.value.squad[side], st.lineup[side]).map { it.id }
            if (huidig.isNotEmpty() && huidig != playerIds) enqueue(makeOp("setlineup", side).copy(playerIds = huidig))
        }
        enqueue(makeOp("setlineup", side).copy(playerIds = playerIds))
    }

    /** Haal de stand op. Een lopende wachtrij gaat voor: de serverstand is dan nog niet "af". */
    private suspend fun refresh(): Boolean = when (val r = Graph.api.fetchState(matchId)) {
        is StateResult.Ok -> {
            if (server == null || (queue.isEmpty() && !inFlight)) {
                server = r.state
                adoptServerClock(r.state)
            }
            _ui.update { it.copy(loading = false, loadError = null) }
            publish()
            loadPlayersIfNeeded()
            true
        }
        is StateResult.Err -> {
            if (server == null) _ui.update { it.copy(loading = false, loadError = r.message) }
            false
        }
    }

    /**
     * Neem de klok van de server over — maar enkel als hij echt afwijkt. Zolang er klokacties in de
     * wachtrij staan is DIT toestel de waarheid. Daarbuiten is onze eigen monotone klok veel
     * gladder dan de server-schatting (die lijdt onder netwerkvertraging), dus we springen pas als
     * de loop-toestand verschilt of de afwijking groter is dan de meetnauwkeurigheid.
     */
    private fun adoptServerClock(s: MatchState) {
        if (queue.any { it.touchesClock }) return
        val m = s.match
        val running = m.clockRunning && m.status == "live"
        val upd = ServerClock.parseIso(m.clockUpdatedAt)
        val serverValue = m.clockSeconds +
            if (running && upd != null) maxOf(0L, Graph.serverClock.serverNowMs() - upd) / 1000.0 else 0.0
        if (clock.isRunning != running || abs(clock.value() - serverValue) > DRIFT_TOLERANCE_S) {
            clock.set(serverValue, running)
        }
    }

    // ── Livestream, hartslag, vangnet ────────────────────────────────────────────────────────

    private suspend fun sseLoop() {
        while (true) {
            val startedAt = Time.elapsed()
            try {
                streamSse(Graph.api.sseHttp, Graph.api.streamRequest(matchId)) { ev -> scope.launch { onSseEvent(ev) } }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // dode lijn of server weg: herverbinden na backoff
            }
            setLink(false)
            // Enkel een verbinding die een tijd standhield telt als "gezond": een overbelaste server die wel
            // verbindt en dan meteen weer afbreekt, mag niet elke ~1,5 s opnieuw bestookt worden.
            if (Time.elapsed() - startedAt >= STABLE_SSE_MS) sseBackoff = 1_000L
            // Jitter evenredig met de wachttijd: honderden toestellen die tegelijk herverbinden na een
            // serverherstart (de storing van 2026-10-30) verspreiden zich zo over meerdere seconden.
            delay(sseBackoff + (0..(sseBackoff / 2).toInt()).random())
            sseBackoff = minOf(sseBackoff * 2, 15_000L)
        }
    }

    private fun restartSse() {
        sseJob?.cancel()
        sseBackoff = 1_000L
        sseJob = scope.launch { sseLoop() }
    }

    private fun onSseEvent(ev: SseEvent) {
        lastSse = Time.elapsed()
        setLink(true)
        if (ev.event != "update") return
        val st = try {
            AppJson.decodeFromString(StreamUpdate.serializer(), ev.data).state
        } catch (_: Exception) {
            null
        } ?: return
        // Eigen acties gaan voor: zolang er iets onderweg is, of net bevestigd werd, kan een
        // livestream-bericht nog van VÓÓR onze tik zijn — dan zou de score even terugspringen.
        if (queue.isNotEmpty() || inFlight || Time.elapsed() - lastOwn < SETTLE_MS) return
        server = st
        adoptServerClock(st)
        publish()
        scope.launch { loadPlayersIfNeeded() }
    }

    private fun setLink(v: Boolean) {
        if (_ui.value.liveLink != v) _ui.update { it.copy(liveLink = v) }
    }

    private fun setOnline(v: Boolean) {
        if (_ui.value.online != v) _ui.update { it.copy(online = v) }
    }

    /** "Dit toestel tekent nog aan" — houdt de claim warm én controleert meteen of je mag aantekenen. */
    private suspend fun heartbeatLoop() {
        while (true) {
            if (Graph.auth.token != null) {
                var r = Graph.api.heartbeat(matchId)
                if (r is ActionResult.Unauthorized && Graph.authRepo.reauthenticate() == Reauth.OK) r = Graph.api.heartbeat(matchId)
                when (r) {
                    is ActionResult.Ok -> _ui.update { it.copy(notAllowed = null, needLogin = false) }
                    is ActionResult.Rejected -> if (r.code == 403) _ui.update { it.copy(notAllowed = r.message) }
                    ActionResult.Unauthorized -> _ui.update { it.copy(needLogin = true) }
                    is ActionResult.Temporary -> Unit
                }
            }
            delay(HEARTBEAT_MS)
        }
    }

    /** Vangnet: ziet de livestream er dood uit, dan halen we de stand zelf op. */
    private suspend fun pollLoop() {
        while (true) {
            delay(POLL_MS)
            if (queue.isEmpty() && !inFlight && Time.elapsed() - lastSse > SSE_DEAD_MS) refresh()
        }
    }

    // ── De verzender ─────────────────────────────────────────────────────────────────────────

    private suspend fun flusherLoop() {
        var backoff = 1_000L
        while (true) {
            if (queue.isEmpty() || staleQueue) {
                wake.receive()
                continue
            }
            val op = queue.first()
            inFlight = true
            val res = try {
                send(op)
            } finally {
                inFlight = false
            }
            when (res) {
                is ActionResult.Ok -> {
                    backoff = 1_000L
                    onAck(op, res)
                }
                is ActionResult.Temporary -> {
                    setOnline(false)
                    withTimeoutOrNull(backoff) { wake.receive() }
                    backoff = minOf(backoff * 2, 8_000L)
                }
                ActionResult.Unauthorized -> {
                    _ui.update { it.copy(needLogin = true) }
                    withTimeoutOrNull(15_000L) { wake.receive() }
                }
                is ActionResult.Rejected -> {
                    onRejected(op, res.message)
                    refresh()
                }
            }
        }
    }

    /** Eén tik versturen. Klok en tijdstip worden op dit moment berekend (zie Op.toBody). */
    private suspend fun send(op: Op): ActionResult {
        val body = { op.toBody(Time.elapsed(), Graph.serverClock::toServerTime) }
        val failedToken = Graph.authRepo.currentToken()
        var r = Graph.api.postAction(matchId, body())
        if (r is ActionResult.Unauthorized) {
            when (Graph.authRepo.reauthenticate(failedToken)) {
                Reauth.OK -> r = Graph.api.postAction(matchId, body())
                Reauth.UNREACHABLE -> r = ActionResult.Temporary("Geen verbinding om opnieuw in te loggen")
                Reauth.DENIED -> Unit
            }
        }
        return r
    }

    private fun onAck(op: Op, ok: ActionResult.Ok) {
        queue.removeFirst()
        lastOwn = Time.elapsed()
        setOnline(true)
        _ui.update { it.copy(needLogin = false) }
        ok.state?.let { st ->
            server = st
            // De server stempelde clockUpdatedAt terwijl ons verzoek onderweg was: een nauwkeurige
            // peiling van het verschil tussen zijn klok en de onze.
            if (op.touchesClock) {
                ServerClock.parseIso(st.match.clockUpdatedAt)?.let { Graph.serverClock.onServerStamp(it, ok.sentWall, ok.recvWall) }
            }
        }
        // Een late start: de server startte zijn klok op het moment van AANKOMST. Zet ze meteen gelijk
        // met de onze, zodat de kijkers de juiste tijd zien.
        if (op.syncAfter && Time.elapsed() - op.tapElapsed > LATE_START_MS) {
            queue.addFirst(
                Op(
                    opId = Op.newId(),
                    action = "clock",
                    clock = ClockSpec(secondsAtTap = 0.0, running = true),
                    tapWall = op.tapWall,
                    tapElapsed = op.tapElapsed,
                    tapHalf = op.tapHalf,
                    tapClockSec = 0,
                ),
            )
        }
        server?.let { adoptServerClock(it) }
        publish()
        scope.launch { loadPlayersIfNeeded() }
    }

    private fun onRejected(op: Op, message: String) {
        queue.removeFirst()
        lastOwn = Time.elapsed()
        // Een "al gestart" na een dubbele tik of een tweede toestel is gewoon goed nieuws — geen foutbalk.
        val alGestart = op.action == "simplestart" && Regex("al gestart", RegexOption.IGNORE_CASE).containsMatchIn(message)
        if (!alGestart) rejected += Rejected(op, message)
        if (op.action == "simplestart") {
            // De wedstrijd loopt op de server niet (te vroeg, niet startklaar): alles wat erna kwam is zinloos.
            while (queue.isNotEmpty()) {
                val later = queue.removeFirst()
                if (!alGestart) rejected += Rejected(later, "Niet verstuurd omdat het starten werd geweigerd.")
            }
        }
        publish()
    }

    // ── Acties van de gebruiker ──────────────────────────────────────────────────────────────

    private fun makeOp(
        action: String,
        side: Side? = null,
        points: Int? = null,
        delta: Int? = null,
        player: Player? = null,
        spec: ClockSpec? = null,
        syncAfter: Boolean = false,
    ): Op = Op(
        opId = Op.newId(),
        action = action,
        side = side?.wire,
        points = points,
        delta = delta,
        playerId = player?.id,
        shirtNumber = player?.shirtNumber,
        playerName = player?.name,
        clock = spec,
        tapWall = Time.wall(),
        tapElapsed = Time.elapsed(),
        tapHalf = _ui.value.state?.match?.currentHalf ?: 1,
        tapClockSec = clock.value().toInt(),
        syncAfter = syncAfter,
    )

    private fun enqueue(op: Op) {
        queue.addLast(op)
        lastOwn = Time.elapsed()
        publish() // schrijft eerst naar schijf
        Graph.haptic() // pas ná het bewaren: de trilling betekent "staat veilig op het toestel"
        ensureFlusher()
        wake.trySend(Unit)
    }

    private fun finishedBlocks(): Boolean = _ui.value.state?.isFinished == true

    /**
     * De klok werkt als een stopwatch: tik = starten, tik = pauzeren, tik = verder (zoals op de
     * website). Een dubbeltik vlak na de start wordt genegeerd.
     */
    fun toggleClock() {
        val st = _ui.value.state ?: return
        if (st.isFinished) return
        val now = Time.elapsed()
        if (now - startTapAt < NA_START_DOOF_MS) return
        if (!st.isLive) {
            startTapAt = now
            clock.set(0.0, true, now)
            enqueue(makeOp("simplestart", syncAfter = true))
            return
        }
        val run = clock.isRunning
        val secs = clock.value()
        clock.set(secs, !run)
        enqueue(makeOp("clock", spec = ClockSpec(secs, !run)))
    }

    /** Klok vergeten te starten (of te laat getikt)? Per minuut bijstellen. */
    fun adjustClock(minutes: Int) {
        if (finishedBlocks()) return
        val secs = maxOf(0.0, clock.value() + minutes * 60.0)
        val run = clock.isRunning
        clock.set(secs, run)
        enqueue(makeOp("clock", spec = ClockSpec(secs, run)))
    }

    fun goal(side: Side, points: Int, player: Player? = null) {
        if (finishedBlocks()) return
        enqueue(makeOp("simplegoal", side, points = points, player = player))
    }

    fun undo(side: Side) {
        val st = _ui.value.state ?: return
        if (st.isFinished || st.lastSimpleGoalBySide[side] == null) return
        enqueue(makeOp("simpleundo", side))
    }

    fun cross(side: Side, delta: Int) {
        val st = _ui.value.state ?: return
        if (st.isFinished || st.crosses[side] + delta < 0) return
        enqueue(makeOp("simplecross", side, delta = delta))
    }

    fun timeout(side: Side, delta: Int) {
        val st = _ui.value.state ?: return
        if (st.isFinished || st.timeouts[side] + delta !in 0..2) return
        enqueue(makeOp("simpletimeout", side, delta = delta))
    }

    fun refStop(delta: Int) {
        val st = _ui.value.state ?: return
        if (st.isFinished || st.refereeStops + delta < 0) return
        enqueue(makeOp("simplerefstop", delta = delta))
    }

    /** Einde 1e helft: de klok springt naar 0 en blijft stil staan (de rust). */
    fun endHalf() {
        val st = _ui.value.state ?: return
        if (!st.isLive || st.match.currentHalf != 1) return
        clock.set(0.0, false)
        enqueue(makeOp("simplehalf"))
    }

    fun finish() {
        val st = _ui.value.state ?: return
        if (!st.isLive) return
        clock.set(clock.value(), false)
        enqueue(makeOp("finish"))
    }

    fun reopen() {
        if (_ui.value.state?.isFinished != true) return
        enqueue(makeOp("reopen"))
    }

    /** Wedstrijd per ongeluk gestart: alles terug naar nul. */
    fun reset() {
        clock.set(0.0, false)
        enqueue(makeOp("reset"))
    }

    // ── Geweigerde / oude tikken ─────────────────────────────────────────────────────────────

    fun retryRejected(opId: String) {
        val r = rejected.firstOrNull { it.op.opId == opId } ?: return
        rejected.remove(r)
        enqueue(r.op)
    }

    fun discardRejected(opId: String) {
        rejected.removeAll { it.op.opId == opId }
        publish()
        scope.launch { refresh() }
        maybeRelease()
    }

    fun sendStale() {
        staleQueue = false
        publish()
        wake.trySend(Unit)
    }

    fun discardStale() {
        queue.clear()
        staleQueue = false
        publish()
        scope.launch { refresh() }
        maybeRelease()
    }

    fun dismissNotice() = _ui.update { it.copy(notice = null) }

    fun takeOver() {
        if (_ui.value.takeoverBusy) return
        _ui.update { it.copy(takeoverBusy = true, notice = null) }
        scope.launch {
            var r = Graph.api.takeOver(matchId)
            if (r is ActionResult.Unauthorized && Graph.authRepo.reauthenticate() == Reauth.OK) r = Graph.api.takeOver(matchId)
            when (r) {
                is ActionResult.Ok -> {
                    _ui.update { it.copy(takeoverBusy = false, notAllowed = null) }
                    refresh()
                }
                is ActionResult.Rejected -> _ui.update { it.copy(takeoverBusy = false, notice = r.message) }
                is ActionResult.Temporary -> _ui.update { it.copy(takeoverBusy = false, notice = "Geen verbinding — probeer opnieuw.") }
                ActionResult.Unauthorized -> _ui.update { it.copy(takeoverBusy = false, needLogin = true) }
            }
        }
    }

    fun reload() {
        scope.launch { refresh() }
    }

    // ── Publiceren ───────────────────────────────────────────────────────────────────────────

    private fun publish() {
        val shown = server?.let { Overlay.apply(it, queue) }
        _ui.update { it.copy(state = shown, pending = queue.size, rejected = rejected.toList(), staleQueue = staleQueue) }
        persist()
        Graph.onSessionChanged()
    }

    private fun persist() {
        if (server == null && queue.isEmpty() && rejected.isEmpty()) return
        try {
            Graph.store.save(
                SessionSnapshot(matchId, server, clock.snapshot(), queue.toList(), rejected.toList(), Time.wall()),
            )
        } catch (e: Exception) {
            Log.w(TAG, "Sessie bewaren mislukt", e)
        }
    }

    companion object {
        private const val TAG = "MatchSession"
        const val STALE_QUEUE_MS = 15 * 60_000L
        const val DRIFT_TOLERANCE_S = 2.0
        const val SETTLE_MS = 3_000L
        const val NA_START_DOOF_MS = 1_200L
        const val LATE_START_MS = 700L
        const val STABLE_SSE_MS = 20_000L
        const val HEARTBEAT_MS = 60_000L
        const val POLL_MS = 25_000L
        const val SSE_DEAD_MS = 40_000L
    }
}
