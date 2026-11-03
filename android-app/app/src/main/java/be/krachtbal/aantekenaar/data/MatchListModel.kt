package be.krachtbal.aantekenaar.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** De wedstrijdenlijst: kies een wedstrijd om aan te tekenen. */
class MatchListModel {
    data class UiState(
        val mode: ListMode = ListMode.TODAY,
        val filters: ListFilters = ListFilters(),
        /** De sortering die de gebruiker koos; null = de standaard (Thuis/Uit met club, anders Reeks). */
        val sort: ListSort? = Graph.settings.listSort,
        /** De wedstrijden van het gekozen tabblad. */
        val rows: List<MatchRow> = emptyList(),
        /** Zoekresultaten over het hele seizoen (enkel bij een zoekopdracht van ≥ 2 tekens). */
        val seasonRows: List<MatchRow> = emptyList(),
        val seasonLoading: Boolean = false,
        val seasonFailed: Boolean = false,
        val loading: Boolean = false,
        val error: String? = null,
        val hasNext: Boolean = false,
        /** Stand van lopende wedstrijden, aangevuld nadat de lijst er is. */
        val scores: Map<Int, Pair<Int, Int>> = emptyMap(),
        val loadedOnce: Boolean = false,
        /** Dichtgeklapte reeksen (sleutel = reeks-code). */
        val collapsed: Set<String> = emptySet(),
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var page = 1
    private var job: Job? = null
    private var queryJob: Job? = null
    private var seasonJob: Job? = null
    private var autoSwitched = false

    fun setMode(m: ListMode) {
        if (_state.value.mode == m && _state.value.loadedOnce) return
        _state.update { it.copy(mode = m) }
        reload()
    }

    // ── Zoeken en filteren (zoals de startpagina van de site) ────────────────────────────────

    fun setQuery(q: String) {
        _state.update { it.copy(filters = it.filters.copy(query = q)) }
        queryJob?.cancel()
        queryJob = Graph.scope.launch {
            delay(350) // niet bij elke toets de server bevragen; het filteren op het toestel gaat wel meteen
            searchSeason(q)
        }
    }

    fun setReeks(code: String?) = _state.update { it.copy(filters = it.filters.copy(reeks = code)) }

    fun setOnlyLive(v: Boolean) = _state.update { it.copy(filters = it.filters.copy(onlyLive = v)) }

    fun setOnlyMyClub(v: Boolean) = _state.update { it.copy(filters = it.filters.copy(onlyMyClub = v)) }

    fun clearFilters() {
        queryJob?.cancel()
        seasonJob?.cancel()
        _state.update { it.copy(filters = ListFilters(), seasonRows = emptyList(), seasonLoading = false, seasonFailed = false) }
    }

    fun setSort(s: ListSort) {
        Graph.settings.listSort = s
        _state.update { it.copy(sort = s) }
    }

    fun toggleCollapsed(key: String) = _state.update {
        it.copy(collapsed = if (key in it.collapsed) it.collapsed - key else it.collapsed + key)
    }

    // ── Laden ────────────────────────────────────────────────────────────────────────────────

    fun reload() {
        page = 1
        load(append = false)
        val q = _state.value.filters.query
        if (_state.value.filters.seasonSearch) searchSeason(q)
    }

    fun loadMore() {
        if (_state.value.loading || !_state.value.hasNext) return
        page += 1
        load(append = true)
    }

    private fun load(append: Boolean) {
        job?.cancel()
        _state.update { it.copy(loading = true, error = null) }
        val mode = _state.value.mode
        job = Graph.scope.launch {
            // De aantekenmodus van de server (supporters/federatie) bepaalt of een geplande wedstrijd "klaar — tik om te
            // starten" mag tonen. Vers ophalen vóór de rijen komen: anders stond die regel op de demo (federatiemodus)
            // verkeerd tot de eerste wedstrijd geopend werd.
            if (!append) Graph.api.fetchScoreMode()?.let { Graph.auth.scoreMode = it }
            Graph.api.fetchMatches(mode, "", page).fold(
                onSuccess = { res ->
                    val rows = if (append) ListLogic.merge(_state.value.rows, res.rows) else res.rows
                    _state.update { it.copy(rows = rows, hasNext = res.hasNext, loading = false, loadedOnce = true) }
                    // Een gewone speeldag zonder wedstrijden vandaag? Dan meteen de komende tonen.
                    if (!append && mode == ListMode.TODAY && res.rows.isEmpty() && !_state.value.filters.seasonSearch && !autoSwitched) {
                        autoSwitched = true
                        setMode(ListMode.UPCOMING)
                        return@fold
                    }
                    // Filters en tellingen kloppen enkel als de lijst (bijna) compleet is: doorladen tot een redelijke grens.
                    if (res.hasNext && rows.size < AUTO_LOAD_MAX) loadMore()
                },
                onFailure = { e ->
                    _state.update { it.copy(loading = false, error = e.message ?: "Laden mislukt.", loadedOnce = true) }
                },
            )
        }
    }

    /** Zoeken over het hele seizoen; de kandidaten kiest [SeasonSearch], het exacte filteren doet de lijst zelf. */
    private fun searchSeason(q: String) {
        seasonJob?.cancel()
        if (q.trim().length < 2) {
            _state.update { it.copy(seasonRows = emptyList(), seasonLoading = false, seasonFailed = false) }
            return
        }
        _state.update { it.copy(seasonLoading = true, seasonFailed = false) }
        seasonJob = Graph.scope.launch {
            ClubDirectory.ensureLoaded()
            // De clublijst is nodig om "baasro" naar een club te vertalen; heel even wachten als ze er nog niet is.
            val clubs = withTimeoutOrNull(3_000) { ClubDirectory.clubs.first { it.isNotEmpty() } } ?: ClubDirectory.clubs.value
            val plan = SeasonSearch.plan(q, clubs)
            if (plan == null) {
                _state.update { it.copy(seasonLoading = false) }
                return@launch
            }
            Graph.api.fetchSeasonMatches(plan).fold(
                onSuccess = { res ->
                    if (_state.value.filters.query != q) return@fold // intussen verder getypt
                    _state.update { it.copy(seasonRows = res.rows, seasonLoading = false, seasonFailed = false) }
                },
                onFailure = { _state.update { it.copy(seasonLoading = false, seasonFailed = true) } },
            )
        }
    }

    // ── Live-standen ─────────────────────────────────────────────────────────────────────────

    private var liveJob: Job? = null

    private fun isLive(r: MatchRow) = r.status == "live"

    /**
     * Houdt de standen van lopende wedstrijden bij via de gedeelde dagstream van de site (zie [parseLiveScores]).
     * Enkel verbonden terwijl het scherm zichtbaar is ([stopLive] bij ON_STOP) én er iets live in beeld staat: een lijst
     * zonder lopende wedstrijd kost de server geen enkele verbinding.
     */
    fun startLive() {
        if (liveJob?.isActive == true) return
        liveJob = Graph.scope.launch {
            _state.map { s -> s.rows.any(::isLive) || s.seasonRows.any(::isLive) }
                .distinctUntilChanged()
                .collectLatest { anyLive -> if (anyLive) liveLoop() }
        }
    }

    fun stopLive() {
        liveJob?.cancel()
        liveJob = null
    }

    private suspend fun liveLoop() {
        var backoff = LIVE_BACKOFF_MIN_MS
        while (true) {
            val startedAt = Time.elapsed()
            try {
                streamSse(Graph.api.sseHttp, Graph.api.liveDayRequest(brusselsToday())) { ev ->
                    if (ev.event != "scores") return@streamSse
                    val fresh = parseLiveScores(ev.data)
                    // Enkel bijwerken als er iets veranderd is: een ongewijzigd bericht mag de lijst niet laten herschikken.
                    _state.update { cur ->
                        val merged = cur.scores + fresh
                        if (merged == cur.scores) cur else cur.copy(scores = merged)
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // server weg of dode lijn: herverbinden na backoff
            }
            if (Time.elapsed() - startedAt >= LIVE_STABLE_MS) backoff = LIVE_BACKOFF_MIN_MS
            delay(backoff + (0..(backoff / 2).toInt()).random())
            backoff = minOf(backoff * 2, LIVE_BACKOFF_MAX_MS)
        }
    }

    companion object {
        /** Zoveel rijen laadt de lijst vanzelf door; daarboven staat er een "Meer laden"-knop. */
        const val AUTO_LOAD_MAX = 200
        private const val LIVE_BACKOFF_MIN_MS = 2_000L
        private const val LIVE_BACKOFF_MAX_MS = 30_000L
        private const val LIVE_STABLE_MS = 20_000L
    }
}
