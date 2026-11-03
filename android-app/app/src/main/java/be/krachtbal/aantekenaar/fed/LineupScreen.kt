package be.krachtbal.aantekenaar.fed

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.ui.Banner
import be.krachtbal.aantekenaar.ui.Btn
import be.krachtbal.aantekenaar.ui.Card
import be.krachtbal.aantekenaar.ui.CenterText
import be.krachtbal.aantekenaar.ui.Num
import be.krachtbal.aantekenaar.ui.Pal
import be.krachtbal.aantekenaar.ui.Pill
import be.krachtbal.aantekenaar.ui.SectionTitle
import be.krachtbal.aantekenaar.ui.SmallButton
import be.krachtbal.aantekenaar.ui.StepBtn
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * De selectie van één ploeg voor deze wedstrijd: wie speelt, met welk rugnummer op dit blad, en wie kapitein is.
 * Wat de coach hier kiest, ziet de scheidsrechter bij de controle. De regels (3 tot 8 spelers, geen dubbele
 * rugnummers, enkel speelgerechtigde spelers) dwingt de server af; hier tonen we ze vooraf.
 */
class LineupModel(val matchId: Int, val side: Side) {
    data class Pick(val player: Int, val rugnummer: Int)

    data class UI(
        val loading: Boolean = true,
        val error: String? = null,
        val info: LineupInfo? = null,
        val picked: List<Pick> = emptyList(),
        val kapitein: Int? = null,
        val favorites: Set<Int> = emptySet(),
        val dirty: Boolean = false,
        /** "Onthoud als vaste opstelling van de ploeg." */
        val remember: Boolean = false,
    ) {
        /** Rugnummers die dubbel gekozen zijn (de server weigert dat). */
        val duplicates: Set<Int>
            get() = picked.groupBy { it.rugnummer }.filterValues { it.size > 1 }.keys
        val canAdd: Boolean get() = picked.size < Limits.SELECTIE_MAX
        val locked: Boolean get() = info?.vergrendeld != null
    }

    private val _ui = MutableStateFlow(UI())
    val ui: StateFlow<UI> = _ui.asStateFlow()

    suspend fun load() {
        when (val r = Graph.api.fetchLineup(matchId, side)) {
            is Fetch.Ok -> applyInfo(r.value)
            is Fetch.Forbidden -> _ui.update { it.copy(loading = false, error = "Je mag de selectie van deze ploeg niet bewerken.") }
            is Fetch.Err -> _ui.update { it.copy(loading = false, error = r.message) }
        }
    }

    /** Neemt wat de server zegt over: de huidige keuze wordt het vertrekpunt, en er is niets meer "niet opgeslagen". */
    internal fun applyInfo(info: LineupInfo) {
        val byId = info.players.associateBy { it.id }
        _ui.value = UI(
            loading = false,
            info = info,
            picked = info.current.map { (p, nr) -> Pick(p, nr ?: byId[p]?.shirtNumber ?: 0) },
            kapitein = info.kapitein,
            favorites = info.favorites,
        )
    }

    private fun freeNumber(taken: Set<Int>, wish: Int?): Int {
        if (wish != null && wish > 0 && wish !in taken) return wish
        return (1..99).first { it !in taken }
    }

    fun toggle(id: Int) = _ui.update { u ->
        val info = u.info ?: return@update u
        if (u.picked.any { it.player == id }) {
            u.copy(picked = u.picked.filterNot { it.player == id }, kapitein = u.kapitein.takeIf { it != id }, dirty = true)
        } else if (u.canAdd) {
            val nr = freeNumber(u.picked.map { it.rugnummer }.toSet(), info.players.firstOrNull { it.id == id }?.shirtNumber)
            u.copy(picked = u.picked + Pick(id, nr), dirty = true)
        } else u
    }

    fun bump(id: Int, delta: Int) = _ui.update { u ->
        u.copy(picked = u.picked.map { if (it.player == id) it.copy(rugnummer = (it.rugnummer + delta).coerceIn(1, 99)) else it }, dirty = true)
    }

    fun setKapitein(id: Int) = _ui.update { u -> if (u.picked.any { it.player == id }) u.copy(kapitein = if (u.kapitein == id) null else id, dirty = true) else u }

    fun setRemember(b: Boolean) = _ui.update { it.copy(remember = b) }

    suspend fun toggleFavorite(id: Int): Act {
        val aan = id !in _ui.value.favorites
        val r = Graph.api.setFavorite(matchId, side, id, aan)
        if (r is Act.Ok) _ui.update { u -> u.copy(favorites = if (aan) u.favorites + id else u.favorites - id) }
        return r
    }

    /** Bewaart de selectie. [confirmed] true bevestigt ze, false heropent ze, null laat de bevestiging staan. */
    suspend fun save(confirmed: Boolean?): Act {
        val u = _ui.value
        val r = Graph.api.saveLineup(matchId, side, u.picked.map { it.player to it.rugnummer }, u.kapitein, confirmed, u.remember)
        if (r is Act.Ok) load()
        return r
    }
}

@Composable
fun LineupScreen(matchId: Int, side: Side, teamName: String, onBack: () -> Unit) {
    val model = remember(matchId, side) { LineupModel(matchId, side) }
    val ui by model.ui.collectAsState()
    val act = rememberActionState()
    val scope = rememberCoroutineScope()
    LaunchedEffect(model) { model.load() }

    val info = ui.info
    val dupes = ui.duplicates
    val canSave = ui.dirty && dupes.isEmpty() && !ui.locked && !act.busy
    val canConfirm = ui.picked.size >= Limits.SELECTIE_MIN && ui.kapitein != null && dupes.isEmpty() && !ui.locked && !act.busy

    val bottomBar: @Composable () -> Unit = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        Modifier.fillMaxWidth().clickable { model.setRemember(!ui.remember) },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Tick(ui.remember, size = 22)
                        Text("Onthoud als vaste opstelling van de ploeg", color = Pal.Dim, fontSize = 13.sp)
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        SmallButton(
                            "Opslaan",
                            kind = Btn.Default,
                            enabled = canSave,
                            modifier = Modifier.weight(1f),
                            onClick = { act.run(scope, { model.save(null) }) { act.info = "Selectie opgeslagen ✓" } },
                        )
                        if (info?.confirmed == true && !ui.dirty) {
                            SmallButton(
                                "Heropenen",
                                kind = Btn.Default,
                                enabled = !act.busy,
                                modifier = Modifier.weight(1f),
                                onClick = { act.run(scope, { model.save(false) }) },
                            )
                        } else {
                            SmallButton(
                                "Bevestigen",
                                enabled = canConfirm,
                                modifier = Modifier.weight(1f),
                                onClick = { act.run(scope, { model.save(true) }) },
                            )
                        }
                    }
                }
    }

    FedScaffold(
        title = "Selectie",
        subtitle = info?.teamName ?: teamName,
        onBack = onBack,
        onRefresh = { scope.launch { model.load() } },
        bottom = if (info == null || ui.locked) null else bottomBar,
    ) {
        when {
            ui.loading -> CenterText("Selectie laden…")
            info == null -> Banner("Selectie niet beschikbaar", ui.error ?: "Laden mislukt.", tint = Pal.Bad)
            else -> {
                ui.info?.vergrendeld?.let { Banner("Vergrendeld", it, tint = Pal.Warn) }
                if (info.confirmed && !ui.dirty) Banner("Bevestigd ✓", "Deze selectie is bevestigd. Tik op Heropenen om nog te wijzigen.", tint = Pal.Ok)
                Feedback(act)
                SummaryBar(ui, info)
                if (dupes.isNotEmpty()) Banner("Dubbel rugnummer", "Twee spelers hebben nummer ${dupes.sorted().joinToString(", ")}. Geef ze elk een eigen nummer.", tint = Pal.Bad)

                SectionTitle("Spelers")
                val ordered = info.players.sortedWith(compareBy({ it.id !in ui.favorites }, { it.blocked }))
                ordered.forEach { p ->
                    PlayerRow(
                        p = p,
                        pick = ui.picked.firstOrNull { it.player == p.id },
                        captain = ui.kapitein == p.id,
                        favorite = p.id in ui.favorites,
                        locked = ui.locked,
                        canAdd = ui.canAdd,
                        duplicate = ui.picked.firstOrNull { it.player == p.id }?.rugnummer in dupes,
                        onToggle = { act.clear(); model.toggle(p.id) },
                        onBump = { d -> model.bump(p.id, d) },
                        onCaptain = { model.setKapitein(p.id) },
                        onFavorite = { act.run(scope, { model.toggleFavorite(p.id) }) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SummaryBar(ui: LineupModel.UI, info: LineupInfo) {
    val n = ui.picked.size
    val kapNaam = ui.kapitein?.let { id -> info.players.firstOrNull { it.id == id }?.name }
    val needs = when {
        n < Limits.SELECTIE_MIN -> "Kies minstens ${Limits.SELECTIE_MIN} spelers."
        kapNaam == null -> "Duid een kapitein aan (C): hij tekent na afloop af."
        else -> null
    }
    Card(Modifier.fillMaxWidth(), border = if (needs == null) Pal.Ok.copy(alpha = 0.6f) else Pal.Line, radius = 12.dp) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("$n / ${Limits.SELECTIE_MAX} spelers", color = Pal.Text, fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, style = Num)
                if (ui.dirty) Pill("NIET OPGESLAGEN", Pal.Warn)
            }
            Text(kapNaam?.let { "Kapitein: $it" } ?: "Nog geen kapitein", color = Pal.Dim, fontSize = 13.sp)
            needs?.let { Text(it, color = Pal.Warn, fontSize = 13.sp) }
        }
    }
}

@Composable
private fun PlayerRow(
    p: RosterPlayer,
    pick: LineupModel.Pick?,
    captain: Boolean,
    favorite: Boolean,
    locked: Boolean,
    canAdd: Boolean,
    duplicate: Boolean,
    onToggle: () -> Unit,
    onBump: (Int) -> Unit,
    onCaptain: () -> Unit,
    onFavorite: () -> Unit,
) {
    val selected = pick != null
    val selectable = !p.blocked && !locked && (selected || canAdd)
    Card(
        Modifier.fillMaxWidth(),
        border = when {
            duplicate -> Pal.Bad
            selected -> Pal.Ok.copy(alpha = 0.7f)
            else -> Pal.Line
        },
        radius = 12.dp,
        onClick = if (selectable) onToggle else null,
    ) {
        Column(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Tick(selected, enabled = !p.blocked)
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(p.name, color = if (p.blocked) Pal.Dim else Pal.Text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        p.shirtNumber?.takeIf { it > 0 }?.let { Text("#$it", color = Pal.Dim, fontSize = 12.sp, style = Num) }
                        p.geleendVan?.let { Pill("UIT ${it.uppercase()}", Pal.Away) }
                        p.knipjes?.let { Pill("KNIPJES $it", Pal.Warn) }
                    }
                }
                Text(
                    if (favorite) "★" else "☆",
                    color = if (favorite) Pal.Warn else Pal.Dim,
                    fontSize = 24.sp,
                    modifier = Modifier.clickable(enabled = !locked, onClick = onFavorite).padding(6.dp),
                )
            }
            if (p.blocked) Text(p.reasons.joinToString(" "), color = Pal.Bad, fontSize = 12.sp, lineHeight = 16.sp)
            else if (p.level == "warn") Text(p.reasons.joinToString(" "), color = Pal.Warn, fontSize = 12.sp, lineHeight = 16.sp)
            if (selected && pick != null) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Rugnummer", color = Pal.Dim, fontSize = 12.sp)
                    StepBtn("−", { onBump(-1) }, enabled = !locked && pick.rugnummer > 1, size = 38.dp)
                    Text(
                        pick.rugnummer.toString(),
                        color = if (duplicate) Pal.Bad else Pal.Text,
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 20.sp,
                        style = Num,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.width(36.dp),
                    )
                    StepBtn("+", { onBump(1) }, enabled = !locked && pick.rugnummer < 99, size = 38.dp)
                    Box(Modifier.weight(1f))
                    Pill(if (captain) "KAPITEIN ✓" else "KAPITEIN (C)", if (captain) Pal.Ok else Pal.Dim, Modifier.clickable(enabled = !locked, onClick = onCaptain))
                }
            }
        }
    }
}
