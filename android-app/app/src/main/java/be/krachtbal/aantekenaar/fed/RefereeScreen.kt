package be.krachtbal.aantekenaar.fed

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import be.krachtbal.aantekenaar.data.Graph
import be.krachtbal.aantekenaar.data.Side
import be.krachtbal.aantekenaar.ui.Banner
import be.krachtbal.aantekenaar.ui.Btn
import be.krachtbal.aantekenaar.ui.Card
import be.krachtbal.aantekenaar.ui.CenterText
import be.krachtbal.aantekenaar.ui.Dim
import be.krachtbal.aantekenaar.ui.Num
import be.krachtbal.aantekenaar.ui.Pal
import be.krachtbal.aantekenaar.ui.PillChip
import be.krachtbal.aantekenaar.ui.SmallButton
import kotlinx.coroutines.launch

/** De punten van de materiële keuring, in de volgorde van het blad (src/lib/keuring.ts). */
private val KEURING_ITEMS = listOf(
    "terrein" to "Terrein",
    "kleedkamers" to "Kleedkamers",
    "douches" to "Douches",
    "aantekentafel" to "Aantekentafel",
    "scorebord" to "Scorebord",
    "grensrechtersvlag" to "Grensrechtersvlag",
    "ehbo" to "EHBO",
    "bal" to "Bal",
    "kentekenGrensrechter" to "Kenteken grensrechter",
    "verlichting" to "Verlichting",
)
private val KEURING_OPTIES = listOf("ok" to "OK", "niet_ok" to "NIET OK", "nvt" to "N.v.t.")

/**
 * De scheidsrechter van één wedstrijd: spelers controleren, de materiële keuring, de officials en het vrijgeven
 * (docs/FEDERATIEFLOW.md §5, stap 2) — plus aftrap verschuiven, blessure en afgelasten. [focus] is de sectie die
 * openstaat ("controle", "keuring" of "vrijgave"); de rest klapt open met een tik.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RefereeScreen(matchId: Int, focus: String, onBack: () -> Unit, onEditLineup: (Side) -> Unit) {
    val model = remember(matchId) { HubModel(matchId, withRosters = true) }
    val ui by model.ui.collectAsState()
    val scope = rememberCoroutineScope()
    // Eén status per sectie: de fout of bevestiging staat dan bij de knop waarop je tikte, niet bovenaan buiten beeld.
    val actControle = rememberActionState()
    val actKeuring = rememberActionState()
    val actOfficials = rememberActionState()
    val actVrijgave = rememberActionState()
    var open by remember { mutableStateOf(setOf(focus)) }
    LaunchedEffect(model) { model.reload() }

    val toggle: (String) -> Unit = { k -> open = if (k in open) open - k else open + k }
    val reload: suspend () -> Unit = { model.reload() }

    FedScaffold(
        title = "Scheidsrechter",
        subtitle = ui.state?.let { "${it.teams.home.name} – ${it.teams.away.name}" },
        onBack = onBack,
        onRefresh = { scope.launch { model.reload() } },
    ) {
        val st = ui.state
        val sheet = ui.sheet
        when {
            st == null && ui.loading -> CenterText("Laden…")
            st == null -> Banner("Laden mislukt", ui.error, tint = Pal.Bad)
            sheet == null -> Banner(
                "Geen toegang tot het blad",
                ui.error ?: "Dit scherm is voor de scheidsrechter van deze wedstrijd of de federatie.",
                tint = Pal.Warn,
            )
            else -> {
                ui.error?.let { Banner("Niet alles kon geladen worden", it, tint = Pal.Warn) }
                if (ui.cancelled) Banner("Wedstrijd afgelast", "Er valt niets meer te controleren of vrij te geven.", tint = Pal.Bad)

                val rows = sheet.home + sheet.away
                val gecontroleerd = rows.count { it.gecontroleerd }
                val locked = sheet.ingediend
                if (locked) Banner("Ingediend", "Het blad is ingediend en onwijzigbaar.", tint = Pal.Ok)

                Section(
                    title = "Spelers controleren",
                    summary = if (rows.isEmpty()) "wacht op de selecties" else "$gecontroleerd van ${rows.size} gecontroleerd",
                    done = rows.isNotEmpty() && gecontroleerd == rows.size,
                    open = "controle" in open,
                    onToggle = { toggle("controle") },
                ) {
                    Dim("Controleer elke speler op de lijst: “jij bent die speler, alles in orde”. Wie volgens het reglement niet mag spelen, staat in het rood.")
                    Feedback(actControle)
                    for (side in listOf(Side.HOME, Side.AWAY)) {
                        ControleSide(model, ui, side, locked, actControle, scope, onEditLineup)
                    }
                }

                Section(
                    title = "Materiële keuring",
                    summary = if (sheet.keuringBevestigd) "bevestigd" else "nog te bevestigen",
                    done = sheet.keuringBevestigd,
                    open = "keuring" in open,
                    onToggle = { toggle("keuring") },
                ) { KeuringBody(matchId, sheet, locked, actKeuring, scope, reload) }

                Section(
                    title = "Officials",
                    summary = Officials.validate(st.match.reeks, sheet.officials).let { if (it.isEmpty()) "in orde" else it.first() },
                    done = Officials.validate(st.match.reeks, sheet.officials).isEmpty(),
                    open = "officials" in open,
                    onToggle = { toggle("officials") },
                ) { OfficialsBody(matchId, st.match.reeks, sheet, locked, actOfficials, scope, reload) }

                val vrijgave = ui.steps.firstOrNull { it.id == StepId.VRIJGAVE }
                Section(
                    title = "Wedstrijd vrijgeven",
                    summary = vrijgave?.detail,
                    done = sheet.startAkkoord,
                    open = "vrijgave" in open,
                    onToggle = { toggle("vrijgave") },
                ) { VrijgaveBody(matchId, ui, vrijgave, locked, actVrijgave, scope, reload) }

                Section(
                    title = "Meer",
                    summary = "aftrap verschuiven · blessure · afgelasten",
                    open = "extras" in open,
                    onToggle = { toggle("extras") },
                ) { Extras(matchId, ui, reload) }
            }
        }
    }
}

@Composable
private fun ControleSide(
    model: HubModel,
    ui: HubModel.UI,
    side: Side,
    locked: Boolean,
    act: ActionState,
    scope: kotlinx.coroutines.CoroutineScope,
    onEditLineup: (Side) -> Unit,
) {
    val sheet = ui.sheet ?: return
    val rows = sheet.lineup(side)
    val team = ui.state?.teams?.get(side)?.name ?: if (side == Side.HOME) "Thuis" else "Uit"
    val roster = ui.lineups[side]
    val checked = rows.count { it.gecontroleerd }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(team, color = Pal.Text, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                Text("$checked van ${rows.size} gecontroleerd", color = Pal.Dim, fontSize = 12.sp)
            }
            SmallButton(
                "Alle controleren",
                kind = Btn.Default,
                enabled = !locked && !act.busy && rows.isNotEmpty() && checked < rows.size,
                onClick = { act.run(scope, { Graph.api.controle(model.matchId, side, null, true) }) { model.reload() } },
            )
        }
        if (rows.isEmpty()) Dim("Nog geen selectie voor deze ploeg.")
        rows.forEach { r ->
            val p = roster?.players?.firstOrNull { it.id == r.player }
            val blokkade = when {
                roster == null -> null
                p == null -> "hoort niet (meer) bij deze ploeg"
                p.blocked -> p.reasons.joinToString(" ")
                else -> null
            }
            Card(
                Modifier.fillMaxWidth(),
                border = if (blokkade != null) Pal.Bad else if (r.gecontroleerd) Pal.Ok.copy(alpha = 0.5f) else Pal.Line,
                radius = 10.dp,
                onClick = if (locked || act.busy) null else {
                    { act.run(scope, { Graph.api.controle(model.matchId, side, r.player, !r.gecontroleerd) }) { model.reload() } }
                },
            ) {
                Row(Modifier.padding(horizontal = 12.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Tick(r.gecontroleerd)
                    Column(Modifier.weight(1f)) {
                        Text("${r.rugnummer?.let { "#$it  " } ?: ""}${p?.name ?: "speler ${r.player}"}", color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 15.sp, style = Num)
                        blokkade?.let { Text("Mag niet spelen: $it", color = Pal.Bad, fontSize = 12.sp, lineHeight = 16.sp) }
                    }
                }
            }
        }
        if (!locked && rows.any { r -> roster != null && roster.players.firstOrNull { it.id == r.player }?.blocked != false }) {
            SmallButton("Selectie van $team aanpassen", kind = Btn.Default, onClick = { onEditLineup(side) })
        }
    }
}

@Composable
private fun KeuringBody(
    matchId: Int,
    sheet: SheetView,
    locked: Boolean,
    act: ActionState,
    scope: kotlinx.coroutines.CoroutineScope,
    reload: suspend () -> Unit,
) {
    val values = remember(sheet.keuring) { mutableStateMapOf<String, String>().apply { putAll(sheet.keuring) } }
    val frozen = locked || sheet.keuringBevestigd
    Feedback(act)
    Dim("Zet elk punt op OK, NIET OK of N.v.t. Een punt dat niet in orde is, gaat meteen als melding naar de thuisclub en de federatie.")
    KEURING_ITEMS.forEach { (key, label) ->
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(label, color = Pal.Text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                KEURING_OPTIES.forEach { (v, l) ->
                    PillChip(l, selected = values[key] == v, onClick = { if (!frozen) values[key] = v })
                }
            }
        }
    }
    if (sheet.keuringBevestigd) {
        SmallButton(
            "Keuring wijzigen",
            kind = Btn.Default,
            enabled = !locked && !act.busy,
            onClick = { act.run(scope, { Graph.api.keuring(matchId, values.toMap(), false) }) { reload() } },
        )
    } else {
        val open = KEURING_ITEMS.count { values[it.first] == null }
        if (open > 0) Dim("$open punt${if (open == 1) "" else "en"} nog niet ingevuld.")
        SmallButton(
            "Keuring bevestigen",
            enabled = !locked && !act.busy,
            onClick = { act.run(scope, { Graph.api.keuring(matchId, values.toMap(), true) }) { act.info = "Keuring bevestigd ✓"; reload() } },
        )
    }
}

@Composable
private fun OfficialsBody(
    matchId: Int,
    reeks: String?,
    sheet: SheetView,
    locked: Boolean,
    act: ActionState,
    scope: kotlinx.coroutines.CoroutineScope,
    reload: suspend () -> Unit,
) {
    val values = remember(sheet.officials) { mutableStateMapOf<String, String>().apply { putAll(sheet.officials) } }
    val required = Officials.required(reeks).toSet()
    Feedback(act)
    Dim("Altijd met naam én voornaam. Verplicht voor deze reeks: ${Officials.required(reeks).joinToString(", ") { Officials.LABELS.getValue(it).lowercase() }.ifEmpty { "niets" }}.")
    Officials.KEYS.forEach { key ->
        val status = Officials.status(key, values.toMap())
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            FedField(
                value = values[key].orEmpty(),
                onChange = { values[key] = it },
                label = Officials.LABELS.getValue(key) + if (key in required) " *" else "",
                enabled = !locked,
            )
            when (status) {
                Officials.FieldStatus.ONVOLLEDIG -> Text("Noteer naam én voornaam.", color = Pal.Warn, fontSize = 12.sp)
                Officials.FieldStatus.CONFLICT -> Text("Een coach mag geen grensrechter zijn (art. 25).", color = Pal.Bad, fontSize = 12.sp)
                else -> Unit
            }
        }
    }
    SmallButton(
        "Officials opslaan",
        enabled = !locked && !act.busy,
        onClick = { act.run(scope, { Graph.api.officials(matchId, values.toMap()) }) { act.info = "Officials opgeslagen ✓"; reload() } },
    )
}

@Composable
private fun VrijgaveBody(
    matchId: Int,
    ui: HubModel.UI,
    step: Step?,
    locked: Boolean,
    act: ActionState,
    scope: kotlinx.coroutines.CoroutineScope,
    reload: suspend () -> Unit,
) {
    val sheet = ui.sheet ?: return
    val me by Graph.authRepo.me.collectAsState()
    var code by remember { mutableStateOf("") }
    val scheduled = ui.state?.match?.status == "scheduled"
    val klaar = step?.state == StepState.TODO
    Feedback(act)
    when {
        sheet.startAkkoord -> {
            Banner("Vrijgegeven ✓", sheet.startNaam?.let { "Door $it." } ?: "De tafel kan de wedstrijd starten.", tint = Pal.Ok)
            if (scheduled && !locked) {
                SmallButton(
                    "Vrijgave intrekken",
                    kind = Btn.Danger,
                    enabled = !act.busy,
                    onClick = { act.run(scope, { Graph.api.vrijgeven(matchId, false, null) }) { act.info = "Vrijgave ingetrokken."; reload() } },
                )
            }
        }
        step?.state == StepState.NA -> Dim(step.detail ?: "Niet van toepassing.")
        else -> {
            if (!klaar) Banner("Nog niet vrij te geven", step?.detail, tint = Pal.Warn)
            else Dim("Alles is in orde. Geef vrij met de code van de scheidsrechter: de tafel kan dan starten.")
            if (!me.isFederatie) {
                FedField(code, { code = it }, "Code (persoonlijke code, vrijgavecode of QR-tekst)", enabled = !locked)
                Dim("Je persoonlijke code staat in het scheidsrechtersportaal op de website, naast je QR.")
            } else {
                Dim("Als federatie hoef je geen code in te geven.")
                sheet.vrijgaveCode?.let { Banner("Vrijgavecode (backup)", "$it — geef ze door aan de scheidsrechter.", tint = Pal.Accent) }
            }
            SmallButton(
                "Vrijgeven",
                enabled = !locked && !act.busy && klaar && (me.isFederatie || code.isNotBlank()),
                onClick = { act.run(scope, { Graph.api.vrijgeven(matchId, true, code) }) { act.info = "Wedstrijd vrijgegeven ✓"; code = ""; reload() } },
            )
        }
    }
}
